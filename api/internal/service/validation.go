package service

import (
	"fmt"
	"math"
	"strings"

	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

// ---------- PART 1: THE HARD RULES (unchanged) ----------

const (
	minPH = 0.0
	maxPH = 14.0

	minNutrient  = 0.0
	maxNitrogen  = 1000.0
	maxPhosphor  = 500.0
	maxPotassium = 1000.0

	minArea = 0.0001
	maxArea = 1000.0

	minYield = 0.0001
	maxYield = 100.0

	minLat = -90.0
	maxLat = 90.0
	minLng = -180.0
	maxLng = 180.0
)

// ---------- PART 2: THE FLAG VALUES ----------
// We use constants, not plain text, so a typing mistake
// like "FLAGED" becomes an error in the editor, not a silent bug.

const (
	FlagOK           = "OK"
	FlagFlagged      = "FLAGGED"
	FlagQuarantined  = "QUARANTINED"
)

// ---------- PART 2: THE SOFT RULE LIMITS ----------

const (
	// How many past readings to fetch for comparison.
	historyLimit = 5

	// pH uses SUBTRACTION, because pH is a scale, not a quantity.
	// Soil pH normally moves less than 0.5 per YEAR.
	phJumpFlag       = 1.5 // unusual, but possible if lime was added
	phJumpQuarantine = 3.0 // almost never real

	// Nutrients use a RATIO (how many TIMES bigger), not subtraction.
	//
	// Why? Because +50 means very different things:
	//   10 -> 60   is 6 times bigger.   Suspicious.
	//   300 -> 350 is 1.17 times bigger. Normal.
	//
	// The 10x rule catches the most common human mistake:
	// typing an extra zero (40 becomes 400).
	nutrientRatioFlag       = 3.0
	nutrientRatioQuarantine = 10.0
)

// ValidationService checks every reading before it is saved.
// CHANGED: it now holds the reading repository, so it can
// look up a field's history.
type ValidationService struct {
	readingRepo *repository.ReadingRepository
}

// NewValidationService builds the service.
// CHANGED: it now receives the reading repository.
func NewValidationService(readingRepo *repository.ReadingRepository) *ValidationService {
	return &ValidationService{readingRepo: readingRepo}
}

// checkRange is a small helper for the hard rules. Unchanged.
func checkRange(fieldName string, value float64, min float64, max float64) error {
	if value < min || value > max {
		return fmt.Errorf("%s must be between %g and %g (you sent %.2f)",
			fieldName, min, max, value)
	}
	return nil
}

// Validate checks the HARD rules. Unchanged from Part 1.
// If this fails, the reading is REFUSED. Nothing is saved.
func (s *ValidationService) Validate(reading model.Reading) error {

	if err := checkRange("Latitude", reading.RawLat, minLat, maxLat); err != nil {
		return err
	}
	if err := checkRange("Longitude", reading.RawLng, minLng, maxLng); err != nil {
		return err
	}
	if err := checkRange("pH", reading.PH, minPH, maxPH); err != nil {
		return err
	}
	if err := checkRange("Nitrogen", reading.N, minNutrient, maxNitrogen); err != nil {
		return err
	}
	if err := checkRange("Phosphorus", reading.P, minNutrient, maxPhosphor); err != nil {
		return err
	}
	if err := checkRange("Potassium", reading.K, minNutrient, maxPotassium); err != nil {
		return err
	}
	if err := checkRange("Field area", reading.Area, minArea, maxArea); err != nil {
		return err
	}
	if err := checkRange("Target yield", reading.TargetYield, minYield, maxYield); err != nil {
		return err
	}

	if strings.TrimSpace(reading.Crop) == "" {
		return fmt.Errorf("Crop is required")
	}
	if strings.TrimSpace(reading.Stage) == "" {
		return fmt.Errorf("Growth stage is required")
	}

	return nil
}

// ---------- PART 2: THE SOFT RULES ----------

// changeRatio works out how many TIMES bigger the new value is.
//
// IMPORTANT: this protects against dividing by zero.
// In Go, dividing by zero gives +Inf (infinity), which would
// break every comparison below it.
func changeRatio(oldValue float64, newValue float64) float64 {
	// No old value to compare against.
	// Return 1.0, which means "no change". The safe, neutral answer.
	if oldValue <= 0 {
		return 1.0
	}

	ratio := newValue / oldValue

	// If the value went DOWN, flip it, so we always get a number >= 1.
	// A drop to one tenth is just as suspicious as a rise to ten times.
	if ratio < 1 {
		ratio = 1 / ratio
	}

	return ratio
}

// worseFlag returns whichever of the two flags is more serious.
// We use this because several checks run, and the WORST one wins.
func worseFlag(a string, b string) string {
	// QUARANTINED is the most serious.
	if a == FlagQuarantined || b == FlagQuarantined {
		return FlagQuarantined
	}
	if a == FlagFlagged || b == FlagFlagged {
		return FlagFlagged
	}
	return FlagOK
}

// CheckQuality compares a new reading against that field's history
// and decides: OK, FLAGGED, or QUARANTINED.
//
// IMPORTANT: a suspicious reading is NOT an error.
// The error slot is only used if the DATABASE fails.
func (s *ValidationService) CheckQuality(reading model.Reading) (string, error) {

	// ---------- STEP 1: is there an anchor? ----------
	// Without one we cannot look up history.
	// Phase 3 always sets it, but we check anyway. Defensive programming.
	if reading.AnchorID == nil {
		return FlagOK, nil
	}

	// ---------- STEP 2: fetch this field's recent GOOD readings ----------
	history, err := s.readingRepo.FindRecentByAnchor(*reading.AnchorID, historyLimit)
	if err != nil {
		// The DATABASE failed. This IS a real error.
		return "", err
	}

	// ---------- STEP 3: is there any history? ----------
	// This is the first reading from this field.
	// No history means no judgement. Accept it.
	if len(history) == 0 {
		return FlagOK, nil
	}

	// ---------- STEP 4: compare against the most recent one ----------
	// history[0] is the NEWEST, because the SQL sorted DESC.
	// The newest is the best comparison, because it is closest in time.
	last := history[0]

	flag := FlagOK

	// ---------- STEP 5: check the pH jump ----------
	// Subtraction, because pH is a SCALE, not a quantity.
	// math.Abs makes the number positive, because we care about
	// HOW BIG the change is, not the direction.
	phJump := math.Abs(reading.PH - last.PH)

	if phJump >= phJumpQuarantine {
		flag = worseFlag(flag, FlagQuarantined)
	} else if phJump >= phJumpFlag {
		flag = worseFlag(flag, FlagFlagged)
	}

	// ---------- STEP 6: check the nutrients ----------
	// Ratio, because nutrients are QUANTITIES.
	// We check all three: N, P, K.
	nutrients := []struct {
		oldValue float64
		newValue float64
	}{
		{last.N, reading.N},
		{last.P, reading.P},
		{last.K, reading.K},
	}

	for _, item := range nutrients {
		ratio := changeRatio(item.oldValue, item.newValue)

		if ratio >= nutrientRatioQuarantine {
			flag = worseFlag(flag, FlagQuarantined)
		} else if ratio >= nutrientRatioFlag {
			flag = worseFlag(flag, FlagFlagged)
		}
	}

	// ---------- STEP 7: return the WORST flag found ----------
	return flag, nil
}
