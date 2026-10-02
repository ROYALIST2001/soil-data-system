package model

// ---------- WHAT THE APP SENDS US ----------

// ChatRequest is one message from the farmer.
type ChatRequest struct {
	Message string `json:"message"`

	// The conversation so far. The app keeps this and sends it back,
	// because the LLM has NO MEMORY between requests.
	History []ChatMessage `json:"history"`

	// Which field the farmer is asking about.
	// Optional - if empty, we use their latest reading.
	ReadingID *int `json:"reading_id"`
}

// ChatMessage is one message in the conversation.
type ChatMessage struct {
	Role       string `json:"role"` // "user" or "assistant"
	Content    string `json:"content"`
	ToolCalls  any    `json:"tool_calls,omitempty"`
	ToolCallID string `json:"tool_call_id,omitempty"`
}

// ---------- WHAT WE SEND BACK ----------

// ChatResponse is the agent's answer.
type ChatResponse struct {
	Answer string `json:"answer"`

	// The updated conversation, for the app to keep.
	History []ChatMessage `json:"history"`

	// Which tools were used. Useful for showing the farmer
	// that the answer is based on their real data.
	ToolsUsed []string `json:"tools_used"`
}
