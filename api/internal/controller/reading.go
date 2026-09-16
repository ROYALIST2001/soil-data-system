package controller

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/service"
)

// ReadingController holds the service.
type ReadingController struct {
	service *service.ReadingService
}

// NewReadingController builds the controller with a service.
func NewReadingController(service *service.ReadingService) *ReadingController {
	return &ReadingController{service: service}
}

// isValidationError decides whether an error came from our validation rules
// (the caller's fault, 400) or from something else like the database
// being down (the server's fault, 500).
//
// HONEST NOTE: the proper Go way is a custom error type checked with
// errors.As(). That needs interfaces and type assertion, which is more
// advanced. This simple version works correctly for our project.
func isValidationError(err error) bool {
	msg := err.Error()

	// These are the words our validation messages start with.
	knownFields := []string{
		"Latitude", "Longitude", "pH", "Nitrogen", "Phosphorus",
		"Potassium", "Field area", "Target yield", "Crop", "Growth stage",
	}

	for _, field := range knownFields {
		if strings.HasPrefix(msg, field) {
			return true
		}
	}
	return false
}

// CreateReading handles POST /readings.
func (c *ReadingController) CreateReading(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var reading model.Reading

	// Read the JSON body into the reading variable.
	if err := json.NewDecoder(r.Body).Decode(&reading); err != nil {
		w.WriteHeader(http.StatusBadRequest) // 400
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON"})
		return
	}

	// Ask the service to save it.
	newID, err := c.service.CreateReading(reading)

	if err != nil {
		// CHANGED: we now separate the two kinds of error.
		if isValidationError(err) {
			// The CALLER sent bad data. 400 Bad Request.
			// We send the real message, so the farmer knows what to fix.
			w.WriteHeader(http.StatusBadRequest) // 400
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		// Something else broke, for example the database.
		// This is the SERVER's fault. 500.
		//
		// We do NOT send the real message here. A database error can
		// reveal table names and structure, which helps an attacker.
		w.WriteHeader(http.StatusInternalServerError) // 500
		json.NewEncoder(w).Encode(map[string]string{"error": "could not save reading"})
		return
	}

	// Success: 201 Created + the new id.
	w.WriteHeader(http.StatusCreated) // 201
	json.NewEncoder(w).Encode(map[string]int{"reading_id": newID})
}

// GetReading handles GET /readings/{id}. This did NOT change.
func (c *ReadingController) GetReading(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Read the {id} text from the URL and turn it into a number.
	idText := r.PathValue("id")
	id, err := strconv.Atoi(idText)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest) // 400
		json.NewEncoder(w).Encode(map[string]string{"error": "id must be a number"})
		return
	}

	reading, err := c.service.GetReading(id)
	if err != nil {
		w.WriteHeader(http.StatusNotFound) // 404
		json.NewEncoder(w).Encode(map[string]string{"error": "reading not found"})
		return
	}

	w.WriteHeader(http.StatusOK) // 200
	json.NewEncoder(w).Encode(reading)
}
