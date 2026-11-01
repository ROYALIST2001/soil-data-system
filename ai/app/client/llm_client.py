"""
Client layer: talks to the LLM provider.

This is the ONLY file in the project that knows about an LLM company.

PROVIDER-AGNOSTIC DESIGN:
Most providers (Groq, OpenAI, Together, OpenRouter, and even local
Ollama) speak the SAME format: OpenAI chat-completions.

So we write ONE client, and choose the provider with environment
variables. To switch companies, change three settings in .env.
NO CODE CHANGES.
"""

import os
import json
import httpx


# All settings come from the environment. Never hard-coded.
LLM_BASE_URL = (
    os.getenv("LLM_BASE_URL", "").strip() or "https://api.groq.com/openai/v1"
).rstrip("/")
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip()
LLM_MODEL = os.getenv("LLM_MODEL", "").strip() or "llama-3.1-8b-instant"

# LLMs are slower than our own model, so we allow more time.
# But we ALWAYS set a timeout. Without one, a hanging API would
# freeze the request forever.
TIMEOUT_SECONDS = 30.0


class LLMError(Exception):
    """Raised when the LLM cannot be reached or gives a bad answer."""

    pass


def is_available() -> bool:
    """
    Is an API key configured?

    We check this so the service can say clearly "no key is set",
    instead of failing mysteriously on the first request.
    """
    return bool(LLM_API_KEY and LLM_API_KEY.strip())


def _request_completion(body: dict) -> dict:
    """Send a completion request without exposing provider secrets in errors."""
    if not is_available():
        raise LLMError(
            "No LLM API key is configured. Set LLM_API_KEY in your .env file."
        )

    try:
        with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
            response = client.post(
                f"{LLM_BASE_URL}/chat/completions",
                json=body,
                headers={
                    "Authorization": f"Bearer {LLM_API_KEY}",
                    "Content-Type": "application/json",
                },
            )
    except httpx.TimeoutException:
        raise LLMError("The LLM took too long to answer.") from None
    except httpx.RequestError:
        raise LLMError("Could not reach the LLM service.") from None

    if response.status_code != 200:
        # Provider error bodies can contain part of the API key. Use only
        # known messages, including in the Go server's diagnostic logs.
        hints = {
            401: "The LLM API key was rejected or expired. Replace LLM_API_KEY "
                 "in .env and recreate the AI service.",
            403: "The LLM API key does not have access to this model.",
            404: "The LLM model or endpoint was not found. Check LLM_MODEL "
                 "and LLM_BASE_URL.",
            429: "The LLM usage limit was reached. Check API billing and "
                 "rate limits before retrying.",
        }
        hint = hints.get(response.status_code, "Please try again shortly.")
        raise LLMError(f"LLM service returned status {response.status_code}. {hint}")

    try:
        message = response.json()["choices"][0]["message"]
        if not isinstance(message, dict):
            raise ValueError("Invalid completion message")
        return message
    except (KeyError, IndexError, TypeError, ValueError):
        raise LLMError("The LLM reply was not in the expected format.") from None


def chat(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.0,
    json_mode: bool = False,
) -> str:
    """
    Send a message to the LLM and get the reply text.

    system_prompt : sets the model's ROLE and RULES
    user_prompt   : the actual question or data
    temperature   : 0 = same answer every time (use for data checking)
                    0.7 = natural conversation
    json_mode     : ask the provider to ENFORCE valid JSON output
    """

    # The OpenAI chat-completions format. Every provider above uses this.
    body = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
    }

    # JSON mode tells the provider to guarantee valid JSON.
    # Not every provider supports it, so we still parse defensively later.
    if json_mode:
        body["response_format"] = {"type": "json_object"}

    message = _request_completion(body)
    if not isinstance(message.get("content"), str):
        raise LLMError("The LLM reply was not in the expected format.")
    return message["content"]


def chat_with_tools(
    messages: list,
    tools: list,
    temperature: float = 0.3,
) -> dict:
    """
    Send a conversation WITH TOOLS and get the raw reply message.

    This is different from chat() above.

    chat()            returns TEXT
    chat_with_tools() returns the whole MESSAGE object, because the
                      reply might contain TOOL CALLS instead of text.

    Returns a dict like:
      {"role": "assistant", "content": "...", "tool_calls": [...]}
    """

    body = {
        "model": LLM_MODEL,
        "messages": messages,
        "temperature": temperature,
    }

    # Only send the tools list if we actually have tools.
    # Some providers complain about an empty list.
    if tools:
        body["tools"] = tools
        # "auto" means: the model decides whether to use a tool.
        # We do NOT force it. Sometimes plain text is the right answer.
        body["tool_choice"] = "auto"

    return _request_completion(body)


def parse_json_reply(text: str) -> dict:
    """
    Turn the model's reply into a Python dictionary.

    WHY IS THIS NEEDED?
    Even in JSON mode, a model can wrap its answer in markdown
    code fences like ```json ... ```. We strip those first.

    ALWAYS parse defensively. Never assume the model behaved.
    """
    cleaned = text.strip()

    # Remove markdown code fences if present.
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")

        # Drop the first line (```json) and the last line (```)
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        raise LLMError("The LLM did not return valid JSON.")
