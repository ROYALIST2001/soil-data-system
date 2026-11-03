// Package locationcatalog holds the versioned official DCS reference catalog.
package locationcatalog

import (
	_ "embed"
	"encoding/json"
	"strings"
)

//go:embed data/gn_divisions.json
var Data []byte

type Division struct {
	Code         string `json:"code"`
	Name         string `json:"name"`
	DistrictCode string `json:"district_code"`
	District     string `json:"district"`
	DSDivision   string `json:"ds_division"`
	Value        string `json:"value"`
}

var All []Division
var byValue map[string]Division
var byCode map[string]Division

func init() {
	var catalog struct {
		Divisions []Division `json:"divisions"`
	}
	if err := json.Unmarshal(Data, &catalog); err != nil {
		panic("Invalid embedded GN catalog")
	}
	All = catalog.Divisions
	byValue, byCode = make(map[string]Division), make(map[string]Division)
	for _, division := range All {
		byValue[strings.ToLower(division.Value)] = division
		byCode[division.Code] = division
	}
}

// Resolve accepts an official option value or its stable census code. Ambiguous
// bare names deliberately do not resolve to an arbitrary district.
func Resolve(value string) (Division, bool) {
	value = strings.TrimSpace(value)
	if division, ok := byCode[value]; ok {
		return division, true
	}
	division, ok := byValue[strings.ToLower(value)]
	return division, ok
}
