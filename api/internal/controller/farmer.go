package controller

import (
	"encoding/json"
	"errors"
	"net/http"

	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/service"
)

// FarmerController holds the service.
type FarmerController struct {
	service *service.FarmerService
}

// NewFarmerController builds the controller.
func NewFarmerController(service *service.FarmerService) *FarmerController {
	return &FarmerController{service: service}
}

// writeAuthError turns one of the service's errors into the right status code.
//
// Both endpoints need the same mapping, so it lives in one place. If the
// rules ever change, there is exactly one function to edit.
func writeAuthError(w http.ResponseWriter, err error) {

	// A broken rule is the CALLER's fault. 400, with the real message,
	// because the farmer needs to know which field to fix.
	//
	// errors.As() asks "is this error a ValidationError?" without caring
	// about the wording. That is why the service uses a type here.
	var ve service.ValidationError
	if errors.As(err, &ve) {
		w.WriteHeader(http.StatusBadRequest) // 400
		json.NewEncoder(w).Encode(map[string]string{"error": ve.Message})
		return
	}

	// That NIC already has an account. 409 Conflict: the request was
	// well formed, it just clashes with what already exists.
	if errors.Is(err, service.ErrNICTaken) {
		w.WriteHeader(http.StatusConflict) // 409
		json.NewEncoder(w).Encode(map[string]string{
			"error": "An account with this NIC already exists. Please log in instead.",
		})
		return
	}

	// Wrong NIC or wrong password. 401 Unauthorized.
	if errors.Is(err, service.ErrInvalidCredentials) {
		w.WriteHeader(http.StatusUnauthorized) // 401
		json.NewEncoder(w).Encode(map[string]string{
			"error": "NIC or password is incorrect.",
		})
		return
	}

	// Anything else is OUR fault: the database is down, bcrypt failed.
	//
	// We send a plain message and NOT err.Error(), because a database error
	// can reveal table and column names that help an attacker. Same reason
	// as in reading.go.
	w.WriteHeader(http.StatusInternalServerError) // 500
	json.NewEncoder(w).Encode(map[string]string{
		"error": "Something went wrong. Please try again.",
	})
}

// Signup handles POST /signup
func (c *FarmerController) Signup(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req model.SignupRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest) // 400
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON"})
		return
	}

	farmer, err := c.service.Signup(req)
	if err != nil {
		writeAuthError(w, err)
		return
	}

	// 201 Created, because a new thing now exists that did not before.
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(model.AuthResponse{Farmer: farmer})
}

// Login handles POST /login
func (c *FarmerController) Login(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req model.LoginRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest) // 400
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON"})
		return
	}

	farmer, err := c.service.Login(req)
	if err != nil {
		writeAuthError(w, err)
		return
	}

	// 200 OK, not 201. Logging in does not create anything.
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(model.AuthResponse{Farmer: farmer})
}
