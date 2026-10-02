from typing import List, Optional
from pydantic import BaseModel, Field


# ---------- ONE PAST READING, for context ----------
class HistoryItem(BaseModel):
    date: str
    n: float
    p: float
    k: float
    ph: float
    crop: str


# ---------- WHAT GO SENDS US ----------
class QualityReviewRequest(BaseModel):
    """A flagged reading, plus the field's history, for review."""

    # The new reading
    soil_n: float
    soil_p: float
    soil_k: float
    soil_ph: float
    crop: str
    stage: str

    # What the RULES decided. This stays authoritative.
    rule_flag: str = Field(..., description="OK, FLAGGED or QUARANTINED")

    # The field's recent GOOD readings, for context.
    # This is GROUNDING: we feed real facts so the model does not invent.
    history: List[HistoryItem] = Field(default_factory=list)


# ---------- WHAT WE SEND BACK ----------
class QualityReviewResponse(BaseModel):
    """The agent's explanation."""

    # A plain-English reason the farmer can read.
    # THIS IS THE MAIN VALUE of the agent.
    explanation: str

    # The agent's OWN opinion. We RECORD it, but the rule flag
    # still decides what is excluded from analysis.
    agent_verdict: str = Field(..., description="OK, FLAGGED or QUARANTINED")

    # Does the agent agree with the rules?
    # If not, that is useful - a human should look.
    agrees_with_rules: bool

    confidence: str = Field(..., description="low, medium or high")
