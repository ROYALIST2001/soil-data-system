package service

import (
	"strings"

	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

// How many rows a dashboard request may return at once.
//
// A limit is not optional. Without one, a single request could try to load
// every reading in the country into memory, into JSON, and into a browser.
// The server would struggle and the browser would freeze.
const (
	maxReadingRows = 500
	maxMapPoints   = 2000
)

// Role names, matching the CHECK constraint in migration 009.
const (
	RoleFarmer      = "FARMER"
	RoleGNOfficer   = "GN_OFFICER"
	RoleDeptOfficer = "DEPT_OFFICER"
)

// OfficerService answers the dashboards, within what the officer may see.
type OfficerService struct {
	officerRepo *repository.OfficerRepository
	landRepo    *repository.LandRepository
}

// NewOfficerService builds the service.
func NewOfficerService(
	officerRepo *repository.OfficerRepository,
	landRepo *repository.LandRepository,
) *OfficerService {
	return &OfficerService{officerRepo: officerRepo, landRepo: landRepo}
}

// ---------- THE ONE FUNCTION THAT DECIDES WHO SEES WHAT ----------
//
// Every method below calls this, and nothing else works out a division.
// Having exactly one place where the rule lives is the whole point: a second
// copy is a second chance to get it wrong, and the wrong answer here means
// one officer reading another division's farmers.
//
// A department officer may ask for a division, or for all of them.
// A division officer ALWAYS gets their own, whatever they asked for. Their
// request is not rejected - it is simply answered about their own division.
// Rejecting would tell them another division exists; this way the question
// is just quietly about them.
func scopeDivision(account model.Farmer, requested string) string {

	if account.Role == RoleGNOfficer {
		if account.ScopeDivision == nil {
			// An officer with no division assigned can see nobody. This
			// should never happen - the seed command always sets one - but
			// the safe failure is "nothing", never "everything".
			return "\x00no-division-assigned"
		}
		return *account.ScopeDivision
	}

	// Department officer: whatever they asked for, or everything.
	return strings.TrimSpace(requested)
}

// maskNIC hides all but the last four characters of an identity card number.
//
//	200128100321 -> ********0321
//
// Applied for department officers, who are looking at national lists and
// have no reason to hold whole identity numbers. A division officer, who
// meets these farmers, sees the real one.
func maskNIC(nic string) string {
	runes := []rune(nic)
	if len(runes) <= 4 {
		return nic
	}

	return strings.Repeat("*", len(runes)-4) + string(runes[len(runes)-4:])
}

// applyPrivacy decides what actually leaves the server for this officer.
//
// NOT a screen concern. If the server sends a mobile number, it is in the
// browser, and anything in the browser can be read, copied or logged
// whatever the screen chooses to draw.
func applyPrivacy(account model.Farmer, f *model.FarmerSummary) {
	if account.Role == RoleDeptOfficer {
		f.NIC = maskNIC(f.NIC)
		f.Mobile = ""
		f.Email = ""
	}
}

// ---------- DIVISIONS ----------

// Divisions returns the list for the filter dropdown.
func (s *OfficerService) Divisions(
	account model.Farmer,
) ([]model.DivisionSummary, error) {
	// A division officer gets a list of exactly one: their own.
	return s.officerRepo.ListDivisions(scopeDivision(account, ""))
}

// ---------- FARMERS ----------

// Farmers returns the farmer table.
func (s *OfficerService) Farmers(
	account model.Farmer, requestedDivision string,
) ([]model.FarmerSummary, error) {

	farmers, err := s.officerRepo.ListFarmers(
		scopeDivision(account, requestedDivision),
	)
	if err != nil {
		return nil, err
	}

	for i := range farmers {
		applyPrivacy(account, &farmers[i])
	}

	return farmers, nil
}

// FarmerDetail returns one farmer with their lands and readings.
func (s *OfficerService) FarmerDetail(
	account model.Farmer, farmerID int,
) (model.FarmerDetail, error) {

	division := scopeDivision(account, "")

	farmer, err := s.officerRepo.FindFarmer(farmerID, division)
	if err != nil {
		// Not found, or outside this officer's division. The controller
		// turns both into 404, so the API never confirms that a farmer
		// exists somewhere the officer may not look.
		return model.FarmerDetail{}, err
	}

	applyPrivacy(account, &farmer)

	lands, err := s.landRepo.FindByFarmer(farmerID)
	if err != nil {
		return model.FarmerDetail{}, err
	}

	readings, err := s.officerRepo.ListReadings(
		division, "", farmerID, maxReadingRows,
	)
	if err != nil {
		return model.FarmerDetail{}, err
	}

	return model.FarmerDetail{
		Farmer:   farmer,
		Lands:    lands,
		Readings: readings,
	}, nil
}

// ---------- READINGS ----------

// Readings returns the readings table, filtered.
func (s *OfficerService) Readings(
	account model.Farmer, requestedDivision string, flag string,
) ([]model.ReadingRow, error) {

	flag = strings.ToUpper(strings.TrimSpace(flag))

	// Only flags we know. An unknown value would otherwise silently match
	// nothing and look like "this division has no readings".
	switch flag {
	case "", FlagOK, FlagFlagged, FlagQuarantined:
	default:
		return nil, ValidationError{
			Message: "Filter must be OK, FLAGGED or QUARANTINED.",
		}
	}

	return s.officerRepo.ListReadings(
		scopeDivision(account, requestedDivision), flag, 0, maxReadingRows,
	)
}

// ---------- MAP ----------

// MapPoints returns the dots for the soil map.
func (s *OfficerService) MapPoints(
	account model.Farmer, requestedDivision string,
) ([]model.MapPoint, error) {

	return s.officerRepo.ListMapPoints(
		scopeDivision(account, requestedDivision), maxMapPoints,
	)
}
