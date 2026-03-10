from __future__ import annotations

from datetime import datetime

from app.db.db_models.scan_session_model import ScanSession
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession


class ScanSessionRepository:
    model = ScanSession

    @classmethod
    async def create(
        cls,
        session: AsyncSession,
        started_at: datetime,
        finished_at: datetime,
        total_items: int,
        total_unique: int,
        total_unknown: int,
        excel_path: str | None = None,
    ) -> ScanSession:
        scan_session = cls.model(
            started_at=started_at,
            finished_at=finished_at,
            total_items=total_items,
            total_unique=total_unique,
            total_unknown=total_unknown,
            excel_path=excel_path,
        )
        session.add(scan_session)
        try:
            await session.commit()
            await session.refresh(scan_session)
        except SQLAlchemyError:
            await session.rollback()
            raise
        return scan_session

    @classmethod
    async def list_paginated(
        cls, session: AsyncSession, limit: int, offset: int
    ) -> tuple[list[ScanSession], int]:
        total_stmt = select(func.count()).select_from(cls.model)
        total = int((await session.scalar(total_stmt)) or 0)

        stmt = (
            select(cls.model).order_by(cls.model.id.desc()).limit(limit).offset(offset)
        )
        result = await session.execute(stmt)
        return list(result.scalars().all()), total

    @classmethod
    async def get_by_id(
        cls, session: AsyncSession, session_id: int
    ) -> ScanSession | None:
        stmt = select(cls.model).where(cls.model.id == session_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def update_excel_path(
        cls, session: AsyncSession, session_id: int, excel_path: str
    ) -> ScanSession | None:
        row = await cls.get_by_id(session, session_id)
        if row is None:
            return None
        row.excel_path = excel_path
        try:
            await session.commit()
            await session.refresh(row)
        except SQLAlchemyError:
            await session.rollback()
            raise
        return row

    @classmethod
    async def update_summary(
        cls,
        session: AsyncSession,
        session_id: int,
        *,
        finished_at: datetime | None,
        total_items: int,
        total_unique: int,
        total_unknown: int,
    ) -> ScanSession | None:
        row = await cls.get_by_id(session, session_id)
        if row is None:
            return None
        row.finished_at = finished_at
        row.total_items = total_items
        row.total_unique = total_unique
        row.total_unknown = total_unknown
        try:
            await session.commit()
            await session.refresh(row)
        except SQLAlchemyError:
            await session.rollback()
            raise
        return row
