// The fertilizer recommendation sent back by the Go API.
//
// These field names MUST match the json tags in
// api/internal/model/recommendation.go exactly.
export interface Recommendation {
  reading_id: number;

  // ---------- What the AI model predicted ----------
  // Kept for transparency, so an officer can check the chemistry.
  need_n_per_ha: number;
  need_p_per_ha: number;
  need_k_per_ha: number;

  // ---------- What to apply per hectare ----------
  urea_per_ha: number;
  dap_per_ha: number;
  mop_per_ha: number;

  // ---------- What to BUY for this whole field ----------
  // This is what the farmer takes to the shop.
  area_ha: number;
  urea_total: number;
  dap_total: number;
  mop_total: number;

  // ---------- Context ----------
  crop: string;
  stage: string;
  zone: string;
  predictor: string;

  // ---------- Notes ----------
  // Messages explaining anything unusual, for example
  // "no urea needed because DAP already supplies enough nitrogen".
  notes: string[];
}
