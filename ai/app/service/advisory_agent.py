"""
Service layer: the Farmer Advisory Agent.

THE AGENT LOOP:
    think -> act -> observe -> repeat

But WE only do the THINKING. GO does the ACTING.

WHY? Because Go owns the database. We would have to call back into
Go for every tool, which is slow and creates a circular dependency.

So: Go drives the loop. We decide what should happen next.
"""

import json

from app.client import llm_client
from app.client.llm_client import LLMError
from app.service.tools import TOOL_DEFINITIONS, VALID_TOOL_NAMES
from app.schema.agent import (
    ChatRequest, ChatResponse, ChatMessage, ToolCallRequest,
)


# How many messages of history we keep.
#
# WHY LIMIT IT? Because every message costs tokens (money and time),
# and the model gets worse at finding what matters in a huge wall of text.
#
# LIMITATION FOR YOUR REPORT: a production system would SUMMARISE old
# messages instead of dropping them.
MAX_HISTORY = 12


SYSTEM_PROMPT = """You are a friendly soil and fertilizer advisor for
farmers in Sri Lanka.

HOW TO USE YOUR TOOLS:
- You have tools that read this farmer's REAL data from the system.
- ALWAYS use a tool before answering anything about THIS farmer's field,
  soil, or fertilizer. Do not guess.
- You may use several tools in one answer if you need to.
- For general farming knowledge questions you do not need a tool.

STRICT RULES:
- NEVER invent a number. If a tool did not give you a number, say you
  do not have that information.
- If a tool says there is no data, tell the farmer honestly and suggest
  they submit a soil test.
- Do NOT give medical advice. If asked about health or chemical exposure,
  tell them to contact a doctor or agricultural officer.
- Do NOT promise income or yield amounts.
- Stay on the topic of soil, crops and fertilizer.

HOW TO WRITE:
- Simple English. Short sentences. A farmer with basic schooling
  should understand you.
- 2 to 4 sentences normally. Longer only if they asked for detail.
- Be warm and practical. Say what to DO, not just what is wrong.
- Use kilograms and hectares."""


def _trim_history(messages: list) -> list:
    """
    Keep the conversation from growing forever.

    We always keep the system prompt (first message), then the most
    recent MAX_HISTORY messages.
    """
    if len(messages) <= MAX_HISTORY + 1:
        return messages

    # Keep the first (system) message, then the last MAX_HISTORY.
    return [messages[0]] + messages[-MAX_HISTORY:]


def _to_dict(message: ChatMessage) -> dict:
    """Turn our schema object into the plain dict the LLM API wants."""
    result = {"role": message.role}

    # content can be None on a tool-call message, but the API
    # still expects the key to exist.
    result["content"] = message.content if message.content is not None else ""

    if message.tool_calls:
        result["tool_calls"] = message.tool_calls
    if message.tool_call_id:
        result["tool_call_id"] = message.tool_call_id

    return result


def _to_schema(raw: dict) -> ChatMessage:
    """Turn a plain dict from the LLM API back into our schema object."""
    return ChatMessage(
        role=raw.get("role", "assistant"),
        content=raw.get("content"),
        tool_calls=raw.get("tool_calls"),
        tool_call_id=raw.get("tool_call_id"),
    )


def chat(request: ChatRequest) -> ChatResponse:
    """
    Run ONE round of the agent loop.

    Returns EITHER:
      - needs_tools = true, with the tools Go should run, OR
      - needs_tools = false, with the final answer
    """

    # ---------- STEP 1: build the message list ----------
    messages = [_to_dict(m) for m in request.messages]

    # If this is a new conversation, add the system prompt.
    if not messages or messages[0].get("role") != "system":
        messages.insert(0, {"role": "system", "content": SYSTEM_PROMPT})

    # ---------- STEP 2: add any tool results Go just gathered ----------
    #
    # THE tool_call_id MUST MATCH. That is how the LLM knows which
    # answer belongs to which question it asked.
    for result in request.tool_results:
        messages.append({
            "role": "tool",
            "tool_call_id": result.tool_call_id,
            "content": result.content,
        })

    messages = _trim_history(messages)

    # ---------- STEP 3: ask the LLM what to do ----------
    #
    # temperature 0.3: natural, but still focused and factual.
    # We stay LOW because this is advice about a real farm.
    # Creativity is not a virtue here.
    raw_reply = llm_client.chat_with_tools(
        messages=messages,
        tools=TOOL_DEFINITIONS,
        temperature=0.3,
    )

    messages.append(raw_reply)

    # ---------- STEP 4: did it ask for tools? ----------
    tool_calls = raw_reply.get("tool_calls")

    if tool_calls:
        wanted = []

        for call in tool_calls:
            name = call.get("function", {}).get("name", "")

            # CHECK THE TOOL IS REAL.
            # A model can invent a tool name that does not exist.
            # Never trust the output without checking.
            if name not in VALID_TOOL_NAMES:
                continue

            wanted.append(ToolCallRequest(
                id=call.get("id", ""),
                name=name,
            ))

        if wanted:
            return ChatResponse(
                needs_tools=True,
                tool_calls=wanted,
                messages=[_to_schema(m) for m in messages],
            )

    # ---------- STEP 5: no tools. This is the final answer. ----------
    answer = raw_reply.get("content") or ""

    if not answer.strip():
        answer = (
            "I could not work out an answer. "
            "Please try asking the question a different way."
        )

    return ChatResponse(
        needs_tools=False,
        answer=answer.strip(),
        messages=[_to_schema(m) for m in messages],
    )
