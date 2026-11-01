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

	// ---------- STEP 4: ask the agent to EXPLAIN, if flagged ---------- NEW
	//
	// WE ONLY CALL THE AGENT FOR FLAGGED READINGS.
	//
	// WHY? Most readings are OK, so most submits never touch the LLM.
	// That keeps the common case FAST and FREE.
	if flag != FlagOK {
		s.attachAgentNote(&reading)
	}

	// ---------- STEP 5: save the complete reading ----------
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

// attachAgentNote asks the Data-Quality Agent to explain a flagged reading.
//
// IMPORTANT: this is OPTIONAL. If it fails, we simply save WITHOUT a note.
// The reading is still stored. The flag still stands. Nothing breaks.
//
// RULE: the optional feature must never break the essential one.
func (s *ReadingService) attachAgentNote(reading *model.Reading) {

	if reading.AnchorID == nil {
		return
	}

	// Get the field's recent GOOD readings, for grounding.
	// Without real facts, the model would invent numbers.
	history, err := s.repo.FindRecentByAnchor(*reading.AnchorID, 5)
	if err != nil {
		// Cannot get history. Skip the agent. Not a failure.
		return
	}

	// Build the history list, OLDEST first, so the story reads naturally.
	var items []client.HistoryItem
	for i := len(history) - 1; i >= 0; i-- {
		h := history[i]
		items = append(items, client.HistoryItem{
			Date: h.CreatedAt.Format("2006-01-02"),
			N:    h.N,
			P:    h.P,
			K:    h.K,
			PH:   h.PH,
			Crop: h.Crop,
		})
	}

	result, err := s.aiClient.ReviewQuality(client.QualityReviewRequest{
		SoilN:    reading.N,
		SoilP:    reading.P,
		SoilK:    reading.K,
		SoilPH:   reading.PH,
		Crop:     reading.Crop,
		Stage:    reading.Stage,
		RuleFlag: reading.QualityFlag,
		History:  items,
	})

	if err != nil {
		// The LLM is down, the key is missing, or the free tier ran out.
		// SAVE WITHOUT A NOTE. The reading is not lost.
		return
	}

	// Store what the agent said.
	//
	// NOTE: we do NOT change reading.QualityFlag.
	// THE RULES DECIDE. THE LLM ONLY EXPLAINS.
	reading.AgentNote = &result.Explanation
	reading.AgentVerdict = &result.AgentVerdict
}
