from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import Boolean, DateTime, Integer, MetaData, func
from sqlalchemy.ext.declarative import declared_attr
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

metadata = MetaData()


class Base(DeclarativeBase):
    metadata = metadata
    __abstract__ = True


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        default=func.now(),
        nullable=False,
    )

    modified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    deleted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True,
    )

    @hybrid_property
    def is_active(self) -> bool:
        return not self.deleted

    @hybrid_property
    def is_deleted(self) -> bool:
        return self.deleted


class AppDatabaseModel(Base):
    __abstract__ = True

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    @declared_attr
    def __tablename__(cls) -> str:
        return cls.__name__.lower()

    def to_dict(
        self,
        exclude: Optional[List[str]] = None,
        include_relations: bool = False,
        exclude_none: bool = False,
    ) -> Dict[str, Any]:
        exclude = exclude or []
        result: Dict[str, Any] = {}

        for column in self.__table__.columns:
            if column.name in exclude:
                continue

            value = getattr(self, column.name, None)
            if exclude_none and value is None:
                continue

            if isinstance(value, datetime):
                value = value.isoformat()

            result[column.name] = value

        return result

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(id={self.id})>"


__all__ = [
    "Base",
    "AppDatabaseModel",
    "TimestampMixin",
    "SoftDeleteMixin",
    "metadata",
]
