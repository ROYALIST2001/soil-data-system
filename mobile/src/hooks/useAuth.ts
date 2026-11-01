import { useEffect } from "react";

import { useAppDispatch, useAppSelector } from "../store";
import * as authApi from "../api/authApi";
import { clearSession, loadSession, saveSession } from "../storage/session";
import { setAuthToken } from "../api/http";
import { LoginData, SignupData } from "../types/farmer";
import {
  authFailed,
  authStarted,
  authSucceeded,
  loggedOut,
  sessionEmpty,
  sessionRestored,
} from "../store/authSlice";
import { landsCleared } from "../store/landSlice";
import { submitSucceeded, resetReading } from "../store/readingSlice";
import { getLatestReading } from "../api/readingApi";

// Load the farmer's last reading into the store, so the Trends and Map
// screens have a field to draw the moment they are opened.
//
// SWALLOWS ITS ERRORS ON PURPOSE. This is a convenience: if it fails, those
// two screens simply say "no readings yet", which is exactly what they said
// before this existed. A nicety must never be able to block logging in.
async function loadLatestReadingInto(
  dispatch: ReturnType<typeof useAppDispatch>,
  farmerID: number
): Promise<void> {
  try {
    const reading = await getLatestReading(farmerID);
    if (reading) {
      // submitSucceeded is the action that puts a reading in the store.
      // The name is about where it came from originally, not about what it
      // means - it simply records "this is the reading in hand".
      dispatch(submitSucceeded(reading));
    }
  } catch (e) {
    // No network, or the server is down. The farmer is still logged in.
  }
}

// ---------------------------------------------------------------------
// useSessionRestore - looks for a saved farmer when the app starts.
//
// THIS IS DELIBERATELY SEPARATE FROM useAuth BELOW, and it is called in
// exactly ONE place: AppNavigator.
//
// WHY IT MATTERS. If this lived inside useAuth, it would run again every
// time any screen used useAuth. Picture it: the login screen mounts and
// starts reading the phone's storage. The farmer types fast and logs in
// successfully. THEN the slow disk read finishes, finds nothing saved, and
// dispatches "no session" - throwing the farmer who just logged in straight
// back out to the login screen.
//
// A bug like that appears only on a slow phone, which makes it very hard to
// find later. One hook, one job, called once.
// ---------------------------------------------------------------------
export function useSessionRestore() {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.auth.status);

  // The empty dependency list means "run once, on first render only".
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const saved = await loadSession();

      // Do not touch the store if this went away while we read the disk.
      if (cancelled) {
        return;
      }

      if (saved) {
        // THE TOKEN GOES BACK FIRST, before we announce the farmer is
        // logged in. The moment the store says "loggedIn", other screens
        // start making requests - and a request sent without the token
        // would come back 401 and bounce the farmer out.
        setAuthToken(saved.token);
        dispatch(sessionRestored(saved.farmer));

        // Fetch their last reading in the background, so Trends and Map
        // have a field to draw. Deliberately NOT awaited: it is a
        // convenience, and making the whole app wait on it would be
        // paying for a nicety with the thing that matters.
        loadLatestReadingInto(dispatch, saved.farmer.farmer_id);
      } else {
        dispatch(sessionEmpty());
      }
    }

    restore();

    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  return { checking: status === "checking" };
}

// ---------------------------------------------------------------------
// useAuth - signup, login and logout. NO side effects on mount.
// ---------------------------------------------------------------------
export function useAuth() {
  const dispatch = useAppDispatch();

  const status = useAppSelector((s) => s.auth.status);
  const farmer = useAppSelector((s) => s.auth.farmer);
  const errorMessage = useAppSelector((s) => s.auth.errorMessage);

  // ---------- Create an account ----------
  async function doSignup(data: SignupData) {
    dispatch(authStarted());

    try {
      const result = await authApi.signup(data);

      setAuthToken(result.token);

      // Save FIRST, then announce. If saving fails it is swallowed inside
      // saveSession, so the farmer is logged in either way - they just
      // have to log in again next time.
      await saveSession(result.farmer, result.token);
      dispatch(authSucceeded(result.farmer));

      // A brand new farmer has none, which is fine - this just does
      // nothing.
      loadLatestReadingInto(dispatch, result.farmer.farmer_id);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Could not reach the server. Check your connection.";
      dispatch(authFailed(message));
    }
  }

  // ---------- Log in ----------
  async function doLogin(data: LoginData) {
    dispatch(authStarted());

    try {
      const result = await authApi.login(data);

      setAuthToken(result.token);

      await saveSession(result.farmer, result.token);
      dispatch(authSucceeded(result.farmer));

      // Their history is already on the server; fetch the last reading so
      // Trends and Map work straight away rather than after a new test.
      loadLatestReadingInto(dispatch, result.farmer.farmer_id);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Could not reach the server. Check your connection.";
      dispatch(authFailed(message));
    }
  }

  // ---------- Log out ----------
  async function doLogout() {
    // Forget the last reading as well, or the next farmer to log in on this
    // phone would see the previous one's field on the Trends screen.
    dispatch(resetReading());

    // Clear the phone's copy FIRST. If we only cleared the store, the next
    // app start would read the old session and log them back in.
    await clearSession();

    // Drop the token so nothing sent after this point carries it.
    setAuthToken(null);

    // FORGET THE LANDS TOO.
    //
    // Without this, the next farmer to log in on the same phone would see
    // the previous farmer's lands and crops for a moment, until the reload
    // finished. That is somebody else's private data on screen, and it
    // would be our bug, not a server problem.
    dispatch(landsCleared());
    dispatch(loggedOut());
  }

  return {
    status,
    farmer,
    errorMessage,
    signup: doSignup,
    login: doLogin,
    logout: doLogout,
  };
}
