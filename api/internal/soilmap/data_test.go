package soilmap

import (
	"encoding/json"
	"soil-data-system/api/internal/locationcatalog"
	"testing"
)

func TestNationalBoundaryCoverage(t *testing.T) {
	districts := make(map[string]bool)
	ids := make(map[int]bool)
	total, unlinked := 0, 0
	for _, division := range locationcatalog.All {
		districts[division.DistrictCode] = true
	}
	for district := range districts {
		features, err := Boundaries(district)
		if err != nil {
			t.Fatal(district, err)
		}
		if len(features) == 0 {
			t.Fatal("empty district", district)
		}
		for _, feature := range features {
			total++
			if ids[feature.Properties.BoundaryID] {
				t.Fatal("duplicated boundary id")
			}
			ids[feature.Properties.BoundaryID] = true
			if feature.Properties.DistrictCode != district {
				t.Fatal("boundary in wrong district")
			}
			if feature.Properties.Stats != nil {
				t.Fatal("bundled boundaries contain fabricated soil data")
			}
			if feature.Properties.Code == "" {
				unlinked++
			} else {
				division, ok := locationcatalog.Resolve(feature.Properties.Code)
				if !ok || division.DistrictCode != district {
					t.Fatal("invalid or cross-district GN link")
				}
			}
			var geometry struct {
				Type        string
				Coordinates json.RawMessage
			}
			if err := json.Unmarshal(feature.Geometry, &geometry); err != nil {
				t.Fatal(err)
			}
			var polygons [][][][]float64
			if geometry.Type == "Polygon" {
				var rings [][][]float64
				if err := json.Unmarshal(geometry.Coordinates, &rings); err != nil {
					t.Fatal(err)
				}
				polygons = append(polygons, rings)
			} else if geometry.Type == "MultiPolygon" {
				if err := json.Unmarshal(geometry.Coordinates, &polygons); err != nil {
					t.Fatal(err)
				}
			} else {
				t.Fatal("unsupported geometry", geometry.Type)
			}
			for _, polygon := range polygons {
				for _, ring := range polygon {
					if len(ring) < 4 {
						t.Fatal("invalid polygon ring")
					}
					for _, point := range ring {
						if len(point) != 2 || point[0] < 79 || point[0] > 82 || point[1] < 5 || point[1] > 10 {
							t.Fatal("invalid or transposed coordinates", point)
						}
					}
				}
			}
		}
	}
	if len(districts) != 25 || total != 14051 || unlinked == 0 {
		t.Fatalf("incomplete or guessed data: districts=%d polygons=%d unlinked=%d", len(districts), total, unlinked)
	}
	for _, invalid := range []string{"", "../11", "00", "Colombo"} {
		if _, err := Boundaries(invalid); err == nil {
			t.Fatal("accepted invalid district", invalid)
		}
	}
}
