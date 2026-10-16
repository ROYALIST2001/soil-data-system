import { API_BASE_URL } from "../config";
import { postJson, requestJson } from "./http";
import { Claim, DisasterEvent, NewClaim } from "../types/relief";

// Which disasters can this farmer claim against right now?
//
// The server returns only OPEN disasters covering their own division, so the
// app never has to work out whether a claim is allowed - if it is in this
// list, it is.
export async function getOpenDisasters(
  farmerId: number
): Promise<DisasterEvent[]> {
  const body = await requestJson<{ disasters: DisasterEvent[] }>(
    `${API_BASE_URL}/farmers/${farmerId}/disasters`
  );
  return body.disasters ?? [];
}

// Every claim this farmer has made, newest first.
export async function getMyClaims(farmerId: number): Promise<Claim[]> {
  const body = await requestJson<{ claims: Claim[] }>(
    `${API_BASE_URL}/farmers/${farmerId}/claims`
  );
  return body.claims ?? [];
}

// Ask for compensation for one crop.
export async function submitClaim(claim: NewClaim): Promise<Claim> {
  return requestJson<Claim>(`${API_BASE_URL}/claims`, postJson(claim));
}
