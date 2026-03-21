"""
Chat router — the main endpoint the VS Code extension talks to.

POST /chat/stream
  - Authenticated (JWT)
  - Checks monthly quota
  - Streams mentor response via SSE
  - Records usage
"""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models.usage import UsageRecord
from ..models.user import User
from ..routers.auth import get_current_user
from ..services.ai import stream_mentor_response
from ..services.rule_engine import MentorMode

router = APIRouter(prefix="/chat", tags=["chat"])


# ─── Schema ───────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str

    @field_validator("role")
    @classmethod
    def role_must_be_valid(cls, v: str) -> str:
        if v not in ("user", "assistant"):
            raise ValueError("role must be 'user' or 'assistant'")
        return v


class ChatRequest(BaseModel):
    mode: MentorMode = MentorMode.LEARN
    history: list[ChatMessage]

    @field_validator("history")
    @classmethod
    def history_length(cls, v: list) -> list:
        # Cap history to prevent token abuse — last 20 messages max
        return v[-20:]


# ─── Quota check ──────────────────────────────────────────────────────────────

def _month_bucket() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _count_this_month(db: Session, user_id: int) -> int:
    return (
        db.query(func.count(UsageRecord.id))
        .filter(UsageRecord.user_id == user_id, UsageRecord.month_bucket == _month_bucket())
        .scalar()
        or 0
    )


def _check_quota(user: User, db: Session) -> None:
    limit = (
        settings.paid_requests_per_month
        if user.is_paid
        else settings.free_requests_per_month
    )
    used = _count_this_month(db, user.id)
    if used >= limit:
        tier = "paid" if user.is_paid else "free"
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "quota_exceeded",
                "used": used,
                "limit": limit,
                "tier": tier,
                "message": (
                    f"You've used all {limit} requests this month on the {tier} plan. "
                    + ("Upgrade to continue." if not user.is_paid else "Quota resets next month.")
                ),
            },
        )


# ─── Route ────────────────────────────────────────────────────────────────────

@router.post("/stream")
async def chat_stream(
    body: ChatRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    _check_quota(current_user, db)

    # Record usage *before* streaming — prevents abuse if client disconnects
    record = UsageRecord(
        user_id=current_user.id,
        mode=body.mode.value,
        month_bucket=_month_bucket(),
    )
    db.add(record)
    db.commit()

    history = [{"role": m.role, "content": m.content} for m in body.history]

    return StreamingResponse(
        stream_mentor_response(body.mode, history),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # Disable nginx buffering
        },
    )


@router.get("/quota")
def get_quota(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    """Returns current usage and limit for the authenticated user."""
    used = _count_this_month(db, current_user.id)
    limit = (
        settings.paid_requests_per_month
        if current_user.is_paid
        else settings.free_requests_per_month
    )
    return {
        "used": used,
        "limit": limit,
        "remaining": max(0, limit - used),
        "tier": "paid" if current_user.is_paid else "free",
        "month": _month_bucket(),
    }
