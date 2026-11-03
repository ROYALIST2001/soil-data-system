package service

import (
	"fmt"
	"strings"

	"soil-data-system/api/internal/locationcatalog"
	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

// The limits for one land.
//
// maxLandSizeHa is generous on purpose: large estates exist. It is here to
// catch a farmer typing 200 when they meant 2.00, not to judge how much
// land somebody may own.
const (
	minLandSizeHa = 0.0001
	maxLandSizeHa = 1000.0
)

// Floating point numbers are not exact. 0.3 + 0.4 + 0.3 can come out as
// 1.0000000000000002, which is bigger than 1.0. Comparing with a tiny
// tolerance stops us rejecting a land whose crops add up correctly.
//
// This is the same reason money is never stored as a float.
const areaTolerance = 0.000001

// LandService creates and manages a farmer's lands and crops.
type LandService struct {
	landRepo   *repository.LandRepository
	farmerRepo *repository.FarmerRepository
}

// NewLandService builds the service.
func NewLandService(
	landRepo *repository.LandRepository,
	farmerRepo *repository.FarmerRepository,
) *LandService {
	return &LandService{landRepo: landRepo, farmerRepo: farmerRepo}
}

// ---------- CREATE ----------

// CreateLand registers one land with its crops.
func (s *LandService) CreateLand(
	req model.CreateLandRequest,
) (model.Land, error) {

	name := strings.TrimSpace(req.Name)
	gnDivision := strings.TrimSpace(req.GNDivision)
	if official, ok := locationcatalog.Resolve(gnDivision); ok {
		gnDivision = official.Value
	}

	// ---------- Does this farmer exist? ----------
	//
	// The database would refuse the insert anyway, because of the foreign
	// key. We check first so the answer is a clear sentence instead of a
	// raw constraint violation.
	if req.FarmerID <= 0 {
		return model.Land{}, ValidationError{
			Message: "No farmer was given for this land.",
		}
	}

	if _, err := s.farmerRepo.FindByID(req.FarmerID); err != nil {
		if err == repository.ErrFarmerNotFound {
			return model.Land{}, ValidationError{
				Message: "That farmer account does not exist.",
			}
		}
		return model.Land{}, err
	}

	// ---------- The land's own fields ----------
	if err := validateLandName(name); err != nil {
		return model.Land{}, err
	}
	if err := validateGNDivision(gnDivision); err != nil {
		return model.Land{}, err
	}
	if err := validateLandSize(req.SizeHa); err != nil {
		return model.Land{}, err
	}

	// ---------- The crops ----------
	//
	// At least one. A land with nothing growing on it gives the fertilizer
	// system nothing to advise on, and it is almost always a half-finished
	// form rather than a real situation.
	if len(req.Crops) == 0 {
		return model.Land{}, ValidationError{
			Message: "Please add at least one crop to this land.",
		}
	}

	cleaned, err := s.cleanCrops(req.Crops, req.SizeHa)
	if err != nil {
		return model.Land{}, err
	}

	return s.landRepo.InsertLandWithCrops(
		req.FarmerID, name, gnDivision, req.SizeHa, cleaned,
	)
}

// cleanCrops checks every crop, and checks they FIT on the land.
func (s *LandService) cleanCrops(
	crops []model.NewLandCrop, landSizeHa float64,
) ([]model.NewLandCrop, error) {

	cleaned := make([]model.NewLandCrop, 0, len(crops))

	// Remember which crops we have already seen in THIS request.
	//
	// The database's UNIQUE (land_id, crop) would catch a duplicate too, but
	// only as an unfriendly constraint error after we had already started
	// writing. Catching it here gives the farmer a sentence they can act on.
	seen := make(map[string]bool)

	var total float64

	for _, c := range crops {
		crop := strings.ToLower(strings.TrimSpace(c.Crop))

		// The crop must be one the trained model knows. model.AllowedCrops
		// is the single list, shared with the soil reading checks in
		// validation.go - there is no second copy to fall out of step.
		if crop == "" {
			return nil, ValidationError{Message: "Please choose a crop."}
		}

		if _, found := model.AllowedCrops[crop]; !found {
			return nil, ValidationError{
				Message: fmt.Sprintf(
					"Crop '%s' is not supported. Choose one of: %s",
					crop, strings.Join(model.CropNames(), ", ")),
			}
		}

		if seen[crop] {
			return nil, ValidationError{
				Message: fmt.Sprintf(
					"%s is listed twice on this land. "+
						"Add it once with the total size.",
					model.AllowedCrops[crop].Label),
			}
		}
		seen[crop] = true

		if c.SizeHa < minLandSizeHa {
			return nil, ValidationError{
				Message: fmt.Sprintf(
					"The size for %s must be bigger than zero.",
					model.AllowedCrops[crop].Label),
			}
		}

		total += c.SizeHa

		cleaned = append(cleaned, model.NewLandCrop{
			Crop:   crop,
			SizeHa: c.SizeHa,
		})
	}

	// ---------- THE RULE THAT MATTERS ----------
	//
	// The crops cannot cover more ground than the land has. Two hectares of
	// rice inside a one hectare land is not a thing.
	//
	// Catching it HERE matters more than it looks. These sizes will feed the
	// yield forecast later. If they were allowed to exceed the land, a
	// district total would quietly overstate how much food is coming - and
	// nobody would ever see where the error came from.
	if total > landSizeHa+areaTolerance {
		return nil, ValidationError{
			Message: fmt.Sprintf(
				"The crops add up to %.2f hectares, but the land is only "+
					"%.2f hectares. Please check the sizes.",
				total, landSizeHa),
		}
	}

	return cleaned, nil
}

// ---------- READ ----------

// GetLands returns every land this farmer owns, with their crops.
func (s *LandService) GetLands(farmerID int) ([]model.Land, error) {
	if farmerID <= 0 {
		return nil, ValidationError{Message: "No farmer was given."}
	}

	return s.landRepo.FindByFarmer(farmerID)
}

// ---------- ADD ONE CROP ----------

// AddCrop adds one crop to a land the farmer already registered.
func (s *LandService) AddCrop(
	landID int, req model.AddCropRequest,
) (model.LandCrop, error) {

	// Load the land FIRST, scoped to this farmer. If it is not theirs, this
	// fails here and nothing else runs.
	land, err := s.landRepo.FindLandForFarmer(landID, req.FarmerID)
	if err != nil {
		return model.LandCrop{}, err
	}

	crop := strings.ToLower(strings.TrimSpace(req.Crop))

	if crop == "" {
		return model.LandCrop{}, ValidationError{
			Message: "Please choose a crop.",
		}
	}

	if _, found := model.AllowedCrops[crop]; !found {
		return model.LandCrop{}, ValidationError{
			Message: fmt.Sprintf(
				"Crop '%s' is not supported. Choose one of: %s",
				crop, strings.Join(model.CropNames(), ", ")),
		}
	}

	if req.SizeHa < minLandSizeHa {
		return model.LandCrop{}, ValidationError{
			Message: "The crop size must be bigger than zero.",
		}
	}

	// Already growing here?
	exists, err := s.landRepo.CropExistsOnLand(landID, crop)
	if err != nil {
		return model.LandCrop{}, err
	}
	if exists {
		return model.LandCrop{}, ValidationError{
			Message: fmt.Sprintf(
				"%s is already on this land. Remove it first if you want to "+
					"change the size.",
				model.AllowedCrops[crop].Label),
		}
	}

	// Does it still fit?
	used, err := s.landRepo.SumCropSize(landID)
	if err != nil {
		return model.LandCrop{}, err
	}

	if used+req.SizeHa > land.SizeHa+areaTolerance {
		free := land.SizeHa - used
		if free < 0 {
			free = 0
		}

		return model.LandCrop{}, ValidationError{
			Message: fmt.Sprintf(
				"Only %.2f hectares are free on this land, so %.2f will not "+
					"fit.", free, req.SizeHa),
		}
	}

	return s.landRepo.InsertCrop(landID, crop, req.SizeHa)
}

// ---------- REMOVE ----------

// RemoveLand deletes one land and everything growing on it.
func (s *LandService) RemoveLand(landID int, farmerID int) error {
	if farmerID <= 0 {
		return ValidationError{Message: "No farmer was given."}
	}

	return s.landRepo.DeleteLand(landID, farmerID)
}

// RemoveCrop deletes one crop from a land.
func (s *LandService) RemoveCrop(landCropID int, farmerID int) error {
	if farmerID <= 0 {
		return ValidationError{Message: "No farmer was given."}
	}

	// Which land is this crop on? This also proves the farmer owns it.
	landID, err := s.landRepo.FindLandIDForCrop(landCropID, farmerID)
	if err != nil {
		return err
	}

	// ---------- DO NOT EMPTY THE LAND ----------
	//
	// Our own rule says a land must have at least one crop. Removing the
	// last one would break that rule through the back door, and leave a
	// land the farmer cannot use.
	//
	// So we say so plainly, and point at the thing they probably meant:
	// deleting the whole land.
	count, err := s.landRepo.CountCropsOnLand(landID)
	if err != nil {
		return err
	}

	if count <= 1 {
		return ValidationError{
			Message: "This is the only crop on this land. Remove the whole " +
				"land instead, or add another crop first.",
		}
	}

	return s.landRepo.DeleteCrop(landCropID, farmerID)
}

// ---------- FIELD RULES ----------

func validateLandName(name string) error {
	if name == "" {
		return ValidationError{
			Message: "Please give this land a name, like \"Home paddy\".",
		}
	}
	if len([]rune(name)) < 2 {
		return ValidationError{
			Message: "The land name is too short.",
		}
	}
	return nil
}

func validateLandSize(sizeHa float64) error {
	if sizeHa < minLandSizeHa {
		return ValidationError{
			Message: "Please enter the land size in hectares.",
		}
	}
	if sizeHa > maxLandSizeHa {
		return ValidationError{
			Message: fmt.Sprintf(
				"Land size must be %.0f hectares or less (you sent %.2f).",
				maxLandSizeHa, sizeHa),
		}
	}
	return nil
}
