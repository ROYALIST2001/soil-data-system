package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"soil-data-system/api/internal/model"
)

// ReadingRepository holds the database connection.
type ReadingRepository struct {
	db *pgxpool.Pool
}

// NewReadingRepository builds the repository.
func NewReadingRepository(db *pgxpool.Pool) *ReadingRepository {
	return &ReadingRepository{db: db}
}

// Insert saves a new reading and gives back its new id.
func (repo *ReadingRepository) Insert(reading model.Reading) (int, error) {
	// CHANGED: anchor_id and district_id are now included.
	// They arrive already filled in from the service.
	// This file does NOT calculate them. It only stores them.
	query := `
		INSERT INTO readings
			(raw_lat, raw_lng, anchor_id, district_id,
			 n, p, k, ph, crop, stage, target_yield, area)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING reading_id
	`

	var newID int

	err := repo.db.QueryRow(
		context.Background(), query,
		reading.RawLat, reading.RawLng,
		reading.AnchorID, reading.DistrictID, // the 2 new values
		reading.N, reading.P, reading.K, reading.PH,
		reading.Crop, reading.Stage, reading.TargetYield, reading.Area,
	).Scan(&newID)

	return newID, err
}

// GetByID reads one reading using its id. This did NOT change.
func (repo *ReadingRepository) GetByID(id int) (model.Reading, error) {
	query := `
		SELECT reading_id, raw_lat, raw_lng, anchor_id, district_id,
		       n, p, k, ph, crop, stage, target_yield, area,
		       created_at, quality_flag
		FROM readings
		WHERE reading_id = $1
	`

	var r model.Reading

	err := repo.db.QueryRow(context.Background(), query, id).Scan(
		&r.ReadingID, &r.RawLat, &r.RawLng, &r.AnchorID, &r.DistrictID,
		&r.N, &r.P, &r.K, &r.PH, &r.Crop, &r.Stage, &r.TargetYield, &r.Area,
		&r.CreatedAt, &r.QualityFlag,
	)

	return r, err
}
