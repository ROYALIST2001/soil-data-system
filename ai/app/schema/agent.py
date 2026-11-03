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


# ---------- CHAT ----------

class ChatMessage(BaseModel):
    """One message in the conversation."""
    role: str = Field(..., description="user, assistant, tool or system")
    content: Optional[str] = None

    # These are only present on tool-related messages.
    tool_calls: Optional[list] = None
    tool_call_id: Optional[str] = None


class ToolResult(BaseModel):
    """A tool result Go is sending back to us."""
    tool_call_id: str
    name: str
    content: str


class ChatRequest(BaseModel):
    """
    What Go sends us.

    NOTE: Go drives the loop. It sends the conversation so far,
    plus any tool results it has just gathered.
    """
    messages: List[ChatMessage] = Field(default_factory=list)
    tool_results: List[ToolResult] = Field(default_factory=list)


class ToolCallRequest(BaseModel):
    """The agent asking Go to run a tool."""

    id: str
    name: str


class ChatResponse(BaseModel):
    """
    What we send back.

    EITHER:
      - needs_tools = true, with a list of tools to run, OR
      - needs_tools = false, with the final answer
    """
    needs_tools: bool

    # If needs_tools is true:
    tool_calls: List[ToolCallRequest] = Field(default_factory=list)

    # If needs_tools is false:
    answer: Optional[str] = None

    # The full message list, so Go can send it back next round.
    messages: List[ChatMessage] = Field(default_factory=list)

    sources: list[dict] = Field(default_factory=list)
    research_steps: list[dict] = Field(default_factory=list)
    tools_used: list[str] = Field(default_factory=list)
