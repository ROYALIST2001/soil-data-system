package controller

import (
	"encoding/json"
	"net/http"
	"regexp"

	"soil-data-system/api/internal/locationcatalog"
	"soil-data-system/api/internal/repository"
)

type LocationCatalogController struct {
	repo *repository.LocationCatalogRepository
}

func NewLocationCatalogController(repo *repository.LocationCatalogRepository) *LocationCatalogController {
	return &LocationCatalogController{repo: repo}
}

func (c *LocationCatalogController) Districts(w http.ResponseWriter, r *http.Request) {
	districts, err := c.repo.Districts(r.Context())
	if err != nil {
		writeJSONError(w, 500, "Could not load districts. Please try again.")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"districts": districts})
}

var catalogDistrictCode = regexp.MustCompile(`^[1-9][1-9]$`)

func (c *LocationCatalogController) Divisions(w http.ResponseWriter, r *http.Request) {
	district := r.URL.Query().Get("district")
	if !catalogDistrictCode.MatchString(district) {
		writeJSONError(w, 400, "Please choose a district first.")
		return
	}
	divisions, err := c.repo.Divisions(r.Context(), district, r.URL.Query().Get("q"))
	if err != nil {
		writeJSONError(w, 500, "Could not load GN divisions. Please try again.")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"divisions": divisions})
}

func (c *LocationCatalogController) Resolve(w http.ResponseWriter, r *http.Request) {
	division, ok := locationcatalog.Resolve(r.URL.Query().Get("value"))
	if !ok {
		writeJSONError(w, 404, "Please choose the district and GN division from the official list.")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(division)
}
