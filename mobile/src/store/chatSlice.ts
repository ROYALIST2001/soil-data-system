import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { ChatMessage, DisplayMessage } from "../types/chat";

interface ChatState {
  status: "idle" | "thinking" | "error" | "no_reading";

  // What the FARMER SEES. Only the real conversation.
  messages: DisplayMessage[];

  // What the AGENT NEEDS. The full history, including the
  // internal tool messages.
  //
  // WHY TWO LISTS? Display is not the same as storage.
  // We SHOW less than we KEEP.
  history: ChatMessage[];

  errorMessage: string | null;
}

const initialState: ChatState = {
  status: "idle",
  messages: [],
  history: [],
  errorMessage: null,
};

// A simple unique id for each bubble.
let nextId = 1;
function makeId(): string {
  nextId += 1;
  return `m${nextId}`;
}

const chatSlice = createSlice({
  name: "chat",
  initialState,

  reducers: {
    // The farmer pressed Send. Show their message immediately,
    // BEFORE the server answers. The app feels faster this way.
    messageSent(state, action: PayloadAction<string>) {
      state.messages.push({
        id: makeId(),
        from: "farmer",
        text: action.payload,
      });
      state.status = "thinking";
      state.errorMessage = null;
    },

    // The advisor answered.
    answerReceived(
      state,
      action: PayloadAction<{
        answer: string;
        history: ChatMessage[];
        toolsUsed: string[];
      }>
    ) {
      state.messages.push({
        id: makeId(),
        from: "advisor",
        text: action.payload.answer,
        toolsUsed: action.payload.toolsUsed,
      });
      state.history = action.payload.history;
      state.status = "idle";
    },

    // No soil reading yet. NOT an error - a normal situation.
    noReading(state, action: PayloadAction<string>) {
      state.status = "no_reading";
      state.errorMessage = action.payload;
      // Remove the message we optimistically added.
      state.messages.pop();
    },

    // Something really went wrong.
    chatFailed(state, action: PayloadAction<string>) {
      state.status = "error";
      state.errorMessage = action.payload;
      state.messages.pop();
    },

    // Start a fresh conversation.
    clearChat(state) {
      state.status = "idle";
      state.messages = [];
      state.history = [];
      state.errorMessage = null;
    },
  },
});

export const {
  messageSent,
  answerReceived,
  noReading,
  chatFailed,
  clearChat,
} = chatSlice.actions;

export default chatSlice.reducer;
