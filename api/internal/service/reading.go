package service

import (
	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

// ReadingService holds everything it needs to do its job.
type ReadingService struct {
	repo       *repository.ReadingRepository
	location   *LocationService
	validation *ValidationService
}

// NewReadingService builds the service.
func NewReadingService(
	repo *repository.ReadingRepository,
	location *LocationService,
	validation *ValidationService,
) *ReadingService {
	return &ReadingService{
		repo:       repo,
		location:   location,
		validation: validation,
	}
}

// CreateReading validates, places in space, checks quality, then saves.
//
// The ORDER of these steps matters a lot. Read the comments.
func (s *ReadingService) CreateReading(reading model.Reading) (int, error) {

	// ---------- STEP 0a: clean the text fields ---------- NEW
	// "Rice" becomes "rice". " vegetative " becomes "vegetative".
	// We do this BEFORE validating, so a capital letter is not an error.
	reading = s.validation.Normalize(reading)

	// ---------- STEP 0b: hard rules. Refuse impossible values. ----------
	// This is FIRST, so bad data never creates an orphan anchor.
	if err := s.validation.Validate(reading); err != nil {
		return 0, err
	}

	// ---------- STEP 1: find the matching field ----------
	// This MUST happen before step 3, because the quality check
	// looks up history BY ANCHOR ID.
	anchorID, err := s.location.FindOrCreateAnchor(reading.RawLat, reading.RawLng)
	if err != nil {
		return 0, err
	}
	reading.AnchorID = &anchorID

	// ---------- STEP 2: find the district ----------
	reading.DistrictID = s.location.FindDistrictID(reading.RawLat, reading.RawLng)

	// ---------- STEP 3: soft rules. Check against history. ---------- NEW
	//
	// This needs the anchor from step 1, so it cannot come earlier.
	//
	// NOTE: a suspicious reading is NOT refused. It is SAVED with a flag.
	// Only a real database failure returns an error here.
	flag, err := s.validation.CheckQuality(reading)
	if err != nil {
		return 0, err
	}
	reading.QualityFlag = flag

	// ---------- STEP 4: save the complete reading ----------
	return s.repo.Insert(reading)
}

// GetReading reads one reading by id, and fills in its derived zone.
func (s *ReadingService) GetReading(id int) (model.Reading, error) {
	reading, err := s.repo.GetByID(id)
	if err != nil {
		return reading, err
	}

	// Zone is DERIVED, not stored. We work it out from the district.
	// Phase 6 will send this same value to the model.
	reading.Zone = s.location.ZoneForDistrict(reading.DistrictID)

	return reading, nil
}
