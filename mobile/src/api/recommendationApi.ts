import { API_BASE_URL } from "../config";
import { Recommendation } from "../types/recommendation";

// A special error type for the "reading was flagged" case.
//
// WHY? Because 409 is not really an ERROR. The request was valid.
// The DATA just is not usable. We want a calm explanation,
// not a red crash message.
export class FlaggedReadingError extends Error {}

// Read the error message the server sent.
async function readServerError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string") {
      return body.error;
    }
  } catch (e) {
    // The reply was not valid JSON. Fall through to the default.
  }
  return "Server returned status " + response.status;
}

// Ask the Go API for the fertilizer recommendation.
export async function getRecommendation(
  readingId: number
): Promise<Recommendation> {

  const response = await fetch(
    `${API_BASE_URL}/readings/${readingId}/recommendation`
  );

  if (!response.ok) {
    const message = await readServerError(response);

    // 409 CONFLICT = the reading was flagged in the quality check.
    // Throw a SPECIAL error, so the screen can show a calm message.
    if (response.status === 409) {
      throw new FlaggedReadingError(message);
    }

    throw new Error(message);
  }

  return response.json();
}
