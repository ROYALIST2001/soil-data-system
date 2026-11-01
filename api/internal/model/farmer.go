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

	// NEW in Phase 10: what this account is allowed to do.
	//
	// FARMER       - their own data only
	// GN_OFFICER   - every farmer in ONE Grama Niladhari division
	// DEPT_OFFICER - every farmer in the country
	Role string `json:"role"`

	// Which division a GN officer covers. NULL for everybody else: a farmer
	// has authority over nobody, a department officer over everybody.
	ScopeDivision *string `json:"scope_division"`

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

	// NEW in Phase 10: proof of who they are, for every later request.
	//
	// The caller sends this back as "Authorization: Bearer <token>" and the
	// server looks it up. This is what replaces the old arrangement where
	// the caller simply announced which farmer they were and was believed.
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
}
