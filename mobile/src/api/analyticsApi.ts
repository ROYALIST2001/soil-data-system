import { API_BASE_URL } from "../config";
import { requestJson } from "./http";
import { HistorySeries, ClusterResult } from "../types/analytics";

// A special error for "not enough data yet".
// This is NOT a crash. It is a normal situation with a clear cause.
export class NotEnoughDataError extends Error {}

// ---------- HISTORY ----------

export async function getFieldHistory(anchorId: number): Promise<HistorySeries> {
  return requestJson<HistorySeries>(
    `${API_BASE_URL}/history/field/${anchorId}`
  );
}

export async function getAreaHistory(
  lat: number,
  lng: number
): Promise<HistorySeries> {
  return requestJson<HistorySeries>(
    `${API_BASE_URL}/history/area?lat=${lat}&lng=${lng}`
  );
}

export async function getDistrictHistory(
  districtId: number
): Promise<HistorySeries> {
  return requestJson<HistorySeries>(
    `${API_BASE_URL}/history/district/${districtId}`
  );
}

// ---------- CLUSTERS ----------

// K-Means runs on the server, so allow a little longer than a plain read.
const CLUSTER_TIMEOUT_MS = 25000;

export async function getClusters(): Promise<ClusterResult> {
  try {
    return await requestJson<ClusterResult>(
      `${API_BASE_URL}/clusters`,
      undefined,
      CLUSTER_TIMEOUT_MS
    );
  } catch (e) {
    // 409 CONFLICT = not enough districts have data yet.
    // Re-throw as a SPECIAL error, so the screen can explain calmly.
    const status = (e as { status?: number }).status;
    if (status === 409) {
      throw new NotEnoughDataError((e as Error).message);
    }
    throw e;
  }
}
