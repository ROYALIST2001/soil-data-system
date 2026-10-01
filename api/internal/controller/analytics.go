package controller

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"soil-data-system/api/internal/service"
)

// AnalyticsController holds the service.
type AnalyticsController struct {
	service *service.AnalyticsService
}

// NewAnalyticsController builds the controller.
func NewAnalyticsController(service *service.AnalyticsService) *AnalyticsController {
	return &AnalyticsController{service: service}
}

// FieldHistory handles GET /history/field/{anchorId}
func (c *AnalyticsController) FieldHistory(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	anchorID, err := strconv.Atoi(r.PathValue("anchorId"))
	if err != nil {
		w.WriteHeader(http.StatusBadRequest) // 400
		json.NewEncoder(w).Encode(map[string]string{"error": "anchor id must be a number"})
		return
	}

	series, err := c.service.FieldHistory(anchorID)

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError) // 500
		json.NewEncoder(w).Encode(map[string]string{"error": "could not load the history"})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(series)
}

// AreaHistory handles GET /history/area?lat=..&lng=..
//
// WHY QUERY PARAMETERS and not a path?
// Because an AREA HAS NO ID. It is defined by a POSITION.
//
// RULE: use a path /{id} for things with an identity.
//
//	use ?query= for filters and coordinates.
func (c *AnalyticsController) AreaHistory(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Read ?lat= and ?lng= from the URL.
	latText := r.URL.Query().Get("lat")
	lngText := r.URL.Query().Get("lng")

	lat, errLat := strconv.ParseFloat(latText, 64)
	lng, errLng := strconv.ParseFloat(lngText, 64)

	if errLat != nil || errLng != nil {
		w.WriteHeader(http.StatusBadRequest) // 400
		json.NewEncoder(w).Encode(map[string]string{
			"error": "lat and lng are required, and must be numbers",
		})
		return
	}

	series, err := c.service.AreaHistory(lat, lng)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "could not load the history"})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(series)
}

// DistrictHistory handles GET /history/district/{districtId}
func (c *AnalyticsController) DistrictHistory(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	districtID, err := strconv.Atoi(r.PathValue("districtId"))
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "district id must be a number"})
		return
	}

	series, err := c.service.DistrictHistory(districtID)
	if err != nil {
		// The district does not exist.
		w.WriteHeader(http.StatusNotFound) // 404
		json.NewEncoder(w).Encode(map[string]string{"error": "district not found"})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(series)
}

// Clusters handles GET /clusters
// NEW in Phase 7 Part 2.
func (c *AnalyticsController) Clusters(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	result, err := c.service.Clusters()

	if err != nil {
		msg := err.Error()

		// Not enough districts have data yet.
		//
		// 409 CONFLICT means: "your request is valid, but the current
		// state of the data does not allow it." Exactly right here.
		if strings.Contains(msg, "districts have data") {
			w.WriteHeader(http.StatusConflict) // 409
			json.NewEncoder(w).Encode(map[string]string{"error": msg})
			return
		}

		// The AI service is down.
		w.WriteHeader(http.StatusServiceUnavailable) // 503
		json.NewEncoder(w).Encode(map[string]string{
			"error": "The clustering service is not available. Please try again shortly.",
		})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(result)
}
