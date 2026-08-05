package service

import (
	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

// ReadingService holds the repository.
type ReadingService struct {
	repo *repository.ReadingRepository
}

// NewReadingService builds the service with a repository.
func NewReadingService(repo *repository.ReadingRepository) *ReadingService {
	return &ReadingService{repo: repo}
}

// CreateReading saves a reading.
func (s *ReadingService) CreateReading(reading model.Reading) (int, error) {
	// Phase 2: just save it.
	// Phase 3 will add location logic here. Phase 4 will add validation.
	return s.repo.Insert(reading)
}

// GetReading reads one reading by id.
func (s *ReadingService) GetReading(id int) (model.Reading, error) {
	return s.repo.GetByID(id)
}