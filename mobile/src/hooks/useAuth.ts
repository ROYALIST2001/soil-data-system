import { useEffect } from "react";

import { useAppDispatch, useAppSelector } from "../store";
import * as authApi from "../api/authApi";
import { clearSession, loadSession, saveSession } from "../storage/session";
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
        dispatch(sessionRestored(saved));
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

      // Save FIRST, then announce. If saving fails it is swallowed inside
      // saveSession, so the farmer is logged in either way - they just
      // have to log in again next time.
      await saveSession(result.farmer);
      dispatch(authSucceeded(result.farmer));
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

      await saveSession(result.farmer);
      dispatch(authSucceeded(result.farmer));
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
    // Clear the phone's copy FIRST. If we only cleared the store, the next
    // app start would read the old session and log them back in.
    await clearSession();

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
