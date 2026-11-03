package repository

import (
	"context"
	"crypto/sha256"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"soil-data-system/api/internal/locationcatalog"
)

type LocationCatalogRepository struct{ db *pgxpool.Pool }

func NewLocationCatalogRepository(db *pgxpool.Pool) *LocationCatalogRepository {
	return &LocationCatalogRepository{db: db}
}

// Ensure installs the additive reference tables for existing and fresh databases.
// A transaction and advisory lock make concurrent API starts safe. Existing farmer
// records and officer scopes are never guessed or rewritten during ingestion.
func (repo *LocationCatalogRepository) Ensure(ctx context.Context) error {
	tx, err := repo.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(71344812)`); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS gn_division_catalog (
			code TEXT PRIMARY KEY, name TEXT NOT NULL, district_code TEXT NOT NULL,
			district TEXT NOT NULL, ds_division TEXT NOT NULL, value TEXT NOT NULL UNIQUE
		);
		CREATE INDEX IF NOT EXISTS gn_catalog_district ON gn_division_catalog(district_code);
		CREATE TABLE IF NOT EXISTS location_catalog_versions (name TEXT PRIMARY KEY, checksum TEXT NOT NULL);
	`); err != nil {
		return err
	}
	checksum := fmt.Sprintf("%x", sha256.Sum256(locationcatalog.Data))
	var current string
	if err = tx.QueryRow(ctx, `SELECT checksum FROM location_catalog_versions WHERE name='dcs-gn'`).Scan(&current); err != nil && err != pgx.ErrNoRows {
		return err
	}
	var count int
	if err = tx.QueryRow(ctx, `SELECT COUNT(*) FROM gn_division_catalog`).Scan(&count); err != nil {
		return err
	}
	if current == checksum && count == len(locationcatalog.All) {
		return tx.Commit(ctx)
	}
	if _, err = tx.Exec(ctx, `CREATE TEMP TABLE gn_catalog_import (LIKE gn_division_catalog INCLUDING DEFAULTS) ON COMMIT DROP`); err != nil {
		return err
	}
	rows := make([][]any, 0, len(locationcatalog.All))
	for _, division := range locationcatalog.All {
		rows = append(rows, []any{division.Code, division.Name, division.DistrictCode, division.District, division.DSDivision, division.Value})
	}
	if _, err = tx.CopyFrom(ctx, pgx.Identifier{"gn_catalog_import"}, []string{"code", "name", "district_code", "district", "ds_division", "value"}, pgx.CopyFromRows(rows)); err != nil {
		return err
	}
	// Only reference rows are replaced; application data is unaffected.
	if _, err = tx.Exec(ctx, `DELETE FROM gn_division_catalog; INSERT INTO gn_division_catalog SELECT * FROM gn_catalog_import;`); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `
		INSERT INTO location_catalog_versions(name, checksum) VALUES ('dcs-gn',$1)
		ON CONFLICT(name) DO UPDATE SET checksum=EXCLUDED.checksum;
	`, checksum); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type CatalogDistrict struct {
	Code          string `json:"code"`
	Name          string `json:"name"`
	DivisionCount int    `json:"division_count"`
}

func (repo *LocationCatalogRepository) Districts(ctx context.Context) ([]CatalogDistrict, error) {
	rows, err := repo.db.Query(ctx, `SELECT district_code,district,COUNT(*) FROM gn_division_catalog GROUP BY district_code,district ORDER BY district`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []CatalogDistrict{}
	for rows.Next() {
		var district CatalogDistrict
		if err := rows.Scan(&district.Code, &district.Name, &district.DivisionCount); err != nil {
			return nil, err
		}
		result = append(result, district)
	}
	return result, rows.Err()
}

func (repo *LocationCatalogRepository) Divisions(ctx context.Context, district, search string) ([]locationcatalog.Division, error) {
	// Literal prefix matching: '%' and '_' entered by a user are not SQL wildcards.
	rows, err := repo.db.Query(ctx, `SELECT code,name,district_code,district,ds_division,value FROM gn_division_catalog
		WHERE district_code=$1 AND ($2='' OR POSITION($2 IN LOWER(name))=1 OR POSITION($2 IN code)=1)
		ORDER BY LOWER(name),ds_division,code`, district, strings.ToLower(strings.TrimSpace(search)))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []locationcatalog.Division{}
	for rows.Next() {
		var division locationcatalog.Division
		if err := rows.Scan(&division.Code, &division.Name, &division.DistrictCode, &division.District, &division.DSDivision, &division.Value); err != nil {
			return nil, err
		}
		result = append(result, division)
	}
	return result, rows.Err()
}
