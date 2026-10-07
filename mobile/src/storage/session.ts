import * as SecureStore from "expo-secure-store";
import { Farmer } from "../types/farmer";

// Where the saved farmer lives on the phone.
const SESSION_KEY = "soil_session_farmer";

// WHY expo-secure-store AND NOT A PLAIN FILE?
//
// SecureStore uses the phone's own protected storage (the Android Keystore,
// the iOS Keychain). Another app cannot read it, and it is encrypted at
// rest. A normal file or AsyncStorage would be plain text on the device.
//
// WHAT WE SAVE: the farmer's details only. NOT the password. If this store
// were somehow read, there is nothing in it to log in with.
//
// EVERY FUNCTION HERE SWALLOWS ITS ERRORS. Saving a session is a
// convenience, never the point of the app. If the secure store is
// unavailable - and it is on web - the farmer must still be able to log in
// and work. A broken convenience must never break the real feature.

// Save the farmer so the app can skip the login screen next time.
export async function saveSession(farmer: Farmer): Promise<void> {
  try {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(farmer));
  } catch (e) {
    // Could not save. The farmer stays logged in for this run, and will
    // simply have to log in again next time. Nothing is broken.
  }
}

// How long we are willing to wait for the phone's secure storage.
//
// WHY A TIMEOUT ON READING THE DISK?
// Because this read happens BEFORE the app can draw anything. The whole app
// waits on it. If it ever fails to come back, the farmer stares at a spinner
// with no error and no way forward - the app looks completely broken.
//
// Two seconds is far longer than a real read needs. If it has not answered by
// then, we treat it as "nobody is saved" and show the login screen. The worst
// case is that a logged-in farmer has to log in again. That is a small
// annoyance; a frozen app is not.
const STORE_TIMEOUT_MS = 2000;

// Load the saved farmer, or null if there is none.
export async function loadSession(): Promise<Farmer | null> {
  try {
    // Promise.race finishes as soon as EITHER promise finishes. So this is
    // "the stored value, or null after two seconds, whichever comes first".
    const raw = await Promise.race([
      SecureStore.getItemAsync(SESSION_KEY),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), STORE_TIMEOUT_MS)
      ),
    ]);
    if (!raw) {
      return null;
    }

    // PARSE DEFENSIVELY. This text came off the disk, and an older version
    // of the app may have written a different shape. If it is not what we
    // expect, treat it as "no session" rather than crashing on startup -
    // which would leave the farmer with an app that cannot even open.
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.farmer_id === "number") {
      return parsed as Farmer;
    }

    return null;
  } catch (e) {
    return null;
  }
}

// Forget the saved farmer. Used by Logout.
export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch (e) {
    // Nothing to do. The store slice has already forgotten the farmer,
    // so the app is logged out either way.
  }
}
