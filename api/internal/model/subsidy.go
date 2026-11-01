package model

import "time"

// ---------- APPLICATION STATUSES ----------
//
// Constants, not loose text. A mistyped "RECIEVED" becomes a compiler error
// instead of an application that silently never matches anything and sits in
// a queue nobody is looking at.
const (
	SubsidySubmitted = "SUBMITTED"
	SubsidyApproved  = "APPROVED"
	SubsidySent      = "SENT"
	SubsidyReceived  = "RECEIVED"
	SubsidyDisputed  = "DISPUTED"
	SubsidyResolved  = "RESOLVED"
	SubsidyRejected  = "REJECTED"
)

// The two cultivation seasons.
const (
	SeasonMaha = "MAHA"
	SeasonYala = "YALA"
)

// Seasons returns them in the order a dropdown should show them.
func Seasons() []string {
	return []string{SeasonMaha, SeasonYala}
}

// ---------- THE ROUND ----------

// SubsidyRate is the money for one crop, in rupees per hectare.
type SubsidyRate struct {
	Crop           string  `json:"crop"`
	RatePerHectare float64 `json:"rate_per_hectare"`
}

// SubsidyRound is one announced subsidy scheme.
type SubsidyRound struct {
	RoundID int    `json:"round_id"`
	Name    string `json:"name"`
	Season  string `json:"season"`

	// Dates as plain strings in YYYY-MM-DD form.
	//
	// These are DAYS, not instants: a round opens on a date everywhere in
	// the country, not at a particular hour in a particular timezone.
	OpensOn  string `json:"opens_on"`
	ClosesOn string `json:"closes_on"`

	Description string `json:"description"`
	Status      string `json:"status"`

	DeclaredBy   int       `json:"declared_by"`
	DeclaredName string    `json:"declared_by_name"`
	DeclaredAt   time.Time `json:"declared_at"`

	// Which divisions may apply. A farmer outside all of them cannot.
	Divisions []string `json:"divisions"`

	// What each crop is worth per hectare under this round.
	Rates []SubsidyRate `json:"rates"`

	// Totals for the department's overview. Zero elsewhere.
	ApplicationCount int     `json:"application_count"`
	TotalApproved    float64 `json:"total_approved"`

	// How many farmers say the money never arrived. The one number on this
	// screen that should make somebody act.
	DisputedCount int `json:"disputed_count"`
}

// ---------- THE APPLICATION ----------

// SubsidyApplication is one farmer asking for the fertilizer subsidy.
type SubsidyApplication struct {
	ApplicationID int `json:"application_id"`

	RoundID   int    `json:"round_id"`
	RoundName string `json:"round_name"`
	Season    string `json:"season"`

	FarmerID    int    `json:"farmer_id"`
	FarmerName  string `json:"farmer_name"`
	GNDivision  string `json:"gn_division"`
	FarmerPhone string `json:"farmer_phone"`

	LandID     int    `json:"land_id"`
	LandName   string `json:"land_name"`
	LandCropID int    `json:"land_crop_id"`
	Crop       string `json:"crop"`

	// The registered area at the moment of applying.
	AreaHa float64 `json:"area_ha"`

	// Worked out at approval from area x rate. NULL until then.
	AmountLKR *float64 `json:"amount_lkr"`

	// The rate used, so the arithmetic can be checked on screen.
	RatePerHectare *float64 `json:"rate_per_hectare"`

	FarmerNote string `json:"farmer_note"`
	Status     string `json:"status"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// SubsidyEvent is one step in an application's journey.
type SubsidyEvent struct {
	SubsidyEventID int       `json:"subsidy_event_id"`
	ApplicationID  int       `json:"application_id"`
	ActorID        int       `json:"actor_id"`
	ActorName      string    `json:"actor_name"`
	ActorRole      string    `json:"actor_role"`
	FromStatus     string    `json:"from_status"`
	ToStatus       string    `json:"to_status"`
	Note           string    `json:"note"`
	CreatedAt      time.Time `json:"created_at"`
}

// SubsidyDetail is one application with everything that has happened to it.
type SubsidyDetail struct {
	Application SubsidyApplication `json:"application"`
	History     []SubsidyEvent     `json:"history"`
}

// ---------- WHAT CALLERS SEND ----------

// DeclareRoundRequest is the department announcing a subsidy round.
type DeclareRoundRequest struct {
	Name        string        `json:"name"`
	Season      string        `json:"season"`
	OpensOn     string        `json:"opens_on"`
	ClosesOn    string        `json:"closes_on"`
	Description string        `json:"description"`
	Divisions   []string      `json:"divisions"`
	Rates       []SubsidyRate `json:"rates"`
}

// ApplyForSubsidyRequest is a farmer applying.
type ApplyForSubsidyRequest struct {
	// HONEST LIMITATION, the same as everywhere else so far: the app sends
	// the farmer id rather than it being read from the login token. The
	// server still checks the crop belongs to this farmer, so nobody can
	// apply against somebody else's field - but the caller is naming
	// themselves. Reading the id from the token is the proper fix.
	FarmerID int `json:"farmer_id"`

	RoundID    int    `json:"round_id"`
	LandCropID int    `json:"land_crop_id"`
	FarmerNote string `json:"farmer_note"`
}

// SubsidyDecisionRequest covers approving, rejecting, sending and resolving.
type SubsidyDecisionRequest struct {
	Note string `json:"note"`
}

// FarmerActionRequest is the farmer confirming receipt or raising a dispute.
//
// Carries the farmer id for the same reason as above: the server has to know
// whose application this is before letting anybody move it.
type FarmerActionRequest struct {
	FarmerID int    `json:"farmer_id"`
	Note     string `json:"note"`
}
