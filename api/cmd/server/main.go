package main

import (
	"log"
	"net/http"

	"soil-data-system/api/internal/controller"
)

func main() {
	// Create a router. It decides which function runs for each URL.
	mux := http.NewServeMux()

	// When someone visits GET /health, run the HealthCheck function.
	mux.HandleFunc("GET /health", controller.HealthCheck)

	// Print a message so we know the server started.
	log.Println("API server starting on port 8080...")

	// Start the server on port 8080.
	// If it fails, stop the program and show the error.
	err := http.ListenAndServe(":8080", mux)
	if err != nil {
		log.Fatal(err)
	}
}