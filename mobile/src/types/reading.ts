// What we SEND to the server when creating a reading.
// Note: no id, no anchor, no district. The server makes those.
export interface NewReading {
  raw_lat: number;
  raw_lng: number;
  n: number;
  p: number;
  k: number;
  ph: number;
  crop: string;
  stage: string;
  target_yield: number;
  area: number;

  // NEW in Phase 10: who sent it, and which land and crop it came from.
  //
  // The server checks that the land really belongs to this farmer, so these
  // are not taken on trust. They are what lets an officer later ask
  // "show me this farmer's soil tests" - a question the system could not
  // answer at all before.
  farmer_id: number;
  land_id: number;
  land_crop_id: number;
}

// What the server SENDS BACK.
// "extends NewReading" means: take all the fields above, and add these.
// This saves us from typing the same 10 fields twice.
export interface Reading extends NewReading {
  reading_id: number;
  anchor_id: number | null;    // the | means "or". This can be empty.
  district_id: number | null;  // empty if the point is outside all districts
  created_at: string;
  quality_flag: string;

  // Derived by the server from the district. Not stored in the database.
  // Values: "wet", "dry", or "intermediate".
  zone: string;

  // NEW in Phase 8: what the Data-Quality Agent said.
  // These can be null - the agent only runs for flagged readings,
  // and it is optional.
  agent_note: string | null;
  agent_verdict: string | null;
}

// The small answer from POST /readings.
export interface CreateReadingResponse {
  reading_id: number;
}
