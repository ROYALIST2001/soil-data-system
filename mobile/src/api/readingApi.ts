import { API_BASE_URL } from "../config";
import { postJson, requestJson } from "./http";
import { NewReading, Reading, CreateReadingResponse } from "../types/reading";

// Send a new reading to the API. Returns the new reading id.
export async function createReading(
  reading: NewReading
): Promise<CreateReadingResponse> {
  return requestJson<CreateReadingResponse>(
    `${API_BASE_URL}/readings`,
    postJson(reading)
  );
}

// The farmer's most recent reading, or null if they have never submitted one.
//
// WHY THE APP NEEDS THIS.
// Trends draws the history of ONE field and has to know which. It used to
// learn that only from a reading submitted during the current session, so a
// farmer with months of history who had just logged in was told "No
// readings yet" - the data existed, the screen just could not find it.
//
// A 404 here is NORMAL: it means somebody who has not tested their soil
// yet. That is why it returns null rather than throwing.
export async function getLatestReading(
  farmerId: number
): Promise<Reading | null> {
  try {
    return await requestJson<Reading>(
      `${API_BASE_URL}/farmers/${farmerId}/readings/latest`
    );
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 404) {
      return null;
    }
    // A real failure - no network, server down - is not the same as "none
    // yet", so it travels on rather than being swallowed.
    throw e;
  }
}

// Read one full reading from the API, using its id.
export async function getReading(id: number): Promise<Reading> {
  return requestJson<Reading>(`${API_BASE_URL}/readings/${id}`);
}
