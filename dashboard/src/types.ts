// The shapes the Go API sends us.
//
// These mirror api/internal/model/officer.go. When that file changes, this
// one must change with it - TypeScript cannot check across the two
// languages, so the discipline has to be ours.

export interface Account {
  farmer_id: number;
  nic: string;
  full_name: string;
  gn_division: string;
  mobile: string;
  email: string;
  role: "FARMER" | "GN_OFFICER" | "DEPT_OFFICER";
  scope_division: string | null;
}

export interface DivisionSummary {
  division: string;
  farmer_count: number;
}

export interface FarmerSummary {
  farmer_id: number;
  full_name: string;
  gn_division: string;

  // Masked to its last four characters for a department officer.
  nic: string;

  // Empty for a department officer - the server does not send them.
  mobile: string;
  email: string;

  land_count: number;
  total_hectare: number;
  reading_count: number;
  flagged_count: number;
  last_reading_at: string | null;
}

export interface ReadingRow {
  reading_id: number;
  farmer_id: number | null;
  farmer_name: string;
  gn_division: string;
  land_name: string;
  crop: string;
  stage: string;
  n: number;
  p: number;
  k: number;
  ph: number;
  area: number;
  quality_flag: string;
  agent_note: string | null;
  raw_lat: number;
  raw_lng: number;
  created_at: string;
}

export interface MapPoint {
  reading_id: number;
  raw_lat: number;
  raw_lng: number;
  quality_flag: string;
  crop: string;
  gn_division: string;
}

export interface LandCrop {
  land_crop_id: number;
  land_id: number;
  crop: string;
  size_ha: number;
}

export interface Land {
  land_id: number;
  name: string;
  gn_division: string;
  size_ha: number;
  crops: LandCrop[];
}

export interface FarmerDetail {
  farmer: FarmerSummary;
  lands: Land[];
  readings: ReadingRow[];
}

export interface Correction {
  correction_id: number;
  reading_id: number;
  officer_id: number;
  officer_name: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  reason: string;
  created_at: string;
}

export interface ReadingDetail {
  reading: ReadingRow;

  // What the farmer originally entered, kept so an officer can see exactly
  // what was changed.
  original_n: number;
  original_p: number;
  original_k: number;
  original_ph: number;

  // What the Phase 4 rules decided, separately from any human override.
  rule_flag: string;
  officer_flag: string | null;

  corrections: Correction[];
}

export interface LoginResponse {
  farmer: Account;
  token: string;
  expires_at: string;
}

// ---------- DISASTER RELIEF ----------

export interface EventRate {
  crop: string;
  rate_per_hectare: number;
}

export interface DisasterEvent {
  event_id: number;
  name: string;
  disaster_type: string;
  started_on: string;
  ended_on: string;
  description: string;
  status: "OPEN" | "CLOSED";
  declared_by: number;
  declared_by_name: string;
  declared_at: string;

  // Which Grama Niladhari divisions this disaster affected. A farmer
  // outside all of them cannot claim.
  divisions: string[];

  // Rupees per hectare, per crop. The amount is worked out from these,
  // never typed by an officer.
  rates: EventRate[];

  claim_count: number;
  total_amount: number;
}

export type ClaimStatus =
  | "SUBMITTED" | "VERIFIED" | "APPROVED" | "PAID" | "REJECTED";

export interface Claim {
  claim_id: number;
  event_id: number;
  event_name: string;

  farmer_id: number;
  farmer_name: string;
  gn_division: string;
  farmer_phone: string;

  land_id: number;
  land_name: string;
  land_crop_id: number;
  crop: string;

  // How much of that crop the farmer has registered in total, so an officer
  // can see at a glance whether somebody is asking for more than they grow.
  registered_area_ha: number;

  claimed_area_ha: number;
  verified_area_ha: number | null;
  amount_lkr: number | null;
  rate_per_hectare: number | null;

  farmer_note: string;
  status: ClaimStatus;
  created_at: string;
  updated_at: string;
}

export interface ClaimEvent {
  claim_event_id: number;
  claim_id: number;
  actor_id: number;
  actor_name: string;
  actor_role: string;
  from_status: string;
  to_status: string;
  note: string;
  created_at: string;
}

export interface ClaimDetail {
  claim: Claim;
  history: ClaimEvent[];
}
