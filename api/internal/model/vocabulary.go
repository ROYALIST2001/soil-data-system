package model

// CropInfo holds the fixed facts about one crop.
type CropInfo struct {
	Label    string  // how we show it to the farmer
	MaxYield float64 // realistic maximum tonnes per hectare
}

// AllowedCrops is the ONLY list of crops this system knows.
//
// IMPORTANT: these keys must match the training dataset EXACTLY.
// The model was trained on these 10 words, in lowercase.
// If you add a crop here, you must retrain the model.
var AllowedCrops = map[string]CropInfo{
	"rice":     {Label: "Rice", MaxYield: 8.0},
	"maize":    {Label: "Maize", MaxYield: 10.0},
	"tea":      {Label: "Tea", MaxYield: 3.5},
	"coconut":  {Label: "Coconut", MaxYield: 18.0},
	"banana":   {Label: "Banana", MaxYield: 60.0},
	"chilli":   {Label: "Chilli", MaxYield: 6.0},
	"potato":   {Label: "Potato", MaxYield: 30.0},
	"cabbage":  {Label: "Cabbage", MaxYield: 45.0},
	"tomato":   {Label: "Tomato", MaxYield: 40.0},
	"bigonion": {Label: "Big Onion", MaxYield: 25.0},
}

// AllowedStages is the ONLY list of growth stages this system knows.
// These must also match the training dataset exactly.
var AllowedStages = map[string]string{
	"seedling":   "Seedling",
	"vegetative": "Vegetative",
	"flowering":  "Flowering",
	"maturity":   "Maturity",
}

// CropNames returns the crop keys in a fixed, sorted order.
// We need a FIXED order so error messages always look the same.
// Go maps have NO order, so we must sort them ourselves.
func CropNames() []string {
	return []string{
		"banana", "bigonion", "cabbage", "chilli", "coconut",
		"maize", "potato", "rice", "tea", "tomato",
	}
}

// StageNames returns the stages in the natural order a crop grows through.
func StageNames() []string {
	return []string{"seedling", "vegetative", "flowering", "maturity"}
}
