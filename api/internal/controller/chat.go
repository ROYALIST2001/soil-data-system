package controller

import (
	"encoding/json"
	"net/http"
	"strings"

	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/service"
)

// ChatController holds the service.
type ChatController struct {
	service *service.ChatService
}

// NewChatController builds the controller.
func NewChatController(service *service.ChatService) *ChatController {
	return &ChatController{service: service}
}

// Chat handles POST /chat
func (c *ChatController) Chat(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req model.ChatRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest) // 400
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON"})
		return
	}

	// An empty question is the caller's mistake.
	if strings.TrimSpace(req.Message) == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Please type a question.",
		})
		return
	}

	result, err := c.service.Chat(req)

	if err != nil {
		msg := err.Error()

		// No reading selected yet.
		if strings.Contains(msg, "submit a soil test") {
			w.WriteHeader(http.StatusConflict) // 409
			json.NewEncoder(w).Encode(map[string]string{"error": msg})
			return
		}

		// The advisor is down, or hit the round limit.
		w.WriteHeader(http.StatusServiceUnavailable) // 503
		json.NewEncoder(w).Encode(map[string]string{
			"error": "The advisor is not available right now. Please try again shortly.",
		})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(result)
}
