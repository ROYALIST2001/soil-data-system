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

	// ---------- STEP 1: connect to the database ----------
	db := database.Connect()
	defer db.Close()
	log.Println("Connected to database.")

	// ---------- STEP 2: build the repositories (the data layer) ----------
	readingRepo := repository.NewReadingRepository(db)
	anchorRepo := repository.NewAnchorRepository(db)
	districtRepo := repository.NewDistrictRepository(db)

	// ---------- STEP 3: load the district shapes ONCE ----------
	boundaries, err := districtRepo.LoadBoundaries("data/districts.geojson")
	if err != nil {
		log.Fatal("Cannot load district boundaries: ", err)
	}
	log.Printf("Loaded %d district boundaries.", len(boundaries))

	// ---------- STEP 4: build the services (the thinking layer) ----------

	// CHANGED: validation now needs the reading repository,
	// so it can look up a field's history.
	validationService := service.NewValidationService(readingRepo)

	locationService := service.NewLocationService(anchorRepo, boundaries)

	readingService := service.NewReadingService(
		readingRepo,
		locationService,
		validationService,
	)

	// ---------- STEP 5: build the controllers (the front door) ----------
	readingController := controller.NewReadingController(readingService)

	// ---------- STEP 6: connect the routes ----------
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", controller.HealthCheck)
	mux.HandleFunc("POST /readings", readingController.CreateReading)
	mux.HandleFunc("GET /readings/{id}", readingController.GetReading)

	// ---------- STEP 7: start the server ----------
	log.Println("API server starting on port 8080...")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}
