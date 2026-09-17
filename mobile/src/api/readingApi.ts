import { API_BASE_URL } from "../config";
import { NewReading, Reading, CreateReadingResponse } from "../types/reading";

// Read the error message that the server sent.
//
// Our Go API sends helpful messages like:
//   {"error": "pH must be between 0 and 14 (you sent 99.00)"}
//
// We want to show THAT to the farmer, not just "status 400".
async function readServerError(response: Response): Promise<string> {
  try {
    const body = await response.json();

    // Does the body have an "error" field with text in it?
    if (body && typeof body.error === "string") {
      return body.error;
    }
  } catch (e) {
    // The reply was not valid JSON. Maybe the server crashed badly.
    // Do not let this second error hide the first one. Fall through.
  }

  // Fallback, if we could not read a proper message.
  return "Server returned status " + response.status;
}

// Send a new reading to the API. Returns the new reading id.
export async function createReading(
  reading: NewReading
): Promise<CreateReadingResponse> {

  const response = await fetch(`${API_BASE_URL}/readings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reading),
  });

  // Remember: fetch does NOT throw for 400 or 500. We must check.
  if (!response.ok) {
    // CHANGED: read the real message instead of throwing it away.
    const message = await readServerError(response);
    throw new Error(message);
  }

  return response.json();
}

// Read one full reading from the API, using its id.
export async function getReading(id: number): Promise<Reading> {

  const response = await fetch(`${API_BASE_URL}/readings/${id}`);

  if (!response.ok) {
    const message = await readServerError(response);
    throw new Error(message);
  }

  return response.json();
}
