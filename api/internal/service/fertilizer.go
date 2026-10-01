package service

import (
	"fmt"

	"soil-data-system/api/internal/model"
)

// ---------- FERTILIZER CHEMISTRY ----------
//
// This is FIXED CHEMISTRY, not AI. These numbers never change.
//
// A fertilizer bag is NOT pure nutrient. Most of it is other
// chemicals holding the nutrient. So:
//
//     product needed = nutrient needed / percentage

const (
	// Urea: 46% nitrogen. The other 54% is carbon, oxygen, hydrogen.
	ureaNPercent = 0.46

	// DAP: gives TWO nutrients at once. This is why ordering matters.
	dapNPercent    = 0.18 // 18% nitrogen
	dapP2O5Percent = 0.46 // 46% phosphate

	// MOP: 60% potash.
	mopK2OPercent = 0.60

	// ---------- THE OXIDE CONVERSION ----------
	//
	// Soil tests report ELEMENTAL P and K.
	// Fertilizer bags report OXIDE forms: P2O5 and K2O.
	// These are DIFFERENT numbers. We must convert.
	//
	// Where the numbers come from (molecular weights):
	//   P2O5 weighs 142, the 2 P atoms inside weigh 62
	//      -> 142 / 62 = 2.29
	//   K2O weighs 94, the 2 K atoms weigh 78
	//      -> 94 / 78 = 1.20
	//
	// FORGETTING THIS makes the answer wrong by more than half.
	// Nitrogen has no oxide form, so N needs no conversion.
	pToP2O5 = 2.29
	kToK2O  = 1.20
)

// FertilizerService turns a nutrient need into buyable products.
type FertilizerService struct {
}

// NewFertilizerService builds the service.
// It needs nothing: this is pure calculation.
func NewFertilizerService() *FertilizerService {
	return &FertilizerService{}
}

// Calculate converts the nutrient need into product amounts.
//
// needN, needP, needK are ELEMENTAL kg per hectare, from the model.
// areaHa is the field size in hectares.
func (s *FertilizerService) Calculate(
	needN float64,
	needP float64,
	needK float64,
	areaHa float64,
) (urea float64, dap float64, mop float64, notes []string) {

	notes = []string{}

	// ---------- STEP 1: convert P and K into OXIDE form ----------
	//
	// The model gives us elemental P and K.
	// Fertilizer bags are labelled in P2O5 and K2O.
	needP2O5 := needP * pToP2O5
	needK2O := needK * kToK2O

	// ---------- STEP 2: DAP FIRST, from the phosphorus need ----------
	//
	// WHY DAP FIRST?
	// Because DAP is the ONLY source of phosphorus in our three
	// products. Urea gives only N. MOP gives only K.
	// So the phosphorus need FIXES how much DAP we must use.
	// Then nitrogen adjusts around it.
	//
	// RULE: the constrained nutrient decides first.
	dapPerHa := 0.0
	if needP2O5 > 0 {
		dapPerHa = needP2O5 / dapP2O5Percent
	}

	// ---------- STEP 3: SUBTRACT the nitrogen DAP already gives ----------
	//
	// THIS IS THE MOST IMPORTANT STEP IN THE FILE.
	//
	// DAP is 18% nitrogen. So it ALREADY supplies nitrogen.
	// If we ignore this and calculate urea for the FULL need,
	// the farmer applies far too much nitrogen.
	//
	// REAL EXAMPLE - need 45 kg N and 45.8 kg P2O5:
	//
	//   WRONG:  DAP  = 45.8 / 0.46 = 99.6 kg  -> gives 17.9 kg N
	//           Urea = 45.0 / 0.46 = 97.8 kg  -> gives 45.0 kg N
	//           TOTAL NITROGEN APPLIED = 62.9 kg
	//           NEEDED                 = 45.0 kg
	//           -> 40% TOO MUCH. Wasted money, polluted water,
	//              burnt roots, weak pest-prone growth.
	//
	//   RIGHT:  DAP  = 99.6 kg          -> gives 17.9 kg N
	//           Remaining N = 45.0 - 17.9 = 27.1 kg
	//           Urea = 27.1 / 0.46 = 58.9 kg
	//           TOTAL NITROGEN = 17.9 + 27.1 = 45.0 kg  CORRECT
	nitrogenFromDap := dapPerHa * dapNPercent
	remainingN := needN - nitrogenFromDap

	ureaPerHa := 0.0
	if remainingN > 0 {
		ureaPerHa = remainingN / ureaNPercent
	} else if needN > 0 {
		// DAP already gives MORE nitrogen than the crop needs.
		// Urea stays at 0. You cannot apply negative fertilizer.
		//
		// We TELL the farmer why, otherwise they think the app
		// is broken when they see "0 kg urea".
		notes = append(notes, fmt.Sprintf(
			"No urea needed. DAP already supplies %.1f kg of nitrogen per hectare, "+
				"which covers the %.1f kg required.",
			nitrogenFromDap, needN))
	}

	// ---------- STEP 4: MOP from the potassium need ----------
	// MOP gives ONLY potassium, so nothing to subtract.
	mopPerHa := 0.0
	if needK2O > 0 {
		mopPerHa = needK2O / mopK2OPercent
	}

	// ---------- STEP 5: scale to the actual field size ----------
	//
	// THIS IS WHERE 'area' FINALLY GETS USED.
	//
	// Remember Phase 5: we deliberately EXCLUDED area as a model
	// feature, because multiplication is EXACT. A neural network
	// would only approximate it. So we calculate it here instead.
	urea = ureaPerHa * areaHa
	dap = dapPerHa * areaHa
	mop = mopPerHa * areaHa

	// ---------- Helpful notes ----------
	if urea == 0 && dap == 0 && mop == 0 {
		notes = append(notes,
			"No fertilizer is needed. The soil already has enough nutrients for this growth stage.")
	}

	return urea, dap, mop, notes
}

// BuildRecommendation assembles the complete answer for the app.
func (s *FertilizerService) BuildRecommendation(
	reading model.Reading,
	needN float64,
	needP float64,
	needK float64,
	predictor string,
) model.Recommendation {

	urea, dap, mop, notes := s.Calculate(needN, needP, needK, reading.Area)

	// Work out the per-hectare amounts too, for transparency.
	ureaPerHa, dapPerHa, mopPerHa := 0.0, 0.0, 0.0
	if reading.Area > 0 {
		ureaPerHa = urea / reading.Area
		dapPerHa = dap / reading.Area
		mopPerHa = mop / reading.Area
	}

	return model.Recommendation{
		ReadingID: reading.ReadingID,

		NeedNPerHa: round2(needN),
		NeedPPerHa: round2(needP),
		NeedKPerHa: round2(needK),

		UreaPerHa: round2(ureaPerHa),
		DapPerHa:  round2(dapPerHa),
		MopPerHa:  round2(mopPerHa),

		AreaHa:    reading.Area,
		UreaTotal: round2(urea),
		DapTotal:  round2(dap),
		MopTotal:  round2(mop),

		Crop:      reading.Crop,
		Stage:     reading.Stage,
		Zone:      reading.Zone,
		Predictor: predictor,

		Notes: notes,
	}
}

// round2 rounds to 2 decimal places.
// A farmer does not need 8 decimals of urea.
func round2(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}
