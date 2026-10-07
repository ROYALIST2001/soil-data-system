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
	sessionRepo := repository.NewSessionRepository(db)  // NEW in Phase 10
	officerRepo := repository.NewOfficerRepository(db)  // NEW in Phase 10
	correctionRepo := repository.NewCorrectionRepository(db)

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
	farmerService := service.NewFarmerService(farmerRepo, sessionRepo)

	// NEW in Phase 9: a farmer's lands and the crops on them.
	// It needs the farmer repository too, so it can refuse a land for a
	// farmer who does not exist.
	landService := service.NewLandService(landRepo, farmerRepo)

	// NEW in Phase 10: the two officer dashboards.
	officerService := service.NewOfficerService(officerRepo, landRepo)
	correctionService := service.NewCorrectionService(correctionRepo)

	// NEW: the chat service drives the agent loop and executes the tools.
	// It needs the OTHER services, so it is built LAST.

	readingService := service.NewReadingService(
		readingRepo,
		locationService,
		validationService,
		aiClient,
		fertilizerService,
		landRepo, // NEW in Phase 10: to verify a reading's land is the farmer's
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
	officerController := controller.NewOfficerController(officerService)       // NEW
	correctionController := controller.NewCorrectionController(correctionService)

	// NEW in Phase 10: proves who is calling, before any officer route runs.
	auth := controller.NewAuthMiddleware(sessionRepo)

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

	// NEW in Phase 10: ends the session, so the token stops working.
	mux.HandleFunc("POST /logout", farmerController.Logout)

	// NEW in Phase 9: lands and the crops on them.
	mux.HandleFunc("POST /lands", landController.CreateLand)
	mux.HandleFunc("GET /farmers/{farmerId}/lands", landController.GetLands)
	mux.HandleFunc("POST /lands/{landId}/crops", landController.AddCrop)
	mux.HandleFunc("DELETE /lands/{landId}", landController.DeleteLand)
	mux.HandleFunc("DELETE /crops/{cropId}", landController.DeleteCrop)

	// ---------- NEW in Phase 10: the officer dashboards ----------
	//
	// EVERY ONE of these goes through RequireOfficer, which proves the
	// caller is logged in AND is an officer. A farmer's token reaches these
	// routes and is turned away with 403.
	//
	// Note there is no route here a farmer may call. The dashboards are a
	// separate surface, not the farmer API with extra parameters.
	mux.HandleFunc("GET /officer/me",
		auth.RequireOfficer(officerController.Me))
	mux.HandleFunc("GET /officer/divisions",
		auth.RequireOfficer(officerController.Divisions))
	mux.HandleFunc("GET /officer/farmers",
		auth.RequireOfficer(officerController.Farmers))
	mux.HandleFunc("GET /officer/farmers/{farmerId}",
		auth.RequireOfficer(officerController.FarmerDetail))
	mux.HandleFunc("GET /officer/readings",
		auth.RequireOfficer(officerController.Readings))
	mux.HandleFunc("GET /officer/map/readings",
		auth.RequireOfficer(officerController.MapPoints))

	// Correcting a farmer's reading. The original values are never
	// overwritten - see migration 010.
	mux.HandleFunc("GET /officer/readings/{readingId}",
		auth.RequireOfficer(correctionController.Detail))
	mux.HandleFunc("POST /officer/readings/{readingId}/correct",
		auth.RequireOfficer(correctionController.Correct))
	mux.HandleFunc("POST /officer/readings/{readingId}/flag",
		auth.RequireOfficer(correctionController.Flag))

	// ---------- STEP 8: start the server ----------
	// Clear out sessions that have already run out. Nothing breaks without
	// this - expired tokens are refused anyway - it just stops the table
	// growing forever.
	if removed, err := sessionRepo.DeleteExpired(); err != nil {
		log.Printf("Could not clear expired sessions: %v", err)
	} else if removed > 0 {
		log.Printf("Cleared %d expired session(s).", removed)
	}

	log.Println("API server starting on port 8080...")

	// WithCORS wraps the WHOLE router, so every route - including the
	// OPTIONS preflight the browser sends before any authenticated request -
	// answers with the right headers. Wrapping one route at a time would
	// mean the first one somebody forgot would fail in the browser only.
	if err := http.ListenAndServe(":8080", controller.WithCORS(mux)); err != nil {
		log.Fatal(err)
	}
}
