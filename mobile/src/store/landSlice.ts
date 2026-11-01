import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Land } from "../types/land";

interface LandState {
  // "unloaded" is the state we START in, before we have asked the server.
  //
  // WHY IT MATTERS: the app decides whether to show the land registration
  // screen by counting the farmer's lands. An empty list could mean "this
  // farmer has no lands" OR "we have not looked yet". Those lead to
  // completely different screens, so they must be different states.
  status: "unloaded" | "loading" | "ready" | "error";

  lands: Land[];

  // A separate flag for "we are saving something right now", so a save does
  // not make the whole list look like it is reloading.
  saving: boolean;

  // Has the farmer finished the first-time land registration?
  //
  // WHY THIS IS NOT JUST "lands.length > 0". The moment a new farmer saves
  // their first land, the count becomes 1. If that alone decided the screen,
  // the app would jump straight into the home tabs and the farmer would
  // never get the chance to add a SECOND land. They have to say when they
  // are done, so this is their decision, not a side effect of counting.
  setupDone: boolean;

  errorMessage: string | null;
}

const initialState: LandState = {
  status: "unloaded",
  lands: [],
  saving: false,
  setupDone: false,
  errorMessage: null,
};

const landSlice = createSlice({
  name: "land",
  initialState,

  reducers: {
    landsLoading(state) {
      state.status = "loading";
      state.errorMessage = null;
    },

    landsLoaded(state, action: PayloadAction<Land[]>) {
      state.status = "ready";
      state.lands = action.payload;
      state.errorMessage = null;

      // A farmer who ALREADY has lands registered has nothing to set up, so
      // they go straight to the home tabs on every future login.
      if (action.payload.length > 0) {
        state.setupDone = true;
      }
    },

    // The farmer pressed "Continue" at the end of registration.
    setupFinished(state) {
      state.setupDone = true;
    },

    landsFailed(state, action: PayloadAction<string>) {
      state.status = "error";
      state.errorMessage = action.payload;
    },

    saveStarted(state) {
      state.saving = true;
      state.errorMessage = null;
    },

    // A land was created. Add it to the list we already have, instead of
    // asking the server for everything again. One less round trip, and the
    // new land appears instantly.
    landAdded(state, action: PayloadAction<Land>) {
      state.lands.push(action.payload);
      state.saving = false;
      state.status = "ready";
    },

    saveFailed(state, action: PayloadAction<string>) {
      state.saving = false;
      state.errorMessage = action.payload;
    },

    // A whole land was removed.
    landRemoved(state, action: PayloadAction<number>) {
      state.lands = state.lands.filter((l) => l.land_id !== action.payload);
      state.saving = false;
    },

    // A crop was removed. We have to find which land it was on.
    cropRemoved(state, action: PayloadAction<number>) {
      for (const land of state.lands) {
        land.crops = land.crops.filter(
          (c) => c.land_crop_id !== action.payload
        );
      }
      state.saving = false;
    },

    // A crop was added to an existing land.
    cropAdded(
      state,
      action: PayloadAction<{ landId: number; crop: Land["crops"][number] }>
    ) {
      const land = state.lands.find((l) => l.land_id === action.payload.landId);
      if (land) {
        land.crops.push(action.payload.crop);
      }
      state.saving = false;
    },

    errorCleared(state) {
      state.errorMessage = null;
    },

    // Logging out must empty this.
    //
    // WITHOUT THIS, the next farmer to log in on the same phone would see
    // the previous farmer's lands for a moment, until the reload finished.
    // That is somebody else's private data on screen, and it would be our
    // fault, not a server problem.
    landsCleared(state) {
      state.status = "unloaded";
      state.lands = [];
      state.saving = false;
      state.setupDone = false;
      state.errorMessage = null;
    },
  },
});

export const {
  landsLoading,
  landsLoaded,
  landsFailed,
  setupFinished,
  saveStarted,
  landAdded,
  saveFailed,
  landRemoved,
  cropRemoved,
  cropAdded,
  errorCleared,
  landsCleared,
} = landSlice.actions;

export default landSlice.reducer;
