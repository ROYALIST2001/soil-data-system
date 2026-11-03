package repository

import (
	"context"
	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/soilmap"
)

// GN averages use the land's saved division snapshot, corrected values and only
// accepted readings. Farmer addresses and GPS points are never returned here.
func (repo *AnalyticsRepository) GNAverages(ctx context.Context, district string) (map[string]soilmap.Stats, error) {
	rows, err := repo.db.Query(ctx, `SELECT r.gn_division_code,
 AVG(COALESCE(r.corrected_n,r.n)), AVG(COALESCE(r.corrected_p,r.p)),
 AVG(COALESCE(r.corrected_k,r.k)), AVG(COALESCE(r.corrected_ph,r.ph)), COUNT(*), MAX(r.created_at)
 FROM readings r JOIN gn_division_catalog c ON c.code=r.gn_division_code
 WHERE c.district_code=$1 AND COALESCE(r.officer_flag,r.quality_flag)='OK'
 GROUP BY r.gn_division_code`, district)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make(map[string]soilmap.Stats)
	for rows.Next() {
		var code string
		var stats soilmap.Stats
		if err := rows.Scan(&code, &stats.N, &stats.P, &stats.K, &stats.PH, &stats.ReadingCount, &stats.LastReading); err != nil {
			return nil, err
		}
		result[code] = stats
	}
	return result, rows.Err()
}

func (repo *AnalyticsRepository) GNHistory(ctx context.Context, code string) ([]model.HistoryPoint, error) {
	rows, err := repo.db.Query(ctx, `SELECT DATE_TRUNC('month',created_at) AS period,
 AVG(COALESCE(corrected_n,n)), AVG(COALESCE(corrected_p,p)),
 AVG(COALESCE(corrected_k,k)), AVG(COALESCE(corrected_ph,ph)), COUNT(*)
 FROM readings WHERE gn_division_code=$1 AND COALESCE(officer_flag,quality_flag)='OK'
 GROUP BY period ORDER BY period`, code)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAggregated(rows)
}

func (repo *AnalyticsRepository) LandHistory(ctx context.Context, landID, farmerID int) ([]model.HistoryPoint, error) {
	rows, err := repo.db.Query(ctx, `SELECT r.created_at,COALESCE(r.corrected_n,r.n),COALESCE(r.corrected_p,r.p),
 COALESCE(r.corrected_k,r.k),COALESCE(r.corrected_ph,r.ph),1
 FROM readings r JOIN lands l ON l.land_id=r.land_id
 WHERE r.land_id=$1 AND l.farmer_id=$2 AND COALESCE(r.officer_flag,r.quality_flag)='OK'
 ORDER BY r.created_at,r.reading_id`, landID, farmerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAggregated(rows)
}
