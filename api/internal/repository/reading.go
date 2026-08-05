package repository

import (
	"context"

	"soil-data-system/api/internal/model"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ReadingRepository holds the database connection.
type ReadingRepository struct {
	db *pgxpool.Pool
}

// NewReadingRepository builds the repository with a database pool.
func NewReadingRepository(db *pgxpool.Pool) *ReadingRepository {
	return &ReadingRepository{db: db}
}

// Insert saves a new reading and returns its new id.
func (repo *ReadingRepository) Insert(reading model.Reading) (int, error) {
	// The SQL command. RETURNING gives us back the new id.
	query := `
		INSERT INTO readings
			(raw_lat, raw_lng, n, p, k, ph, crop, stage, target_yield, area)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING reading_id
	`

	var newID int

	// Run the command and read the returned id into newID.
	err := repo.db.QueryRow(
		context.Background(), query,
		reading.RawLat, reading.RawLng,
		reading.N, reading.P, reading.K, reading.PH,
		reading.Crop, reading.Stage, reading.TargetYield, reading.Area,
	).Scan(&newID)

	return newID, err
}

// GetByID reads one reading using its id.
func (repo *ReadingRepository) GetByID(id int) (model.Reading, error) {
	// Select all columns of one reading.
	query := `
		SELECT reading_id, raw_lat, raw_lng, anchor_id, district_id,
		       n, p, k, ph, crop, stage, target_yield, area,
		       created_at, quality_flag
		FROM readings
		WHERE reading_id = $1
	`

	var r model.Reading

	// Run the command and copy each column into the struct fields.
	err := repo.db.QueryRow(context.Background(), query, id).Scan(
		&r.ReadingID, &r.RawLat, &r.RawLng, &r.AnchorID, &r.DistrictID,
		&r.N, &r.P, &r.K, &r.PH, &r.Crop, &r.Stage, &r.TargetYield, &r.Area,
		&r.CreatedAt, &r.QualityFlag,
	)

	return r, err
}