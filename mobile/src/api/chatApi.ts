import { API_BASE_URL } from "../config";
import { postJson, requestJson } from "./http";
import { ChatRequest, ChatResponse } from "../types/chat";

// A special error for "no soil reading yet".
// NOT a crash. A normal situation with a clear cause.
export class NoReadingError extends Error {}

// The agent loop can run several rounds, each one a call to the LLM, so this
// is the slowest request in the app by far. It needs its own, longer wait.
const CHAT_TIMEOUT_MS = 60000;

// Send one message to the advisor.
export async function sendChatMessage(
  request: ChatRequest
): Promise<ChatResponse> {
  try {
    return await requestJson<ChatResponse>(
      `${API_BASE_URL}/chat`,
      postJson(request),
      CHAT_TIMEOUT_MS
    );
  } catch (e) {
    // 409 CONFLICT = no soil reading selected yet.
    const status = (e as { status?: number }).status;
    if (status === 409) {
      throw new NoReadingError((e as Error).message);
    }
    throw e;
  }
}
