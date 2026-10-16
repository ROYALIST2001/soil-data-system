package service

import (
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

// A note explaining a decision must say something.
const minNoteLength = 10

// Dates arrive as YYYY-MM-DD and nothing else.
var datePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// The same tolerance used for land areas. Floating point addition is not
// exact, and a farmer claiming their whole 2.00 hectare field must not be
// refused because the arithmetic produced 2.0000000000000004.
const claimAreaTolerance = 0.000001

// DisasterService runs the relief scheme.
type DisasterService struct {
	disasterRepo *repository.DisasterRepository
	landRepo     *repository.LandRepository
	farmerRepo   *repository.FarmerRepository
}

// NewDisasterService builds the service.
func NewDisasterService(
	disasterRepo *repository.DisasterRepository,
	landRepo *repository.LandRepository,
	farmerRepo *repository.FarmerRepository,
) *DisasterService {
	return &DisasterService{
		disasterRepo: disasterRepo,
		landRepo:     landRepo,
		farmerRepo:   farmerRepo,
	}
}

// ============================================================
// THE STATE MACHINE
// ============================================================
//
// A claim may only move along these arrows:
//
//	SUBMITTED --verify--> VERIFIED --approve--> APPROVED --pay--> PAID
//	    |                    |
//	    +------reject--------+------> REJECTED
//
// WHY WRITE IT DOWN AS DATA RATHER THAN AS IF-STATEMENTS.
//
// Because the dangerous mistakes in a scheme like this are the moves nobody
// thought about: paying a claim that was never verified, approving one twice,
// re-opening something already rejected. Scattered if-statements make those
// easy to miss. One table makes every allowed move visible at a glance, and
// anything not in it is impossible.
//
// Each move also names WHO may make it. Checking the loss on the ground and
// releasing public money are different jobs, held by different people on
// purpose.

type transition struct {
	from      string
	to        string
	allowedBy []string
}

var allowedTransitions = []transition{
	// The GN officer went and looked.
	{model.ClaimSubmitted, model.ClaimVerified, []string{RoleGNOfficer}},

	// Either officer may turn a claim down, at their own stage.
	{model.ClaimSubmitted, model.ClaimRejected, []string{RoleGNOfficer}},
	{model.ClaimVerified, model.ClaimRejected, []string{RoleDeptOfficer}},

	// Only the department releases money.
	{model.ClaimVerified, model.ClaimApproved, []string{RoleDeptOfficer}},
	{model.ClaimApproved, model.ClaimPaid, []string{RoleDeptOfficer}},
}

// canMove says whether this role may make this move, and why not if it cannot.
func canMove(from, to, role string) error {
	for _, t := range allowedTransitions {
		if t.from != from || t.to != to {
			continue
		}

		for _, allowed := range t.allowedBy {
			if allowed == role {
				return nil
			}
		}

		// The move is real, but not for this person. That is a different
		// problem from an impossible move, and deserves a different message.
		return ValidationError{
			Message: fmt.Sprintf(
				"Your role cannot move a claim from %s to %s.", from, to),
		}
	}

	return ValidationError{
		Message: fmt.Sprintf(
			"A claim that is %s cannot be changed to %s.", from, to),
	}
}

// ============================================================
// DECLARING A DISASTER
// ============================================================

// DeclareEvent announces a disaster. Department officers only.
func (s *DisasterService) DeclareEvent(
	account model.Farmer, req model.DeclareEventRequest,
) (model.DisasterEvent, error) {

	if account.Role != RoleDeptOfficer {
		return model.DisasterEvent{}, ValidationError{
			Message: "Only the department can declare a disaster.",
		}
	}

	name := strings.TrimSpace(req.Name)
	if len([]rune(name)) < 4 {
		return model.DisasterEvent{}, ValidationError{
			Message: "Please give the disaster a name, " +
				"like \"Flood - Kurunegala - October 2026\".",
		}
	}

	disasterType := strings.ToUpper(strings.TrimSpace(req.DisasterType))
	if !isKnownDisasterType(disasterType) {
		return model.DisasterEvent{}, ValidationError{
			Message: "Disaster type must be one of: " +
				strings.Join(model.DisasterTypes(), ", "),
		}
	}

	started, err := parseDay(req.StartedOn, "start date")
	if err != nil {
		return model.DisasterEvent{}, err
	}

	ended, err := parseDay(req.EndedOn, "end date")
	if err != nil {
		return model.DisasterEvent{}, err
	}

	if ended.Before(started) {
		return model.DisasterEvent{}, ValidationError{
			Message: "The end date cannot be before the start date.",
		}
	}

	// A disaster cannot be declared for next month. Relief is for what has
	// happened, and a future date is almost always a typing mistake.
	if started.After(time.Now().AddDate(0, 0, 1)) {
		return model.DisasterEvent{}, ValidationError{
			Message: "The start date cannot be in the future.",
		}
	}

	// ---------- divisions ----------
	//
	// Without at least one, nobody could ever claim: every claim is checked
	// against this list. An event with no divisions is a scheme that quietly
	// does nothing.
	divisions := []string{}
	seenDivision := map[string]bool{}

	for _, d := range req.Divisions {
		d = strings.TrimSpace(d)
		if d == "" {
			continue
		}

		key := strings.ToLower(d)
		if seenDivision[key] {
			continue
		}
		seenDivision[key] = true

		divisions = append(divisions, d)
	}

	if len(divisions) == 0 {
		return model.DisasterEvent{}, ValidationError{
			Message: "Please choose at least one affected Grama Niladhari " +
				"division.",
		}
	}

	// ---------- rates ----------
	//
	// Likewise: a crop with no rate is a crop nobody can be paid for.
	rates := []model.EventRate{}
	seenCrop := map[string]bool{}

	for _, r := range req.Rates {
		crop := strings.ToLower(strings.TrimSpace(r.Crop))

		if _, known := model.AllowedCrops[crop]; !known {
			return model.DisasterEvent{}, ValidationError{
				Message: fmt.Sprintf(
					"Crop '%s' is not supported. Choose one of: %s",
					crop, strings.Join(model.CropNames(), ", ")),
			}
		}

		if seenCrop[crop] {
			return model.DisasterEvent{}, ValidationError{
				Message: fmt.Sprintf(
					"%s is listed twice. Give one rate per crop.",
					model.AllowedCrops[crop].Label),
			}
		}
		seenCrop[crop] = true

		if r.RatePerHectare <= 0 {
			return model.DisasterEvent{}, ValidationError{
				Message: fmt.Sprintf(
					"The rate for %s must be more than zero.",
					model.AllowedCrops[crop].Label),
			}
		}

		rates = append(rates, model.EventRate{
			Crop:           crop,
			RatePerHectare: r.RatePerHectare,
		})
	}

	if len(rates) == 0 {
		return model.DisasterEvent{}, ValidationError{
			Message: "Please set a compensation rate for at least one crop.",
		}
	}

	eventID, err := s.disasterRepo.InsertEvent(account.FarmerID,
		model.DeclareEventRequest{
			Name:         name,
			DisasterType: disasterType,
			StartedOn:    req.StartedOn,
			EndedOn:      req.EndedOn,
			Description:  strings.TrimSpace(req.Description),
			Divisions:    divisions,
			Rates:        rates,
		})
	if err != nil {
		return model.DisasterEvent{}, err
	}

	return s.disasterRepo.FindEvent(eventID)
}

// CloseEvent stops new claims being submitted.
func (s *DisasterService) CloseEvent(
	account model.Farmer, eventID int,
) error {

	if account.Role != RoleDeptOfficer {
		return ValidationError{
			Message: "Only the department can close a disaster.",
		}
	}

	return s.disasterRepo.SetEventStatus(eventID, "CLOSED")
}

// Events lists disasters this account may see.
func (s *DisasterService) Events(
	account model.Farmer,
) ([]model.DisasterEvent, error) {
	// A division officer sees only the disasters that touched their own
	// division; the department sees all of them.
	return s.disasterRepo.ListEvents(scopeDivision(account, ""), false)
}

// OpenEventsForFarmer lists the disasters a farmer may claim against.
func (s *DisasterService) OpenEventsForFarmer(
	farmerID int,
) ([]model.DisasterEvent, error) {

	farmer, err := s.farmerRepo.FindByID(farmerID)
	if err != nil {
		return nil, ValidationError{Message: "That farmer does not exist."}
	}

	// Only OPEN events, and only those covering their division.
	return s.disasterRepo.ListEvents(farmer.GNDivision, true)
}

// ============================================================
// SUBMITTING A CLAIM
// ============================================================

// SubmitClaim files a farmer's claim for one crop.
func (s *DisasterService) SubmitClaim(
	req model.SubmitClaimRequest,
) (model.Claim, error) {

	if req.FarmerID <= 0 || req.EventID <= 0 || req.LandCropID <= 0 {
		return model.Claim{}, ValidationError{
			Message: "Please choose a disaster, a land and a crop.",
		}
	}

	farmer, err := s.farmerRepo.FindByID(req.FarmerID)
	if err != nil {
		return model.Claim{}, ValidationError{
			Message: "That farmer does not exist.",
		}
	}

	// ---------- is the disaster real, and still open? ----------
	event, err := s.disasterRepo.FindEvent(req.EventID)
	if err != nil {
		return model.Claim{}, ValidationError{
			Message: "That disaster was not found.",
		}
	}

	if event.Status != "OPEN" {
		return model.Claim{}, ValidationError{
			Message: "Claims for this disaster have closed.",
		}
	}

	// ---------- was this farmer's area affected? ----------
	//
	// A flood in Kurunegala is not a reason to pay a farmer in Jaffna.
	covered, err := s.disasterRepo.DivisionCovered(
		req.EventID, farmer.GNDivision,
	)
	if err != nil {
		return model.Claim{}, err
	}
	if !covered {
		return model.Claim{}, ValidationError{
			Message: fmt.Sprintf(
				"This disaster did not affect %s, so no claim can be made.",
				farmer.GNDivision),
		}
	}

	// ---------- is this crop really theirs? ----------
	//
	// FindLandIDForCrop has the farmer id in its WHERE clause, so a crop
	// belonging to somebody else simply is not found. There is no separate
	// ownership check here that a later edit could forget.
	landID, err := s.landRepo.FindLandIDForCrop(req.LandCropID, req.FarmerID)
	if err != nil {
		return model.Claim{}, ValidationError{
			Message: "That crop is not one you registered.",
		}
	}

	// ---------- how much of it is there? ----------
	lands, err := s.landRepo.FindByFarmer(req.FarmerID)
	if err != nil {
		return model.Claim{}, err
	}

	var registeredArea float64
	var cropName string

	for _, land := range lands {
		for _, c := range land.Crops {
			if c.LandCropID == req.LandCropID {
				registeredArea = c.SizeHa
				cropName = c.Crop
			}
		}
	}

	if cropName == "" {
		return model.Claim{}, ValidationError{
			Message: "That crop is not one you registered.",
		}
	}

	// ---------- does the scheme cover this crop? ----------
	_, hasRate, err := s.disasterRepo.RateForCrop(req.EventID, cropName)
	if err != nil {
		return model.Claim{}, err
	}
	if !hasRate {
		return model.Claim{}, ValidationError{
			Message: fmt.Sprintf(
				"This relief scheme does not cover %s.",
				model.AllowedCrops[cropName].Label),
		}
	}

	// ---------- is the claimed area possible? ----------
	//
	// THE RULE THAT MATTERS MOST HERE. A farmer cannot lose more of a crop
	// than they planted. Without this, the claimed area - and therefore the
	// money - would be whatever somebody typed.
	if req.ClaimedAreaHa <= 0 {
		return model.Claim{}, ValidationError{
			Message: "Please enter how much of the crop was lost.",
		}
	}

	if req.ClaimedAreaHa > registeredArea+claimAreaTolerance {
		return model.Claim{}, ValidationError{
			Message: fmt.Sprintf(
				"You registered %.2f hectares of %s, so you cannot claim "+
					"for %.2f hectares.",
				registeredArea, model.AllowedCrops[cropName].Label,
				req.ClaimedAreaHa),
		}
	}

	// ---------- already claimed? ----------
	exists, err := s.disasterRepo.ClaimExists(req.EventID, req.LandCropID)
	if err != nil {
		return model.Claim{}, err
	}
	if exists {
		return model.Claim{}, ValidationError{
			Message: "You have already claimed for this crop in this " +
				"disaster.",
		}
	}

	req.FarmerNote = strings.TrimSpace(req.FarmerNote)

	claimID, err := s.disasterRepo.InsertClaim(req, landID)
	if err != nil {
		return model.Claim{}, err
	}

	return s.disasterRepo.FindClaim(claimID, "")
}

// FarmerClaims returns one farmer's claims.
func (s *DisasterService) FarmerClaims(
	farmerID int,
) ([]model.Claim, error) {

	if farmerID <= 0 {
		return nil, ValidationError{Message: "No farmer was given."}
	}

	return s.disasterRepo.ListClaims("", "", farmerID, 0)
}

// ============================================================
// THE OFFICER STEPS
// ============================================================

// OfficerClaims returns the claims an officer may act on.
func (s *DisasterService) OfficerClaims(
	account model.Farmer, status string, eventID int,
) ([]model.Claim, error) {

	status = strings.ToUpper(strings.TrimSpace(status))

	switch status {
	case "", model.ClaimSubmitted, model.ClaimVerified,
		model.ClaimApproved, model.ClaimPaid, model.ClaimRejected:
	default:
		return nil, ValidationError{
			Message: "Unknown claim status filter.",
		}
	}

	return s.disasterRepo.ListClaims(
		scopeDivision(account, ""), status, 0, eventID,
	)
}

// ClaimDetail returns one claim and everything that has happened to it.
func (s *DisasterService) ClaimDetail(
	account model.Farmer, claimID int,
) (model.ClaimDetail, error) {

	claim, err := s.disasterRepo.FindClaim(
		claimID, scopeDivision(account, ""),
	)
	if err != nil {
		return model.ClaimDetail{}, err
	}

	history, err := s.disasterRepo.ClaimHistory(claimID)
	if err != nil {
		return model.ClaimDetail{}, err
	}

	return model.ClaimDetail{Claim: claim, History: history}, nil
}

// Verify records what the GN officer actually found on the ground.
func (s *DisasterService) Verify(
	account model.Farmer, claimID int, req model.VerifyClaimRequest,
) error {

	claim, err := s.disasterRepo.FindClaim(
		claimID, scopeDivision(account, ""),
	)
	if err != nil {
		return err
	}

	if err := canMove(
		claim.Status, model.ClaimVerified, account.Role,
	); err != nil {
		return err
	}

	if req.VerifiedAreaHa < 0 {
		return ValidationError{
			Message: "The verified area cannot be negative.",
		}
	}

	// The officer may confirm LESS than was claimed, but not more. Awarding
	// more than the farmer asked for is not verification, and it is not the
	// officer's to give.
	if req.VerifiedAreaHa > claim.ClaimedAreaHa+claimAreaTolerance {
		return ValidationError{
			Message: fmt.Sprintf(
				"The farmer claimed %.2f hectares, so you cannot verify "+
					"%.2f.", claim.ClaimedAreaHa, req.VerifiedAreaHa),
		}
	}

	note := strings.TrimSpace(req.Note)

	// Cutting somebody's claim down always needs an explanation. Confirming
	// it in full speaks for itself.
	reduced := req.VerifiedAreaHa < claim.ClaimedAreaHa-claimAreaTolerance

	if reduced && len([]rune(note)) < minNoteLength {
		return ValidationError{
			Message: "You are verifying less than the farmer claimed. " +
				"Please write why, in at least 10 characters.",
		}
	}

	verified := req.VerifiedAreaHa

	return s.disasterRepo.Transition(
		claimID, account.FarmerID,
		claim.Status, model.ClaimVerified, note, &verified, nil,
	)
}

// Approve releases the money, and works out how much.
func (s *DisasterService) Approve(
	account model.Farmer, claimID int, req model.DecisionRequest,
) error {

	claim, err := s.disasterRepo.FindClaim(
		claimID, scopeDivision(account, ""),
	)
	if err != nil {
		return err
	}

	if err := canMove(
		claim.Status, model.ClaimApproved, account.Role,
	); err != nil {
		return err
	}

	if claim.VerifiedAreaHa == nil {
		// Cannot happen, since only a VERIFIED claim reaches here. But an
		// assumption that fails silently is worse than one that stops.
		return ValidationError{
			Message: "This claim has not been verified yet.",
		}
	}

	rate, found, err := s.disasterRepo.RateForCrop(claim.EventID, claim.Crop)
	if err != nil {
		return err
	}
	if !found {
		return ValidationError{
			Message: fmt.Sprintf(
				"This scheme has no rate for %s, so no amount can be "+
					"worked out.", claim.Crop),
		}
	}

	// ---------- THE ARITHMETIC ----------
	//
	// verified hectares x rupees per hectare, rounded to the cent.
	//
	// Nobody types this number. That is the whole point of a rate table:
	// two farmers who lost the same half hectare of rice receive the same
	// amount, and the figure can be checked by anybody with a calculator.
	amount := math.Round(*claim.VerifiedAreaHa*rate*100) / 100

	return s.disasterRepo.Transition(
		claimID, account.FarmerID,
		claim.Status, model.ClaimApproved,
		strings.TrimSpace(req.Note), nil, &amount,
	)
}

// Reject turns a claim down, at whichever stage it has reached.
func (s *DisasterService) Reject(
	account model.Farmer, claimID int, req model.DecisionRequest,
) error {

	claim, err := s.disasterRepo.FindClaim(
		claimID, scopeDivision(account, ""),
	)
	if err != nil {
		return err
	}

	if err := canMove(
		claim.Status, model.ClaimRejected, account.Role,
	); err != nil {
		return err
	}

	note := strings.TrimSpace(req.Note)

	// A rejection ALWAYS needs a reason. The farmer is being told no, and
	// they are entitled to know why - both as a matter of fairness and so
	// they can correct a genuine mistake and claim again.
	if len([]rune(note)) < minNoteLength {
		return ValidationError{
			Message: "Please write why this claim is being rejected, in at " +
				"least 10 characters. The farmer will see it.",
		}
	}

	return s.disasterRepo.Transition(
		claimID, account.FarmerID,
		claim.Status, model.ClaimRejected, note, nil, nil,
	)
}

// MarkPaid records that the farmer has collected the money.
func (s *DisasterService) MarkPaid(
	account model.Farmer, claimID int, req model.DecisionRequest,
) error {

	claim, err := s.disasterRepo.FindClaim(
		claimID, scopeDivision(account, ""),
	)
	if err != nil {
		return err
	}

	if err := canMove(
		claim.Status, model.ClaimPaid, account.Role,
	); err != nil {
		return err
	}

	return s.disasterRepo.Transition(
		claimID, account.FarmerID,
		claim.Status, model.ClaimPaid,
		strings.TrimSpace(req.Note), nil, nil,
	)
}

// ---------- small helpers ----------

func isKnownDisasterType(t string) bool {
	for _, known := range model.DisasterTypes() {
		if known == t {
			return true
		}
	}
	return false
}

// parseDay reads a YYYY-MM-DD date and rejects anything else.
//
// time.Parse would accept "2026-13-45" by rolling it over into the next
// year, which is how a typing mistake becomes a date nobody notices.
func parseDay(value string, what string) (time.Time, error) {
	value = strings.TrimSpace(value)

	if !datePattern.MatchString(value) {
		return time.Time{}, ValidationError{
			Message: fmt.Sprintf(
				"Please give the %s as YYYY-MM-DD.", what),
		}
	}

	day, err := time.Parse("2006-01-02", value)
	if err != nil {
		return time.Time{}, ValidationError{
			Message: fmt.Sprintf("That %s is not a real date.", what),
		}
	}

	// time.Parse rolls 2026-02-30 forward to 2026-03-02 rather than
	// refusing it. Formatting it back and comparing catches that.
	if day.Format("2006-01-02") != value {
		return time.Time{}, ValidationError{
			Message: fmt.Sprintf("That %s is not a real date.", what),
		}
	}

	return day, nil
}
