package model

import "time"

// HistoryPoint is ONE dot on the graph.
type HistoryPoint struct {
	// When. For aggregated levels this is the start of the period.
	Date time.Time `json:"date"`

	// The soil values at that time.
	N  float64 `json:"n"`
	P  float64 `json:"p"`
	K  float64 `json:"k"`
	PH float64 `json:"ph"`

	// How many readings made this point.
	//
	// IMPORTANT: never show an average without showing the count.
	// An average of 200 readings is trustworthy.
	// An average of 1 reading is not. The user must be able to tell.
	Count int `json:"count"`
}

// HistorySeries is the WHOLE graph: the points plus a description.
type HistorySeries struct {
	// Which zoom level: "field", "area", or "district".
	Level string `json:"level"`

	// What we are looking at. For example "Anchor 17" or "Colombo".
	Label string `json:"label"`

	// How many readings in total across all points.
	TotalReadings int `json:"total_readings"`

	// The dots, oldest first. A graph needs time order,
	// or the line zigzags backwards and looks broken.
	Points []HistoryPoint `json:"points"`
}
