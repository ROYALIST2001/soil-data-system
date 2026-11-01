// ---------- HISTORY ----------

// One dot on the graph.
export interface HistoryPoint {
  date: string;
  n: number;
  p: number;
  k: number;
  ph: number;

  // How many readings made this point.
  // IMPORTANT: an average of 200 is trustworthy.
  // An average of 1 is not. The user must be able to tell.
  count: number;
}

// The whole graph.
export interface HistorySeries {
  level: string;   // "field", "area", or "district"
  label: string;
  total_readings: number;
  points: HistoryPoint[];
}

// ---------- CLUSTERS ----------

export interface ClusterInfo {
  cluster_id: number;
  description: string;      // plain English, e.g. "acidic, low nitrogen"
  district_count: number;
  district_names: string[];
  centre_n: number;
  centre_p: number;
  centre_k: number;
  centre_ph: number;
}

export interface KEvaluation {
  k: number;
  inertia: number;
  silhouette: number;
}

export interface ClusterResult {
  chosen_k: number;
  elbow_k: number;
  silhouette_score: number;
  quality: string;
  clusters: ClusterInfo[];
  assignments: Record<string, number>;  // district_id -> cluster_id
  evaluations: KEvaluation[];
}

// ---------- MAP ----------

// One pin on the map.
export interface MapReading {
  reading_id: number;
  lat: number;
  lng: number;
  district_id: number | null;
  ph: number;
}
