// What the government pays per hectare, per crop, in one round.
export interface SubsidyRate {
  crop: string;
  rate_per_hectare: number;
}

// One announced subsidy round the farmer may apply to.
//
// A farmer only ever sees rounds that are OPEN and that cover their own
// Grama Niladhari division - the server decides that, not the app.
export interface SubsidyRound {
  round_id: number;
  name: string;
  season: string;
  opens_on: string;
  closes_on: string;
  description: string;
  status: string;
  divisions: string[];
  rates: SubsidyRate[];
}

export type SubsidyStatus =
  | "SUBMITTED" | "APPROVED" | "SENT"
  | "RECEIVED" | "DISPUTED" | "RESOLVED" | "REJECTED";

// One application the farmer has made.
export interface SubsidyApplication {
  application_id: number;
  round_id: number;
  round_name: string;
  season: string;

  farmer_id: number;
  land_id: number;
  land_name: string;
  land_crop_id: number;
  crop: string;

  area_ha: number;

  // The money. null until the division officer approves.
  amount_lkr: number | null;
  rate_per_hectare: number | null;

  farmer_note: string;
  status: SubsidyStatus;
  created_at: string;
  updated_at: string;
}

export interface SubsidyEvent {
  subsidy_event_id: number;
  actor_name: string;
  actor_role: string;
  from_status: string;
  to_status: string;
  note: string;
  created_at: string;
}

export interface SubsidyDetail {
  application: SubsidyApplication;
  history: SubsidyEvent[];
}

// What we SEND to apply.
export interface NewSubsidyApplication {
  farmer_id: number;
  round_id: number;
  land_crop_id: number;
  farmer_note: string;
}
