package controller

import (
	"encoding/json"
	"net/http"
	"strconv"

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

// CreateReading handles POST /readings.
func (c *ReadingController) CreateReading(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var reading model.Reading

	// Read the JSON body into the reading variable.
	err := json.NewDecoder(r.Body).Decode(&reading)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest) // 400: bad input
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON"})
		return
	}

	// Ask the service to save it.
	newID, err := c.service.CreateReading(reading)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError) // 500: server problem
		json.NewEncoder(w).Encode(map[string]string{"error": "could not save reading"})
		return
	}

	// Success: 201 Created + the new id.
	w.WriteHeader(http.StatusCreated) // 201
	json.NewEncoder(w).Encode(map[string]int{"reading_id": newID})
}

// GetReading handles GET /readings/{id}.
func (c *ReadingController) GetReading(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Read the {id} text from the URL and turn it into a number.
	idText := r.PathValue("id")
	id, err := strconv.Atoi(idText)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest) // 400: id is not a number
		json.NewEncoder(w).Encode(map[string]string{"error": "id must be a number"})
		return
	}

	// Ask the service for the reading.
	reading, err := c.service.GetReading(id)
	if err != nil {
		w.WriteHeader(http.StatusNotFound) // 404: no reading with this id
		json.NewEncoder(w).Encode(map[string]string{"error": "reading not found"})
		return
	}

	// Success: 200 OK + the reading.
	w.WriteHeader(http.StatusOK) // 200
	json.NewEncoder(w).Encode(reading)
}