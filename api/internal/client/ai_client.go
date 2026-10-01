package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// PredictRequest is what we SEND to the AI service.
// The json tags must match the FastAPI schema exactly.
type PredictRequest struct {
	SoilN       float64 `json:"soil_n"`
	SoilP       float64 `json:"soil_p"`
	SoilK       float64 `json:"soil_k"`
	SoilPH      float64 `json:"soil_ph"`
	Crop        string  `json:"crop"`
	Stage       string  `json:"stage"`
	Zone        string  `json:"zone"`
	TargetYield float64 `json:"target_yield"`
}

// PredictResponse is what the AI service SENDS BACK.
type PredictResponse struct {
	NeedN     float64 `json:"need_n"`
	NeedP     float64 `json:"need_p"`
	NeedK     float64 `json:"need_k"`
	Predictor string  `json:"predictor"`
}

// AIClient talks to the FastAPI service.
type AIClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewAIClient builds the client.
func NewAIClient() *AIClient {
	// Read the address from the environment.
	// Inside Docker, services find each other by SERVICE NAME,
	// not by localhost. Inside a container, "localhost" means
	// THAT container itself.
	url := os.Getenv("AI_SERVICE_URL")
	if url == "" {
		url = "http://ai:8000" // the service name from docker-compose.yml
	}

	return &AIClient{
		baseURL: url,
		httpClient: &http.Client{
			// ALWAYS set a timeout on a network call.
			//
			// Without one, if the AI service hangs, this request
			// waits FOREVER and the farmer sees a frozen screen.
			//
			// 10 seconds is generous, because the first call after
			// startup can be slower.
			Timeout: 10 * time.Second,
		},
	}
}

// Predict asks the AI service how much N, P and K the crop needs.
func (c *AIClient) Predict(req PredictRequest) (*PredictResponse, error) {

	// ---------- STEP 1: turn the request into JSON text ----------
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("could not build the request: %w", err)
	}

	// ---------- STEP 2: send it ----------
	resp, err := c.httpClient.Post(
		c.baseURL+"/predict",
		"application/json",
		bytes.NewBuffer(body),
	)
	if err != nil {
		// The AI service is down, or the network failed.
		return nil, fmt.Errorf("could not reach the AI service: %w", err)
	}

	// defer runs at the end, always. This frees the connection.
	defer resp.Body.Close()

	// ---------- STEP 3: check the status ----------
	if resp.StatusCode != http.StatusOK {
		// Read FastAPI's helpful message instead of throwing it away.
		errBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("AI service returned %d: %s",
			resp.StatusCode, string(errBody))
	}

	// ---------- STEP 4: read the answer ----------
	var result PredictResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("could not read the AI reply: %w", err)
	}

	return &result, nil
}
