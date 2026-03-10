from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.sqlite.models import AppDatabaseModel, TimestampMixin


class SystemSetting(AppDatabaseModel, TimestampMixin):
    __tablename__ = "system_settings"

    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    setting_type: Mapped[str] = mapped_column(String(32), nullable=False)

    value_str: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_int: Mapped[int | None] = mapped_column(Integer, nullable=True)
    value_bool: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    value_float: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_datetime: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True
    )
    value_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
