import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Farmer } from "../types/farmer";

interface AuthState {
  // "checking" is the state the app STARTS in, while we look for a saved
  // session on the phone.
  //
  // WHY IT MATTERS: without it, the app would show the login screen for a
  // moment and then jump to the soil test screen. That flash looks like a
  // bug. "checking" lets us show a quiet loading screen instead.
  status: "checking" | "loggedOut" | "loading" | "loggedIn" | "error";

  // Who is logged in. null when nobody is.
  farmer: Farmer | null;

  errorMessage: string | null;
}

const initialState: AuthState = {
  status: "checking",
  farmer: null,
  errorMessage: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,

  reducers: {
    // We looked on the phone and found nobody saved.
    sessionEmpty(state) {
      state.status = "loggedOut";
      state.farmer = null;
    },

    // We found a saved farmer. Straight in, no login screen.
    sessionRestored(state, action: PayloadAction<Farmer>) {
      state.status = "loggedIn";
      state.farmer = action.payload;
      state.errorMessage = null;
    },

    // The farmer pressed Log In or Sign Up. Show the spinner and
    // disable the button so they cannot press it twice.
    authStarted(state) {
      state.status = "loading";
      state.errorMessage = null;
    },

    // It worked.
    authSucceeded(state, action: PayloadAction<Farmer>) {
      state.status = "loggedIn";
      state.farmer = action.payload;
      state.errorMessage = null;
    },

    // It did not work. Keep the farmer on the form with the reason,
    // so they can correct one field and try again.
    authFailed(state, action: PayloadAction<string>) {
      state.status = "error";
      state.farmer = null;
      state.errorMessage = action.payload;
    },

    // Logout, or moving between the Login and Sign Up screens.
    loggedOut(state) {
      state.status = "loggedOut";
      state.farmer = null;
      state.errorMessage = null;
    },

    // Clear just the message, when the farmer starts typing again.
    errorCleared(state) {
      state.errorMessage = null;
      if (state.status === "error") {
        state.status = "loggedOut";
      }
    },
  },
});

export const {
  sessionEmpty,
  sessionRestored,
  authStarted,
  authSucceeded,
  authFailed,
  loggedOut,
  errorCleared,
} = authSlice.actions;

export default authSlice.reducer;
