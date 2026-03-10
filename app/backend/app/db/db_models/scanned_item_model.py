from __future__ import annotations

from app.infrastructure.sqlite.models import AppDatabaseModel, TimestampMixin
from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class ScannedItem(AppDatabaseModel, TimestampMixin):
    __tablename__ = "scanned_items"

    session_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("scan_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    barcode: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    session = relationship("ScanSession", back_populates="items")
