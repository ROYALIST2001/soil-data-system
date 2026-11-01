import { API_BASE_URL } from "../config";
import { postJson, requestJson, requestNoBody } from "./http";
import {
  AddCropData, CreateLandData, Land, LandCrop, LandsResponse,
} from "../types/land";

// Every land this farmer owns, with the crops on each.
export async function getLands(farmerId: number): Promise<Land[]> {
  const body = await requestJson<LandsResponse>(
    `${API_BASE_URL}/farmers/${farmerId}/lands`
  );

  // The server sends [] for a farmer with no lands, but a missing or odd
  // body should not crash the screen either. An empty list is the safe
  // reading of "we did not get a list".
  return body.lands ?? [];
}

// Register one new land together with its crops.
export async function createLand(data: CreateLandData): Promise<Land> {
  return requestJson<Land>(`${API_BASE_URL}/lands`, postJson(data));
}

// Add one more crop to a land that already exists.
export async function addCrop(
  landId: number,
  data: AddCropData
): Promise<LandCrop> {
  return requestJson<LandCrop>(
    `${API_BASE_URL}/lands/${landId}/crops`,
    postJson(data)
  );
}

// Remove a whole land, and everything growing on it.
//
// The farmer id goes in the query string because a DELETE has no body.
// Once login issues a token this argument disappears.
export async function deleteLand(
  landId: number,
  farmerId: number
): Promise<void> {
  return requestNoBody(
    `${API_BASE_URL}/lands/${landId}?farmer_id=${farmerId}`,
    { method: "DELETE" }
  );
}

// Remove one crop from a land.
export async function deleteCrop(
  cropId: number,
  farmerId: number
): Promise<void> {
  return requestNoBody(
    `${API_BASE_URL}/crops/${cropId}?farmer_id=${farmerId}`,
    { method: "DELETE" }
  );
}
