package service

import (
	"fmt"

	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

// The size of one "local area" square, in degrees.
//
// WHY 0.025?
//   0.01  is about 1.1 km
//   0.025 is about 2.8 km   <-- ours
//   0.05  is about 5.5 km
//
// Your project document says "2-3 km neighbourhood", so 0.025 fits.
//
// HONEST LIMITATION: a grid has EDGE EFFECTS. Two farms 200 m apart
// can fall in different squares if the boundary runs between them.
// H3 hexagons would avoid this, but need an extra library.
// Simple and fast was the right trade for this project.
const areaRadiusDegrees = 0.025

// AnalyticsService produces the history graphs.
type AnalyticsService struct {
	repo *repository.AnalyticsRepository
}

// NewAnalyticsService builds the service.
func NewAnalyticsService(repo *repository.AnalyticsRepository) *AnalyticsService {
	return &AnalyticsService{repo: repo}
}

// FieldHistory returns the history for ONE exact field.
func (s *AnalyticsService) FieldHistory(anchorID int) (model.HistorySeries, error) {

	points, err := s.repo.FieldHistory(anchorID)
	if err != nil {
		return model.HistorySeries{}, err
	}

	return s.buildSeries(
		"field",
		fmt.Sprintf("Field %d", anchorID),
		points,
	), nil
}

// AreaHistory returns the history for a small neighbourhood.
func (s *AnalyticsService) AreaHistory(lat, lng float64) (model.HistorySeries, error) {

	points, err := s.repo.AreaHistory(lat, lng, areaRadiusDegrees)
	if err != nil {
		return model.HistorySeries{}, err
	}

	return s.buildSeries(
		"area",
		fmt.Sprintf("Area around %.3f, %.3f", lat, lng),
		points,
	), nil
}

// DistrictHistory returns the history for one whole district.
func (s *AnalyticsService) DistrictHistory(districtID int) (model.HistorySeries, error) {

	// Get the name, so the graph has a proper title.
	name, err := s.repo.DistrictName(districtID)
	if err != nil {
		return model.HistorySeries{}, err
	}

	points, err := s.repo.DistrictHistory(districtID)
	if err != nil {
		return model.HistorySeries{}, err
	}

	return s.buildSeries("district", name, points), nil
}

// buildSeries tidies the points and wraps them with a description.
func (s *AnalyticsService) buildSeries(
	level string,
	label string,
	points []model.HistoryPoint,
) model.HistorySeries {

	// An EMPTY result is NOT an error.
	// "No data yet" is a normal situation for a new field.
	if points == nil {
		points = []model.HistoryPoint{}
	}

	total := 0

	for i := range points {
		// Round the values. The database gives 6.433333333333333.
		// A farmer does not need 15 decimals, and shorter JSON
		// is faster on a slow phone connection.
		points[i].N = round2(points[i].N)
		points[i].P = round2(points[i].P)
		points[i].K = round2(points[i].K)
		points[i].PH = round2(points[i].PH)

		total += points[i].Count
	}

	return model.HistorySeries{
		Level:         level,
		Label:         label,
		TotalReadings: total,
		Points:        points,
	}
}
