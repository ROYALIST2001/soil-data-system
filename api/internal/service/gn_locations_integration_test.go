package service

import (
	"context"
	"fmt"
	"math"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"soil-data-system/api/internal/locationcatalog"
	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

func TestGNLocationsPostgres(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("Set TEST_DATABASE_URL for the isolated GN integration test")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := fmt.Sprintf("gn_reading_test_%d", time.Now().UnixNano())
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+quoted); err != nil {
		t.Fatal(err)
	}
	defer admin.Exec(ctx, "DROP SCHEMA "+quoted+" CASCADE")
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	base, err := os.ReadFile("../../migrations/001_init.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, string(base)); err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `ALTER TABLE districts ADD COLUMN zone TEXT NOT NULL DEFAULT 'wet';
 CREATE TABLE lands(land_id SERIAL PRIMARY KEY,farmer_id INT,name TEXT,gn_division TEXT,size_ha FLOAT8,created_at TIMESTAMP DEFAULT NOW());
 ALTER TABLE readings ADD COLUMN farmer_id INT,ADD COLUMN land_id INT,ADD COLUMN land_crop_id INT,
 ADD COLUMN agent_note TEXT,ADD COLUMN agent_verdict TEXT,ADD COLUMN corrected_n FLOAT8,ADD COLUMN corrected_p FLOAT8,
 ADD COLUMN corrected_k FLOAT8,ADD COLUMN corrected_ph FLOAT8,ADD COLUMN officer_flag TEXT;
 ALTER TABLE readings ADD CONSTRAINT readings_test_land FOREIGN KEY(land_id) REFERENCES lands(land_id) ON DELETE SET NULL;
 INSERT INTO districts(name) VALUES ('Colombo');`)
	if err != nil {
		t.Fatal(err)
	}
	if err = repository.NewLocationCatalogRepository(pool).Ensure(ctx); err != nil {
		t.Fatal(err)
	}
	repo := repository.NewReadingRepository(pool)
	if err = repo.EnsureGNLocations(ctx); err != nil {
		t.Fatal(err)
	}
	division, _ := locationcatalog.Resolve("1103005")
	other, _ := locationcatalog.Resolve("1103010")
	_, err = pool.Exec(ctx, `INSERT INTO lands(land_id,farmer_id,name,gn_division,size_ha) VALUES
 (1,1,'Land one',$1,1),(2,2,'Land two',$1,1),(3,2,'Other division',$2,1)`, division.Value, other.Value)
	if err != nil {
		t.Fatal(err)
	}
	location := NewLocationService(repository.NewAnchorRepository(pool), nil)
	validation := NewValidationService(repo)
	svc := NewReadingService(repo, location, validation, nil, NewFertilizerService(), repository.NewLandRepository(pool))
	farmer, land := 1, 1
	spoofed := other.Code
	request := model.Reading{LocationSource: "gn_division", FarmerID: &farmer, LandID: &land, GNDivisionCode: &spoofed,
		N: 40, P: 20, K: 80, PH: 6.5, Crop: "rice", Stage: "vegetative", TargetYield: 5, Area: 1}
	id, err := svc.CreateReading(request)
	if err != nil {
		t.Fatal(err)
	}
	saved, err := svc.GetReading(id)
	if err != nil {
		t.Fatal(err)
	}
	if saved.RawLat != nil || saved.RawLng != nil || saved.AnchorID != nil || saved.GNDivisionCode == nil || *saved.GNDivisionCode != division.Code || saved.Zone != "wet" {
		t.Fatalf("GN test acquired false GPS coordinates, lost its division or used an unverified code: %+v", saved)
	}
	foreignLand := 2
	foreign := request
	foreign.LandID = &foreignLand
	if _, err = svc.CreateReading(foreign); err == nil {
		t.Fatal("accepted another farmer's land")
	}
	gps := request
	lat, lng := 7.0, 80.0
	gps.LocationSource = "gps"
	gps.RawLat = &lat
	gps.RawLng = &lng
	gps.N = 42
	gpsID, err := svc.CreateReading(gps)
	if err != nil {
		t.Fatal(err)
	}
	legacy, err := svc.GetReading(gpsID)
	if err != nil {
		t.Fatal(err)
	}
	if legacy.RawLat == nil || legacy.AnchorID == nil {
		t.Fatal("GPS capture path no longer works")
	}
	bad := request
	bad.GNDivisionCode = &division.Code
	bad.LandID = &foreignLand
	bad.FarmerID = &foreignLand
	bad.N = 900
	bad.QualityFlag = FlagQuarantined
	badID, err := repo.Insert(bad)
	if err != nil {
		t.Fatal(err)
	}
	corrected := bad
	corrected.N = 800
	correctedID, err := repo.Insert(corrected)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE readings SET corrected_n=70,officer_flag='OK' WHERE reading_id=$1`, correctedID); err != nil {
		t.Fatal(err)
	}
	analytics := repository.NewAnalyticsRepository(pool)
	averages, err := analytics.GNAverages(ctx, division.DistrictCode)
	if err != nil {
		t.Fatal(err)
	}
	stats := averages[division.Code]
	if stats.ReadingCount != 3 || math.Abs(stats.N-(40.0+42+70)/3) > 0.0001 {
		t.Fatalf("wrong corrected/quality-filtered average: %+v; quarantined id %d", stats, badID)
	}
	history, err := analytics.LandHistory(ctx, 1, 1)
	if err != nil || len(history) != 2 {
		t.Fatalf("lost land history without GPS: %v %+v", err, history)
	}
	hidden, err := analytics.LandHistory(ctx, 1, 2)
	if err != nil || len(hidden) != 0 {
		t.Fatal("land history crossed owner scope")
	}
	nearby, err := analytics.GNHistory(ctx, division.Code)
	if err != nil || len(nearby) != 1 || nearby[0].Count != 3 {
		t.Fatalf("GN monthly totals are wrong: %v %+v", err, nearby)
	}
	// A later land edit and repeated startup must not move historical tests.
	if _, err = pool.Exec(ctx, `UPDATE lands SET gn_division=$1 WHERE land_id=1`, other.Value); err != nil {
		t.Fatal(err)
	}
	if err = repo.EnsureGNLocations(ctx); err != nil {
		t.Fatal(err)
	}
	saved, err = svc.GetReading(id)
	if err != nil || *saved.GNDivisionCode != division.Code {
		t.Fatal("startup rewrote the division snapshot")
	}
	if _, err = pool.Exec(ctx, `DELETE FROM lands WHERE land_id=1`); err != nil {
		t.Fatal("land deletion broke GN snapshots", err)
	}
	saved, err = svc.GetReading(id)
	if err != nil || saved.LandID != nil || saved.GNDivisionCode == nil || *saved.GNDivisionCode != division.Code {
		t.Fatal("lost GN snapshot when its land was removed")
	}

}

func TestGNLocationValidation(t *testing.T) {
	land, farmer := 1, 1
	good := model.Reading{LocationSource: "gn_division", LandID: &land, FarmerID: &farmer, N: 40, P: 20, K: 80, PH: 6.5, Crop: "rice", Stage: "vegetative", TargetYield: 5, Area: 1}
	svc := NewValidationService(nil)
	if err := svc.Validate(good); err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"missing land", "gps coordinates", "unknown source", "non-finite nutrient"} {
		t.Run(kind, func(t *testing.T) {
			bad := good
			switch kind {
			case "missing land":
				bad.LandID = nil
			case "gps coordinates":
				lat := 7.0
				bad.RawLat = &lat
			case "unknown source":
				bad.LocationSource = "made_up"
			case "non-finite nutrient":
				bad.N = math.NaN()
			}
			if err := svc.Validate(bad); err == nil {
				t.Fatal("invalid reading accepted")
			}
		})
	}
}
