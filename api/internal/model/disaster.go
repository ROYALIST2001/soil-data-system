package model

import "time"

// ---------- CLAIM STATUSES ----------
//
// Constants, not loose text. A mistyped "VERFIED" becomes a compiler error
// instead of a claim that silently never matches anything and sits in a
// queue nobody is looking at.
const (
	ClaimSubmitted = "SUBMITTED"
	ClaimVerified  = "VERIFIED"
	ClaimApproved  = "APPROVED"
	ClaimPaid      = "PAID"
	ClaimRejected  = "REJECTED"
)

// Disaster types the system knows.
const (
	DisasterFlood     = "FLOOD"
	DisasterDrought   = "DROUGHT"
	DisasterLandslide = "LANDSLIDE"
	DisasterCyclone   = "CYCLONE"
	DisasterPest      = "PEST"
	DisasterOther     = "OTHER"
)

// DisasterTypes is the full list, in the order a dropdown should show them.
func DisasterTypes() []string {
	return []string{
		DisasterFlood, DisasterDrought, DisasterLandslide,
		DisasterCyclone, DisasterPest, DisasterOther,
	}
}

// ---------- THE DISASTER ----------

// EventRate is the compensation for one crop, in rupees per hectare.
type EventRate struct {
	Crop           string  `json:"crop"`
	RatePerHectare float64 `json:"rate_per_hectare"`
}

// DisasterEvent is one declared disaster.
type DisasterEvent struct {
	EventID      int    `json:"event_id"`
	Name         string `json:"name"`
	DisasterType string `json:"disaster_type"`

	// Dates as plain strings in YYYY-MM-DD form.
	//
	// WHY NOT time.Time? Because these are DAYS, not instants. A flood
	// started on the 10th of October everywhere in the district; it did not
	// start at 00:00 in one timezone and 05:30 in another. Carrying a time
	// and a zone on a date invites exactly that confusion.
	StartedOn string `json:"started_on"`
	EndedOn   string `json:"ended_on"`

	Description string `json:"description"`
	Status      string `json:"status"`

	DeclaredBy   int       `json:"declared_by"`
	DeclaredName string    `json:"declared_by_name"`
	DeclaredAt   time.Time `json:"declared_at"`

	// The divisions this disaster affected. A farmer outside all of them
	// cannot claim.
	Divisions []string `json:"divisions"`

	// What each crop is worth per hectare under this scheme.
	Rates []EventRate `json:"rates"`

	// Totals, filled in for the department's overview. Zero elsewhere.
	ClaimCount  int     `json:"claim_count"`
	TotalAmount float64 `json:"total_amount"`
}

// ---------- THE CLAIM ----------

// Claim is one farmer asking for compensation.
type Claim struct {
	ClaimID int `json:"claim_id"`

	EventID   int    `json:"event_id"`
	EventName string `json:"event_name"`

	FarmerID   int    `json:"farmer_id"`
	FarmerName string `json:"farmer_name"`
	GNDivision string `json:"gn_division"`
	FarmerPhone string `json:"farmer_phone"`

	LandID     int    `json:"land_id"`
	LandName   string `json:"land_name"`
	LandCropID int    `json:"land_crop_id"`
	Crop       string `json:"crop"`

	// How much of that crop the farmer has registered in total. Shown beside
	// the claim so an officer can see at a glance whether somebody is asking
	// for more than they grow.
	RegisteredAreaHa float64 `json:"registered_area_ha"`

	ClaimedAreaHa float64 `json:"claimed_area_ha"`

	// Filled by the GN officer. Both numbers are kept, so what was asked
	// for and what was agreed are always both visible.
	VerifiedAreaHa *float64 `json:"verified_area_ha"`

	// Worked out at approval from verified area x the crop's rate.
	AmountLKR *float64 `json:"amount_lkr"`

	// What the rate was, so the arithmetic can be checked on screen.
	RatePerHectare *float64 `json:"rate_per_hectare"`

	FarmerNote string `json:"farmer_note"`
	Status     string `json:"status"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ClaimEvent is one step in a claim's journey.
type ClaimEvent struct {
	ClaimEventID int       `json:"claim_event_id"`
	ClaimID      int       `json:"claim_id"`
	ActorID      int       `json:"actor_id"`
	ActorName    string    `json:"actor_name"`
	ActorRole    string    `json:"actor_role"`
	FromStatus   string    `json:"from_status"`
	ToStatus     string    `json:"to_status"`
	Note         string    `json:"note"`
	CreatedAt    time.Time `json:"created_at"`
}

// ClaimDetail is one claim with everything that has happened to it.
type ClaimDetail struct {
	Claim   Claim        `json:"claim"`
	History []ClaimEvent `json:"history"`
}

// ---------- WHAT CALLERS SEND ----------

// DeclareEventRequest is the department announcing a disaster.
type DeclareEventRequest struct {
	Name         string      `json:"name"`
	DisasterType string      `json:"disaster_type"`
	StartedOn    string      `json:"started_on"`
	EndedOn      string      `json:"ended_on"`
	Description  string      `json:"description"`
	Divisions    []string    `json:"divisions"`
	Rates        []EventRate `json:"rates"`
}

// SubmitClaimRequest is a farmer asking for compensation.
type SubmitClaimRequest struct {
	// HONEST LIMITATION, same as the land endpoints: the app sends the
	// farmer id rather than it being read from the login token. The server
	// still checks the land belongs to this farmer, so a claim cannot be
	// filed against somebody else's field - but the caller is naming
	// themselves. Reading the id from the token is the proper fix.
	FarmerID int `json:"farmer_id"`

	EventID       int     `json:"event_id"`
	LandCropID    int     `json:"land_crop_id"`
	ClaimedAreaHa float64 `json:"claimed_area_ha"`
	FarmerNote    string  `json:"farmer_note"`
}

// VerifyClaimRequest is the GN officer confirming what was actually lost.
type VerifyClaimRequest struct {
	// What the officer found. May be less than the farmer asked for, and
	// may be zero if nothing was actually lost - though in that case
	// rejecting is usually the honest answer.
	VerifiedAreaHa float64 `json:"verified_area_ha"`
	Note           string  `json:"note"`
}

// DecisionRequest covers rejecting, approving and marking paid.
type DecisionRequest struct {
	Note string `json:"note"`
}
