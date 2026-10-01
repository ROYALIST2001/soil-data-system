import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Recommendation } from "../types/recommendation";

// The shape of this slice.
interface RecommendationState {
  // NOTE the extra status: "flagged".
  // It is NOT the same as "error".
  //   error   -> something went wrong (red)
  //   flagged -> the data is unusable, and here is why (orange)
  status: "idle" | "loading" | "success" | "error" | "flagged";
  result: Recommendation | null;
  message: string | null;
}

const initialState: RecommendationState = {
  status: "idle",
  result: null,
  message: null,
};

const recommendationSlice = createSlice({
  name: "recommendation",
  initialState,

  reducers: {
    // The farmer pressed "Get Recommendation".
    recommendationStarted(state) {
      state.status = "loading";
      state.message = null;
    },

    // The server sent the advice.
    recommendationSucceeded(state, action: PayloadAction<Recommendation>) {
      state.status = "success";
      state.result = action.payload;
    },

    // The reading was flagged in the Phase 4 quality check.
    recommendationFlagged(state, action: PayloadAction<string>) {
      state.status = "flagged";
      state.message = action.payload;
    },

    // Something else went wrong.
    recommendationFailed(state, action: PayloadAction<string>) {
      state.status = "error";
      state.message = action.payload;
    },

    // Clear everything.
    resetRecommendation(state) {
      state.status = "idle";
      state.result = null;
      state.message = null;
    },
  },
});

export const {
  recommendationStarted,
  recommendationSucceeded,
  recommendationFlagged,
  recommendationFailed,
  resetRecommendation,
} = recommendationSlice.actions;

export default recommendationSlice.reducer;
