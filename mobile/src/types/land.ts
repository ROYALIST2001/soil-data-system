// One crop growing on part of one land.
export interface LandCrop {
  land_crop_id: number;
  land_id: number;
  crop: string;      // a lowercase key from vocabulary.ts, like "rice"
  size_ha: number;
  created_at: string;
}

// One piece of ground belonging to the logged-in farmer.
export interface Land {
  land_id: number;
  farmer_id: number;
  name: string;
  gn_division: string;
  size_ha: number;
  created_at: string;

  // The server always sends the crops with the land, so the screen never
  // has to make a second request to show a complete picture.
  crops: LandCrop[];
}

// ---------- WHAT WE SEND ----------

// One crop being added, before the server gives it an id.
export interface NewLandCrop {
  crop: string;
  size_ha: number;
}

// A whole land with its crops, as one request.
export interface CreateLandData {
  farmer_id: number;
  name: string;
  gn_division: string;
  size_ha: number;
  crops: NewLandCrop[];
}

// One crop being added to a land that already exists.
export interface AddCropData {
  farmer_id: number;
  crop: string;
  size_ha: number;
}

// ---------- WHAT WE GET BACK ----------

export interface LandsResponse {
  lands: Land[];
}
