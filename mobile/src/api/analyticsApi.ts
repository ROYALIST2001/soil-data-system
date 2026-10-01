import { API_BASE_URL } from "../config";
import { HistorySeries, ClusterResult } from "../types/analytics";

// A special error for "not enough data yet".
// This is NOT a crash. It is a normal situation with a clear cause.
export class NotEnoughDataError extends Error {}

async function readServerError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string") {
      return body.error;
    }
  } catch (e) {
    // Not valid JSON. Fall through to the default.
  }
  return "Server returned status " + response.status;
}

// ---------- HISTORY ----------

export async function getFieldHistory(anchorId: number): Promise<HistorySeries> {
  const response = await fetch(`${API_BASE_URL}/history/field/${anchorId}`);

  if (!response.ok) {
    throw new Error(await readServerError(response));
  }
  return response.json();
}

export async function getAreaHistory(
  lat: number,
  lng: number
): Promise<HistorySeries> {
  const response = await fetch(
    `${API_BASE_URL}/history/area?lat=${lat}&lng=${lng}`
  );

  if (!response.ok) {
    throw new Error(await readServerError(response));
  }
  return response.json();
}

export async function getDistrictHistory(
  districtId: number
): Promise<HistorySeries> {
  const response = await fetch(`${API_BASE_URL}/history/district/${districtId}`);

  if (!response.ok) {
    throw new Error(await readServerError(response));
  }
  return response.json();
}

// ---------- CLUSTERS ----------

export async function getClusters(): Promise<ClusterResult> {
  const response = await fetch(`${API_BASE_URL}/clusters`);

  if (!response.ok) {
    const message = await readServerError(response);

    // 409 CONFLICT = not enough districts have data yet.
    // Throw a SPECIAL error, so the screen can explain calmly.
    if (response.status === 409) {
      throw new NotEnoughDataError(message);
    }
    throw new Error(message);
  }

  return response.json();
}
