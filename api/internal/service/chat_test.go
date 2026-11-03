package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"soil-data-system/api/internal/client"
	"soil-data-system/api/internal/model"
	"testing"
)

func TestChatRetainsBookCitationsAcrossFarmerToolRounds(t *testing.T) {
	rounds := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rounds++
		var request client.AgentChatRequest
		json.NewDecoder(r.Body).Decode(&request)
		if rounds == 1 {
			json.NewEncoder(w).Encode(map[string]any{
				"needs_tools": true, "messages": request.Messages,
				"tool_calls": []map[string]string{{"id": "call_weather", "name": "get_weather"}},
				"sources":    []model.ChatSource{{ID: "B1", Kind: "book", Title: "guide.pdf", Page: 19}},
				"tools_used": []string{"books"},
			})
		} else {
			if len(request.ToolResults) != 1 || request.ToolResults[0].ToolCallID != "call_weather" {
				t.Error("tool results lost between rounds")
			}
			json.NewEncoder(w).Encode(map[string]any{"needs_tools": false, "answer": "පස පිළිබඳ තොරතුරු [B1]", "messages": request.Messages})
		}
	}))
	defer server.Close()
	t.Setenv("AI_SERVICE_URL", server.URL)
	service := NewChatService(nil, nil, nil, nil, client.NewAIClient())
	result, err := service.Chat(model.ChatRequest{Message: "පස පිළිබඳ තොරතුරු"})
	if err != nil {
		t.Fatal(err)
	}
	if rounds != 2 || len(result.Sources) != 1 || result.Sources[0].Page != 19 {
		t.Fatalf("references lost across tool rounds: %+v", result)
	}
}

func TestCitationsOnlyUseReturnedReferences(t *testing.T) {
	answer, sources := citedSources("මුං වගාව [B1]. Other claim [W99].", []model.ChatSource{
		{ID: "B1", Kind: "book", Title: "Guide", Page: 5},
		{ID: "B2", Kind: "book", Title: "Unused", Page: 6},
	})
	if answer != "මුං වගාව [B1]. Other claim ." || len(sources) != 1 || sources[0].ID != "B1" {
		t.Fatalf("invalid references: %s, %+v", answer, sources)
	}
}

func TestPersonalToolsWithoutAReadingDoNotAccessDatabase(t *testing.T) {
	service := &ChatService{}
	for _, name := range []string{"get_soil_history", "get_fertilizer_advice", "get_region_info"} {
		if result := service.runTool(name, model.Reading{}); result == "" {
			t.Fatalf("expected a missing-reading explanation for %s", name)
		}
	}
}
