package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestChatToolResultsContract(t *testing.T) {
	for _, tc := range []struct {
		name    string
		results []AgentToolResult
	}{
		{name: "first round without tools"},
		{
			name: "round with tool results",
			results: []AgentToolResult{{
				ToolCallID: "call_soil", Name: "get_soil_history", Content: "pH 6.2",
			}},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodPost || r.URL.Path != "/agent/chat" {
					t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
				}
				var body struct {
					Messages    []AgentChatMessage `json:"messages"`
					ToolResults json.RawMessage    `json:"tool_results"`
				}
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
					http.Error(w, "invalid JSON", http.StatusBadRequest)
					return
				}
				// Match FastAPI's required list contract, including the first round.
				if len(body.ToolResults) == 0 || body.ToolResults[0] != '[' {
					t.Errorf("tool_results must be an array, got %s", body.ToolResults)
					http.Error(w, "tool_results must be a list", http.StatusUnprocessableEntity)
					return
				}
				var results []AgentToolResult
				if err := json.Unmarshal(body.ToolResults, &results); err != nil {
					t.Error(err)
				}
				if len(results) != len(tc.results) {
					t.Errorf("got %d tool results, want %d", len(results), len(tc.results))
				} else if len(results) > 0 && results[0] != tc.results[0] {
					t.Errorf("tool result changed: %+v", results[0])
				}
				if len(body.Messages) != 1 || body.Messages[0].Content != "How is my soil?" {
					t.Errorf("conversation changed: %+v", body.Messages)
				}
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]any{
					"needs_tools": false, "answer": "Your soil pH is 6.2.", "messages": body.Messages,
				})
			}))
			defer server.Close()

			t.Setenv("AI_SERVICE_URL", server.URL)
			response, err := NewAIClient().Chat(AgentChatRequest{
				Messages:    []AgentChatMessage{{Role: "user", Content: "How is my soil?"}},
				ToolResults: tc.results,
			})
			if err != nil {
				t.Fatal(err)
			}
			if response.NeedsTools || response.Answer == nil || *response.Answer != "Your soil pH is 6.2." {
				t.Fatalf("unexpected response: %+v", response)
			}
		})
	}
}

func TestChatAllowsLongerWaitThanPrediction(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"needs_tools": false, "answer": "Soil pH measures acidity."})
	}))
	defer server.Close()

	t.Setenv("AI_SERVICE_URL", server.URL)
	client := NewAIClient()
	// Scale the two deadlines down so this regression test stays fast.
	client.httpClient.Timeout = 10 * time.Millisecond
	client.chatHTTPClient.Timeout = time.Second
	if _, err := client.Chat(AgentChatRequest{
		Messages: []AgentChatMessage{{Role: "user", Content: "What is soil pH?"}},
	}); err != nil {
		t.Fatalf("chat was cut off by the prediction deadline: %v", err)
	}
}
