import { API_BASE_URL } from "../config";
import {
  AddCropData, CreateLandData, Land, LandCrop, LandsResponse,
} from "../types/land";

// Read the real message the server sent, the same as the other api files.
async function readServerError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string") {
      return body.error;
    }
  } catch (e) {
    // Not JSON. Fall through.
  }
  return "Server returned status " + response.status;
}

// Every land this farmer owns, with the crops on each.
export async function getLands(farmerId: number): Promise<Land[]> {

  const response = await fetch(`${API_BASE_URL}/farmers/${farmerId}/lands`);

  if (!response.ok) {
    throw new Error(await readServerError(response));
  }

  const body: LandsResponse = await response.json();

  // The server sends [] for a farmer with no lands, but a missing or odd
  // body should not crash the screen either. An empty list is the safe
  // reading of "we did not get a list".
  return body.lands ?? [];
}

// Register one new land together with its crops.
export async function createLand(data: CreateLandData): Promise<Land> {

  const response = await fetch(`${API_BASE_URL}/lands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(await readServerError(response));
  }

  return response.json();
}

// Add one more crop to a land that already exists.
export async function addCrop(
  landId: number,
  data: AddCropData
): Promise<LandCrop> {

  const response = await fetch(`${API_BASE_URL}/lands/${landId}/crops`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(await readServerError(response));
  }

  return response.json();
}

// Remove a whole land, and everything growing on it.
//
// The farmer id goes in the query string because a DELETE has no body.
// Once login issues a token this argument disappears.
export async function deleteLand(
  landId: number,
  farmerId: number
): Promise<void> {

  const response = await fetch(
    `${API_BASE_URL}/lands/${landId}?farmer_id=${farmerId}`,
    { method: "DELETE" }
  );

  if (!response.ok) {
    throw new Error(await readServerError(response));
  }
}

// Remove one crop from a land.
export async function deleteCrop(
  cropId: number,
  farmerId: number
): Promise<void> {

  const response = await fetch(
    `${API_BASE_URL}/crops/${cropId}?farmer_id=${farmerId}`,
    { method: "DELETE" }
  );

  if (!response.ok) {
    throw new Error(await readServerError(response));
  }
}
