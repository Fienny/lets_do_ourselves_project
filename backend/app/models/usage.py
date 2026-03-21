from sqlalchemy import Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from ..database import Base


class UsageRecord(Base):
    """One row per chat request. Used to enforce monthly quotas."""

    __tablename__ = "usage_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    mode: Mapped[str] = mapped_column(String(20))       # learn | hint | emergency
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Month bucket — "2026-03" — for fast quota queries
    month_bucket: Mapped[str] = mapped_column(String(7), index=True)
