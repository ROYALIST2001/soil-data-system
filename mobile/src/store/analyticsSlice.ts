import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { HistorySeries, ClusterResult } from "../types/analytics";

// The shape of this slice.
//
// NOTE: history and clusters have SEPARATE statuses.
// WHY? Because they load independently. The history can succeed
// while clustering fails because too few districts have data.
interface AnalyticsState {
  historyStatus: "idle" | "loading" | "success" | "error";
  history: HistorySeries | null;
  historyError: string | null;

  clusterStatus: "idle" | "loading" | "success" | "error" | "not_enough_data";
  clusters: ClusterResult | null;
  clusterMessage: string | null;
}

const initialState: AnalyticsState = {
  historyStatus: "idle",
  history: null,
  historyError: null,

  clusterStatus: "idle",
  clusters: null,
  clusterMessage: null,
};

const analyticsSlice = createSlice({
  name: "analytics",
  initialState,

  reducers: {
    // ---------- HISTORY ----------
    historyStarted(state) {
      state.historyStatus = "loading";
      state.historyError = null;
    },
    historySucceeded(state, action: PayloadAction<HistorySeries>) {
      state.historyStatus = "success";
      state.history = action.payload;
    },
    historyFailed(state, action: PayloadAction<string>) {
      state.historyStatus = "error";
      state.historyError = action.payload;
    },

    // ---------- CLUSTERS ----------
    clustersStarted(state) {
      state.clusterStatus = "loading";
      state.clusterMessage = null;
    },
    clustersSucceeded(state, action: PayloadAction<ClusterResult>) {
      state.clusterStatus = "success";
      state.clusters = action.payload;
    },
    // Not enough districts yet. NOT an error - a normal situation.
    clustersNotEnoughData(state, action: PayloadAction<string>) {
      state.clusterStatus = "not_enough_data";
      state.clusterMessage = action.payload;
    },
    clustersFailed(state, action: PayloadAction<string>) {
      state.clusterStatus = "error";
      state.clusterMessage = action.payload;
    },
  },
});

export const {
  historyStarted,
  historySucceeded,
  historyFailed,
  clustersStarted,
  clustersSucceeded,
  clustersNotEnoughData,
  clustersFailed,
} = analyticsSlice.actions;

export default analyticsSlice.reducer;
