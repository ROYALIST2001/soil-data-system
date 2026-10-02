"""
Service layer: the Data-Quality Agent.

WHAT IT DOES: explains, in plain English, WHY a reading looks wrong.

IMPORTANT DESIGN DECISION:
    The RULES decide the flag. The LLM only EXPLAINS.

WHY? Because:
  - LLMs are NOT deterministic. The same reading could get
    different answers on different days.
  - Data integrity must be PREDICTABLE. Your analysis depends on it.
  - LLMs can be confidently wrong.
  - The service can be down. Then nothing would be checked.

So the agent adds VALUE (a human-readable reason) without adding RISK.
"""

from app.client import llm_client
from app.client.llm_client import LLMError
from app.schema.agent import QualityReviewRequest, QualityReviewResponse


SYSTEM_PROMPT = """You are a soil data quality reviewer for an agricultural
system in Sri Lanka.

Your job is to look at ONE new soil reading, compare it with that same
field's past readings, and explain in simple English whether it looks
believable.

AGRICULTURAL FACTS YOU SHOULD USE:
- Soil pH changes very slowly in nature, usually less than 0.5 per year.
- Adding lime raises pH. Heavy rain and some fertilizers lower it.
- A farmer changing crop may deliberately change the soil. For example,
  tea likes acidic soil but cabbage does not.
- Nutrient values jumping 10 times usually means a typing mistake,
  such as typing 400 instead of 40.
- Adding fertilizer can genuinely raise nutrient values.

STRICT RULES:
- Use ONLY the numbers given to you. NEVER invent a number.
- If there is not enough history to judge, say so honestly.
- Write for a farmer. Use simple words. No technical jargon.
- Keep the explanation to 2 or 3 short sentences.
- Reply with ONLY a JSON object. No other text before or after.

Your JSON must have exactly these fields:
{
  "explanation": "2-3 simple sentences for the farmer",
  "agent_verdict": "OK" or "FLAGGED" or "QUARANTINED",
  "confidence": "low" or "medium" or "high"
}"""


def _build_grounding(request: QualityReviewRequest) -> str:
    """
    Build the text of REAL FACTS we feed the model.

    THIS IS GROUNDING. Without it, the model would invent numbers.
    With it, the model is READING, not guessing.
    """
    lines = []

    lines.append("NEW READING:")
    lines.append(f"  Nitrogen : {request.soil_n} mg/kg")
    lines.append(f"  Phosphorus: {request.soil_p} mg/kg")
    lines.append(f"  Potassium: {request.soil_k} mg/kg")
    lines.append(f"  pH       : {request.soil_ph}")
    lines.append(f"  Crop     : {request.crop}")
    lines.append(f"  Stage    : {request.stage}")
    lines.append("")

    if not request.history:
        lines.append("PAST READINGS AT THIS FIELD: none.")
        lines.append("This is the first reading from this field.")
    else:
        lines.append("PAST READINGS AT THIS FIELD (oldest first):")
        for h in request.history:
            lines.append(
                f"  {h.date} | N {h.n} | P {h.p} | K {h.k} "
                f"| pH {h.ph} | crop {h.crop}"
            )

    lines.append("")
    lines.append(
        f"OUR AUTOMATIC RULE CHECK MARKED THIS READING AS: {request.rule_flag}"
    )
    lines.append("")
    lines.append(
        "Explain to the farmer why this reading looks the way it does, "
        "and give your own verdict."
    )

    return "\n".join(lines)


def _clean_verdict(value) -> str:
    """
    Make sure the verdict is one of our three exact words.

    NEVER trust a model's output shape. It might return
    "flagged", "Flag", or something else entirely.
    """
    if not isinstance(value, str):
        return "FLAGGED"

    upper = value.strip().upper()

    if upper in ("OK", "FLAGGED", "QUARANTINED"):
        return upper

    # Anything unexpected becomes FLAGGED - the safe middle answer.
    return "FLAGGED"


def _clean_confidence(value) -> str:
    """Same defensive check for the confidence word."""
    if not isinstance(value, str):
        return "low"

    lower = value.strip().lower()
    if lower in ("low", "medium", "high"):
        return lower

    return "low"


def review(request: QualityReviewRequest) -> QualityReviewResponse:
    """Ask the agent to explain a flagged reading."""

    # STEP 1: build the grounding text from REAL data.
    user_prompt = _build_grounding(request)

    # STEP 2 and 3: call the LLM.
    #
    # temperature=0 means the SAME reading gets the SAME answer
    # every time. Data checking must be CONSISTENT.
    # Randomness in a quality check would be a bug.
    raw = llm_client.chat(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.0,
        json_mode=True,
    )

    # STEP 4: parse the JSON, DEFENSIVELY.
    # Even in JSON mode, a model can wrap it in code fences,
    # or miss a field, or use the wrong word.
    data = llm_client.parse_json_reply(raw)

    explanation = data.get("explanation", "")
    if not isinstance(explanation, str) or not explanation.strip():
        explanation = "The system could not produce a clear explanation."

    verdict = _clean_verdict(data.get("agent_verdict"))
    confidence = _clean_confidence(data.get("confidence"))

    return QualityReviewResponse(
        explanation=explanation.strip(),
        agent_verdict=verdict,

        # Does the agent agree with the rules?
        # If not, that is USEFUL - a human should look at this reading.
        agrees_with_rules=(verdict == request.rule_flag),
        confidence=confidence,
    )
