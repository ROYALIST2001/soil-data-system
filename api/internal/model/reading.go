package model

import "time"

// Reading is the shape of one soil test.
type Reading struct {
	ReadingID   int       `json:"reading_id"`
	RawLat      float64   `json:"raw_lat"`
	RawLng      float64   `json:"raw_lng"`
	AnchorID    *int      `json:"anchor_id"`    // *int = can be empty (null)
	DistrictID  *int      `json:"district_id"`  // *int = can be empty (null)
	N           float64   `json:"n"`
	P           float64   `json:"p"`
	K           float64   `json:"k"`
	PH          float64   `json:"ph"`
	Crop        string    `json:"crop"`
	Stage       string    `json:"stage"`
	TargetYield float64   `json:"target_yield"`
	Area        float64   `json:"area"`
	CreatedAt   time.Time `json:"created_at"`
	QualityFlag string    `json:"quality_flag"`
}