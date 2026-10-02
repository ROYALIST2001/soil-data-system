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
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.1-8b-instant")

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

    if not is_available():
        raise LLMError(
            "No LLM API key is configured. "
            "Set LLM_API_KEY in your .env file."
        )

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

    headers = {
        "Authorization": f"Bearer {LLM_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
            response = client.post(
                f"{LLM_BASE_URL}/chat/completions",
                json=body,
                headers=headers,
            )
    except httpx.TimeoutException:
        raise LLMError("The LLM took too long to answer.")

    except httpx.RequestError as e:
        raise LLMError(f"Could not reach the LLM service: {e}")

    if response.status_code != 200:
        # Do NOT include the API key in any error message.
        raise LLMError(
            f"The LLM service returned status {response.status_code}."
        )

    try:
        data = response.json()
        # The answer sits at choices[0].message.content
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError):
        raise LLMError("The LLM reply was not in the expected format.")


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
