package controller

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"soil-data-system/api/internal/service"
)

// OfficerController serves the two dashboards.
type OfficerController struct {
	service *service.OfficerService
}

// NewOfficerController builds the controller.
func NewOfficerController(service *service.OfficerService) *OfficerController {
	return &OfficerController{service: service}
}

// writeOfficerError maps a service error to a status code.
func writeOfficerError(w http.ResponseWriter, err error) {

	var ve service.ValidationError
	if errors.As(err, &ve) {
		writeJSONError(w, http.StatusBadRequest, ve.Message)
		return
	}

	writeJSONError(w, http.StatusInternalServerError,
		"Something went wrong. Please try again.")
}

// Divisions handles GET /officer/divisions
func (c *OfficerController) Divisions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// RequireOfficer already proved who this is, so it cannot be missing.
	account, _ := AccountFrom(r)

	divisions, err := c.service.Divisions(account)
	if err != nil {
		writeOfficerError(w, err)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{"divisions": divisions})
}

// Farmers handles GET /officer/farmers?division=
func (c *OfficerController) Farmers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	// NOTE what happens to this value. For a division officer the service
	// ignores it entirely. The browser cannot widen its own access by
	// putting a different division in the address.
	division := r.URL.Query().Get("division")

	farmers, err := c.service.Farmers(account, division)
	if err != nil {
		writeOfficerError(w, err)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{"farmers": farmers})
}

// FarmerDetail handles GET /officer/farmers/{farmerId}
func (c *OfficerController) FarmerDetail(
	w http.ResponseWriter, r *http.Request,
) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	farmerID, err := strconv.Atoi(r.PathValue("farmerId"))
	if err != nil || farmerID <= 0 {
		writeJSONError(w, http.StatusBadRequest, "invalid farmer id")
		return
	}

	detail, err := c.service.FarmerDetail(account, farmerID)
	if err != nil {
		// Either there is no such farmer, or they are in another division.
		// 404 for both, so the API never reveals that a farmer exists
		// somewhere this officer is not allowed to look.
		writeJSONError(w, http.StatusNotFound, "That farmer was not found.")
		return
	}

	json.NewEncoder(w).Encode(detail)
}

// Readings handles GET /officer/readings?division=&flag=
func (c *OfficerController) Readings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	readings, err := c.service.Readings(
		account,
		r.URL.Query().Get("division"),
		r.URL.Query().Get("flag"),
	)
	if err != nil {
		writeOfficerError(w, err)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{"readings": readings})
}

// MapPoints handles GET /officer/map/readings?division=
func (c *OfficerController) MapPoints(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	points, err := c.service.MapPoints(account, r.URL.Query().Get("division"))
	if err != nil {
		writeOfficerError(w, err)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{"points": points})
}

// Me handles GET /officer/me
//
// The dashboard calls this on load to find out who it is talking to, so it
// knows which of the two dashboards to draw and which division to show. It
// also confirms a saved token is still good before anything else runs.
func (c *OfficerController) Me(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	// The password hash is tagged json:"-" on the model, so it cannot
	// travel even by accident.
	json.NewEncoder(w).Encode(map[string]any{"account": account})
}
