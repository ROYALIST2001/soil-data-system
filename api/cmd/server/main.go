package main

import (
	"log"
	"net/http"

	"soil-data-system/api/internal/client"
	"soil-data-system/api/internal/controller"
	"soil-data-system/api/internal/database"
	"soil-data-system/api/internal/repository"
	"soil-data-system/api/internal/service"
)

func main() {

	// ---------- STEP 1: connect to the database ----------
	db := database.Connect()
	defer db.Close()
	log.Println("Connected to database.")

	// ---------- STEP 2: build the repositories (the data layer) ----------
	readingRepo := repository.NewReadingRepository(db)
	anchorRepo := repository.NewAnchorRepository(db)
	districtRepo := repository.NewDistrictRepository(db)
	analyticsRepo := repository.NewAnalyticsRepository(db) // NEW

	// ---------- STEP 3: build the client (talks to other services) ----------
	aiClient := client.NewAIClient()

	// ---------- STEP 4: load the district shapes ONCE ----------
	boundaries, err := districtRepo.LoadBoundaries("data/districts.geojson")
	if err != nil {
		log.Fatal("Cannot load district boundaries: ", err)
	}
	log.Printf("Loaded %d district boundaries.", len(boundaries))

	// ---------- STEP 5: build the services (the thinking layer) ----------
	validationService := service.NewValidationService(readingRepo)
	locationService := service.NewLocationService(anchorRepo, boundaries)
	fertilizerService := service.NewFertilizerService()
	analyticsService := service.NewAnalyticsService(analyticsRepo) // NEW

	readingService := service.NewReadingService(
		readingRepo,
		locationService,
		validationService,
		aiClient,
		fertilizerService,
	)

	// ---------- STEP 6: build the controllers (the front door) ----------
	readingController := controller.NewReadingController(readingService)
	analyticsController := controller.NewAnalyticsController(analyticsService) // NEW

	// ---------- STEP 7: connect the routes ----------
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", controller.HealthCheck)
	mux.HandleFunc("POST /readings", readingController.CreateReading)
	mux.HandleFunc("GET /readings/{id}", readingController.GetReading)
	mux.HandleFunc("GET /readings/{id}/recommendation",
		readingController.GetRecommendation)

	// NEW: the three zoom levels.
	mux.HandleFunc("GET /history/field/{anchorId}",
		analyticsController.FieldHistory)
	mux.HandleFunc("GET /history/area",
		analyticsController.AreaHistory)
	mux.HandleFunc("GET /history/district/{districtId}",
		analyticsController.DistrictHistory)

	// ---------- STEP 8: start the server ----------
	log.Println("API server starting on port 8080...")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}
