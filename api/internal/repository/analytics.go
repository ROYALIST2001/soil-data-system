package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"soil-data-system/api/internal/model"
)

// AnalyticsRepository holds the database connection.
type AnalyticsRepository struct {
	db *pgxpool.Pool
}

// NewAnalyticsRepository builds the repository.
func NewAnalyticsRepository(db *pgxpool.Pool) *AnalyticsRepository {
	return &AnalyticsRepository{db: db}
}

// FieldHistory returns every reading from ONE exact field, in time order.
//
// NOTE: we do NOT aggregate here.
// A field has few readings, maybe 4 or 10. We plot them directly.
// Averaging 4 readings into 1 point would destroy the detail.
//
// RULE: aggregate only when you have too many points to show.
func (repo *AnalyticsRepository) FieldHistory(anchorID int) ([]model.HistoryPoint, error) {

	// Read every line of this SQL. Every part matters:
	//
	//   anchor_id = $1        -> only THIS field
	//   quality_flag = 'OK'   -> EXCLUDE flagged readings.
	//                            We promised this in Phase 4.
	//                            Without it, one bad reading with
	//                            N = 430 would put a huge fake spike
	//                            in the graph.
	//   ORDER BY ... ASC      -> oldest first. A graph needs time order.
	query := `
		SELECT created_at, n, p, k, ph
		FROM readings
		WHERE anchor_id = $1 AND quality_flag = 'OK'
		ORDER BY created_at ASC
	`

	rows, err := repo.db.Query(context.Background(), query, anchorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []model.HistoryPoint

	for rows.Next() {
		var p model.HistoryPoint

		if err := rows.Scan(&p.Date, &p.N, &p.P, &p.K, &p.PH); err != nil {
			return nil, err
		}

		// Each point is ONE reading, so the count is 1.
		p.Count = 1
		points = append(points, p)
	}

	return points, rows.Err()
}

// AreaHistory returns the MONTHLY AVERAGE for a small neighbourhood.
//
// We take a BOX around the centre point. Any reading inside the box
// counts as "this area".
func (repo *AnalyticsRepository) AreaHistory(
	lat float64,
	lng float64,
	radiusDegrees float64,
) ([]model.HistoryPoint, error) {

	// AGGREGATION. An area can have many readings, so we average
	// them per month, giving one clean point per month.
	//
	// DATE_TRUNC('month', ...) chops a timestamp down to the month:
	//   2026-07-11 09:14  ->  2026-07-01 00:00
	//   2026-07-28 16:02  ->  2026-07-01 00:00
	// Both become the SAME value, so GROUP BY puts them together.
	//
	// COALESCE(AVG(n), 0): AVG returns NULL if there are no rows,
	// and Go cannot read NULL into a float64. COALESCE says
	// "if it is NULL, use 0 instead".
	//
	// WHY THE ::float8 CASTS?
	// Without them PostgreSQL refuses the query:
	//   ERROR: operator is not unique: unknown - unknown
	// In "$1 - $3" BOTH sides are placeholders, so Postgres cannot
	// tell WHICH minus operator to use. The cast names the type and
	// removes the ambiguity. The other two queries do not need this,
	// because their parameters are compared to a column directly.
	query := `
		SELECT
			DATE_TRUNC('month', created_at) AS period,
			COALESCE(AVG(n), 0)  AS avg_n,
			COALESCE(AVG(p), 0)  AS avg_p,
			COALESCE(AVG(k), 0)  AS avg_k,
			COALESCE(AVG(ph), 0) AS avg_ph,
			COUNT(*)             AS reading_count
		FROM readings
		WHERE quality_flag = 'OK'
		  AND raw_lat BETWEEN $1::float8 - $3::float8 AND $1::float8 + $3::float8
		  AND raw_lng BETWEEN $2::float8 - $3::float8 AND $2::float8 + $3::float8
		GROUP BY period
		ORDER BY period ASC
	`

	rows, err := repo.db.Query(context.Background(), query, lat, lng, radiusDegrees)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanAggregated(rows)
}

// DistrictHistory returns the MONTHLY AVERAGE for one whole district.
func (repo *AnalyticsRepository) DistrictHistory(districtID int) ([]model.HistoryPoint, error) {

	query := `
		SELECT
			DATE_TRUNC('month', created_at) AS period,
			COALESCE(AVG(n), 0)  AS avg_n,
			COALESCE(AVG(p), 0)  AS avg_p,
			COALESCE(AVG(k), 0)  AS avg_k,
			COALESCE(AVG(ph), 0) AS avg_ph,
			COUNT(*)             AS reading_count
		FROM readings
		WHERE district_id = $1 AND quality_flag = 'OK'
		GROUP BY period
		ORDER BY period ASC
	`

	rows, err := repo.db.Query(context.Background(), query, districtID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanAggregated(rows)
}

// DistrictName looks up a district name, for the graph title.
func (repo *AnalyticsRepository) DistrictName(districtID int) (string, error) {
	var name string

	err := repo.db.QueryRow(context.Background(),
		`SELECT name FROM districts WHERE district_id = $1`,
		districtID).Scan(&name)

	if err != nil {
		return "", fmt.Errorf("district not found")
	}

	return name, nil
}

// scanAggregated reads the rows from an aggregated query.
//
// Both AreaHistory and DistrictHistory return the SAME columns,
// so we share this helper instead of writing it twice.
func scanAggregated(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
}) ([]model.HistoryPoint, error) {

	var points []model.HistoryPoint

	for rows.Next() {
		var p model.HistoryPoint

		err := rows.Scan(&p.Date, &p.N, &p.P, &p.K, &p.PH, &p.Count)
		if err != nil {
			return nil, err
		}

		points = append(points, p)
	}

	return points, rows.Err()
}

// DistrictAverages returns the average soil for every district
// that has data. Used for clustering.
// NEW in Phase 7 Part 2.
func (repo *AnalyticsRepository) DistrictAverages() ([]model.DistrictSoil, error) {

	// JOIN connects the two tables: each reading knows its district_id,
	// and we want the district's NAME as well.
	//
	// HAVING filters AFTER grouping. WHERE filters BEFORE.
	// We must use HAVING here, because COUNT(*) only exists
	// once the rows have been grouped.
	//
	// TIP: raising this to >= 3 would exclude districts with barely
	// any data, giving more reliable averages. Worth mentioning
	// in your report as a tuning option.
	query := `
		SELECT
			d.district_id,
			d.name,
			COALESCE(AVG(r.n), 0)  AS avg_n,
			COALESCE(AVG(r.p), 0)  AS avg_p,
			COALESCE(AVG(r.k), 0)  AS avg_k,
			COALESCE(AVG(r.ph), 0) AS avg_ph,
			COUNT(*)               AS reading_count
		FROM readings r
		JOIN districts d ON d.district_id = r.district_id
		WHERE r.quality_flag = 'OK'
		GROUP BY d.district_id, d.name
		HAVING COUNT(*) >= 1
		ORDER BY d.name
	`

	rows, err := repo.db.Query(context.Background(), query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []model.DistrictSoil

	for rows.Next() {
		var d model.DistrictSoil

		err := rows.Scan(&d.DistrictID, &d.Name,
			&d.AvgN, &d.AvgP, &d.AvgK, &d.AvgPH, &d.ReadingCount)
		if err != nil {
			return nil, err
		}

		results = append(results, d)
	}

	return results, rows.Err()
}
