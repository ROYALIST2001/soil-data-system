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
}

// The small answer from POST /readings.
export interface CreateReadingResponse {
  reading_id: number;
}
