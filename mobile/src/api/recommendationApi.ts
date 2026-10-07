import { API_BASE_URL } from "../config";
import { requestJson } from "./http";
import { Recommendation } from "../types/recommendation";

// A special error type for the "reading was flagged" case.
//
// WHY? Because 409 is not really an ERROR. The request was valid.
// The DATA just is not usable. We want a calm explanation,
// not a red crash message.
export class FlaggedReadingError extends Error {}

// Ask the Go API for the fertilizer recommendation.
//
// The model has to run, so this one gets longer than the normal wait.
const PREDICT_TIMEOUT_MS = 20000;

export async function getRecommendation(
  readingId: number
): Promise<Recommendation> {
  try {
    return await requestJson<Recommendation>(
      `${API_BASE_URL}/readings/${readingId}/recommendation`,
      undefined,
      PREDICT_TIMEOUT_MS
    );
  } catch (e) {
    // 409 CONFLICT = the reading was flagged in the quality check.
    // Re-throw as a SPECIAL error, so the screen shows a calm message.
    const status = (e as { status?: number }).status;
    if (status === 409) {
      throw new FlaggedReadingError((e as Error).message);
    }
    throw e;
  }
}
