package service

import (
	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

// ReadingService holds everything it needs to do its job.
// CHANGED: it now also holds the validation service.
type ReadingService struct {
	repo       *repository.ReadingRepository
	location   *LocationService
	validation *ValidationService
}

// NewReadingService builds the service.
// All three things are passed in from outside (dependency injection).
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

// CreateReading validates, places in space, then saves.
//
// This function knows the ORDER of the steps.
// It does NOT know HOW each step works.
func (s *ReadingService) CreateReading(reading model.Reading) (int, error) {

	// ---------- STEP 0: VALIDATE FIRST ---------- NEW
	//
	// This MUST be first. Two reasons:
	//
	// 1. Do not waste work. Why measure distance to 500 anchors
	//    if we are going to throw the reading away?
	//
	// 2. MORE IMPORTANT: do not create rubbish.
	//    FindOrCreateAnchor CREATES a new anchor if none is near.
	//    If we validated after it, a bad reading would leave an
	//    ORPHAN ANCHOR in the database forever - a field with no readings.
	if err := s.validation.Validate(reading); err != nil {
		// Stop here. Nothing below this line runs. Nothing is saved.
		return 0, err
	}

	// ---------- STEP 1: find the matching field ----------
	// This must happen before the insert, because readings.anchor_id
	// points to it, and the database refuses links to missing rows.
	anchorID, err := s.location.FindOrCreateAnchor(reading.RawLat, reading.RawLng)
	if err != nil {
		return 0, err
	}
	reading.AnchorID = &anchorID

	// ---------- STEP 2: find the district ----------
	// Can be nil, for example a point in the sea. That is allowed.
	reading.DistrictID = s.location.FindDistrictID(reading.RawLat, reading.RawLng)

	// ---------- STEP 3: save it ----------
	// PART 2 NOTE: the quality flag will be set here, before the insert.
	return s.repo.Insert(reading)
}

// GetReading reads one reading by id. This did NOT change.
func (s *ReadingService) GetReading(id int) (model.Reading, error) {
	return s.repo.GetByID(id)
}
