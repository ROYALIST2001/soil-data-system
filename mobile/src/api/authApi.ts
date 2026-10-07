import { API_BASE_URL } from "../config";
import { postJson, requestJson } from "./http";
import { AuthResponse, LoginData, SignupData } from "../types/farmer";

// Create a new account.
export async function signup(data: SignupData): Promise<AuthResponse> {
  return requestJson<AuthResponse>(
    `${API_BASE_URL}/signup`,
    postJson(data)
  );
}

// Log in to an existing account.
export async function login(data: LoginData): Promise<AuthResponse> {
  return requestJson<AuthResponse>(
    `${API_BASE_URL}/login`,
    postJson(data)
  );
}
