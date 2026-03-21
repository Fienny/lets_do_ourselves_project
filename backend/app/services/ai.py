"""
AI service — streams responses from OpenAI, applies the rule engine,
and yields Server-Sent Events (SSE) for the chat endpoint.
"""

from typing import AsyncIterator
from openai import AsyncOpenAI

from ..config import settings
from .rule_engine import MentorMode, get_system_prompt, apply_rules


# ─── Types ────────────────────────────────────────────────────────────────────

type ChatMessage = dict[str, str]  # {"role": "user"|"assistant", "content": "..."}


# ─── SSE helpers ─────────────────────────────────────────────────────────────

def _sse(event: str, data: str) -> str:
    """Format a Server-Sent Event string."""
    # Escape newlines in data — SSE data is line-based
    escaped = data.replace("\n", "\\n")
    return f"event: {event}\ndata: {escaped}\n\n"


# ─── Streaming ────────────────────────────────────────────────────────────────

async def stream_mentor_response(
    mode: MentorMode,
    history: list[ChatMessage],
) -> AsyncIterator[str]:
    """
    Streams the mentor's reply as SSE chunks.

    Events emitted:
      chunk   — partial text delta
      done    — stream complete (data = full response for post-processing)
      warning — rule engine detected a soft violation
      error   — something went wrong
    """
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    full_response = ""

    try:
        stream = await client.chat.completions.create(
            model=settings.openai_model,
            stream=True,
            messages=[
                {"role": "system", "content": get_system_prompt(mode)},
                *history,
            ],
            max_tokens=1024,   # Mentors are concise
            temperature=0.5,
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                full_response += delta
                yield _sse("chunk", delta)

    except Exception as exc:
        yield _sse("error", str(exc))
        return

    # ── Post-stream: apply rule engine ───────────────────────────────────────
    cleaned, violations = apply_rules(full_response, mode)

    # If the response was cleaned (code blocks removed), notify client
    if cleaned != full_response:
        # Send a replacement event so the client replaces the full message
        yield _sse("replace", cleaned)

    for v in violations:
        if v.severity == "warn":
            yield _sse("warning", f"[{v.rule}] {v.detail}")

    yield _sse("done", cleaned)
