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

// Read one full reading from the API, using its id.
export async function getReading(id: number): Promise<Reading> {
  return requestJson<Reading>(`${API_BASE_URL}/readings/${id}`);
}
