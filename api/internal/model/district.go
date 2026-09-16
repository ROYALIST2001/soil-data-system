package model

// ---------- GROUP 1: the raw shape of the GeoJSON file ----------
// These structs match the file exactly, so Go can read it.

// GeoJSONFile is the whole file.
type GeoJSONFile struct {
	Features []GeoJSONFeature `json:"features"`
}

// GeoJSONFeature is one district inside the file.
type GeoJSONFeature struct {
	Properties GeoJSONProperties `json:"properties"`
	Geometry   GeoJSONGeometry   `json:"geometry"`
}

// GeoJSONProperties holds the information about the shape.
type GeoJSONProperties struct {
	Name string `json:"name"`
}

// GeoJSONGeometry holds the shape itself.
type GeoJSONGeometry struct {
	Type string `json:"type"`

	// Read the brackets from outside to inside:
	// [ring number][point number][0 = longitude, 1 = latitude]
	// WARNING: GeoJSON puts longitude FIRST.
	Coordinates [][][]float64 `json:"coordinates"`
}

// ---------- GROUP 2: our own clean shapes ----------

// We convert Group 1 into these, so nobody mixes up lat and lng.

// Point is one corner. The names make it clear which number is which.
type Point struct {
	Lat float64
	Lng float64
}

// DistrictBoundary is one district and its outline.
type DistrictBoundary struct {
	DistrictID int     // the id from the database
	Name       string  // the district name
	Ring       []Point // the outline corners, in order
}
