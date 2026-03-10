from __future__ import annotations

from collections.abc import Iterable

from app.db.db_models.system_settings_model import SystemSetting
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class SystemSettingsRepository:
    model = SystemSetting
    _VALUE_FIELDS = (
        "value_str",
        "value_int",
        "value_bool",
        "value_float",
        "value_datetime",
        "value_json",
    )

    @classmethod
    async def get_by_name(cls, session: AsyncSession, name: str) -> SystemSetting | None:
        stmt = select(cls.model).where(cls.model.name == name).limit(1)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def get_by_names(
        cls, session: AsyncSession, names: Iterable[str]
    ) -> list[SystemSetting]:
        names_list = list(names)
        if not names_list:
            return []
        stmt = select(cls.model).where(cls.model.name.in_(names_list))
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def list_all(cls, session: AsyncSession) -> list[SystemSetting]:
        stmt = select(cls.model).order_by(cls.model.category.asc(), cls.model.name.asc())
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    def create(
        cls,
        *,
        name: str,
        category: str,
        setting_type: str,
        description: str | None,
        is_system: bool,
        value_field: str,
        value: object,
    ) -> SystemSetting:
        row = cls.model(
            name=name,
            category=category,
            setting_type=setting_type,
            description=description,
            is_system=is_system,
        )
        cls._set_value_field(row, value_field, value)
        return row

    @classmethod
    def set_typed(
        cls,
        row: SystemSetting,
        *,
        setting_type: str,
        value_field: str,
        value: object,
    ) -> None:
        row.setting_type = setting_type
        cls._set_value_field(row, value_field, value)

    @classmethod
    def _set_value_field(cls, row: SystemSetting, value_field: str, value: object) -> None:
        for field in cls._VALUE_FIELDS:
            setattr(row, field, None)
        setattr(row, value_field, value)
