package service

import (
	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

// ReadingService holds everything it needs to do its job.
// CHANGED: it now also holds the location service.
type ReadingService struct {
	repo     *repository.ReadingRepository
	location *LocationService
}

// NewReadingService builds the service.
// Both things are passed in from outside. This is dependency injection.
func NewReadingService(
	repo *repository.ReadingRepository,
	location *LocationService,
) *ReadingService {
	return &ReadingService{
		repo:     repo,
		location: location,
	}
}

// CreateReading places the reading in space, then saves it.
//
// This function knows the ORDER of the steps.
// It does NOT know HOW each step works. That is the point.
func (s *ReadingService) CreateReading(reading model.Reading) (int, error) {

	// STEP 1: find the matching field, or make a new one.
	//
	// This MUST happen first, because readings.anchor_id points to it.
	// The database will REFUSE a link to a row that does not exist.
	anchorID, err := s.location.FindOrCreateAnchor(reading.RawLat, reading.RawLng)
	if err != nil {
		return 0, err
	}

	// The & makes a pointer, because our model field is *int.
	reading.AnchorID = &anchorID

	// STEP 2: find which district the point falls inside.
	//
	// No & here, because FindDistrictID ALREADY returns a pointer.
	// This can be nil, for example a point in the sea. That is allowed.
	reading.DistrictID = s.location.FindDistrictID(reading.RawLat, reading.RawLng)

	// STEP 3: the reading is now complete. Save it.
	//
	// PHASE 4 NOTE: data validation will be added here, before this line.
	return s.repo.Insert(reading)
}

// GetReading reads one reading by id. This did NOT change.
func (s *ReadingService) GetReading(id int) (model.Reading, error) {
	return s.repo.GetByID(id)
}
