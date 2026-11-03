package repository

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"soil-data-system/api/internal/locationcatalog"
)

func TestLocationCatalogPostgresImportAndFiltering(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("Set TEST_DATABASE_URL to run the isolated PostgreSQL catalog test")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := fmt.Sprintf("gn_catalog_test_%d", time.Now().UnixNano())
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
	repo := NewLocationCatalogRepository(pool)
	for attempt := 0; attempt < 2; attempt++ {
		if err := repo.Ensure(ctx); err != nil {
			t.Fatal(err)
		}
	}
	districts, err := repo.Districts(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(districts) != 25 {
		t.Fatalf("got %d districts", len(districts))
	}
	total := 0
	for _, district := range districts {
		total += district.DivisionCount
	}
	if total != len(locationcatalog.All) {
		t.Fatalf("lost rows: %d", total)
	}
	all, err := repo.Divisions(ctx, "11", "")
	if err != nil {
		t.Fatal(err)
	}
	oneLetter, err := repo.Divisions(ctx, "11", "a")
	if err != nil {
		t.Fatal(err)
	}
	moreLetters, err := repo.Divisions(ctx, "11", "am")
	if err != nil {
		t.Fatal(err)
	}
	if !(len(moreLetters) > 0 && len(moreLetters) < len(oneLetter) && len(oneLetter) < len(all)) {
		t.Fatalf("search did not narrow: %d -> %d -> %d", len(all), len(oneLetter), len(moreLetters))
	}
	for _, division := range moreLetters {
		if division.DistrictCode != "11" || !strings.HasPrefix(strings.ToLower(division.Name), "am") {
			t.Fatalf("wrong district or search result: %+v", division)
		}
	}
	for _, query := range []string{"%", "_", "' OR 1=1 --"} {
		rows, err := repo.Divisions(ctx, "11", query)
		if err != nil {
			t.Fatal(err)
		}
		for _, division := range rows {
			if !strings.HasPrefix(strings.ToLower(division.Name), query) {
				t.Fatal("query was treated as a SQL expression or wildcard")
			}
		}
	}
}
