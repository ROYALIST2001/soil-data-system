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
	farmerRepo := repository.NewFarmerRepository(db)    // NEW in Phase 9
	landRepo := repository.NewLandRepository(db)        // NEW in Phase 9

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
	analyticsService := service.NewAnalyticsService(analyticsRepo, aiClient) // CHANGED

	// NEW in Phase 9: farmer accounts. It needs nothing but its own
	// repository, so it can be built straight away.
	farmerService := service.NewFarmerService(farmerRepo)

	// NEW in Phase 9: a farmer's lands and the crops on them.
	// It needs the farmer repository too, so it can refuse a land for a
	// farmer who does not exist.
	landService := service.NewLandService(landRepo, farmerRepo)

	// NEW: the chat service drives the agent loop and executes the tools.
	// It needs the OTHER services, so it is built LAST.

	readingService := service.NewReadingService(
		readingRepo,
		locationService,
		validationService,
		aiClient,
		fertilizerService,
	)

	chatService := service.NewChatService(
		readingRepo,
		readingService,
		analyticsService,
		locationService,
		aiClient,
	)

	// ---------- STEP 6: build the controllers (the front door) ----------
	readingController := controller.NewReadingController(readingService)
	analyticsController := controller.NewAnalyticsController(analyticsService) // NEW
	chatController := controller.NewChatController(chatService)                // NEW
	farmerController := controller.NewFarmerController(farmerService)          // NEW
	landController := controller.NewLandController(landService)                 // NEW

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

	// NEW in Part 2: the clustering endpoint.
	mux.HandleFunc("GET /clusters", analyticsController.Clusters)

	// NEW: the farmer advisory chatbot.
	mux.HandleFunc("POST /chat", chatController.Chat)

	// NEW in Phase 9: farmer accounts.
	//
	// These two are the only routes that work WITHOUT an account, for the
	// obvious reason that you cannot have an account before you make one.
	mux.HandleFunc("POST /signup", farmerController.Signup)
	mux.HandleFunc("POST /login", farmerController.Login)

	// NEW in Phase 9: lands and the crops on them.
	mux.HandleFunc("POST /lands", landController.CreateLand)
	mux.HandleFunc("GET /farmers/{farmerId}/lands", landController.GetLands)
	mux.HandleFunc("POST /lands/{landId}/crops", landController.AddCrop)
	mux.HandleFunc("DELETE /lands/{landId}", landController.DeleteLand)
	mux.HandleFunc("DELETE /crops/{cropId}", landController.DeleteCrop)

	// ---------- STEP 8: start the server ----------
	log.Println("API server starting on port 8080...")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}
