package main

import (
	"context"
	"log"
	"net/http"
	"time"

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
	locationCatalogRepo := repository.NewLocationCatalogRepository(db)
	catalogContext, cancelCatalog := context.WithTimeout(context.Background(), 60*time.Second)
	if err := locationCatalogRepo.Ensure(catalogContext); err != nil {
		cancelCatalog()
		log.Fatal("Cannot initialize GN division catalog: ", err)
	}
	cancelCatalog()

	// ---------- STEP 2: build the repositories (the data layer) ----------
	readingRepo := repository.NewReadingRepository(db)
	anchorRepo := repository.NewAnchorRepository(db)
	districtRepo := repository.NewDistrictRepository(db)
	analyticsRepo := repository.NewAnalyticsRepository(db) // NEW
	farmerRepo := repository.NewFarmerRepository(db)       // NEW in Phase 9
	landRepo := repository.NewLandRepository(db)           // NEW in Phase 9
	sessionRepo := repository.NewSessionRepository(db)     // NEW in Phase 10
	officerRepo := repository.NewOfficerRepository(db)     // NEW in Phase 10
	correctionRepo := repository.NewCorrectionRepository(db)
	disasterRepo := repository.NewDisasterRepository(db) // NEW in Phase 11
	subsidyRepo := repository.NewSubsidyRepository(db)   // NEW in Phase 12

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

	// NEW in Phase 11: disaster relief. It needs the land repository to
	// check a claimed crop really belongs to the farmer, and the farmer
	// repository to find out which division they are in.
	disasterService := service.NewDisasterService(
		disasterRepo, landRepo, farmerRepo,
	)

	// NEW in Phase 12: the fertilizer subsidy. Needs the same two helpers
	// as relief: lands to confirm a crop is really the farmer's, and
	// farmers to find out which division they are in.
	subsidyService := service.NewSubsidyService(
		subsidyRepo, landRepo, farmerRepo,
	)

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
	landController := controller.NewLandController(landService)                // NEW
	officerController := controller.NewOfficerController(officerService)       // NEW
	correctionController := controller.NewCorrectionController(correctionService)
	disasterController := controller.NewDisasterController(disasterService)
	subsidyController := controller.NewSubsidyController(subsidyService)

	// NEW in Phase 10: proves who is calling, before any officer route runs.
	auth := controller.NewAuthMiddleware(sessionRepo)

	// ---------- STEP 7: connect the routes ----------
	mux := http.NewServeMux()
	locationCatalogController := controller.NewLocationCatalogController(locationCatalogRepo)
	// Public reference data is needed before a new farmer can sign up.
	mux.HandleFunc("GET /locations/districts", locationCatalogController.Districts)
	mux.HandleFunc("GET /locations/gn-divisions", locationCatalogController.Divisions)
	mux.HandleFunc("GET /locations/gn-divisions/resolve", locationCatalogController.Resolve)

	mux.HandleFunc("GET /health", controller.HealthCheck)
	mux.HandleFunc("POST /readings", readingController.CreateReading)
	mux.HandleFunc("GET /readings/{id}", readingController.GetReading)

	// The farmer's most recent reading, so Trends and Map know which field
	// to draw as soon as they log in.
	mux.HandleFunc("GET /farmers/{farmerId}/readings/latest",
		readingController.LatestForFarmer)
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

	// ---------- NEW in Phase 11: disaster relief ----------
	//
	// THE FARMER SIDE. Open to the app, like the other farmer routes.
	mux.HandleFunc("GET /farmers/{farmerId}/disasters",
		disasterController.FarmerEvents)
	mux.HandleFunc("GET /farmers/{farmerId}/claims",
		disasterController.FarmerClaims)
	mux.HandleFunc("POST /claims", disasterController.SubmitClaim)

	// THE OFFICER SIDE. Every route behind RequireOfficer, and the service
	// checks the ROLE again for each step - only a GN officer may verify,
	// only the department may approve or release money.
	mux.HandleFunc("GET /officer/disasters",
		auth.RequireOfficer(disasterController.ListEvents))
	mux.HandleFunc("POST /officer/disasters",
		auth.RequireOfficer(disasterController.DeclareEvent))
	mux.HandleFunc("POST /officer/disasters/{eventId}/close",
		auth.RequireOfficer(disasterController.CloseEvent))

	mux.HandleFunc("GET /officer/claims",
		auth.RequireOfficer(disasterController.OfficerClaims))
	mux.HandleFunc("GET /officer/claims/{claimId}",
		auth.RequireOfficer(disasterController.ClaimDetail))
	mux.HandleFunc("POST /officer/claims/{claimId}/verify",
		auth.RequireOfficer(disasterController.Verify))
	mux.HandleFunc("POST /officer/claims/{claimId}/approve",
		auth.RequireOfficer(disasterController.Approve))
	mux.HandleFunc("POST /officer/claims/{claimId}/reject",
		auth.RequireOfficer(disasterController.Reject))
	mux.HandleFunc("POST /officer/claims/{claimId}/pay",
		auth.RequireOfficer(disasterController.MarkPaid))

	// ---------- NEW in Phase 12: the fertilizer subsidy ----------
	//
	// THE FARMER SIDE.
	//
	// Note the last two. Every other workflow in this system is moved along
	// by officers only; here the farmer confirms the money arrived, or says
	// it did not. The service checks the application is theirs before
	// either one is allowed.
	mux.HandleFunc("GET /farmers/{farmerId}/subsidy-rounds",
		subsidyController.FarmerRounds)
	mux.HandleFunc("GET /farmers/{farmerId}/subsidies",
		subsidyController.FarmerApplications)
	mux.HandleFunc("POST /subsidies", subsidyController.Apply)
	mux.HandleFunc("POST /subsidies/{applicationId}/received",
		subsidyController.ConfirmReceived)
	mux.HandleFunc("POST /subsidies/{applicationId}/dispute",
		subsidyController.Dispute)

	// THE OFFICER SIDE. Every route behind RequireOfficer, and the service
	// checks the ROLE again for each step - only a GN officer approves,
	// only the department sends money or settles a dispute.
	mux.HandleFunc("GET /officer/subsidy-rounds",
		auth.RequireOfficer(subsidyController.ListRounds))
	mux.HandleFunc("POST /officer/subsidy-rounds",
		auth.RequireOfficer(subsidyController.DeclareRound))
	mux.HandleFunc("POST /officer/subsidy-rounds/{roundId}/close",
		auth.RequireOfficer(subsidyController.CloseRound))

	mux.HandleFunc("GET /officer/subsidies",
		auth.RequireOfficer(subsidyController.OfficerApplications))
	mux.HandleFunc("GET /officer/subsidies/{applicationId}",
		auth.RequireOfficer(subsidyController.OfficerDetail))
	mux.HandleFunc("POST /officer/subsidies/{applicationId}/approve",
		auth.RequireOfficer(subsidyController.Approve))
	mux.HandleFunc("POST /officer/subsidies/{applicationId}/send",
		auth.RequireOfficer(subsidyController.Send))
	mux.HandleFunc("POST /officer/subsidies/{applicationId}/reject",
		auth.RequireOfficer(subsidyController.Reject))
	mux.HandleFunc("POST /officer/subsidies/{applicationId}/resolve",
		auth.RequireOfficer(subsidyController.Resolve))

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
