package model

import "time"

// ---------- WHAT IS STORED ----------

// LandCrop is one crop grown on part of one land.
type LandCrop struct {
	LandCropID int       `json:"land_crop_id"`
	LandID     int       `json:"land_id"`
	Crop       string    `json:"crop"`
	SizeHa     float64   `json:"size_ha"`
	CreatedAt  time.Time `json:"created_at"`
}

// Land is one piece of ground belonging to one farmer.
type Land struct {
	LandID     int       `json:"land_id"`
	FarmerID   int       `json:"farmer_id"`
	Name       string    `json:"name"`
	GNDivision string    `json:"gn_division"`
	SizeHa     float64   `json:"size_ha"`
	CreatedAt  time.Time `json:"created_at"`

	// The crops growing on it.
	//
	// We send the land AND its crops together, in one reply. The app always
	// needs both, so splitting them into two requests would just make the
	// screen flicker and double the trips over a slow mobile connection.
	Crops []LandCrop `json:"crops"`
}

// ---------- WHAT THE APP SENDS US ----------

// NewLandCrop is one crop being added, before it has an id.
type NewLandCrop struct {
	Crop   string  `json:"crop"`
	SizeHa float64 `json:"size_ha"`
}

// CreateLandRequest is a farmer registering one land with its crops.
type CreateLandRequest struct {
	// WHICH FARMER THIS BELONGS TO.
	//
	// HONEST LIMITATION FOR THE REPORT: the app sends this, which means
	// anyone calling the API directly could put somebody else's id here and
	// add a land to their account. The proper fix is a signed token from
	// login that the server reads the farmer id OUT of, so the caller cannot
	// choose it. That is the next piece of work, not something this step
	// quietly pretends to have solved.
	FarmerID int `json:"farmer_id"`

	Name       string  `json:"name"`
	GNDivision string  `json:"gn_division"`
	SizeHa     float64 `json:"size_ha"`

	// At least one crop is required. A land with nothing growing on it
	// gives the fertilizer system nothing to work with.
	Crops []NewLandCrop `json:"crops"`
}

// AddCropRequest is one crop being added to a land that already exists.
type AddCropRequest struct {
	FarmerID int     `json:"farmer_id"`
	Crop     string  `json:"crop"`
	SizeHa   float64 `json:"size_ha"`
}

// ---------- WHAT WE SEND BACK ----------

// LandsResponse is every land this farmer owns, with their crops.
type LandsResponse struct {
	Lands []Land `json:"lands"`
}
