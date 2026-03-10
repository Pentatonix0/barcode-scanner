from __future__ import annotations

from datetime import datetime

from app.infrastructure.sqlite.models import AppDatabaseModel, TimestampMixin
from sqlalchemy import DateTime, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship


class ScanSession(AppDatabaseModel, TimestampMixin):
    __tablename__ = "scan_sessions"

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    total_items: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_unique: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_unknown: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    excel_path: Mapped[str | None] = mapped_column(Text, nullable=True)

    items = relationship(
        "ScannedItem", back_populates="session", cascade="all, delete-orphan"
    )
    unknown_items = relationship(
        "UnknownItem", back_populates="session", cascade="all, delete-orphan"
    )
