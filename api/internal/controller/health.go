package controller

import (
	"encoding/json"
	"net/http"
)

// HealthCheck answers requests to /health.
// It tells the caller that the API is alive.
func HealthCheck(w http.ResponseWriter, r *http.Request) {
	// Tell the caller we are sending JSON.
	w.Header().Set("Content-Type", "application/json")

	// Send status code 200. This means "OK / success".
	w.WriteHeader(http.StatusOK)

	// Build a small answer.
	response := map[string]string{
		"status":  "ok",
		"service": "api",
	}

	// Convert the answer to JSON text and send it back.
	json.NewEncoder(w).Encode(response)
}