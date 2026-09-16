import { API_BASE_URL } from "../config";
import { NewReading, Reading, CreateReadingResponse } from "../types/reading";

// Send a new reading to the API. Returns the new reading id.
// Promise<...> means the answer arrives later, not immediately.
export async function createReading(
  reading: NewReading
): Promise<CreateReadingResponse> {

  const response = await fetch(`${API_BASE_URL}/readings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }, // tell the server we send JSON
    body: JSON.stringify(reading),                   // turn the object into JSON text
  });

  // IMPORTANT TRAP: fetch does NOT throw an error for 404 or 500.
  // It only throws when the network itself fails.
  // So we must check the status ourselves.
  // response.ok is true only for status 200 to 299.
  if (!response.ok) {
    throw new Error("Server returned status " + response.status);
  }

  // Turn the JSON text back into an object.
  return response.json();
}

// Read one full reading from the API, using its id.
export async function getReading(id: number): Promise<Reading> {

  const response = await fetch(`${API_BASE_URL}/readings/${id}`);

  if (!response.ok) {
    throw new Error("Server returned status " + response.status);
  }

  return response.json();
}
