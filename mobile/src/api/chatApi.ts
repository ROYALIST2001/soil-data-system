import { API_BASE_URL } from "../config";
import { ChatRequest, ChatResponse } from "../types/chat";

// A special error for "no soil reading yet".
// NOT a crash. A normal situation with a clear cause.
export class NoReadingError extends Error {}

async function readServerError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string") {
      return body.error;
    }
  } catch (e) {
    // Not valid JSON. Fall through.
  }
  return "Server returned status " + response.status;
}

// Send one message to the advisor.
export async function sendChatMessage(
  request: ChatRequest
): Promise<ChatResponse> {

  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const message = await readServerError(response);

    // 409 CONFLICT = no soil reading selected yet.
    if (response.status === 409) {
      throw new NoReadingError(message);
    }

    throw new Error(message);
  }

  return response.json();
}
