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

// LandController holds the service.
type LandController struct {
	service *service.LandService
}

// NewLandController builds the controller.
func NewLandController(service *service.LandService) *LandController {
	return &LandController{service: service}
}

// writeLandError maps one of the service's errors to a status code.
func writeLandError(w http.ResponseWriter, err error) {

	// A broken rule is the caller's fault. 400, with the real sentence,
	// because the farmer needs to know what to change.
	var ve service.ValidationError
	if errors.As(err, &ve) {
		w.WriteHeader(http.StatusBadRequest) // 400
		json.NewEncoder(w).Encode(map[string]string{"error": ve.Message})
		return
	}

	// No such land, or it is somebody else's. 404 for both, so the API
	// never confirms that a land id exists on another account.
	if errors.Is(err, repository.ErrLandNotFound) {
		w.WriteHeader(http.StatusNotFound) // 404
		json.NewEncoder(w).Encode(map[string]string{
			"error": "That land was not found.",
		})
		return
	}

	// Our fault. No details out, same reasoning as the other controllers.
	w.WriteHeader(http.StatusInternalServerError) // 500
	json.NewEncoder(w).Encode(map[string]string{
		"error": "Something went wrong. Please try again.",
	})
}

// readIntParam pulls a number out of the URL path.
func readIntParam(r *http.Request, name string) (int, bool) {
	value, err := strconv.Atoi(r.PathValue(name))
	if err != nil || value <= 0 {
		return 0, false
	}
	return value, true
}

// CreateLand handles POST /lands
func (c *LandController) CreateLand(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req model.CreateLandRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON"})
		return
	}

	land, err := c.service.CreateLand(req)
	if err != nil {
		writeLandError(w, err)
		return
	}

	// 201 Created: a new thing exists that did not before.
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(land)
}

// GetLands handles GET /farmers/{farmerId}/lands
func (c *LandController) GetLands(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	farmerID, ok := readIntParam(r, "farmerId")
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "invalid farmer id",
		})
		return
	}

	lands, err := c.service.GetLands(farmerID)
	if err != nil {
		writeLandError(w, err)
		return
	}

	// A farmer with no lands gets 200 and an empty list, NOT a 404.
	//
	// "You have no lands yet" is a normal, expected answer - it is exactly
	// what a farmer who just signed up should get. 404 would mean "there is
	// no such thing as this farmer's lands", which is a different claim.
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(model.LandsResponse{Lands: lands})
}

// AddCrop handles POST /lands/{landId}/crops
func (c *LandController) AddCrop(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	landID, ok := readIntParam(r, "landId")
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid land id"})
		return
	}

	var req model.AddCropRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON"})
		return
	}

	crop, err := c.service.AddCrop(landID, req)
	if err != nil {
		writeLandError(w, err)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(crop)
}

// DeleteLand handles DELETE /lands/{landId}?farmer_id=N
//
// WHY THE FARMER ID IS IN THE QUERY STRING.
// A DELETE request has no body by convention, so the owner has to travel in
// the URL. Once login issues a token this disappears entirely, because the
// server will read the farmer id out of the token instead of trusting the
// caller to say who they are.
func (c *LandController) DeleteLand(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	landID, ok := readIntParam(r, "landId")
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid land id"})
		return
	}

	farmerID, err := strconv.Atoi(r.URL.Query().Get("farmer_id"))
	if err != nil || farmerID <= 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "invalid farmer id",
		})
		return
	}

	if err := c.service.RemoveLand(landID, farmerID); err != nil {
		writeLandError(w, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

// DeleteCrop handles DELETE /crops/{cropId}?farmer_id=N
func (c *LandController) DeleteCrop(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	cropID, ok := readIntParam(r, "cropId")
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid crop id"})
		return
	}

	farmerID, err := strconv.Atoi(r.URL.Query().Get("farmer_id"))
	if err != nil || farmerID <= 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "invalid farmer id",
		})
		return
	}

	if err := c.service.RemoveCrop(cropID, farmerID); err != nil {
		writeLandError(w, err)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}
