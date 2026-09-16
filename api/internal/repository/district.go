package repository

import (
	"context"
	"encoding/json"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"soil-data-system/api/internal/model"
)

// DistrictRepository holds the database connection.
type DistrictRepository struct {
	db *pgxpool.Pool
}

// NewDistrictRepository builds the repository.
func NewDistrictRepository(db *pgxpool.Pool) *DistrictRepository {
	return &DistrictRepository{db: db}
}

// LoadBoundaries gets district ids from the database,
// gets district shapes from the GeoJSON file,
// and joins them into one list.
// IMPORTANT: run this ONCE at startup, not on every request.
func (repo *DistrictRepository) LoadBoundaries(filePath string) ([]model.DistrictBoundary, error) {

	// ---------- STEP 1: read id and name from the database ----------

	rows, err := repo.db.Query(context.Background(),
		`SELECT district_id, name FROM districts`)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// A map is a lookup table.
	// Give it a name, and it gives you the id.
	idByName := make(map[string]int)

	for rows.Next() {
		var id int
		var name string

		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}

		idByName[name] = id
	}

	// ---------- STEP 2: read the GeoJSON file from disk ----------

	// Read the whole file as raw bytes.
	fileBytes, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}

	// Turn those bytes into our Go structs.
	var geoFile model.GeoJSONFile
	if err := json.Unmarshal(fileBytes, &geoFile); err != nil {
		return nil, err
	}

	// ---------- STEP 3: join the two together ----------

	var boundaries []model.DistrictBoundary

	for _, feature := range geoFile.Features {
		name := feature.Properties.Name

		// Find the id for this name.
		// "found" is false if the name is not in our map.
		id, found := idByName[name]
		if !found {
			// A spelling mistake should not crash the service.
			// Skip this shape, warn, and carry on.
			log.Println("Skipping unknown district in GeoJSON:", name)
			continue
		}

		// A polygon must have at least one ring.
		if len(feature.Geometry.Coordinates) == 0 {
			continue
		}

		// Ring 0 is the outside border.
		// Later rings would be holes. We do not use them.
		outerRing := feature.Geometry.Coordinates[0]

		// Convert each confusing [lng, lat] pair
		// into a clear Point with named fields.
		var points []model.Point
		for _, pair := range outerRing {
			points = append(points, model.Point{
				Lng: pair[0], // GeoJSON puts longitude FIRST
				Lat: pair[1], // and latitude SECOND
			})
		}

		// Save the finished district.
		boundaries = append(boundaries, model.DistrictBoundary{
			DistrictID: id,
			Name:       name,
			Ring:       points,
		})
	}

	return boundaries, nil
}
