import type {
  Account, Claim, ClaimDetail, DisasterEvent, DivisionSummary, EventRate,
  FarmerDetail, FarmerSummary, LoginResponse, MapPoint, ReadingDetail,
  ReadingRow, SubsidyApplication, SubsidyDetail, SubsidyRate, SubsidyRound,
} from "./types";

// Where the Go API lives.
//
// Unlike the phone app, this one can safely say "localhost": the dashboard
// runs in a browser ON the same machine as the API, so localhost means the
// right computer. The phone could never use localhost, because to a phone it
// means the phone.
//
// If an officer opens this from another computer, set VITE_API_URL when
// starting Vite and it will use that instead.
const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:8080";

// How long we wait before giving up on a request.
//
// The phone app learned this the hard way: fetch has no timeout of its own,
// so a request to an address that is not listening hangs forever and the
// screen spins with no error. The same mistake is not worth making twice.
const TIMEOUT_MS = 12000;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// ---------- THE TOKEN ----------
//
// Held here, in the one module every request goes through, so no call can
// forget to send it.
//
// It is also written to localStorage so a page refresh does not log the
// officer out. localStorage is readable by any script on this origin, which
// is a real trade-off - but the alternative, logging in again on every
// refresh, is the kind of friction that makes people write passwords down.
const TOKEN_KEY = "soil_officer_token";

let authToken: string | null = localStorage.getItem(TOKEN_KEY);

export function setToken(token: string | null): void {
  authToken = token;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function hasToken(): boolean {
  return authToken !== null;
}

// Read the real message the server sent, rather than showing a bare number.
async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Not JSON. Fall through.
  }
  return `Server returned status ${response.status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string>) ?? {}),
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new ApiError(
        `The server at ${API_BASE_URL} did not answer in time. ` +
        `Check that Docker is running.`,
        0
      );
    }
    throw new ApiError(
      `Could not reach ${API_BASE_URL}. Check that the API is running.`,
      0
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const message = await readError(response);

    // 401 means the token is gone or expired. Clear it, so the app shows the
    // login screen instead of retrying forever with something that will
    // never work again.
    if (response.status === 401) {
      setToken(null);
    }

    throw new ApiError(message, response.status);
  }

  return response.json();
}

// ---------- CALLS ----------

export async function login(
  nic: string,
  password: string
): Promise<LoginResponse> {
  return request<LoginResponse>("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nic, password }),
  });
}

export async function getMe(): Promise<Account> {
  const body = await request<{ account: Account }>("/officer/me");
  return body.account;
}

export async function getDivisions(): Promise<DivisionSummary[]> {
  const body = await request<{ divisions: DivisionSummary[] }>(
    "/officer/divisions"
  );
  return body.divisions ?? [];
}

export async function getFarmers(division: string): Promise<FarmerSummary[]> {
  const query = division ? `?division=${encodeURIComponent(division)}` : "";
  const body = await request<{ farmers: FarmerSummary[] }>(
    `/officer/farmers${query}`
  );
  return body.farmers ?? [];
}

export async function getFarmer(farmerId: number): Promise<FarmerDetail> {
  return request<FarmerDetail>(`/officer/farmers/${farmerId}`);
}

export async function getReadings(
  division: string,
  flag: string
): Promise<ReadingRow[]> {
  const params = new URLSearchParams();
  if (division) params.set("division", division);
  if (flag) params.set("flag", flag);

  const query = params.toString() ? `?${params.toString()}` : "";
  const body = await request<{ readings: ReadingRow[] }>(
    `/officer/readings${query}`
  );
  return body.readings ?? [];
}

export async function getMapPoints(division: string): Promise<MapPoint[]> {
  const query = division ? `?division=${encodeURIComponent(division)}` : "";
  const body = await request<{ points: MapPoint[] }>(
    `/officer/map/readings${query}`
  );
  return body.points ?? [];
}

export async function getReading(readingId: number): Promise<ReadingDetail> {
  return request<ReadingDetail>(`/officer/readings/${readingId}`);
}

export async function correctReading(
  readingId: number,
  values: { n?: number; p?: number; k?: number; ph?: number },
  reason: string
): Promise<ReadingDetail> {
  return request<ReadingDetail>(`/officer/readings/${readingId}/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...values, reason }),
  });
}

export async function flagReading(
  readingId: number,
  flag: string,
  reason: string
): Promise<ReadingDetail> {
  return request<ReadingDetail>(`/officer/readings/${readingId}/flag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flag, reason }),
  });
}

export async function logout(): Promise<void> {
  try {
    await request("/logout", { method: "POST" });
  } catch {
    // The server may already have forgotten us. Either way we are logging
    // out locally, so this must never block.
  }
  setToken(null);
}

// ---------- DISASTER RELIEF ----------

export async function getDisasters(): Promise<DisasterEvent[]> {
  const body = await request<{ disasters: DisasterEvent[] }>(
    "/officer/disasters"
  );
  return body.disasters ?? [];
}

export async function declareDisaster(event: {
  name: string;
  disaster_type: string;
  started_on: string;
  ended_on: string;
  description: string;
  divisions: string[];
  rates: EventRate[];
}): Promise<DisasterEvent> {
  return request<DisasterEvent>("/officer/disasters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
}

export async function closeDisaster(eventId: number): Promise<void> {
  await request(`/officer/disasters/${eventId}/close`, { method: "POST" });
}

export async function getClaims(
  status: string,
  eventId?: number
): Promise<Claim[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (eventId) params.set("event", String(eventId));

  const query = params.toString() ? `?${params.toString()}` : "";
  const body = await request<{ claims: Claim[] }>(`/officer/claims${query}`);
  return body.claims ?? [];
}

export async function getClaim(claimId: number): Promise<ClaimDetail> {
  return request<ClaimDetail>(`/officer/claims/${claimId}`);
}

// One function for all four steps.
//
// Verify, approve, reject and pay differ only in the word in the URL and
// whether an area travels with them. Four near-identical functions would be
// four places for one to drift.
export async function claimStep(
  claimId: number,
  step: "verify" | "approve" | "reject" | "pay",
  body: { note: string; verified_area_ha?: number }
): Promise<ClaimDetail> {
  return request<ClaimDetail>(`/officer/claims/${claimId}/${step}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------- FERTILIZER SUBSIDY ----------

export async function getSubsidyRounds(): Promise<SubsidyRound[]> {
  const body = await request<{ rounds: SubsidyRound[] }>(
    "/officer/subsidy-rounds"
  );
  return body.rounds ?? [];
}

export async function declareSubsidyRound(round: {
  name: string;
  season: string;
  opens_on: string;
  closes_on: string;
  description: string;
  divisions: string[];
  rates: SubsidyRate[];
}): Promise<SubsidyRound> {
  return request<SubsidyRound>("/officer/subsidy-rounds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(round),
  });
}

export async function closeSubsidyRound(roundId: number): Promise<void> {
  await request(`/officer/subsidy-rounds/${roundId}/close`, {
    method: "POST",
  });
}

export async function getSubsidies(
  status: string,
  roundId?: number
): Promise<SubsidyApplication[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (roundId) params.set("round", String(roundId));

  const query = params.toString() ? `?${params.toString()}` : "";
  const body = await request<{ applications: SubsidyApplication[] }>(
    `/officer/subsidies${query}`
  );
  return body.applications ?? [];
}

export async function getSubsidy(
  applicationId: number
): Promise<SubsidyDetail> {
  return request<SubsidyDetail>(`/officer/subsidies/${applicationId}`);
}

// One function for all four officer steps. They differ only in the word in
// the URL, so four near-identical functions would be four places for one to
// drift.
export async function subsidyStep(
  applicationId: number,
  step: "approve" | "send" | "reject" | "resolve",
  note: string
): Promise<SubsidyDetail> {
  return request<SubsidyDetail>(
    `/officer/subsidies/${applicationId}/${step}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    }
  );
}
