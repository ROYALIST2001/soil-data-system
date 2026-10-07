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

// ---------- THE SESSION TOKEN ----------
//
// Since Phase 10 the server no longer believes the app when it says which
// farmer it is. Every request carries a token instead, and the server looks
// up who that is.
//
// The token is held HERE, in the one module every request already goes
// through, rather than being passed down through each api function. That
// means adding it was a two-line change instead of touching every call, and
// it is impossible to write a new request that forgets it.
//
// It is kept in memory only. The copy that survives closing the app lives in
// the phone's protected storage, in storage/session.ts.
let authToken: string | null = null;

// Called after login, signup, and when a saved session is restored.
export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

// Just the host and port, for error messages.
//
// WHY PUT AN ADDRESS IN A MESSAGE A FARMER MIGHT SEE?
// Because the single most common failure in this project is the laptop's
// WiFi address changing, and the message "could not reach 10.1.2.3:8080"
// says which address was tried. Without it, every network problem looks
// identical and has to be debugged from scratch. A slightly technical
// message that explains itself beats a tidy one that explains nothing.
function hostOf(url: string): string {
  const match = url.match(/^https?:\/\/([^/]+)/);
  return match ? match[1] : url;
}

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

// fetch, but it ALWAYS finishes.
//
// FIRST ATTEMPT, AND WHY IT FAILED.
// The obvious way is AbortController: start a timer, abort the request when
// it fires. That is the documented approach and it is what we tried first.
// It did nothing. The app still hung forever on a request that never
// answered. React Native's fetch did not act on the abort signal, so the
// promise never settled and the timer had no effect anybody could see.
//
// The lesson: a timeout that depends on somebody else honouring it is not a
// timeout. So we no longer depend on it.
//
// Promise.race settles as soon as EITHER side settles. The timer is ours and
// always fires, so this function always returns or throws - whatever fetch
// does or does not do. We still send the abort signal, because when it IS
// honoured it frees the socket instead of leaving it dangling. But nothing
// now depends on that.
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs: number = TIMEOUT_MS
): Promise<Response> {

  // __DEV__ is true only while running from the Expo dev server, never in a
  // release build. Printing every request here means the Metro terminal
  // shows exactly which address the app is calling - which is the fastest
  // way to spot a stale or wrong address.
  if (__DEV__) {
    console.log(`[api] ${init?.method ?? "GET"} ${url}`);
  }

  // Attach the token, if we have one.
  //
  // The headers already on the request are kept, so a caller setting
  // Content-Type does not lose it.
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string>) ?? {}),
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  init = { ...init, headers };

  const controller = new AbortController();

  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      // Best effort: ask fetch to stop. If it ignores us, the race below
      // has already rejected and the app has moved on regardless.
      try {
        controller.abort();
      } catch (e) {
        // Some runtimes have no AbortController at all. Not our problem
        // any more - the rejection below is what actually matters.
      }

      reject(
        new TimeoutError(
          `Could not reach ${hostOf(url)} within ` +
          `${Math.round(timeoutMs / 1000)} seconds. Check that Docker is ` +
          `running on the laptop and that the phone is on the same WiFi.`
        )
      );
    }, timeoutMs);
  });

  // Build the request promise separately so one failing cannot hide
  // the other.
  const request = (async () => {
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (e) {
      // A genuine network failure, as opposed to our own timeout.
      if (e instanceof TimeoutError) {
        throw e;
      }
      throw new Error(
        `Could not reach ${hostOf(url)}. Check your WiFi connection.`
      );
    }
  })();

  try {
    return await Promise.race([request, timeout]);
  } finally {
    // ALWAYS clear the timer. Left running it would keep the app awake
    // for no reason.
    if (timer !== undefined) {
      clearTimeout(timer);
    }
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
