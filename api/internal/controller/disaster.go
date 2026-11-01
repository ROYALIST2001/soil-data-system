package controller

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
	"soil-data-system/api/internal/service"
)

// DisasterController serves the relief scheme: declaring disasters, filing
// claims, and moving them through verification, approval and payment.
type DisasterController struct {
	service *service.DisasterService
}

// NewDisasterController builds the controller.
func NewDisasterController(
	service *service.DisasterService,
) *DisasterController {
	return &DisasterController{service: service}
}

// writeDisasterError maps a service error to a status code.
func writeDisasterError(w http.ResponseWriter, err error) {

	var ve service.ValidationError
	if errors.As(err, &ve) {
		writeJSONError(w, http.StatusBadRequest, ve.Message)
		return
	}

	// Not found, already moved on by somebody else, or outside this
	// officer's division. 404 for all three: the API must not confirm that
	// a claim exists somewhere the caller may not look.
	if errors.Is(err, repository.ErrClaimNotFound) {
		writeJSONError(w, http.StatusNotFound,
			"That claim was not found, or somebody else has already acted "+
				"on it. Reload and try again.")
		return
	}

	if errors.Is(err, repository.ErrEventNotFound) {
		writeJSONError(w, http.StatusNotFound, "That disaster was not found.")
		return
	}

	writeJSONError(w, http.StatusInternalServerError,
		"Something went wrong. Please try again.")
}

func intParam(r *http.Request, name string) (int, bool) {
	v, err := strconv.Atoi(r.PathValue(name))
	if err != nil || v <= 0 {
		return 0, false
	}
	return v, true
}

// ---------- DISASTER EVENTS ----------

// DeclareEvent handles POST /officer/disasters
func (c *DisasterController) DeclareEvent(
	w http.ResponseWriter, r *http.Request,
) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	var req model.DeclareEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	event, err := c.service.DeclareEvent(account, req)
	if err != nil {
		writeDisasterError(w, err)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(event)
}

// ListEvents handles GET /officer/disasters
func (c *DisasterController) ListEvents(
	w http.ResponseWriter, r *http.Request,
) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	events, err := c.service.Events(account)
	if err != nil {
		writeDisasterError(w, err)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{"disasters": events})
}

// CloseEvent handles POST /officer/disasters/{eventId}/close
func (c *DisasterController) CloseEvent(
	w http.ResponseWriter, r *http.Request,
) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	eventID, ok := intParam(r, "eventId")
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid disaster id")
		return
	}

	if err := c.service.CloseEvent(account, eventID); err != nil {
		writeDisasterError(w, err)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"status": "closed"})
}

// FarmerEvents handles GET /farmers/{farmerId}/disasters
//
// The farmer's phone calls this to find out whether there is anything they
// can claim against. Only OPEN disasters covering their own division.
func (c *DisasterController) FarmerEvents(
	w http.ResponseWriter, r *http.Request,
) {
	w.Header().Set("Content-Type", "application/json")

	farmerID, ok := intParam(r, "farmerId")
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid farmer id")
		return
	}

	events, err := c.service.OpenEventsForFarmer(farmerID)
	if err != nil {
		writeDisasterError(w, err)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{"disasters": events})
}

// ---------- CLAIMS ----------

// SubmitClaim handles POST /claims
func (c *DisasterController) SubmitClaim(
	w http.ResponseWriter, r *http.Request,
) {
	w.Header().Set("Content-Type", "application/json")

	var req model.SubmitClaimRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	claim, err := c.service.SubmitClaim(req)
	if err != nil {
		writeDisasterError(w, err)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(claim)
}

// FarmerClaims handles GET /farmers/{farmerId}/claims
func (c *DisasterController) FarmerClaims(
	w http.ResponseWriter, r *http.Request,
) {
	w.Header().Set("Content-Type", "application/json")

	farmerID, ok := intParam(r, "farmerId")
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid farmer id")
		return
	}

	claims, err := c.service.FarmerClaims(farmerID)
	if err != nil {
		writeDisasterError(w, err)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{"claims": claims})
}

// OfficerClaims handles GET /officer/claims?status=&event=
func (c *DisasterController) OfficerClaims(
	w http.ResponseWriter, r *http.Request,
) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	// event= is optional; 0 means every event.
	eventID, _ := strconv.Atoi(r.URL.Query().Get("event"))

	claims, err := c.service.OfficerClaims(
		account, r.URL.Query().Get("status"), eventID,
	)
	if err != nil {
		writeDisasterError(w, err)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{"claims": claims})
}

// ClaimDetail handles GET /officer/claims/{claimId}
func (c *DisasterController) ClaimDetail(
	w http.ResponseWriter, r *http.Request,
) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	claimID, ok := intParam(r, "claimId")
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid claim id")
		return
	}

	detail, err := c.service.ClaimDetail(account, claimID)
	if err != nil {
		writeDisasterError(w, err)
		return
	}

	json.NewEncoder(w).Encode(detail)
}

// step runs one move of the claim through its journey.
//
// Verify, approve, reject and mark-paid differ only in which service method
// they call, so the plumbing around them is written once. Four near-identical
// handlers would be four places for one to drift.
func (c *DisasterController) step(
	w http.ResponseWriter,
	r *http.Request,
	run func(model.Farmer, int) error,
) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	claimID, ok := intParam(r, "claimId")
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid claim id")
		return
	}

	if err := run(account, claimID); err != nil {
		writeDisasterError(w, err)
		return
	}

	// Send the claim back as it now stands, so the screen can redraw without
	// a second request.
	detail, err := c.service.ClaimDetail(account, claimID)
	if err != nil {
		writeDisasterError(w, err)
		return
	}

	json.NewEncoder(w).Encode(detail)
}

// Verify handles POST /officer/claims/{claimId}/verify
func (c *DisasterController) Verify(w http.ResponseWriter, r *http.Request) {
	var req model.VerifyClaimRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	c.step(w, r, func(a model.Farmer, id int) error {
		return c.service.Verify(a, id, req)
	})
}

// Approve handles POST /officer/claims/{claimId}/approve
func (c *DisasterController) Approve(w http.ResponseWriter, r *http.Request) {
	var req model.DecisionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	c.step(w, r, func(a model.Farmer, id int) error {
		return c.service.Approve(a, id, req)
	})
}

// Reject handles POST /officer/claims/{claimId}/reject
func (c *DisasterController) Reject(w http.ResponseWriter, r *http.Request) {
	var req model.DecisionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	c.step(w, r, func(a model.Farmer, id int) error {
		return c.service.Reject(a, id, req)
	})
}

// MarkPaid handles POST /officer/claims/{claimId}/pay
func (c *DisasterController) MarkPaid(w http.ResponseWriter, r *http.Request) {
	var req model.DecisionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	c.step(w, r, func(a model.Farmer, id int) error {
		return c.service.MarkPaid(a, id, req)
	})
}
