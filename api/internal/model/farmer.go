package model

import "time"

// ---------- THE FARMER AS STORED ----------

// Farmer is one account.
type Farmer struct {
	FarmerID   int       `json:"farmer_id"`
	NIC        string    `json:"nic"`
	FullName   string    `json:"full_name"`
	GNDivision string    `json:"gn_division"`
	Mobile     string    `json:"mobile"`
	Email      string    `json:"email"`
	CreatedAt  time.Time `json:"created_at"`

	// json:"-" means NEVER put this field in a JSON reply.
	//
	// This one tag is the only thing standing between us and leaking
	// every password hash in the database out through the API. We do it
	// here, on the type itself, so it is impossible to forget later in
	// some new endpoint.
	PasswordHash string `json:"-"`
}

// ---------- WHAT THE APP SENDS US ----------

// SignupRequest is a new farmer filling in the form.
type SignupRequest struct {
	NIC        string `json:"nic"`
	FullName   string `json:"full_name"`
	GNDivision string `json:"gn_division"`
	Mobile     string `json:"mobile"`
	Email      string `json:"email"`
	Password   string `json:"password"`
}

// LoginRequest is an existing farmer coming back.
type LoginRequest struct {
	NIC      string `json:"nic"`
	Password string `json:"password"`
}

// ---------- WHAT WE SEND BACK ----------

// AuthResponse is the answer to both signup and login.
//
// It carries the farmer WITHOUT the password hash, because of the
// json:"-" tag above.
type AuthResponse struct {
	Farmer Farmer `json:"farmer"`
}
