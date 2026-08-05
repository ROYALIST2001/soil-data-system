package main

import (
	"log"
	"net/http"

	"soil-data-system/api/internal/controller"
	"soil-data-system/api/internal/database"
	"soil-data-system/api/internal/repository"
	"soil-data-system/api/internal/service"
)

func main() {
	// 1. Connect to the database.
	db := database.Connect()
	defer db.Close() // close the pool when the program stops
	log.Println("Connected to database.")

	// 2. Build the layers: repository -> service -> controller.
	readingRepo := repository.NewReadingRepository(db)
	readingService := service.NewReadingService(readingRepo)
	readingController := controller.NewReadingController(readingService)

	// 3. Create the router and connect the routes.
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", controller.HealthCheck)
	mux.HandleFunc("POST /readings", readingController.CreateReading)
	mux.HandleFunc("GET /readings/{id}", readingController.GetReading)

	// 4. Start the server.
	log.Println("API server starting on port 8080...")
	err := http.ListenAndServe(":8080", mux)
	if err != nil {
		log.Fatal(err)
	}
}