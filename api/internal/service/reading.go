package service

import (
	"fmt"

	"soil-data-system/api/internal/client"
	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

// ReadingService holds everything it needs.
// CHANGED: it now also holds the AI client and the fertilizer service.
type ReadingService struct {
	repo       *repository.ReadingRepository
	location   *LocationService
	validation *ValidationService
	aiClient   *client.AIClient
	fertilizer *FertilizerService
}

// NewReadingService builds the service.
func NewReadingService(
	repo *repository.ReadingRepository,
	location *LocationService,
	validation *ValidationService,
	aiClient *client.AIClient,
	fertilizer *FertilizerService,
) *ReadingService {
	return &ReadingService{
		repo:       repo,
		location:   location,
		validation: validation,
		aiClient:   aiClient,
		fertilizer: fertilizer,
	}
}

// CreateReading validates, places in space, checks quality, then saves.
// UNCHANGED from Phase 4.
func (s *ReadingService) CreateReading(reading model.Reading) (int, error) {

	// STEP 0a: clean the text fields.
	reading = s.validation.Normalize(reading)

	// STEP 0b: hard rules. Refuse impossible values.
	if err := s.validation.Validate(reading); err != nil {
		return 0, err
	}

	// STEP 1: find the matching field.
	anchorID, err := s.location.FindOrCreateAnchor(reading.RawLat, reading.RawLng)
	if err != nil {
		return 0, err
	}
	reading.AnchorID = &anchorID

	// STEP 2: find the district.
	reading.DistrictID = s.location.FindDistrictID(reading.RawLat, reading.RawLng)

	// STEP 3: soft rules. Check against history.
	flag, err := s.validation.CheckQuality(reading)
	if err != nil {
		return 0, err
	}
	reading.QualityFlag = flag

	// STEP 4: save it.
	return s.repo.Insert(reading)
}

// GetReading reads one reading by id, and fills in its derived zone.
func (s *ReadingService) GetReading(id int) (model.Reading, error) {
	reading, err := s.repo.GetByID(id)
	if err != nil {
		return reading, err
	}

	reading.Zone = s.location.ZoneForDistrict(reading.DistrictID)
	return reading, nil
}

// GetRecommendation produces the fertilizer advice for one reading.
// NEW in Phase 6.
func (s *ReadingService) GetRecommendation(id int) (model.Recommendation, error) {

	var empty model.Recommendation

	// ---------- STEP 1: load the reading ----------
	reading, err := s.GetReading(id)
	if err != nil {
		return empty, err
	}

	// ---------- STEP 2: refuse if the data was flagged ----------
	//
	// IMPORTANT. Remember Phase 4.
	//
	// A flagged reading is SUSPICIOUS. Maybe pH 9.8 was a typing
	// mistake. If we gave advice from bad data, the farmer might
	// apply the wrong fertilizer to a real field. That costs money
	// and can damage the crop.
	//
	// The Phase 4 rule was: flagged rows are excluded from analysis.
	// A RECOMMENDATION IS ANALYSIS.
	if reading.QualityFlag != FlagOK {
		return empty, fmt.Errorf(
			"This reading was marked as %s during the quality check, "+
				"so no recommendation can be given. Please take a new soil test.",
			reading.QualityFlag)
	}

	// ---------- STEP 3: build the AI request ----------
	aiRequest := client.PredictRequest{
		SoilN:       reading.N,
		SoilP:       reading.P,
		SoilK:       reading.K,
		SoilPH:      reading.PH,
		Crop:        reading.Crop,
		Stage:       reading.Stage,
		Zone:        reading.Zone,
		TargetYield: reading.TargetYield,
	}

	// ---------- STEP 4: call the AI service ----------
	prediction, err := s.aiClient.Predict(aiRequest)
	if err != nil {
		return empty, fmt.Errorf("could not get a prediction: %w", err)
	}

	// ---------- STEP 5: do the chemistry ----------
	// This is FIXED chemistry, not AI.
	recommendation := s.fertilizer.BuildRecommendation(
		reading,
		prediction.NeedN,
		prediction.NeedP,
		prediction.NeedK,
		prediction.Predictor,
	)

	return recommendation, nil
}
