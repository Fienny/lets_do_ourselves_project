"""
AI service — streams the mentor's response from OpenAI as Server-Sent Events.
"""

from typing import AsyncIterator
from openai import AsyncOpenAI

from ..config import settings
from .rule_engine import SYSTEM_PROMPT, apply_rules

type ChatMessage = dict[str, str]


def _sse(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data.replace(chr(10), chr(92) + 'n')}\n\n"


async def stream_mentor_response(history: list[ChatMessage]) -> AsyncIterator[str]:
    """
    Streams the mentor's reply as SSE.

    Events:
      chunk    — text delta
      replace  — rule engine redacted the response; data = cleaned full text
      done     — stream finished; data = final full text
      error    — something went wrong
    """
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    full_response = ""

    try:
        stream = await client.chat.completions.create(
            model=settings.openai_model,
            stream=True,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                *history,
            ],
            max_tokens=1024,
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

    cleaned, violations = apply_rules(full_response)

    if cleaned != full_response:
        yield _sse("replace", cleaned)

    yield _sse("done", cleaned)
