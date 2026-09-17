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
	// CHANGED: quality_flag is now included.
	// Before, the database filled it in automatically with 'OK'.
	// Now the SERVICE decides the value, so we must send it.
	query := `
		INSERT INTO readings
			(raw_lat, raw_lng, anchor_id, district_id,
			 n, p, k, ph, crop, stage, target_yield, area, quality_flag)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING reading_id
	`

	var newID int

	err := repo.db.QueryRow(
		context.Background(), query,
		reading.RawLat, reading.RawLng,
		reading.AnchorID, reading.DistrictID,
		reading.N, reading.P, reading.K, reading.PH,
		reading.Crop, reading.Stage, reading.TargetYield, reading.Area,
		reading.QualityFlag, // the new value
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

// FindRecentByAnchor returns the most recent GOOD readings from one field.
// NEW in Phase 4 Part 2.
//
// The service uses this to compare a new reading against that field's history.
func (repo *ReadingRepository) FindRecentByAnchor(
	anchorID int,
	limit int,
) ([]model.Reading, error) {

	// Read the SQL carefully. Every line matters:
	//
	//   anchor_id = $1        -> only THIS field's readings
	//   quality_flag = 'OK'   -> only GOOD readings. VERY IMPORTANT.
	//                            Without this, one bad reading would
	//                            poison the next one.
	//   ORDER BY ... DESC     -> newest first (DESC = biggest first,
	//                            and for dates biggest means newest)
	//   LIMIT $2              -> only a few rows, for speed
	query := `
		SELECT reading_id, raw_lat, raw_lng, anchor_id, district_id,
		       n, p, k, ph, crop, stage, target_yield, area,
		       created_at, quality_flag
		FROM readings
		WHERE anchor_id = $1 AND quality_flag = 'OK'
		ORDER BY created_at DESC
		LIMIT $2
	`

	rows, err := repo.db.Query(context.Background(), query, anchorID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var readings []model.Reading

	for rows.Next() {
		var r model.Reading

		err := rows.Scan(
			&r.ReadingID, &r.RawLat, &r.RawLng, &r.AnchorID, &r.DistrictID,
			&r.N, &r.P, &r.K, &r.PH, &r.Crop, &r.Stage, &r.TargetYield, &r.Area,
			&r.CreatedAt, &r.QualityFlag,
		)
		if err != nil {
			return nil, err
		}

		readings = append(readings, r)
	}

	return readings, rows.Err()
}
