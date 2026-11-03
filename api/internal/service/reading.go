package service

import (
	"fmt"

	"soil-data-system/api/internal/client"
	"soil-data-system/api/internal/locationcatalog"
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

	// NEW in Phase 10: used only to confirm a reading's land really belongs
	// to the farmer who sent it.
	landRepo *repository.LandRepository
}

// NewReadingService builds the service.
func NewReadingService(
	repo *repository.ReadingRepository,
	location *LocationService,
	validation *ValidationService,
	aiClient *client.AIClient,
	fertilizer *FertilizerService,
	landRepo *repository.LandRepository,
) *ReadingService {
	return &ReadingService{
		repo:       repo,
		location:   location,
		validation: validation,
		aiClient:   aiClient,
		fertilizer: fertilizer,
		landRepo:   landRepo,
	}
}

// CreateReading validates, resolves GPS or the verified land's division, checks quality and saves.
func (s *ReadingService) CreateReading(reading model.Reading) (int, error) {

	// STEP 0a: clean the text fields.
	reading = s.validation.Normalize(reading)

	// STEP 0b: hard rules. Refuse impossible values.
	if err := s.validation.Validate(reading); err != nil {
		return 0, err
	}

	// ---------- STEP 0c: is this land really theirs? ---------- NEW Phase 10
	//
	// The app sends farmer_id and land_id, which means a caller could send
	// SOMEBODY ELSE'S land id and attach their reading to another farmer's
	// field. That would corrupt that farmer's history and, once the officer
	// dashboards exist, show the reading under the wrong person.
	//
	// So we check. A link the server has not verified is not a link worth
	// having, and both dashboards are built on this one being true.
	if err := s.checkLandBelongsToFarmer(reading); err != nil {
		return 0, err
	}

	// Resolve the verified land, never a client-supplied GN code.
	reading.GNDivisionCode = nil
	reading.AnchorID, reading.DistrictID = nil, nil
	if reading.LandID != nil {
		land, err := s.landRepo.FindLandForFarmer(*reading.LandID, *reading.FarmerID)
		if err != nil {
			return 0, err
		}
		if division, ok := locationcatalog.Resolve(land.GNDivision); ok {
			reading.GNDivisionCode = &division.Code
			if reading.LocationSource == "gn_division" {
				id, err := s.repo.DistrictByName(division.District)
				if err != nil {
					return 0, err
				}
				reading.DistrictID = &id
			}
		} else if reading.LocationSource == "gn_division" {
			return 0, fmt.Errorf("Field area has an unrecognized GN division. Please register a land with a division from the official list")
		}
	}
	if reading.LocationSource == "gps" {
		anchorID, err := s.location.FindOrCreateAnchor(*reading.RawLat, *reading.RawLng)
		if err != nil {
			return 0, err
		}
		reading.AnchorID = &anchorID
		reading.DistrictID = s.location.FindDistrictID(*reading.RawLat, *reading.RawLng)
	}

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

	s.fillLocation(&reading)
	return reading, nil
}

// LatestForFarmer returns the last reading this farmer submitted.
//
// The app calls this right after login so the Trends and Map screens know
// which field to draw, without making the farmer submit a new test first.
func (s *ReadingService) LatestForFarmer(
	farmerID int,
) (model.Reading, error) {

	reading, err := s.repo.FindLatestByFarmer(farmerID)
	if err != nil {
		return reading, err
	}

	// Zone is DERIVED, not stored - the same as GetReading does. Without
	// this the screen would show an empty zone for a reading that has one.
	s.fillLocation(&reading)
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

	if reading.AnchorID == nil && reading.LandID == nil {
		return
	}

	// Get the field's recent GOOD readings, for grounding.
	// Without real facts, the model would invent numbers.
	var history []model.Reading
	var err error
	if reading.LandID != nil {
		history, err = s.repo.FindRecentByLand(*reading.LandID, 5)
	} else {
		history, err = s.repo.FindRecentByAnchor(*reading.AnchorID, 5)
	}
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

// checkLandBelongsToFarmer refuses a reading pointing at another farmer's land.
//
// Both ids are OPTIONAL. A reading with neither is still allowed, because the
// 27 readings made while testing have no owner and the farmer app worked that
// way for three phases. We only check what we were actually given.
func (s *ReadingService) checkLandBelongsToFarmer(reading model.Reading) error {

	// No land claimed, nothing to check.
	if reading.LandID == nil {
		return nil
	}

	// A land was named but no farmer. We cannot verify that, and an
	// unverifiable claim is worse than no claim.
	if reading.FarmerID == nil {
		return fmt.Errorf(
			"Field area is linked to a land but no farmer was given")
	}

	// FindLandForFarmer has the farmer id in its WHERE clause, so a land
	// belonging to somebody else simply is not found. There is no code path
	// here that can forget to compare them.
	if _, err := s.landRepo.FindLandForFarmer(
		*reading.LandID, *reading.FarmerID,
	); err != nil {
		return fmt.Errorf("Field area does not match a land you registered")
	}

	// The crop, if given, must be on THAT land.
	//
	// FindLandIDForCrop is also scoped to the farmer, so it answers both
	// "is this crop theirs" and "which land is it on" in one query. We then
	// only have to check the two land ids agree.
	if reading.LandCropID != nil {
		landID, err := s.landRepo.FindLandIDForCrop(
			*reading.LandCropID, *reading.FarmerID,
		)
		if err != nil {
			return fmt.Errorf("Crop does not match a crop you registered")
		}

		if landID != *reading.LandID {
			return fmt.Errorf("Crop is not one of the crops on that land")
		}
	}

	return nil
}

func (s *ReadingService) fillLocation(reading *model.Reading) {
	reading.Zone = s.location.ZoneForDistrict(reading.DistrictID)
	if reading.DistrictID != nil {
		if zone, err := s.repo.DistrictZone(*reading.DistrictID); err == nil {
			reading.Zone = zone
		}
	}
	if reading.GNDivisionCode != nil {
		if division, ok := locationcatalog.Resolve(*reading.GNDivisionCode); ok {
			reading.GNDivision = division.Value
		}
	}
}
