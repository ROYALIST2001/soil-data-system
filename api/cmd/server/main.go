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

	// defer runs at the end of the function, always.
	// This makes sure the connection is closed properly.
	defer db.Close()
	log.Println("Connected to database.")

	// ---------- STEP 2: build the repositories (the data layer) ----------
	// All three share the same database pool.
	readingRepo := repository.NewReadingRepository(db)
	anchorRepo := repository.NewAnchorRepository(db)
	districtRepo := repository.NewDistrictRepository(db)

	// ---------- STEP 3: load the district shapes ONCE ----------
	// We do this here, at startup, NOT on every request.
	// The shapes never change while the program runs.
	boundaries, err := districtRepo.LoadBoundaries("data/districts.geojson")

	if err != nil {
		// Without shapes, no reading can get a district.
		// So stop now, with a clear message.
		log.Fatal("Cannot load district boundaries: ", err)
	}

	// Print the count. If this says 0, something is wrong. Check it.
	log.Printf("Loaded %d district boundaries.", len(boundaries))

	// ---------- STEP 4: build the services (the thinking layer) ----------
	// ORDER MATTERS. Build the location service FIRST,
	// because the reading service needs it.
	locationService := service.NewLocationService(anchorRepo, boundaries)
	readingService := service.NewReadingService(readingRepo, locationService)

	// ---------- STEP 5: build the controllers (the front door) ----------
	readingController := controller.NewReadingController(readingService)

	// ---------- STEP 6: connect the routes ----------
	// A route joins a URL to a function.
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
