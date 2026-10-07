package model

import "time"

// What the officer dashboards read.
//
// These are NOT the database tables. They are shaped for the screens that
// show them: one row of a table is one struct, already counted up, so the
// browser never has to add anything together itself.
//
// Keeping them separate from the storage types also means we choose, field
// by field, what leaves the server. That is how the privacy rules below are
// enforced - by not sending the data, rather than by hoping the screen does
// not show it.

// DivisionSummary is one Grama Niladhari division, for the filter dropdown.
type DivisionSummary struct {
	Division    string `json:"division"`
	FarmerCount int    `json:"farmer_count"`
}

// FarmerSummary is one row of the farmer table.
type FarmerSummary struct {
	FarmerID   int    `json:"farmer_id"`
	FullName   string `json:"full_name"`
	GNDivision string `json:"gn_division"`

	// The NIC, usually MASKED to its last four characters.
	//
	// A department officer looking at a national list has no need for whole
	// identity card numbers, and a list of them is exactly the sort of thing
	// that should not be sitting in a browser tab. A division officer, who
	// deals with these farmers face to face, sees the real one.
	//
	// The masking happens in the service, not the screen. Data that never
	// leaves the server cannot leak from the browser.
	NIC string `json:"nic"`

	// Contact details, only for an officer who needs them.
	// Empty for a department officer.
	Mobile string `json:"mobile"`
	Email  string `json:"email"`

	LandCount    int     `json:"land_count"`
	TotalHectare float64 `json:"total_hectare"`

	ReadingCount int `json:"reading_count"`

	// How many of their readings the quality rules did not accept. This is
	// the column an officer sorts by to find who needs attention.
	FlaggedCount int `json:"flagged_count"`

	LastReadingAt *time.Time `json:"last_reading_at"`
}

// ReadingRow is one row of the readings table in the dashboards.
type ReadingRow struct {
	ReadingID int `json:"reading_id"`

	FarmerID   *int   `json:"farmer_id"`
	FarmerName string `json:"farmer_name"`
	GNDivision string `json:"gn_division"`

	LandName string `json:"land_name"`
	Crop     string `json:"crop"`
	Stage    string `json:"stage"`

	N  float64 `json:"n"`
	P  float64 `json:"p"`
	K  float64 `json:"k"`
	PH float64 `json:"ph"`

	Area float64 `json:"area"`

	QualityFlag string `json:"quality_flag"`

	// What the Phase 8 agent said, when it ran. An officer deciding whether
	// a reading is really wrong benefits from seeing the explanation that
	// was already written for the farmer.
	AgentNote *string `json:"agent_note"`

	RawLat    float64   `json:"raw_lat"`
	RawLng    float64   `json:"raw_lng"`
	CreatedAt time.Time `json:"created_at"`
}

// MapPoint is one dot on the soil map.
//
// Deliberately tiny. A map may draw thousands of these at once, and sending
// whole readings would be slow for no benefit - nothing else fits on a dot.
type MapPoint struct {
	ReadingID   int     `json:"reading_id"`
	RawLat      float64 `json:"raw_lat"`
	RawLng      float64 `json:"raw_lng"`
	QualityFlag string  `json:"quality_flag"`
	Crop        string  `json:"crop"`
	GNDivision  string  `json:"gn_division"`
}

// FarmerDetail is one farmer with everything about them, for the detail page.
type FarmerDetail struct {
	Farmer   FarmerSummary `json:"farmer"`
	Lands    []Land        `json:"lands"`
	Readings []ReadingRow  `json:"readings"`
}
