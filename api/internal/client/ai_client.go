package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"soil-data-system/api/internal/model"
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
	baseURL        string
	httpClient     *http.Client
	chatHTTPClient *http.Client
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
		// Reference retrieval and prioritized searches span multiple LLM calls.
		chatHTTPClient: &http.Client{Timeout: 180 * time.Second},
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

// ClusterRequest is what we SEND to the AI service.
type ClusterRequest struct {
	Districts []model.DistrictSoil `json:"districts"`
	MaxK      int                  `json:"max_k"`
}

// Cluster asks the AI service to group districts by soil similarity.
func (c *AIClient) Cluster(districts []model.DistrictSoil) (*model.ClusterResult, error) {

	request := ClusterRequest{
		Districts: districts,
		MaxK:      6, // test K = 2 up to 6
	}

	body, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("could not build the request: %w", err)
	}

	resp, err := c.httpClient.Post(
		c.baseURL+"/cluster",
		"application/json",
		bytes.NewBuffer(body),
	)
	if err != nil {
		return nil, fmt.Errorf("could not reach the AI service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Read FastAPI's helpful message instead of throwing it away.
		errBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("AI service returned %d: %s",
			resp.StatusCode, string(errBody))
	}

	var result model.ClusterResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("could not read the AI reply: %w", err)
	}

	return &result, nil
}

// QualityReviewRequest is what we SEND to the agent.
type QualityReviewRequest struct {
	SoilN    float64       `json:"soil_n"`
	SoilP    float64       `json:"soil_p"`
	SoilK    float64       `json:"soil_k"`
	SoilPH   float64       `json:"soil_ph"`
	Crop     string        `json:"crop"`
	Stage    string        `json:"stage"`
	RuleFlag string        `json:"rule_flag"`
	History  []HistoryItem `json:"history"`
}

// HistoryItem is one past reading, for grounding.
type HistoryItem struct {
	Date string  `json:"date"`
	N    float64 `json:"n"`
	P    float64 `json:"p"`
	K    float64 `json:"k"`
	PH   float64 `json:"ph"`
	Crop string  `json:"crop"`
}

// QualityReviewResponse is what the agent sends back.
type QualityReviewResponse struct {
	Explanation     string `json:"explanation"`
	AgentVerdict    string `json:"agent_verdict"`
	AgreesWithRules bool   `json:"agrees_with_rules"`
	Confidence      string `json:"confidence"`
}

// ReviewQuality asks the Data-Quality Agent to explain a flagged reading.
func (c *AIClient) ReviewQuality(req QualityReviewRequest) (*QualityReviewResponse, error) {

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("could not build the request: %w", err)
	}

	resp, err := c.httpClient.Post(
		c.baseURL+"/agent/quality-review",
		"application/json",
		bytes.NewBuffer(body),
	)
	if err != nil {
		return nil, fmt.Errorf("could not reach the agent: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("agent returned %d: %s",
			resp.StatusCode, string(errBody))
	}

	var result QualityReviewResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("could not read the agent reply: %w", err)
	}

	return &result, nil
}

// ---------- CHAT ----------

// AgentChatMessage is one message, as FastAPI expects it.
type AgentChatMessage struct {
	Role       string `json:"role"`
	Content    string `json:"content"`
	ToolCalls  any    `json:"tool_calls,omitempty"`
	ToolCallID string `json:"tool_call_id,omitempty"`
}

// AgentToolResult is a tool result we send back to the agent.
type AgentToolResult struct {
	ToolCallID string `json:"tool_call_id"`
	Name       string `json:"name"`
	Content    string `json:"content"`
}

// AgentChatRequest is what we SEND to the agent.
type AgentChatRequest struct {
	Messages    []AgentChatMessage `json:"messages"`
	ToolResults []AgentToolResult  `json:"tool_results"`
}

// AgentToolCall is the agent asking us to run a tool.
type AgentToolCall struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// AgentChatResponse is what the agent sends back.
type AgentChatResponse struct {
	NeedsTools    bool                 `json:"needs_tools"`
	ToolCalls     []AgentToolCall      `json:"tool_calls"`
	Answer        *string              `json:"answer"`
	Messages      []AgentChatMessage   `json:"messages"`
	Sources       []model.ChatSource   `json:"sources"`
	ResearchSteps []model.ResearchStep `json:"research_steps"`
	ToolsUsed     []string             `json:"tools_used"`
}

// Chat runs one round of the agent loop.
func (c *AIClient) Chat(req AgentChatRequest) (*AgentChatResponse, error) {

	// A nil Go slice becomes JSON null, which FastAPI rejects for a list.
	// The first agent round has no tool results yet, so send an empty list.
	if req.ToolResults == nil {
		req.ToolResults = []AgentToolResult{}
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("could not build the request: %w", err)
	}

	resp, err := c.chatHTTPClient.Post(
		c.baseURL+"/agent/chat",
		"application/json",
		bytes.NewBuffer(body),
	)
	if err != nil {
		return nil, fmt.Errorf("could not reach the agent: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("agent returned %d: %s",
			resp.StatusCode, string(errBody))
	}

	var result AgentChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("could not read the agent reply: %w", err)
	}

	return &result, nil
}
