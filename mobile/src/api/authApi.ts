import { API_BASE_URL } from "../config";
import { AuthResponse, LoginData, SignupData } from "../types/farmer";

// Read the error message the server sent.
//
// Our Go API sends real, useful sentences like:
//   {"error": "NIC must be 9 numbers then V (like 871234567V), ..."}
//
// That message is far more helpful than "status 400", so we dig it out.
// Same helper as in readingApi.ts.
async function readServerError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string") {
      return body.error;
    }
  } catch (e) {
    // Not valid JSON. Fall through rather than hiding the first problem.
  }
  return "Server returned status " + response.status;
}

// Create a new account.
export async function signup(data: SignupData): Promise<AuthResponse> {

  const response = await fetch(`${API_BASE_URL}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  // fetch does NOT throw for 400 or 409. We must check ourselves.
  if (!response.ok) {
    throw new Error(await readServerError(response));
  }

  return response.json();
}

// Log in to an existing account.
export async function login(data: LoginData): Promise<AuthResponse> {

  const response = await fetch(`${API_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(await readServerError(response));
  }

  return response.json();
}
