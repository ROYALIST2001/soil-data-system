// One message in the conversation.
//
// NOTE: this holds MORE than the farmer sees.
// Tool messages and tool-call messages are internal machinery.
// We keep them because the AGENT needs them, but we FILTER them
// out before displaying.
export interface ChatMessage {
  role: string;              // "user", "assistant", "tool", "system"
  content: string;
  tool_calls?: any;
  tool_call_id?: string;
}

// What we SEND to the Go API.
export interface ChatRequest {
  message: string;
  reading_id: number;

  // The conversation so far.
  //
  // WHY SEND IT EVERY TIME? Because the LLM has NO MEMORY.
  // Each request starts fresh. We must re-send the whole story.
  history: ChatMessage[];
}

// What the Go API sends back.
export interface ChatResponse {
  answer: string;
  history: ChatMessage[];

  // Which tools the agent used. We show this to the farmer,
  // so they can see the answer came from THEIR data.
  tools_used: string[];
}

// One bubble on the screen.
//
// This is DIFFERENT from ChatMessage. This is only what we DISPLAY.
export interface DisplayMessage {
  id: string;
  from: "farmer" | "advisor";
  text: string;
  toolsUsed?: string[];
}
