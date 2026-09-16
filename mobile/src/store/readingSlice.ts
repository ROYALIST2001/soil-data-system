import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Reading } from "../types/reading";

// The shape of this slice of the store.
interface ReadingState {
  // This type means: ONLY these four exact words are allowed.
  status: "idle" | "loading" | "success" | "error";
  result: Reading | null; // the reading that came back from the server
  error: string | null;   // an error message, if something failed
}

// The data when the app first opens.
const initialState: ReadingState = {
  status: "idle",
  result: null,
  error: null,
};

const readingSlice = createSlice({
  name: "reading",
  initialState,

  // Each function here describes ONE event.
  //
  // NOTE: it looks like we change state directly.
  // Normally that is wrong in Redux. But Redux Toolkit includes
  // a library called Immer that makes this safe for us.
  reducers: {

    // The user pressed Submit. Sending has started.
    submitStarted(state) {
      state.status = "loading";
      state.error = null; // clear any old error
    },

    // The server accepted it and sent the full reading back.
    // PayloadAction<Reading> means the action carries a Reading.
    submitSucceeded(state, action: PayloadAction<Reading>) {
      state.status = "success";
      state.result = action.payload; // payload = the data in the action
    },

    // Something went wrong.
    submitFailed(state, action: PayloadAction<string>) {
      state.status = "error";
      state.error = action.payload;
    },

    // The user wants to enter another reading. Clear everything.
    resetReading(state) {
      state.status = "idle";
      state.result = null;
      state.error = null;
    },
  },
});

// createSlice made an ACTION for each reducer above.
// Export them, so hooks can dispatch them.
export const { submitStarted, submitSucceeded, submitFailed, resetReading } =
  readingSlice.actions;

// Export the REDUCER, so the store can use it.
export default readingSlice.reducer;
