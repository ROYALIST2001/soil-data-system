import { API_BASE_URL } from "../config";
import { requestJson } from "./http";

export interface CatalogDistrict {
  code: string;
  name: string;
  division_count: number;
}

export interface GNDivision {
  code: string;
  name: string;
  district_code: string;
  district: string;
  ds_division: string;
  value: string;
}

let districts: Promise<CatalogDistrict[]> | undefined;
const divisions = new Map<string, Promise<GNDivision[]>>();

export function getDistricts(): Promise<CatalogDistrict[]> {
  if (!districts) {
    districts = requestJson<{ districts: CatalogDistrict[] }>(`${API_BASE_URL}/locations/districts`)
      .then((body) => body.districts).catch((error) => { districts = undefined; throw error; });
  }
  return districts;
}

export function getGNDivisions(district: string): Promise<GNDivision[]> {
  let request = divisions.get(district);
  if (!request) {
    request = requestJson<{ divisions: GNDivision[] }>(`${API_BASE_URL}/locations/gn-divisions?district=${encodeURIComponent(district)}`)
      .then((body) => body.divisions).catch((error) => { divisions.delete(district); throw error; });
    divisions.set(district, request);
  }
  return request;
}

export function resolveGNDivision(value: string): Promise<GNDivision> {
  return requestJson<GNDivision>(`${API_BASE_URL}/locations/gn-divisions/resolve?value=${encodeURIComponent(value)}`);
}
