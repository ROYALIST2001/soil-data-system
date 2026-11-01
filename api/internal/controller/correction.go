package controller

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
	"soil-data-system/api/internal/service"
)

// CorrectionController lets an officer correct and flag readings.
type CorrectionController struct {
	service *service.CorrectionService
}

// NewCorrectionController builds the controller.
func NewCorrectionController(
	service *service.CorrectionService,
) *CorrectionController {
	return &CorrectionController{service: service}
}

// writeCorrectionError maps a service error to a status code.
func writeCorrectionError(w http.ResponseWriter, err error) {

	var ve service.ValidationError
	if errors.As(err, &ve) {
		writeJSONError(w, http.StatusBadRequest, ve.Message)
		return
	}

	// No such reading, OR it belongs to another division. 404 for both: the
	// API must not confirm that a reading exists somewhere this officer is
	// not allowed to look.
	if errors.Is(err, repository.ErrReadingNotFound) {
		writeJSONError(w, http.StatusNotFound, "That reading was not found.")
		return
	}

	writeJSONError(w, http.StatusInternalServerError,
		"Something went wrong. Please try again.")
}

// readingIDFrom pulls the reading id out of the path.
func readingIDFrom(r *http.Request) (int, bool) {
	id, err := strconv.Atoi(r.PathValue("readingId"))
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}

// Detail handles GET /officer/readings/{readingId}
func (c *CorrectionController) Detail(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	readingID, ok := readingIDFrom(r)
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid reading id")
		return
	}

	detail, err := c.service.Detail(account, readingID)
	if err != nil {
		writeCorrectionError(w, err)
		return
	}

	json.NewEncoder(w).Encode(detail)
}

// Correct handles POST /officer/readings/{readingId}/correct
func (c *CorrectionController) Correct(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	readingID, ok := readingIDFrom(r)
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid reading id")
		return
	}

	var req model.CorrectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	if err := c.service.Correct(account, readingID, req); err != nil {
		writeCorrectionError(w, err)
		return
	}

	// Send the reading back as it now stands, so the screen does not have to
	// ask again to redraw itself.
	detail, err := c.service.Detail(account, readingID)
	if err != nil {
		writeCorrectionError(w, err)
		return
	}

	json.NewEncoder(w).Encode(detail)
}

// Flag handles POST /officer/readings/{readingId}/flag
func (c *CorrectionController) Flag(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	readingID, ok := readingIDFrom(r)
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid reading id")
		return
	}

	var req model.FlagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	if err := c.service.Flag(account, readingID, req); err != nil {
		writeCorrectionError(w, err)
		return
	}

	detail, err := c.service.Detail(account, readingID)
	if err != nil {
		writeCorrectionError(w, err)
		return
	}

	json.NewEncoder(w).Encode(detail)
}
