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

// SubsidyController serves the fertilizer subsidy: announcing rounds,
// applying, approving, sending money, and the farmer's own confirmation
// or dispute.
type SubsidyController struct {
	service *service.SubsidyService
}

// NewSubsidyController builds the controller.
func NewSubsidyController(
	service *service.SubsidyService,
) *SubsidyController {
	return &SubsidyController{service: service}
}

// writeSubsidyError maps a service error to a status code.
func writeSubsidyError(w http.ResponseWriter, err error) {

	var ve service.ValidationError
	if errors.As(err, &ve) {
		writeJSONError(w, http.StatusBadRequest, ve.Message)
		return
	}

	// Not found, somebody else's, or already moved on by another person.
	// 404 for all three: the API must not confirm that an application
	// exists where the caller may not look.
	if errors.Is(err, repository.ErrApplicationNotFound) {
		writeJSONError(w, http.StatusNotFound,
			"That application was not found, or somebody else has already "+
				"acted on it. Reload and try again.")
		return
	}

	if errors.Is(err, repository.ErrRoundNotFound) {
		writeJSONError(w, http.StatusNotFound,
			"That subsidy round was not found.")
		return
	}

	writeJSONError(w, http.StatusInternalServerError,
		"Something went wrong. Please try again.")
}

// ---------- ROUNDS ----------

// DeclareRound handles POST /officer/subsidy-rounds
func (c *SubsidyController) DeclareRound(
	w http.ResponseWriter, r *http.Request,
) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	var req model.DeclareRoundRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	round, err := c.service.DeclareRound(account, req)
	if err != nil {
		writeSubsidyError(w, err)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(round)
}

// ListRounds handles GET /officer/subsidy-rounds
func (c *SubsidyController) ListRounds(
	w http.ResponseWriter, r *http.Request,
) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	rounds, err := c.service.Rounds(account)
	if err != nil {
		writeSubsidyError(w, err)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{"rounds": rounds})
}

// CloseRound handles POST /officer/subsidy-rounds/{roundId}/close
func (c *SubsidyController) CloseRound(
	w http.ResponseWriter, r *http.Request,
) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	roundID, ok := intParam(r, "roundId")
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid round id")
		return
	}

	if err := c.service.CloseRound(account, roundID); err != nil {
		writeSubsidyError(w, err)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"status": "closed"})
}

// FarmerRounds handles GET /farmers/{farmerId}/subsidy-rounds
func (c *SubsidyController) FarmerRounds(
	w http.ResponseWriter, r *http.Request,
) {
	w.Header().Set("Content-Type", "application/json")

	farmerID, ok := intParam(r, "farmerId")
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid farmer id")
		return
	}

	rounds, err := c.service.OpenRoundsForFarmer(farmerID)
	if err != nil {
		writeSubsidyError(w, err)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{"rounds": rounds})
}

// ---------- APPLICATIONS ----------

// Apply handles POST /subsidies
func (c *SubsidyController) Apply(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req model.ApplyForSubsidyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	application, err := c.service.Apply(req)
	if err != nil {
		writeSubsidyError(w, err)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(application)
}

// FarmerApplications handles GET /farmers/{farmerId}/subsidies
func (c *SubsidyController) FarmerApplications(
	w http.ResponseWriter, r *http.Request,
) {
	w.Header().Set("Content-Type", "application/json")

	farmerID, ok := intParam(r, "farmerId")
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid farmer id")
		return
	}

	applications, err := c.service.FarmerApplications(farmerID)
	if err != nil {
		writeSubsidyError(w, err)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{"applications": applications})
}

// OfficerApplications handles GET /officer/subsidies?status=&round=
func (c *SubsidyController) OfficerApplications(
	w http.ResponseWriter, r *http.Request,
) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	roundID, _ := strconv.Atoi(r.URL.Query().Get("round"))

	applications, err := c.service.OfficerApplications(
		account, r.URL.Query().Get("status"), roundID,
	)
	if err != nil {
		writeSubsidyError(w, err)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{"applications": applications})
}

// OfficerDetail handles GET /officer/subsidies/{applicationId}
func (c *SubsidyController) OfficerDetail(
	w http.ResponseWriter, r *http.Request,
) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	applicationID, ok := intParam(r, "applicationId")
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid application id")
		return
	}

	detail, err := c.service.OfficerDetail(account, applicationID)
	if err != nil {
		writeSubsidyError(w, err)
		return
	}

	json.NewEncoder(w).Encode(detail)
}

// officerStep runs one officer move and sends back the updated application.
//
// Approve, send, reject and resolve differ only in which service method they
// call, so the plumbing around them is written once.
func (c *SubsidyController) officerStep(
	w http.ResponseWriter,
	r *http.Request,
	run func(model.Farmer, int, model.SubsidyDecisionRequest) error,
) {
	w.Header().Set("Content-Type", "application/json")

	account, _ := AccountFrom(r)

	applicationID, ok := intParam(r, "applicationId")
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid application id")
		return
	}

	var req model.SubsidyDecisionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	if err := run(account, applicationID, req); err != nil {
		writeSubsidyError(w, err)
		return
	}

	// Send it back as it now stands, so the screen can redraw without a
	// second request.
	detail, err := c.service.OfficerDetail(account, applicationID)
	if err != nil {
		writeSubsidyError(w, err)
		return
	}

	json.NewEncoder(w).Encode(detail)
}

// Approve handles POST /officer/subsidies/{applicationId}/approve
func (c *SubsidyController) Approve(w http.ResponseWriter, r *http.Request) {
	c.officerStep(w, r, c.service.Approve)
}

// Send handles POST /officer/subsidies/{applicationId}/send
func (c *SubsidyController) Send(w http.ResponseWriter, r *http.Request) {
	c.officerStep(w, r, c.service.Send)
}

// Reject handles POST /officer/subsidies/{applicationId}/reject
func (c *SubsidyController) Reject(w http.ResponseWriter, r *http.Request) {
	c.officerStep(w, r, c.service.Reject)
}

// Resolve handles POST /officer/subsidies/{applicationId}/resolve
func (c *SubsidyController) Resolve(w http.ResponseWriter, r *http.Request) {
	c.officerStep(w, r, c.service.Resolve)
}

// ---------- THE FARMER'S OWN STEPS ----------

// farmerStep runs one of the two moves a farmer may make.
func (c *SubsidyController) farmerStep(
	w http.ResponseWriter,
	r *http.Request,
	run func(model.FarmerActionRequest, int) error,
) {
	w.Header().Set("Content-Type", "application/json")

	applicationID, ok := intParam(r, "applicationId")
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid application id")
		return
	}

	var req model.FarmerActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	if err := run(req, applicationID); err != nil {
		writeSubsidyError(w, err)
		return
	}

	detail, err := c.service.FarmerDetail(req.FarmerID, applicationID)
	if err != nil {
		writeSubsidyError(w, err)
		return
	}

	json.NewEncoder(w).Encode(detail)
}

// ConfirmReceived handles POST /subsidies/{applicationId}/received
func (c *SubsidyController) ConfirmReceived(
	w http.ResponseWriter, r *http.Request,
) {
	c.farmerStep(w, r, c.service.ConfirmReceived)
}

// Dispute handles POST /subsidies/{applicationId}/dispute
//
// The farmer saying the money never arrived. This is the route that makes
// the whole feature worth having.
func (c *SubsidyController) Dispute(w http.ResponseWriter, r *http.Request) {
	c.farmerStep(w, r, c.service.Dispute)
}
