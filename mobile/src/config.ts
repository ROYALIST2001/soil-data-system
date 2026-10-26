import Constants from "expo-constants";
import { NativeModules } from "react-native";

// The address of our Go API.
//
// THIS USED TO BE A HARDCODED IP, AND IT BROKE CONSTANTLY.
//
// Every time the laptop reconnected to WiFi the router handed it a new
// address, the line below went stale, and the app would hang with no error.
// The address was always written down in exactly one place, and that place
// was always wrong.
//
// So we stop writing it down. The phone has ALREADY reached this laptop -
// that is how it downloaded the app in the first place. We take the host
// from the dev server it used and point the API at the same machine. The
// address cannot be stale, because it is the address that just worked.

// The port our Go API listens on. Ours, so it is safe to fix here.
const API_PORT = 8080;

// Used ONLY when there is no dev server to ask, which in practice means a
// released build. It is never reached while developing with Expo.
//
// It is a guess, and a guess about a network address ages badly. A real
// deployment would point at a fixed server name instead.
const FALLBACK_HOST = "10.162.209.132";

// hostFrom pulls just the hostname out of something like
// "10.0.0.5:8081" or "http://10.0.0.5:8081/index.bundle?platform=ios".
function hostFrom(value: string | undefined | null): string | null {
  if (typeof value !== "string" || value === "") {
    return null;
  }

  // Drop ANY scheme, not just http.
  //
  // An earlier version stripped only "http://" and "https://", so
  // "exp://10.0.0.5:8081" came back as the host "exp" - which would have
  // produced http://exp:8080 and a failure nobody could have read. Expo
  // uses exp:// and expo-dev-client uses its own scheme, so this has to be
  // general.
  const withoutScheme = value.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
  const host = withoutScheme.split(/[:/?#]/)[0];

  if (!host) {
    return null;
  }

  // "localhost" means THE PHONE when the app runs on a real device, so it
  // would be worse than useless. Only trust a real address.
  if (host === "localhost" || host === "127.0.0.1") {
    return null;
  }

  return host;
}

function resolveApiBaseUrl(): string {
  // ---------- FIRST CHOICE: ask Expo ----------
  //
  // hostUri is the address the phone used to reach the dev server, and it
  // is what Expo itself documents for this.
  //
  // WHY THIS IS FIRST. The original version used only the React Native
  // module below, and on Android with React Native 0.86 it returned
  // nothing - so the app silently fell back to a hardcoded address from
  // weeks earlier and reported it could not reach a laptop that was sitting
  // right there. One source of truth was not enough.
  const fromExpo = hostFrom(Constants.expoConfig?.hostUri);
  if (fromExpo) {
    return `http://${fromExpo}:${API_PORT}`;
  }

  // ---------- SECOND CHOICE: ask React Native ----------
  //
  // Kept as a backup because it needs no package and still works on some
  // setups where the above does not.
  const scriptURL: string | undefined = NativeModules?.SourceCode?.scriptURL;
  const fromRN = hostFrom(scriptURL);
  if (fromRN) {
    return `http://${fromRN}:${API_PORT}`;
  }

  return `http://${FALLBACK_HOST}:${API_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

// Printed once at startup so the Metro terminal always shows which address
// the app settled on, and which of the two sources gave it. When something
// cannot connect, this is the first thing worth knowing.
if (__DEV__) {
  console.log(
    `[config] API_BASE_URL = ${API_BASE_URL}` +
      ` (hostUri=${Constants.expoConfig?.hostUri ?? "none"},` +
      ` scriptURL=${NativeModules?.SourceCode?.scriptURL ?? "none"})`
  );
}
