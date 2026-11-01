package model

// Recommendation is the final answer sent to the farmer.
type Recommendation struct {
	ReadingID int `json:"reading_id"`

	// ---------- What the AI model predicted ----------
	// Kept for transparency: an officer can check our chemistry,
	// and your report can show the raw output.
	NeedNPerHa float64 `json:"need_n_per_ha"` // elemental N, kg/ha
	NeedPPerHa float64 `json:"need_p_per_ha"` // elemental P, kg/ha
	NeedKPerHa float64 `json:"need_k_per_ha"` // elemental K, kg/ha

	// ---------- What to apply per hectare ----------
	UreaPerHa float64 `json:"urea_per_ha"`
	DapPerHa  float64 `json:"dap_per_ha"`
	MopPerHa  float64 `json:"mop_per_ha"`

	// ---------- What to BUY for this whole field ----------
	// This is the number the farmer takes to the shop.
	AreaHa    float64 `json:"area_ha"`
	UreaTotal float64 `json:"urea_total"`
	DapTotal  float64 `json:"dap_total"`
	MopTotal  float64 `json:"mop_total"`

	// ---------- Context ----------
	Crop      string `json:"crop"`
	Stage     string `json:"stage"`
	Zone      string `json:"zone"`
	Predictor string `json:"predictor"` // which model made the prediction

	// ---------- Notes ----------
	// Messages explaining anything unusual.
	// Without these, a farmer seeing "0 kg urea" thinks the app is broken.
	Notes []string `json:"notes"`
}
