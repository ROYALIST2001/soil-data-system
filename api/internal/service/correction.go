package service

import (
	"fmt"
	"strconv"
	"strings"

	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

// The shortest reason we accept for a correction.
//
// Not a formality. "ok" or "." explains nothing to whoever reads the audit
// trail later, and the whole point of recording a reason is that somebody
// can understand the change without asking the officer who made it.
const minReasonLength = 10

// CorrectionService lets an officer correct a reading, without ever losing
// what the farmer actually sent.
type CorrectionService struct {
	correctionRepo *repository.CorrectionRepository
}

// NewCorrectionService builds the service.
func NewCorrectionService(
	correctionRepo *repository.CorrectionRepository,
) *CorrectionService {
	return &CorrectionService{correctionRepo: correctionRepo}
}

// Detail returns one reading with its original values and its history.
func (s *CorrectionService) Detail(
	account model.Farmer, readingID int,
) (model.ReadingDetail, error) {

	division := scopeDivision(account, "")

	reading, err := s.correctionRepo.FindReadingInDivision(readingID, division)
	if err != nil {
		return model.ReadingDetail{}, err
	}

	raw, err := s.correctionRepo.RawValues(readingID)
	if err != nil {
		return model.ReadingDetail{}, err
	}

	corrections, err := s.correctionRepo.ListCorrections(readingID)
	if err != nil {
		return model.ReadingDetail{}, err
	}

	return model.ReadingDetail{
		Reading:     reading,
		OriginalN:   raw.N,
		OriginalP:   raw.P,
		OriginalK:   raw.K,
		OriginalPH:  raw.PH,
		RuleFlag:    raw.QualityFlag,
		OfficerFlag: raw.OfficerFlag,
		Corrections: corrections,
	}, nil
}

// Correct changes one or more of a reading's numbers.
func (s *CorrectionService) Correct(
	account model.Farmer, readingID int, req model.CorrectRequest,
) error {

	reason := strings.TrimSpace(req.Reason)

	if len([]rune(reason)) < minReasonLength {
		return ValidationError{
			Message: "Please write why you are correcting this, in at " +
				"least 10 characters. It is stored with the change.",
		}
	}

	// Division check first. Everything after this point assumes the officer
	// is allowed to touch this reading.
	division := scopeDivision(account, "")

	if _, err := s.correctionRepo.FindReadingInDivision(
		readingID, division,
	); err != nil {
		return err
	}

	raw, err := s.correctionRepo.RawValues(readingID)
	if err != nil {
		return err
	}

	// ---------- THE SAME RULES AS A FARMER ----------
	//
	// An officer typing pH 99 is no more acceptable than a farmer doing it.
	// Authority over the data is not authority over chemistry, and a
	// corrected value that breaks the model is worse than the wrong value
	// it replaced, because it now carries an officer's name.
	//
	// We check the values that WOULD be in force after this change, not just
	// the ones being changed, so a correction cannot create an impossible
	// combination with the untouched fields.
	n, p, k, ph, _ := raw.Effective()

	if req.N != nil {
		n = *req.N
	}
	if req.P != nil {
		p = *req.P
	}
	if req.K != nil {
		k = *req.K
	}
	if req.PH != nil {
		ph = *req.PH
	}

	if err := validateNutrients(n, p, k, ph); err != nil {
		return err
	}

	// ---------- Work out what actually changed ----------
	//
	// Only real changes are written down. Re-saving the same number is not
	// a correction, and recording it would clutter the history that an
	// officer has to read.
	changes := []model.FieldChange{}

	addChange := func(field string, newValue *float64, current float64,
		corrected *float64) {

		if newValue == nil || *newValue == current {
			return
		}

		// The old value we record is what was in force before, which is the
		// previous correction if there was one, otherwise the farmer's.
		old := formatFloat(current)
		if corrected != nil {
			old = formatFloat(*corrected)
		}

		changes = append(changes, model.FieldChange{
			Field:    field,
			OldValue: &old,
			NewValue: formatFloat(*newValue),
		})
	}

	effN, effP, effK, effPH, _ := raw.Effective()
	addChange("n", req.N, effN, raw.CorrectedN)
	addChange("p", req.P, effP, raw.CorrectedP)
	addChange("k", req.K, effK, raw.CorrectedK)
	addChange("ph", req.PH, effPH, raw.CorrectedPH)

	if len(changes) == 0 {
		return ValidationError{
			Message: "Nothing was changed.",
		}
	}

	return s.correctionRepo.ApplyCorrection(
		readingID, account.FarmerID, reason, changes,
	)
}

// Flag overrules the quality decision the Phase 4 rules made.
func (s *CorrectionService) Flag(
	account model.Farmer, readingID int, req model.FlagRequest,
) error {

	flag := strings.ToUpper(strings.TrimSpace(req.Flag))
	reason := strings.TrimSpace(req.Reason)

	switch flag {
	case FlagOK, FlagFlagged, FlagQuarantined:
	default:
		return ValidationError{
			Message: "Flag must be OK, FLAGGED or QUARANTINED.",
		}
	}

	if len([]rune(reason)) < minReasonLength {
		return ValidationError{
			Message: "Please write why you are changing the flag, in at " +
				"least 10 characters.",
		}
	}

	division := scopeDivision(account, "")

	if _, err := s.correctionRepo.FindReadingInDivision(
		readingID, division,
	); err != nil {
		return err
	}

	raw, err := s.correctionRepo.RawValues(readingID)
	if err != nil {
		return err
	}

	// What is in force now, so we can record what it changed from.
	current := raw.QualityFlag
	if raw.OfficerFlag != nil {
		current = *raw.OfficerFlag
	}

	if current == flag {
		return ValidationError{
			Message: fmt.Sprintf("This reading is already %s.", flag),
		}
	}

	old := current

	return s.correctionRepo.ApplyCorrection(
		readingID, account.FarmerID, reason,
		[]model.FieldChange{{
			Field:    "flag",
			OldValue: &old,
			NewValue: flag,
		}},
	)
}

// validateNutrients applies the Phase 4 hard limits to corrected values.
//
// The numbers come from validation.go, so there is one definition of what a
// possible soil reading is, used for farmers and officers alike.
func validateNutrients(n, p, k, ph float64) error {
	if ph < minPH || ph > maxPH {
		return ValidationError{
			Message: fmt.Sprintf(
				"pH must be between %.0f and %.0f (you sent %.2f).",
				minPH, maxPH, ph),
		}
	}
	if n < minNutrient || n > maxNitrogen {
		return ValidationError{
			Message: fmt.Sprintf(
				"Nitrogen must be between %.0f and %.0f (you sent %.2f).",
				minNutrient, maxNitrogen, n),
		}
	}
	if p < minNutrient || p > maxPhosphor {
		return ValidationError{
			Message: fmt.Sprintf(
				"Phosphorus must be between %.0f and %.0f (you sent %.2f).",
				minNutrient, maxPhosphor, p),
		}
	}
	if k < minNutrient || k > maxPotassium {
		return ValidationError{
			Message: fmt.Sprintf(
				"Potassium must be between %.0f and %.0f (you sent %.2f).",
				minNutrient, maxPotassium, k),
		}
	}
	return nil
}

// formatFloat writes a number for the audit trail.
//
// 'g' with -1 digits gives the shortest text that reads back as exactly the
// same number: 6.5 stays "6.5", not "6.50000".
func formatFloat(v float64) string {
	return strconv.FormatFloat(v, 'g', -1, 64)
}
