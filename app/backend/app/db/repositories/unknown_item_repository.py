from __future__ import annotations

from app.db.db_models.unknown_item_model import UnknownItem
from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession


class UnknownItemRepository:
    model = UnknownItem

    @classmethod
    async def bulk_create(cls, session: AsyncSession, items: list[UnknownItem]) -> None:
        if not items:
            return
        session.add_all(items)
        try:
            await session.commit()
        except SQLAlchemyError:
            await session.rollback()
            raise

    @classmethod
    async def list_by_session_id(
        cls, session: AsyncSession, session_id: int
    ) -> list[UnknownItem]:
        stmt = (
            select(cls.model)
            .where(cls.model.session_id == session_id)
            .order_by(cls.model.quantity.desc(), cls.model.barcode.asc())
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def delete_by_session_id(cls, session: AsyncSession, session_id: int) -> None:
        stmt = delete(cls.model).where(cls.model.session_id == session_id)
        try:
            await session.execute(stmt)
            await session.commit()
        except SQLAlchemyError:
            await session.rollback()
            raise
