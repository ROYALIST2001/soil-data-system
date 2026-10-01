package model

// DistrictSoil is one district's average soil.
// We SEND these to the AI service.
type DistrictSoil struct {
	DistrictID   int     `json:"district_id"`
	Name         string  `json:"name"`
	AvgN         float64 `json:"avg_n"`
	AvgP         float64 `json:"avg_p"`
	AvgK         float64 `json:"avg_k"`
	AvgPH        float64 `json:"avg_ph"`
	ReadingCount int     `json:"reading_count"`
}

// ClusterInfo is one group of similar districts.
type ClusterInfo struct {
	ClusterID     int      `json:"cluster_id"`
	Description   string   `json:"description"`
	DistrictCount int      `json:"district_count"`
	DistrictNames []string `json:"district_names"`
	CentreN       float64  `json:"centre_n"`
	CentreP       float64  `json:"centre_p"`
	CentreK       float64  `json:"centre_k"`
	CentrePH      float64  `json:"centre_ph"`
}

// KEvaluation is one K value we tested. For the elbow chart.
type KEvaluation struct {
	K          int     `json:"k"`
	Inertia    float64 `json:"inertia"`
	Silhouette float64 `json:"silhouette"`
}

// ClusterResult is the complete answer.
type ClusterResult struct {
	ChosenK         int            `json:"chosen_k"`
	ElbowK          int            `json:"elbow_k"`
	SilhouetteScore float64        `json:"silhouette_score"`
	Quality         string         `json:"quality"`
	Clusters        []ClusterInfo  `json:"clusters"`
	Assignments     map[string]int `json:"assignments"`
	Evaluations     []KEvaluation  `json:"evaluations"`
}
