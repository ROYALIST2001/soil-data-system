package service

import (
	"math"

	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

// The Earth's average radius, in metres.
const earthRadiusMeters = 6371000.0

// How close a new reading must be to join an old anchor.
// See the theory for why we chose 100.
const anchorRadiusMeters = 100.0

// LocationService does all the location thinking.
type LocationService struct {
	anchorRepo *repository.AnchorRepository
	boundaries []model.DistrictBoundary // loaded once at startup, kept in memory
}

// NewLocationService builds the service.
// Both things it needs are passed in from outside.
func NewLocationService(
	anchorRepo *repository.AnchorRepository,
	boundaries []model.DistrictBoundary,
) *LocationService {
	return &LocationService{
		anchorRepo: anchorRepo,
		boundaries: boundaries,
	}
}

// Haversine returns the distance in METRES between two points on Earth.
// This is a plain function. It needs nothing else, so it is easy to test.
func Haversine(lat1, lng1, lat2, lng2 float64) float64 {

	// STEP 1: change degrees into radians.
	// Computer sin and cos only work with radians.
	// Formula: radians = degrees * pi / 180
	phi1 := lat1 * math.Pi / 180
	phi2 := lat2 * math.Pi / 180

	// STEP 2: find the two differences, also in radians.
	deltaPhi := (lat2 - lat1) * math.Pi / 180    // change in latitude
	deltaLambda := (lng2 - lng1) * math.Pi / 180 // change in longitude

	// STEP 3 and 4 together:
	// hav(x) = sin squared of (x / 2). We apply it to both differences.
	//
	// The cos(phi1) * cos(phi2) part is the IMPORTANT correction.
	// It shrinks the longitude part as you move away from the equator,
	// because longitude lines get closer together near the poles.
	a := math.Sin(deltaPhi/2)*math.Sin(deltaPhi/2) +
		math.Cos(phi1)*math.Cos(phi2)*
			math.Sin(deltaLambda/2)*math.Sin(deltaLambda/2)

	// STEP 5: turn that value into an angle.
	// This is the angle between the two points, seen from the Earth's centre.
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	// STEP 6: angle multiplied by radius gives distance along the surface.
	return earthRadiusMeters * c
}

// FindOrCreateAnchor decides: is this the same field, or a new field?
// It returns the id of the anchor to use.
func (s *LocationService) FindOrCreateAnchor(lat, lng float64) (int, error) {

	// 1. Get every anchor we already have.
	anchors, err := s.anchorRepo.FindAll()
	if err != nil {
		return 0, err
	}

	// 2. Look for the closest one.
	bestID := 0
	bestDistance := math.MaxFloat64 // start with the biggest possible number

	for _, a := range anchors {
		distance := Haversine(lat, lng, a.CenterLat, a.CenterLng)

		// Is this one closer than the best so far?
		if distance < bestDistance {
			bestDistance = distance
			bestID = a.AnchorID
		}
	}

	// 3. Is the closest one near enough?
	// bestID != 0 means we actually found an anchor.
	if bestID != 0 && bestDistance <= anchorRadiusMeters {
		// Yes. Same field. Use the old anchor.
		return bestID, nil
	}

	// 4. No anchor was near enough (or there were none at all).
	// This is a new field. Make a new anchor.
	return s.anchorRepo.Insert(lat, lng)
}

// pointInPolygon tests if a point is inside a shape, using ray casting.
// Small first letter = private. Only this package can use it.
func pointInPolygon(lat, lng float64, ring []model.Point) bool {

	// We start by assuming the point is OUTSIDE.
	// Every crossing will flip this value.
	inside := false

	// j starts at the LAST point.
	// This way, the first edge we check is (last point -> first point),
	// which closes the shape. Then j follows behind i.
	j := len(ring) - 1

	for i := 0; i < len(ring); i++ {

		// QUESTION 1: does this edge cross the height of our point?
		// True only when one corner is ABOVE our point
		// and the other corner is BELOW it.
		// The != here means "one is true, one is false".
		crossesLine := (ring[i].Lat > lat) != (ring[j].Lat > lat)

		if crossesLine {
			// QUESTION 2: is the crossing on our RIGHT side?
			// First, work out the exact longitude where the edge
			// crosses our height. This is straight-line interpolation.
			crossLng := (ring[j].Lng-ring[i].Lng)*(lat-ring[i].Lat)/
				(ring[j].Lat-ring[i].Lat) + ring[i].Lng

			// Our torch only shines to the right.
			// So count this crossing only if it is to our right.
			if lng < crossLng {
				inside = !inside // flip: outside <-> inside
			}
		}

		// Move j forward, so it always follows one step behind i.
		j = i
	}

	// Odd number of flips = inside. Even = outside.
	return inside
}

// FindDistrictID finds which district contains the point.
// It returns nothing (nil) if the point is outside every district.
func (s *LocationService) FindDistrictID(lat, lng float64) *int {

	// Check each district shape until one matches.
	for _, boundary := range s.boundaries {
		if pointInPolygon(lat, lng, boundary.Ring) {
			// Found it. Return a pointer to the id.
			id := boundary.DistrictID
			return &id
		}
	}

	// Checked them all. The point is outside every district.
	// For example, a point in the sea.
	return nil
}
