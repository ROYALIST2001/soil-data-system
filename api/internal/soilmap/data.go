// Package soilmap serves the mobile map and versioned, simplified NSDI boundaries.
package soilmap

import (
	"compress/gzip"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"sync"
	"time"
)

//go:embed data/*.geojson.gz assets/*
var files embed.FS

type Stats struct {
	N            float64   `json:"n"`
	P            float64   `json:"p"`
	K            float64   `json:"k"`
	PH           float64   `json:"ph"`
	ReadingCount int       `json:"reading_count"`
	LastReading  time.Time `json:"last_reading"`
}

type Properties struct {
	BoundaryID   int    `json:"boundary_id"`
	Code         string `json:"code"`
	Name         string `json:"name"`
	DistrictCode string `json:"district_code"`
	District     string `json:"district"`
	DSDivision   string `json:"ds_division"`
	Stats        *Stats `json:"stats"`
}

type Feature struct {
	Type       string          `json:"type"`
	Geometry   json.RawMessage `json:"geometry"`
	Properties Properties      `json:"properties"`
}

var cache sync.Map

func Boundaries(district string) ([]Feature, error) {
	// This is a reference code, never an arbitrary path.
	if len(district) != 2 || district[0] < '0' || district[0] > '9' || district[1] < '0' || district[1] > '9' {
		return nil, fmt.Errorf("invalid district code")
	}
	if cached, ok := cache.Load(district); ok {
		return cached.([]Feature), nil
	}
	file, err := files.Open("data/" + district + ".geojson.gz")
	if err != nil {
		return nil, err
	}
	defer file.Close()
	reader, err := gzip.NewReader(file)
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	var collection struct {
		Features []Feature `json:"features"`
	}
	if err := json.NewDecoder(reader).Decode(&collection); err != nil {
		return nil, err
	}
	cache.Store(district, collection.Features)
	return collection.Features, nil
}

func Handler() http.Handler {
	assets, err := fs.Sub(files, "assets")
	if err != nil {
		panic(err)
	}
	return http.FileServerFS(assets)
}
