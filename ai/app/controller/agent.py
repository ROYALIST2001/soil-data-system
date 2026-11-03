"""
Controller layer: the front door for the agents.
It receives the request and sends the reply. No thinking.
"""

from fastapi import APIRouter, HTTPException

from app.schema.agent import (
    QualityReviewRequest, QualityReviewResponse,
    ChatRequest, ChatResponse,
)
from app.service import quality_agent, advisory_agent
from app.client.llm_client import LLMError, is_available
from app.service.book_index import book_index
from app.service.research import SEARCH_TIERS

router = APIRouter()


@router.post("/agent/quality-review", response_model=QualityReviewResponse)
def quality_review_endpoint(request: QualityReviewRequest):
    """Ask the Data-Quality Agent to explain a flagged reading."""

    # No API key set. Say so CLEARLY, so the developer knows what to fix.
    if not is_available():
        raise HTTPException(
            status_code=503,
            detail="No LLM API key is configured. Set LLM_API_KEY in .env.",
        )

    try:
        return quality_agent.review(request)

    except LLMError as e:
        # The LLM is down, slow, or gave a bad answer.
        #
        # 503 means "Service Unavailable - try again shortly".
        # NOT 500, because the service is not BROKEN, only unavailable.
        raise HTTPException(status_code=503, detail=str(e))

    except Exception:
        # Do NOT leak the internal message. It could reveal how the
        # service is built, or in the worst case contain the API key.
        raise HTTPException(status_code=500, detail="Quality review failed.")


@router.post("/agent/chat", response_model=ChatResponse)
def chat_endpoint(request: ChatRequest):
    """
    Run one round of the Advisory Agent.

    Go drives the loop. We decide what should happen next:
    either run some tools, or give the final answer.
    """

    if not is_available():
        raise HTTPException(
            status_code=503,
            detail="No LLM API key is configured. Set LLM_API_KEY in .env.",
        )

    try:
        return advisory_agent.chat(request)

    except LLMError as e:
        raise HTTPException(status_code=503, detail=str(e))

    except Exception:
        raise HTTPException(status_code=500, detail="Chat failed.")


@router.get("/agent/status")
def agent_status():
    """
    Is the agent ready? Useful for checking your setup
    without spending an API call.
    """
    return {
        "llm_configured": is_available(),
        "books": book_index.status(),
        "search_order": ["books"] + [tier for tier, _ in SEARCH_TIERS] + ["llm_generation"],
        "note": (
            "Set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL in .env "
            "to enable the agents."
        ),
    }
