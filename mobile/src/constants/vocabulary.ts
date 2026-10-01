// The crops and stages this system knows.
//
// ⚠ THIS LIST MUST MATCH THREE THINGS EXACTLY:
//   1. api/internal/model/vocabulary.go
//   2. the training dataset (training_data.csv)
//   3. the trained model
//
// If you add a crop here, you must also change the Go file
// AND retrain the model. Otherwise predictions will be wrong.

export interface Option {
  value: string; // what we SEND to the server (lowercase)
  label: string; // what the FARMER sees
}

export const CROPS: Option[] = [
  { value: "rice", label: "Rice" },
  { value: "maize", label: "Maize" },
  { value: "tea", label: "Tea" },
  { value: "coconut", label: "Coconut" },
  { value: "banana", label: "Banana" },
  { value: "chilli", label: "Chilli" },
  { value: "potato", label: "Potato" },
  { value: "cabbage", label: "Cabbage" },
  { value: "tomato", label: "Tomato" },
  { value: "bigonion", label: "Big Onion" },
];

export const STAGES: Option[] = [
  { value: "seedling", label: "Seedling" },
  { value: "vegetative", label: "Vegetative" },
  { value: "flowering", label: "Flowering" },
  { value: "maturity", label: "Maturity" },
];

// The realistic maximum yield for each crop, in tonnes per hectare.
// The app uses this to show a helpful hint under the yield box.
// The Go server enforces the real limit. This is only a helper.
export const MAX_YIELD: Record<string, number> = {
  rice: 8,
  maize: 10,
  tea: 3.5,
  coconut: 18,
  banana: 60,
  chilli: 6,
  potato: 30,
  cabbage: 45,
  tomato: 40,
  bigonion: 25,
};
