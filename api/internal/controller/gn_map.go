package controller

import (
	"encoding/json"
	"net/http"
	"soil-data-system/api/internal/locationcatalog"
	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
	"soil-data-system/api/internal/soilmap"
)

type GNMapController struct {
	repo *repository.AnalyticsRepository
}

func NewGNMapController(repo *repository.AnalyticsRepository) *GNMapController {
	return &GNMapController{repo: repo}
}

func (c *GNMapController) Divisions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	district := r.URL.Query().Get("district")
	boundaries, err := soilmap.Boundaries(district)
	if err != nil {
		writeJSONError(w, 400, "Please choose a valid district.")
		return
	}
	averages, err := c.repo.GNAverages(r.Context(), district)
	if err != nil {
		writeJSONError(w, 500, "Could not load division soil averages. Please retry.")
		return
	}
	// Copy each feature before attaching request-specific readings to cached shapes.
	features := make([]soilmap.Feature, len(boundaries))
	unmapped := 0
	mappedCodes := make(map[string]bool)
	for i, feature := range boundaries {
		features[i] = feature
		if feature.Properties.Code == "" {
			unmapped++
		}
		if stats, ok := averages[feature.Properties.Code]; ok {
			features[i].Properties.Stats = &stats
			mappedCodes[feature.Properties.Code] = true
		}
	}
	json.NewEncoder(w).Encode(map[string]any{"type": "FeatureCollection", "features": features,
		"unlinked_boundaries": unmapped, "divisions_with_readings": len(averages), "mapped_divisions_with_readings": len(mappedCodes)})
}

func buildGNHistory(level, label string, points []model.HistoryPoint) model.HistorySeries {
	if points == nil {
		points = []model.HistoryPoint{}
	}
	total := 0
	for _, point := range points {
		total += point.Count
	}
	return model.HistorySeries{Level: level, Label: label, Points: points, TotalReadings: total}
}

func (c *GNMapController) History(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	division, ok := locationcatalog.Resolve(r.PathValue("code"))
	if !ok {
		writeJSONError(w, 400, "Please choose an official GN division.")
		return
	}
	points, err := c.repo.GNHistory(r.Context(), division.Code)
	if err != nil {
		writeJSONError(w, 500, "Could not load division history.")
		return
	}
	json.NewEncoder(w).Encode(buildGNHistory("gn_division", division.Name, points))
}

func (c *GNMapController) LandHistory(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	account, ok := AccountFrom(r)
	if !ok {
		writeJSONError(w, 401, "Please log in first.")
		return
	}
	landID, ok := readIntParam(r, "landId")
	if !ok {
		writeJSONError(w, 400, "Please choose a registered land.")
		return
	}
	points, err := c.repo.LandHistory(r.Context(), landID, account.FarmerID)
	if err != nil {
		writeJSONError(w, 500, "Could not load land history.")
		return
	}
	json.NewEncoder(w).Encode(buildGNHistory("land", "Your land", points))
}
