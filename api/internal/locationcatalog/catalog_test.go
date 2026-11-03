package locationcatalog

import (
	"strings"
	"testing"
)

func TestOfficialCatalogCoverageAndUniqueIdentities(t *testing.T) {
	if len(All) < 14000 {
		t.Fatalf("national catalog is incomplete: %d", len(All))
	}
	districts, codes, values := map[string]bool{}, map[string]bool{}, map[string]bool{}
	names := map[string]int{}
	for _, division := range All {
		if len(division.Code) != 7 || division.DistrictCode != division.Code[:2] || division.Name == "" || division.DSDivision == "" {
			t.Fatalf("invalid division: %+v", division)
		}
		if codes[division.Code] || values[strings.ToLower(division.Value)] {
			t.Fatalf("duplicate identity: %+v", division)
		}
		codes[division.Code], values[strings.ToLower(division.Value)], districts[division.DistrictCode] = true, true, true
		names[strings.ToLower(division.Name)]++
		resolved, ok := Resolve(division.Code)
		if !ok || resolved.Value != division.Value {
			t.Fatal("census code did not resolve")
		}
	}
	if len(districts) != 25 {
		t.Fatalf("got %d districts", len(districts))
	}
	for name, count := range names {
		if count > 1 {
			if _, ok := Resolve(name); ok {
				t.Fatalf("ambiguous bare name resolved: %s", name)
			}
		}
	}
}

func TestResolveKeepsExistingUniqueNamesAndRejectsUnknownText(t *testing.T) {
	division, ok := Resolve("  gettuwana  ")
	if !ok || division.Code != "6154165" || division.Value != "Gettuwana" || division.DistrictCode != "61" {
		t.Fatalf("unexpected resolution: %+v", division)
	}
	for _, value := range []string{"", "not-a-real-GN-division", "invented-division-xyz"} {
		if _, ok := Resolve(value); ok {
			t.Fatalf("unknown value resolved: %s", value)
		}
	}
}
