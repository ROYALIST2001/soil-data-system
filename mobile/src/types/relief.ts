// What the government is paying, per crop, per hectare lost.
export interface EventRate {
  crop: string;
  rate_per_hectare: number;
}

// One declared disaster the farmer may claim against.
//
// A farmer only ever sees disasters that are OPEN and that affected their
// own Grama Niladhari division - the server decides that, not the app.
export interface DisasterEvent {
  event_id: number;
  name: string;
  disaster_type: string;
  started_on: string;
  ended_on: string;
  description: string;
  status: string;
  divisions: string[];
  rates: EventRate[];
}

export type ClaimStatus =
  | "SUBMITTED" | "VERIFIED" | "APPROVED" | "PAID" | "REJECTED";

// One claim the farmer has made.
export interface Claim {
  claim_id: number;
  event_id: number;
  event_name: string;

  farmer_id: number;
  land_id: number;
  land_name: string;
  land_crop_id: number;
  crop: string;

  registered_area_ha: number;
  claimed_area_ha: number;

  // What the officer confirmed after looking. null until they have been.
  verified_area_ha: number | null;

  // The money. null until the department approves.
  amount_lkr: number | null;
  rate_per_hectare: number | null;

  farmer_note: string;
  status: ClaimStatus;
  created_at: string;
  updated_at: string;
}

// What we SEND to make a claim.
export interface NewClaim {
  farmer_id: number;
  event_id: number;
  land_crop_id: number;
  claimed_area_ha: number;
  farmer_note: string;
}
