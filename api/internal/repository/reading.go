package repository

import (
	"context"
	"fmt"
	"soil-data-system/api/migrations"

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
	// CHANGED: agent_note and agent_verdict are now included.
	// Before, the database filled it in automatically with 'OK'.
	// Now the SERVICE decides the value, so we must send it.
	query := `
		INSERT INTO readings
			(raw_lat, raw_lng, anchor_id, district_id,
			 n, p, k, ph, crop, stage, target_yield, area,
			 quality_flag, agent_note, agent_verdict,
			 farmer_id, land_id, land_crop_id, location_source, gn_division_code)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
			 $16, $17, $18, $19, $20)
		RETURNING reading_id
	`

	var newID int

	err := repo.db.QueryRow(
		context.Background(), query,
		reading.RawLat, reading.RawLng,
		reading.AnchorID, reading.DistrictID,
		reading.N, reading.P, reading.K, reading.PH,
		reading.Crop, reading.Stage, reading.TargetYield, reading.Area,
		reading.QualityFlag,
		reading.AgentNote,
		reading.AgentVerdict,
		reading.FarmerID,   // NEW in Phase 10
		reading.LandID,     // NEW in Phase 10
		reading.LandCropID, // NEW in Phase 10
		reading.LocationSource, reading.GNDivisionCode,
	).Scan(&newID)

	return newID, err
}

// GetByID reads one reading using its id.
//
// CHANGED in Phase 10: it now returns the values IN FORCE, not the raw ones.
// If an officer corrected a number, that is what comes back, and the
// fertilizer recommendation is calculated from it. The farmer's original is
// still in the table and is read separately by the correction service, which
// is the only part of the system that needs to see both.
func (repo *ReadingRepository) GetByID(id int) (model.Reading, error) {
	query := `
		SELECT reading_id, raw_lat, raw_lng, anchor_id, district_id,
		       COALESCE(corrected_n, n), COALESCE(corrected_p, p),
		       COALESCE(corrected_k, k), COALESCE(corrected_ph, ph),
		       crop, stage, target_yield, area,
		       created_at, COALESCE(officer_flag, quality_flag),
		       agent_note, agent_verdict,
		       farmer_id, land_id, land_crop_id, location_source, gn_division_code
		FROM readings
		WHERE reading_id = $1
	`

	var r model.Reading

	err := repo.db.QueryRow(context.Background(), query, id).Scan(
		&r.ReadingID, &r.RawLat, &r.RawLng, &r.AnchorID, &r.DistrictID,
		&r.N, &r.P, &r.K, &r.PH, &r.Crop, &r.Stage, &r.TargetYield, &r.Area,
		&r.CreatedAt, &r.QualityFlag,
		&r.AgentNote, &r.AgentVerdict,
		&r.FarmerID, &r.LandID, &r.LandCropID, &r.LocationSource, &r.GNDivisionCode, // NEW in Phase 10
	)

	return r, err
}

// FindLatestByFarmer returns the most recent reading this farmer submitted.
//
// WHY THIS EXISTS.
// The Trends screen draws the history of ONE field, and it needs to know
// which field. It used to learn that only from a reading submitted during
// the current app session - so a farmer with two years of history who had
// just logged in was told "No readings yet". The data was there; the screen
// simply had no way to find it.
//
// Note it does NOT filter on quality_flag. The point is to find the last
// field they tested, and a flagged reading still tells us where that was.
func (repo *ReadingRepository) FindLatestByFarmer(
	farmerID int,
) (model.Reading, error) {

	query := `
		SELECT reading_id, raw_lat, raw_lng, anchor_id, district_id,
		       COALESCE(corrected_n, n), COALESCE(corrected_p, p),
		       COALESCE(corrected_k, k), COALESCE(corrected_ph, ph),
		       crop, stage, target_yield, area,
		       created_at, COALESCE(officer_flag, quality_flag),
		       agent_note, agent_verdict,
		       farmer_id, land_id, land_crop_id, location_source, gn_division_code
		FROM readings
		WHERE farmer_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`

	var r model.Reading

	err := repo.db.QueryRow(context.Background(), query, farmerID).Scan(
		&r.ReadingID, &r.RawLat, &r.RawLng, &r.AnchorID, &r.DistrictID,
		&r.N, &r.P, &r.K, &r.PH, &r.Crop, &r.Stage, &r.TargetYield, &r.Area,
		&r.CreatedAt, &r.QualityFlag,
		&r.AgentNote, &r.AgentVerdict,
		&r.FarmerID, &r.LandID, &r.LandCropID, &r.LocationSource, &r.GNDivisionCode,
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
	return repo.findRecent("anchor_id", anchorID, limit)
}

func (repo *ReadingRepository) FindRecentByLand(landID, limit int) ([]model.Reading, error) {
	return repo.findRecent("land_id", landID, limit)
}

// column is selected only by the two methods above, never by request input.
func (repo *ReadingRepository) findRecent(column string, id, limit int) ([]model.Reading, error) {

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
		       COALESCE(corrected_n, n), COALESCE(corrected_p, p),
		       COALESCE(corrected_k, k), COALESCE(corrected_ph, ph),
		       crop, stage, target_yield, area,
		       created_at, COALESCE(officer_flag, quality_flag),
		       agent_note, agent_verdict,
		       farmer_id, land_id, land_crop_id, location_source, gn_division_code
		FROM readings
		WHERE %s = $1 AND COALESCE(officer_flag, quality_flag) = 'OK'
		ORDER BY created_at DESC
		LIMIT $2
	`

	rows, err := repo.db.Query(context.Background(), fmt.Sprintf(query, column), id, limit)
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
			&r.AgentNote, &r.AgentVerdict,
			&r.FarmerID, &r.LandID, &r.LandCropID, &r.LocationSource, &r.GNDivisionCode, // NEW in Phase 10
		)
		if err != nil {
			return nil, err
		}

		readings = append(readings, r)
	}

	return readings, rows.Err()
}

// EnsureGNLocations is additive and upgrades existing database volumes.
func (repo *ReadingRepository) EnsureGNLocations(ctx context.Context) error {
	tx, err := repo.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(71344813)`); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, migrations.GNReadings); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE readings r SET gn_division_code = c.code
 FROM lands l JOIN gn_division_catalog c ON LOWER(TRIM(l.gn_division)) IN (LOWER(c.value), c.code)
 WHERE r.land_id = l.land_id AND r.gn_division_code IS NULL`); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (repo *ReadingRepository) DistrictByName(name string) (int, error) {
	var id int
	err := repo.db.QueryRow(context.Background(), `SELECT district_id FROM districts WHERE LOWER(name)=LOWER($1)`, name).Scan(&id)
	return id, err
}

func (repo *ReadingRepository) DistrictZone(id int) (string, error) {
	var zone string
	err := repo.db.QueryRow(context.Background(), `SELECT zone FROM districts WHERE district_id=$1`, id).Scan(&zone)
	return zone, err
}
