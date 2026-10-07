// ONE place that actually talks to the network.
//
// WHY THIS FILE EXISTS.
// React Native's fetch has NO TIMEOUT. If the server address is wrong, or
// the phone is on a different WiFi, or the laptop has gone to sleep, the
// request does not fail - it just hangs. Forever.
//
// We learned this the hard way: a spinner that never stopped, with no error
// message, and nothing in any log. From the outside it looked like a broken
// app. The request had simply gone to an address that no longer existed.
//
// A hang with no feedback is worse than an error. An error tells you what to
// fix. So every request in this app goes through here, and every request
// gives up after a set time and says something useful.

// How long to wait before giving up.
//
// 12 seconds is chosen for a farmer on a phone: long enough for a slow
// mobile connection and a cold server, short enough that nobody sits
// staring at a spinner wondering whether the app is broken.
const TIMEOUT_MS = 12000;

// Raised when the request ran out of time.
export class TimeoutError extends Error {}

// Read the error message the server sent.
//
// Our Go API sends real sentences like:
//   {"error": "NIC must be 9 numbers then V (like 871234567V), ..."}
//
// That is far more useful than "status 400", so we dig it out.
export async function readServerError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string") {
      return body.error;
    }
  } catch (e) {
    // Not valid JSON. Maybe the server crashed badly. Do not let this
    // second problem hide the first one - fall through.
  }
  return "Server returned status " + response.status;
}

// fetch, but it always finishes.
//
// AbortController is the standard way to stop a request. We start a timer,
// and if it fires first we abort, which makes fetch reject.
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs: number = TIMEOUT_MS
): Promise<Response> {

  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });

  } catch (e) {
    // An abort and a real network failure both land here, and they need
    // DIFFERENT messages, because the farmer has to do different things.
    //
    // Timed out  -> the address is probably wrong, or the server is not up.
    // Failed     -> the phone could not reach the network at all.
    if (controller.signal.aborted) {
      throw new TimeoutError(
        "The server did not answer in time. Check that your laptop is " +
        "running and that the phone is on the same WiFi."
      );
    }

    throw new Error(
      "Could not reach the server. Check your WiFi connection."
    );

  } finally {
    // ALWAYS clear the timer, on success and on failure. A timer left
    // running would fire later and abort nothing, but it keeps the app
    // awake for no reason.
    clearTimeout(timer);
  }
}

// The common case: send and receive JSON, or throw a useful error.
export async function requestJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs?: number
): Promise<T> {

  const response = await fetchWithTimeout(url, init, timeoutMs);

  // Remember: fetch does NOT throw for 400 or 500. We must check.
  if (!response.ok) {
    const message = await readServerError(response);

    // Attach the status so a caller can treat one code specially, the way
    // the chat screen treats 409 as "no reading yet" rather than an error.
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return response.json();
}

// For requests that return nothing useful, like DELETE.
export async function requestNoBody(
  url: string,
  init?: RequestInit,
  timeoutMs?: number
): Promise<void> {

  const response = await fetchWithTimeout(url, init, timeoutMs);

  if (!response.ok) {
    const message = await readServerError(response);
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
}

// A plain POST of JSON. Used by nearly every write in the app.
export function postJson(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
