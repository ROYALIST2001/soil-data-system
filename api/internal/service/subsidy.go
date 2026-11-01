package service

import (
	"fmt"
	"math"
	"strings"
	"time"

	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

// SubsidyService runs the fertilizer subsidy scheme.
type SubsidyService struct {
	subsidyRepo *repository.SubsidyRepository
	landRepo    *repository.LandRepository
	farmerRepo  *repository.FarmerRepository
}

// NewSubsidyService builds the service.
func NewSubsidyService(
	subsidyRepo *repository.SubsidyRepository,
	landRepo *repository.LandRepository,
	farmerRepo *repository.FarmerRepository,
) *SubsidyService {
	return &SubsidyService{
		subsidyRepo: subsidyRepo,
		landRepo:    landRepo,
		farmerRepo:  farmerRepo,
	}
}

// ============================================================
// THE STATE MACHINE
// ============================================================
//
//	SUBMITTED --approve--> APPROVED --send--> SENT --confirm--> RECEIVED
//	    |                      |                |
//	    |                      |                +--dispute--> DISPUTED
//	    |                      |                                  |
//	    +------reject----------+---------> REJECTED               |
//	                                                              |
//	                              SENT <--resend--+---resolve--> RESOLVED
//
// WHAT MAKES THIS DIFFERENT FROM THE RELIEF WORKFLOW.
//
// The FARMER is an actor here, not merely the subject. Two of these moves
// belong to them and to nobody else: confirming the money arrived, and
// saying it did not.
//
// That is the whole point of the feature. Before this, "paid" meant an
// officer had ticked a box, and a farmer who never saw the money had no way
// to say so inside the system. Now the payment is not finished until the
// person it was meant for agrees that it is.
//
// Note what a farmer still CANNOT do: approve their own application, send
// themselves money, or resolve their own dispute. Being an actor in a
// workflow is not the same as having authority over it.

type subsidyMove struct {
	from      string
	to        string
	allowedBy []string
}

var subsidyTransitions = []subsidyMove{
	// The division officer checks the farmer qualifies.
	{model.SubsidySubmitted, model.SubsidyApproved, []string{RoleGNOfficer}},
	{model.SubsidySubmitted, model.SubsidyRejected, []string{RoleGNOfficer}},

	// Only the department moves money - and may still refuse to.
	{model.SubsidyApproved, model.SubsidySent, []string{RoleDeptOfficer}},
	{model.SubsidyApproved, model.SubsidyRejected, []string{RoleDeptOfficer}},

	// THE FARMER'S OWN MOVES.
	{model.SubsidySent, model.SubsidyReceived, []string{RoleFarmer}},
	{model.SubsidySent, model.SubsidyDisputed, []string{RoleFarmer}},

	// Settling a dispute: either send it again, or close it with an
	// explanation. The department sent the money, so the department
	// answers for it.
	{model.SubsidyDisputed, model.SubsidySent, []string{RoleDeptOfficer}},
	{model.SubsidyDisputed, model.SubsidyResolved, []string{RoleDeptOfficer}},

	// A farmer who was paid after a dispute confirms it like any other.
	{model.SubsidyResolved, model.SubsidyReceived, []string{RoleFarmer}},
}

// canMoveSubsidy says whether this role may make this move.
func canMoveSubsidy(from, to, role string) error {
	for _, t := range subsidyTransitions {
		if t.from != from || t.to != to {
			continue
		}

		for _, allowed := range t.allowedBy {
			if allowed == role {
				return nil
			}
		}

		// The move is real, but not for this person. A different problem
		// from an impossible move, and it deserves a different message.
		return ValidationError{
			Message: fmt.Sprintf(
				"Your role cannot move an application from %s to %s.",
				from, to),
		}
	}

	return ValidationError{
		Message: fmt.Sprintf(
			"An application that is %s cannot be changed to %s.", from, to),
	}
}

// ============================================================
// ANNOUNCING A ROUND
// ============================================================

// DeclareRound announces a subsidy round. Department officers only.
func (s *SubsidyService) DeclareRound(
	account model.Farmer, req model.DeclareRoundRequest,
) (model.SubsidyRound, error) {

	if account.Role != RoleDeptOfficer {
		return model.SubsidyRound{}, ValidationError{
			Message: "Only the department can announce a subsidy round.",
		}
	}

	name := strings.TrimSpace(req.Name)
	if len([]rune(name)) < 4 {
		return model.SubsidyRound{}, ValidationError{
			Message: "Please name the round, like " +
				"\"Maha season 2026/27 fertilizer subsidy\".",
		}
	}

	season := strings.ToUpper(strings.TrimSpace(req.Season))
	if season != model.SeasonMaha && season != model.SeasonYala {
		return model.SubsidyRound{}, ValidationError{
			Message: "Season must be MAHA or YALA.",
		}
	}

	opens, err := parseDay(req.OpensOn, "opening date")
	if err != nil {
		return model.SubsidyRound{}, err
	}

	closes, err := parseDay(req.ClosesOn, "closing date")
	if err != nil {
		return model.SubsidyRound{}, err
	}

	if closes.Before(opens) {
		return model.SubsidyRound{}, ValidationError{
			Message: "The closing date cannot be before the opening date.",
		}
	}

	// A round that closed before it was announced can never be applied to.
	// Almost always a typing mistake, and a confusing one to debug later.
	if closes.Before(time.Now().AddDate(0, 0, -1)) {
		return model.SubsidyRound{}, ValidationError{
			Message: "The closing date has already passed.",
		}
	}

	divisions, err := cleanDivisions(req.Divisions)
	if err != nil {
		return model.SubsidyRound{}, err
	}

	rates, err := cleanSubsidyRates(req.Rates)
	if err != nil {
		return model.SubsidyRound{}, err
	}

	roundID, err := s.subsidyRepo.InsertRound(account.FarmerID,
		model.DeclareRoundRequest{
			Name:        name,
			Season:      season,
			OpensOn:     req.OpensOn,
			ClosesOn:    req.ClosesOn,
			Description: strings.TrimSpace(req.Description),
			Divisions:   divisions,
			Rates:       rates,
		})
	if err != nil {
		return model.SubsidyRound{}, err
	}

	return s.subsidyRepo.FindRound(roundID)
}

// cleanDivisions tidies and checks the affected divisions.
func cleanDivisions(raw []string) ([]string, error) {
	divisions := []string{}
	seen := map[string]bool{}

	for _, d := range raw {
		d = strings.TrimSpace(d)
		if d == "" {
			continue
		}

		key := strings.ToLower(d)
		if seen[key] {
			continue
		}
		seen[key] = true

		divisions = append(divisions, d)
	}

	// Without at least one, nobody could ever apply: every application is
	// checked against this list. A round with no divisions quietly does
	// nothing at all.
	if len(divisions) == 0 {
		return nil, ValidationError{
			Message: "Please choose at least one Grama Niladhari division.",
		}
	}

	return divisions, nil
}

// cleanSubsidyRates tidies and checks the per-crop rates.
func cleanSubsidyRates(
	raw []model.SubsidyRate,
) ([]model.SubsidyRate, error) {

	rates := []model.SubsidyRate{}
	seen := map[string]bool{}

	for _, r := range raw {
		crop := strings.ToLower(strings.TrimSpace(r.Crop))

		if _, known := model.AllowedCrops[crop]; !known {
			return nil, ValidationError{
				Message: fmt.Sprintf(
					"Crop '%s' is not supported. Choose one of: %s",
					crop, strings.Join(model.CropNames(), ", ")),
			}
		}

		if seen[crop] {
			return nil, ValidationError{
				Message: fmt.Sprintf(
					"%s is listed twice. Give one rate per crop.",
					model.AllowedCrops[crop].Label),
			}
		}
		seen[crop] = true

		if r.RatePerHectare <= 0 {
			return nil, ValidationError{
				Message: fmt.Sprintf(
					"The rate for %s must be more than zero.",
					model.AllowedCrops[crop].Label),
			}
		}

		rates = append(rates, model.SubsidyRate{
			Crop:           crop,
			RatePerHectare: r.RatePerHectare,
		})
	}

	// Likewise: a crop with no rate is a crop nobody can be paid for.
	if len(rates) == 0 {
		return nil, ValidationError{
			Message: "Please set a rate for at least one crop.",
		}
	}

	return rates, nil
}

// CloseRound stops new applications.
func (s *SubsidyService) CloseRound(
	account model.Farmer, roundID int,
) error {

	if account.Role != RoleDeptOfficer {
		return ValidationError{
			Message: "Only the department can close a subsidy round.",
		}
	}

	return s.subsidyRepo.SetRoundStatus(roundID, "CLOSED")
}

// Rounds lists the rounds this officer may see.
func (s *SubsidyService) Rounds(
	account model.Farmer,
) ([]model.SubsidyRound, error) {
	// A division officer sees only rounds covering their own division; the
	// department sees all of them.
	return s.subsidyRepo.ListRounds(scopeDivision(account, ""), false)
}

// OpenRoundsForFarmer lists the rounds a farmer may apply to.
func (s *SubsidyService) OpenRoundsForFarmer(
	farmerID int,
) ([]model.SubsidyRound, error) {

	farmer, err := s.farmerRepo.FindByID(farmerID)
	if err != nil {
		return nil, ValidationError{Message: "That farmer does not exist."}
	}

	return s.subsidyRepo.ListRounds(farmer.GNDivision, true)
}

// ============================================================
// APPLYING
// ============================================================

// Apply files a farmer's application for one crop.
func (s *SubsidyService) Apply(
	req model.ApplyForSubsidyRequest,
) (model.SubsidyApplication, error) {

	if req.FarmerID <= 0 || req.RoundID <= 0 || req.LandCropID <= 0 {
		return model.SubsidyApplication{}, ValidationError{
			Message: "Please choose a subsidy round and a crop.",
		}
	}

	farmer, err := s.farmerRepo.FindByID(req.FarmerID)
	if err != nil {
		return model.SubsidyApplication{}, ValidationError{
			Message: "That farmer does not exist.",
		}
	}

	round, err := s.subsidyRepo.FindRound(req.RoundID)
	if err != nil {
		return model.SubsidyApplication{}, ValidationError{
			Message: "That subsidy round was not found.",
		}
	}

	if round.Status != "OPEN" {
		return model.SubsidyApplication{}, ValidationError{
			Message: "This subsidy round has closed.",
		}
	}

	// Is this farmer's area covered?
	covered, err := s.subsidyRepo.DivisionCovered(
		req.RoundID, farmer.GNDivision,
	)
	if err != nil {
		return model.SubsidyApplication{}, err
	}
	if !covered {
		return model.SubsidyApplication{}, ValidationError{
			Message: fmt.Sprintf(
				"This subsidy round does not cover %s.", farmer.GNDivision),
		}
	}

	// Is this crop really theirs?
	//
	// FindLandIDForCrop has the farmer id in its WHERE clause, so a crop
	// belonging to somebody else simply is not found.
	landID, err := s.landRepo.FindLandIDForCrop(req.LandCropID, req.FarmerID)
	if err != nil {
		return model.SubsidyApplication{}, ValidationError{
			Message: "That crop is not one you registered.",
		}
	}

	areaHa, cropName, err := s.cropDetails(req.FarmerID, req.LandCropID)
	if err != nil {
		return model.SubsidyApplication{}, err
	}

	// Does the round cover this crop?
	_, hasRate, err := s.subsidyRepo.RateForCrop(req.RoundID, cropName)
	if err != nil {
		return model.SubsidyApplication{}, err
	}
	if !hasRate {
		return model.SubsidyApplication{}, ValidationError{
			Message: fmt.Sprintf(
				"This subsidy round does not cover %s.",
				model.AllowedCrops[cropName].Label),
		}
	}

	exists, err := s.subsidyRepo.ApplicationExists(req.RoundID, req.LandCropID)
	if err != nil {
		return model.SubsidyApplication{}, err
	}
	if exists {
		return model.SubsidyApplication{}, ValidationError{
			Message: "You have already applied for this crop in this round.",
		}
	}

	req.FarmerNote = strings.TrimSpace(req.FarmerNote)

	applicationID, err := s.subsidyRepo.InsertApplication(req, landID, areaHa)
	if err != nil {
		return model.SubsidyApplication{}, err
	}

	return s.subsidyRepo.FindApplication(applicationID, "", 0)
}

// cropDetails finds the registered area and crop name for one of a farmer's
// crops.
func (s *SubsidyService) cropDetails(
	farmerID int, landCropID int,
) (areaHa float64, crop string, err error) {

	lands, err := s.landRepo.FindByFarmer(farmerID)
	if err != nil {
		return 0, "", err
	}

	for _, land := range lands {
		for _, c := range land.Crops {
			if c.LandCropID == landCropID {
				return c.SizeHa, c.Crop, nil
			}
		}
	}

	return 0, "", ValidationError{
		Message: "That crop is not one you registered.",
	}
}

// FarmerApplications returns one farmer's applications.
func (s *SubsidyService) FarmerApplications(
	farmerID int,
) ([]model.SubsidyApplication, error) {

	if farmerID <= 0 {
		return nil, ValidationError{Message: "No farmer was given."}
	}

	return s.subsidyRepo.ListApplications("", "", farmerID, 0)
}

// ============================================================
// THE OFFICER STEPS
// ============================================================

// OfficerApplications returns the applications an officer may act on.
func (s *SubsidyService) OfficerApplications(
	account model.Farmer, status string, roundID int,
) ([]model.SubsidyApplication, error) {

	status = strings.ToUpper(strings.TrimSpace(status))

	switch status {
	case "", model.SubsidySubmitted, model.SubsidyApproved,
		model.SubsidySent, model.SubsidyReceived, model.SubsidyDisputed,
		model.SubsidyResolved, model.SubsidyRejected:
	default:
		return nil, ValidationError{
			Message: "Unknown application status filter.",
		}
	}

	return s.subsidyRepo.ListApplications(
		scopeDivision(account, ""), status, 0, roundID,
	)
}

// OfficerDetail returns one application and its history, for an officer.
func (s *SubsidyService) OfficerDetail(
	account model.Farmer, applicationID int,
) (model.SubsidyDetail, error) {

	application, err := s.subsidyRepo.FindApplication(
		applicationID, scopeDivision(account, ""), 0,
	)
	if err != nil {
		return model.SubsidyDetail{}, err
	}

	return s.withHistory(application)
}

// FarmerDetail returns one application and its history, for its owner.
func (s *SubsidyService) FarmerDetail(
	farmerID int, applicationID int,
) (model.SubsidyDetail, error) {

	// farmerID in the WHERE clause, so another farmer's application is
	// simply not found rather than refused with a message that confirms it
	// exists.
	application, err := s.subsidyRepo.FindApplication(
		applicationID, "", farmerID,
	)
	if err != nil {
		return model.SubsidyDetail{}, err
	}

	return s.withHistory(application)
}

func (s *SubsidyService) withHistory(
	application model.SubsidyApplication,
) (model.SubsidyDetail, error) {

	history, err := s.subsidyRepo.ApplicationHistory(application.ApplicationID)
	if err != nil {
		return model.SubsidyDetail{}, err
	}

	return model.SubsidyDetail{
		Application: application,
		History:     history,
	}, nil
}

// Approve confirms the farmer qualifies, and works out the money.
func (s *SubsidyService) Approve(
	account model.Farmer, applicationID int, req model.SubsidyDecisionRequest,
) error {

	application, err := s.subsidyRepo.FindApplication(
		applicationID, scopeDivision(account, ""), 0,
	)
	if err != nil {
		return err
	}

	if err := canMoveSubsidy(
		application.Status, model.SubsidyApproved, account.Role,
	); err != nil {
		return err
	}

	rate, found, err := s.subsidyRepo.RateForCrop(
		application.RoundID, application.Crop,
	)
	if err != nil {
		return err
	}
	if !found {
		return ValidationError{
			Message: fmt.Sprintf(
				"This round has no rate for %s, so no amount can be worked "+
					"out.", application.Crop),
		}
	}

	// ---------- THE ARITHMETIC ----------
	//
	// registered hectares x rupees per hectare, rounded to the cent.
	//
	// Nobody types this number. Two farmers with the same half hectare of
	// rice receive the same money, and the figure can be checked by anybody
	// with a calculator.
	amount := math.Round(application.AreaHa*rate*100) / 100

	return s.subsidyRepo.Transition(
		applicationID, account.FarmerID,
		application.Status, model.SubsidyApproved,
		strings.TrimSpace(req.Note), &amount,
	)
}

// Send records that the department has released the money.
func (s *SubsidyService) Send(
	account model.Farmer, applicationID int, req model.SubsidyDecisionRequest,
) error {
	return s.officerMove(
		account, applicationID, model.SubsidySent, req.Note, false,
	)
}

// Reject turns an application down, at whichever stage it has reached.
func (s *SubsidyService) Reject(
	account model.Farmer, applicationID int, req model.SubsidyDecisionRequest,
) error {
	// A reason is required. The farmer is being told no, and they are
	// entitled to know why - both as a matter of fairness and so they can
	// correct a genuine mistake and apply again next round.
	return s.officerMove(
		account, applicationID, model.SubsidyRejected, req.Note, true,
	)
}

// Resolve closes a dispute with an explanation.
func (s *SubsidyService) Resolve(
	account model.Farmer, applicationID int, req model.SubsidyDecisionRequest,
) error {
	// Always needs a reason: a farmer said the money never arrived, and
	// closing that without explaining is exactly the behaviour this whole
	// feature exists to prevent.
	return s.officerMove(
		account, applicationID, model.SubsidyResolved, req.Note, true,
	)
}

// officerMove is the shared plumbing for the officer steps.
func (s *SubsidyService) officerMove(
	account model.Farmer,
	applicationID int,
	to string,
	note string,
	noteRequired bool,
) error {

	note = strings.TrimSpace(note)

	if noteRequired && len([]rune(note)) < minNoteLength {
		return ValidationError{
			Message: "Please write a reason, in at least 10 characters. " +
				"The farmer will see it.",
		}
	}

	application, err := s.subsidyRepo.FindApplication(
		applicationID, scopeDivision(account, ""), 0,
	)
	if err != nil {
		return err
	}

	if err := canMoveSubsidy(application.Status, to, account.Role); err != nil {
		return err
	}

	return s.subsidyRepo.Transition(
		applicationID, account.FarmerID, application.Status, to, note, nil,
	)
}

// ============================================================
// THE FARMER'S OWN STEPS
// ============================================================

// ConfirmReceived is the farmer saying the money arrived.
func (s *SubsidyService) ConfirmReceived(
	req model.FarmerActionRequest, applicationID int,
) error {
	return s.farmerMove(req, applicationID, model.SubsidyReceived, false)
}

// Dispute is the farmer saying the money never arrived.
//
// THE POINT OF THIS WHOLE FEATURE. Until now a payment was finished when an
// officer said so. Now the farmer can answer back, in the system, where it
// is recorded and lands in a queue somebody has to work through.
func (s *SubsidyService) Dispute(
	req model.FarmerActionRequest, applicationID int,
) error {
	return s.farmerMove(req, applicationID, model.SubsidyDisputed, true)
}

// farmerMove is the shared plumbing for the two moves a farmer may make.
func (s *SubsidyService) farmerMove(
	req model.FarmerActionRequest,
	applicationID int,
	to string,
	noteRequired bool,
) error {

	if req.FarmerID <= 0 {
		return ValidationError{Message: "No farmer was given."}
	}

	note := strings.TrimSpace(req.Note)

	if noteRequired && len([]rune(note)) < minNoteLength {
		return ValidationError{
			Message: "Please say what happened, in at least 10 characters. " +
				"It helps the department find the problem.",
		}
	}

	// THE OWNERSHIP CHECK, done by the database rather than in Go.
	//
	// The farmer id goes into the WHERE clause, so somebody else's
	// application is not found at all. There is no branch here that could
	// be edited later into letting one farmer confirm another's payment.
	application, err := s.subsidyRepo.FindApplication(
		applicationID, "", req.FarmerID,
	)
	if err != nil {
		return err
	}

	// A farmer acts with the FARMER role regardless of anything else, so
	// the transition table decides what they may do.
	if err := canMoveSubsidy(application.Status, to, RoleFarmer); err != nil {
		return err
	}

	return s.subsidyRepo.Transition(
		applicationID, req.FarmerID, application.Status, to, note, nil,
	)
}
