import { NativeModules } from "react-native";

// The address of our Go API.
//
// THIS USED TO BE A HARDCODED IP, AND IT BROKE CONSTANTLY.
//
// Every time the laptop reconnected to WiFi the router handed it a new
// address, the line below went stale, and the app would hang with no error.
// It cost hours, more than once. The address was always written down in
// exactly one place and that place was always wrong.
//
// So we stop writing it down. The phone has ALREADY reached this laptop -
// that is how it downloaded the app in the first place. React Native knows
// the address it used, so we take the host from there and point the API at
// the same machine. The address can never be stale again, because it is the
// address that just worked.
//
// scriptURL looks like:
//   http://10.210.50.132:8081/index.bundle?platform=ios&dev=true
// and we want:
//   http://10.210.50.132:8080

// The port our Go API listens on. This is ours, so it is safe to fix here.
const API_PORT = 8080;

// Used only when we cannot work the address out, which in practice means a
// released build with no dev server. Keep it for that case.
const FALLBACK_HOST = "10.210.50.132";

function resolveApiBaseUrl(): string {
  // SourceCode is part of React Native itself, so this needs no extra
  // package. In Expo Go it holds the dev server URL the phone used.
  const scriptURL: string | undefined = NativeModules?.SourceCode?.scriptURL;

  if (typeof scriptURL === "string") {
    // Pull out just the host, dropping the scheme, the port and the path.
    const match = scriptURL.match(/^https?:\/\/([^/:]+)/);

    if (match && match[1]) {
      const host = match[1];

      // "localhost" means the PHONE when the app runs on a real device, so
      // it would be worse than useless. Only trust a real address.
      if (host !== "localhost" && host !== "127.0.0.1") {
        return `http://${host}:${API_PORT}`;
      }
    }
  }

  return `http://${FALLBACK_HOST}:${API_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

// Printed once at startup so the Metro terminal always shows which address
// the app settled on. When something cannot connect, this is the first
// thing worth knowing.
if (__DEV__) {
  console.log(`[config] API_BASE_URL = ${API_BASE_URL}`);
}
