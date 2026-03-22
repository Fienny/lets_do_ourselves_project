from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from ..services.ai import stream_mentor_response

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str) -> str:
        if v not in ("user", "assistant"):
            raise ValueError("role must be 'user' or 'assistant'")
        return v


class ChatRequest(BaseModel):
    history: list[ChatMessage]

    @field_validator("history")
    @classmethod
    def cap_history(cls, v: list) -> list:
        return v[-20:]  # last 20 messages max


@router.post("/stream")
async def chat_stream(body: ChatRequest):
    history = [{"role": m.role, "content": m.content} for m in body.history]
    return StreamingResponse(
        stream_mentor_response(history),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
