package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"soil-data-system/api/internal/model"
)

// OfficerRepository answers the questions the dashboards ask.
//
// ONE RULE RUNS THROUGH EVERY QUERY IN THIS FILE.
//
// The division filter is applied IN THE SQL, never after the rows come back.
// If a division officer's query returned the whole country and Go then threw
// most of it away, the data would already have left the database, travelled
// through the service, and sat in memory - and one forgotten filter anywhere
// after that point would put it on somebody's screen.
//
// Filtering where the rows are produced means there is no moment at which
// the wrong rows exist at all.
type OfficerRepository struct {
	db *pgxpool.Pool
}

// NewOfficerRepository builds the repository.
func NewOfficerRepository(db *pgxpool.Pool) *OfficerRepository {
	return &OfficerRepository{db: db}
}

// HOW THE DIVISION FILTER IS WRITTEN, everywhere below:
//
//	($1 = '' OR LOWER(TRIM(gn_division)) = LOWER(TRIM($1)))
//
// An empty string means "no filter", which is how a department officer sees
// everybody without a second query.
//
// LOWER(TRIM(...)) on BOTH sides because gn_division is free text typed by a
// farmer. "Gettuwana", "gettuwana" and "Gettuwana " are the same place, and
// an officer whose division is spelled with a trailing space should not find
// their own farmers missing.
//
// LIMITATION FOR THE REPORT: this makes matching forgiving, not correct. A
// real system would offer the official list of Grama Niladhari divisions
// instead of a text box, so there is nothing to mistype.

// ListDivisions returns the divisions that have farmers in them.
func (repo *OfficerRepository) ListDivisions(
	division string,
) ([]model.DivisionSummary, error) {

	query := `
		SELECT TRIM(gn_division) AS division, COUNT(*) AS farmer_count
		FROM farmers
		WHERE role = 'FARMER'
		  AND ($1 = '' OR LOWER(TRIM(gn_division)) = LOWER(TRIM($1)))
		GROUP BY TRIM(gn_division)
		ORDER BY TRIM(gn_division)
	`

	rows, err := repo.db.Query(context.Background(), query, division)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Empty slice, not nil, so the JSON is [] and never null.
	result := []model.DivisionSummary{}

	for rows.Next() {
		var d model.DivisionSummary
		if err := rows.Scan(&d.Division, &d.FarmerCount); err != nil {
			return nil, err
		}
		result = append(result, d)
	}

	return result, rows.Err()
}

// ListFarmers returns one row per farmer, already counted up.
//
// The counts come from correlated subqueries rather than joins. A join to
// lands AND readings at once would multiply the rows together - three lands
// and four readings would give twelve rows, and SUM(size_ha) would report
// four times the real area. Subqueries each answer one question about one
// farmer, so there is nothing to double count.
func (repo *OfficerRepository) ListFarmers(
	division string,
) ([]model.FarmerSummary, error) {

	query := `
		SELECT
			f.farmer_id, f.full_name, TRIM(f.gn_division), f.nic,
			f.mobile, f.email,

			(SELECT COUNT(*) FROM lands l
			  WHERE l.farmer_id = f.farmer_id),

			(SELECT COALESCE(SUM(l.size_ha), 0) FROM lands l
			  WHERE l.farmer_id = f.farmer_id),

			(SELECT COUNT(*) FROM readings r
			  WHERE r.farmer_id = f.farmer_id),

			(SELECT COUNT(*) FROM readings r
			  WHERE r.farmer_id = f.farmer_id AND r.quality_flag <> 'OK'),

			(SELECT MAX(r.created_at) FROM readings r
			  WHERE r.farmer_id = f.farmer_id)

		FROM farmers f
		WHERE f.role = 'FARMER'
		  AND ($1 = '' OR LOWER(TRIM(f.gn_division)) = LOWER(TRIM($1)))
		ORDER BY f.full_name
	`

	rows, err := repo.db.Query(context.Background(), query, division)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []model.FarmerSummary{}

	for rows.Next() {
		var f model.FarmerSummary
		err := rows.Scan(
			&f.FarmerID, &f.FullName, &f.GNDivision, &f.NIC,
			&f.Mobile, &f.Email,
			&f.LandCount, &f.TotalHectare,
			&f.ReadingCount, &f.FlaggedCount, &f.LastReadingAt,
		)
		if err != nil {
			return nil, err
		}
		result = append(result, f)
	}

	return result, rows.Err()
}

// FindFarmer loads one farmer, but only if they are inside the division the
// caller is allowed to see.
//
// The division is part of the WHERE clause, so a farmer outside it is simply
// not found. An officer cannot reach another division's farmer by typing a
// different id into the address bar.
func (repo *OfficerRepository) FindFarmer(
	farmerID int, division string,
) (model.FarmerSummary, error) {

	query := `
		SELECT
			f.farmer_id, f.full_name, TRIM(f.gn_division), f.nic,
			f.mobile, f.email,
			(SELECT COUNT(*) FROM lands l WHERE l.farmer_id = f.farmer_id),
			(SELECT COALESCE(SUM(l.size_ha), 0) FROM lands l
			  WHERE l.farmer_id = f.farmer_id),
			(SELECT COUNT(*) FROM readings r WHERE r.farmer_id = f.farmer_id),
			(SELECT COUNT(*) FROM readings r
			  WHERE r.farmer_id = f.farmer_id AND r.quality_flag <> 'OK'),
			(SELECT MAX(r.created_at) FROM readings r
			  WHERE r.farmer_id = f.farmer_id)
		FROM farmers f
		WHERE f.farmer_id = $1
		  AND f.role = 'FARMER'
		  AND ($2 = '' OR LOWER(TRIM(f.gn_division)) = LOWER(TRIM($2)))
	`

	var f model.FarmerSummary

	err := repo.db.QueryRow(context.Background(), query, farmerID, division).
		Scan(
			&f.FarmerID, &f.FullName, &f.GNDivision, &f.NIC,
			&f.Mobile, &f.Email,
			&f.LandCount, &f.TotalHectare,
			&f.ReadingCount, &f.FlaggedCount, &f.LastReadingAt,
		)

	return f, err
}

// ListReadings returns the readings table behind both dashboards.
//
// farmerID 0 means "any farmer", flag "" means "any flag".
func (repo *OfficerRepository) ListReadings(
	division string, flag string, farmerID int, limit int,
) ([]model.ReadingRow, error) {

	// LEFT JOIN, not JOIN, on farmers and lands.
	//
	// The 27 readings made while testing have no farmer and no land. A plain
	// JOIN would drop them silently, and the dashboard would quietly show
	// fewer readings than the database holds - the worst kind of bug,
	// because nothing looks wrong. LEFT JOIN keeps them, with empty names.
	query := `
		SELECT
			r.reading_id, r.farmer_id,
			COALESCE(f.full_name, ''), COALESCE(TRIM(f.gn_division), ''),
			COALESCE(l.name, ''),
			r.crop, r.stage, r.n, r.p, r.k, r.ph, r.area,
			r.quality_flag, r.agent_note,
			r.raw_lat, r.raw_lng, r.created_at
		FROM readings r
		LEFT JOIN farmers f ON f.farmer_id = r.farmer_id
		LEFT JOIN lands   l ON l.land_id   = r.land_id
		WHERE ($1 = '' OR LOWER(TRIM(f.gn_division)) = LOWER(TRIM($1)))
		  AND ($2 = '' OR r.quality_flag = $2)
		  AND ($3 = 0  OR r.farmer_id = $3)
		ORDER BY r.created_at DESC
		LIMIT $4
	`

	rows, err := repo.db.Query(
		context.Background(), query, division, flag, farmerID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []model.ReadingRow{}

	for rows.Next() {
		var rr model.ReadingRow
		err := rows.Scan(
			&rr.ReadingID, &rr.FarmerID,
			&rr.FarmerName, &rr.GNDivision, &rr.LandName,
			&rr.Crop, &rr.Stage, &rr.N, &rr.P, &rr.K, &rr.PH, &rr.Area,
			&rr.QualityFlag, &rr.AgentNote,
			&rr.RawLat, &rr.RawLng, &rr.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		result = append(result, rr)
	}

	return result, rows.Err()
}

// ListMapPoints returns just what a dot on the map needs.
func (repo *OfficerRepository) ListMapPoints(
	division string, limit int,
) ([]model.MapPoint, error) {

	query := `
		SELECT r.reading_id, r.raw_lat, r.raw_lng, r.quality_flag, r.crop,
		       COALESCE(TRIM(f.gn_division), '')
		FROM readings r
		LEFT JOIN farmers f ON f.farmer_id = r.farmer_id
		WHERE r.raw_lat IS NOT NULL AND r.raw_lng IS NOT NULL AND ($1 = '' OR LOWER(TRIM(f.gn_division)) = LOWER(TRIM($1)))
		ORDER BY r.created_at DESC
		LIMIT $2
	`

	rows, err := repo.db.Query(context.Background(), query, division, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []model.MapPoint{}

	for rows.Next() {
		var p model.MapPoint
		err := rows.Scan(
			&p.ReadingID, &p.RawLat, &p.RawLng,
			&p.QualityFlag, &p.Crop, &p.GNDivision,
		)
		if err != nil {
			return nil, err
		}
		result = append(result, p)
	}

	return result, rows.Err()
}
