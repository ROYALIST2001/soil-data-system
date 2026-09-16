package service

import (
	"fmt"
	"strings"

	"soil-data-system/api/internal/model"
)

// ---------- THE RULES ----------
// Every limit has a name. Nothing is hidden inside the code below.
// If your supervisor asks "what are your rules?", show them this block.

const (
	// pH scale is DEFINED as 0 to 14. Outside this is not a pH at all.
	minPH = 0.0
	maxPH = 14.0

	// Soil nutrients cannot be negative.
	// The maximums are generous, to catch only IMPOSSIBLE values.
	minNutrient = 0.0
	maxNitrogen = 1000.0 // normal farm soil: 20 to 300
	maxPhosphor = 500.0  // normal farm soil: 5 to 100
	maxPotassium = 1000.0 // normal farm soil: 50 to 400

	// A field cannot have zero size.
	// Also important: we DIVIDE by area in Phase 6.
	// Dividing by zero would crash the program.
	minArea = 0.0001
	maxArea = 1000.0

	// Target yield cannot be zero or negative.
	minYield = 0.0001
	maxYield = 100.0

	// These are the limits of the Earth itself.
	minLat = -90.0
	maxLat = 90.0
	minLng = -180.0
	maxLng = 180.0
)

// ValidationService checks every reading before it is saved.
// It is empty now. In Part 2 it will hold the reading repository,
// so it can compare a new reading against that field's history.
type ValidationService struct {
}

// NewValidationService builds the service.
func NewValidationService() *ValidationService {
	return &ValidationService{}
}

// checkRange is a small helper.
// We need 8 range checks. Without this helper we would write
// almost the same if-statement 8 times.
//
// It also makes every error message look the same, automatically.
func checkRange(fieldName string, value float64, min float64, max float64) error {
	if value < min || value > max {
		// A GOOD error message names the field, states the rule,
		// and shows what the user actually sent.
		return fmt.Errorf("%s must be between %g and %g (you sent %.2f)",
			fieldName, min, max, value)
	}
	return nil // nil means "no error"
}

// Validate checks one reading against all the hard rules.
// It returns nil if everything is fine.
// It returns the FIRST problem it finds.
func (s *ValidationService) Validate(reading model.Reading) error {

	// ---------- CHECK 1: the location ----------
	// We check this first, because location is the spine of the project.
	if err := checkRange("Latitude", reading.RawLat, minLat, maxLat); err != nil {
		return err
	}
	if err := checkRange("Longitude", reading.RawLng, minLng, maxLng); err != nil {
		return err
	}

	// ---------- CHECK 2: the soil values ----------
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

	// ---------- CHECK 3: the crop context ----------
	if err := checkRange("Field area", reading.Area, minArea, maxArea); err != nil {
		return err
	}
	if err := checkRange("Target yield", reading.TargetYield, minYield, maxYield); err != nil {
		return err
	}

	// ---------- CHECK 4: required text fields ----------
	// GO TRAP: if a NUMBER is missing from the JSON, Go makes it 0.
	// So a missing pH would arrive as 0, which passes the range check!
	//
	// Text is different. A missing text field arrives as "".
	// So we can reliably check text for being empty.
	//
	// TrimSpace removes spaces, so "   " also counts as empty.
	if strings.TrimSpace(reading.Crop) == "" {
		return fmt.Errorf("Crop is required")
	}
	if strings.TrimSpace(reading.Stage) == "" {
		return fmt.Errorf("Growth stage is required")
	}

	// Everything passed. nil means "no error".
	return nil
}
