from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, TypeVar, overload

from app.core.config.system_settings_registry import (
    ALL_SYSTEM_SETTINGS,
    SYSTEM_SETTINGS_BY_NAME,
    SettingDef,
)
from app.db.repositories.system_settings_repository import SystemSettingsRepository
from app.infrastructure.sqlite.database import Database

T = TypeVar("T")


class SystemSettingsService:
    """Typed system settings service backed by SQLite table `system_settings`."""

    def __init__(self) -> None:
        self._settings = SYSTEM_SETTINGS_BY_NAME
        self._handlers_for_update = {
            "serial": self._validate_serial_update,
            "reports": self._validate_reports_update,
        }

    async def ensure_seed_settings(self) -> None:
        """Ensures all settings from registry are present in DB with defaults."""
        names = [item.name for item in ALL_SYSTEM_SETTINGS]
        async with Database.get_async_session() as session:
            rows = await SystemSettingsRepository.get_by_names(session, names)
            existing = {row.name for row in rows}

            for item in ALL_SYSTEM_SETTINGS:
                if item.name in existing:
                    continue
                setting_type = self._setting_type_name(item.type_)
                parsed = self._parse_input_value(item.default, item.type_)
                value_field, value = self._serialize_value(setting_type, parsed)
                row = SystemSettingsRepository.create(
                    name=item.name,
                    category=item.category,
                    setting_type=setting_type,
                    description=item.description,
                    is_system=item.is_system,
                    value_field=value_field,
                    value=value,
                )
                session.add(row)

            await session.commit()

    async def list_settings(self) -> list[dict]:
        """Returns all seeded settings with metadata and typed values."""
        await self.ensure_seed_settings()
        async with Database.get_async_session() as session:
            rows = await SystemSettingsRepository.list_all(session)
            result: list[dict] = []
            for row in rows:
                definition = self._settings.get(row.name)
                result.append(self._serialize_row(row, definition))
            return result

    async def get_setting_entry(self, name: str) -> dict:
        """Returns one setting with metadata and typed value."""
        await self.ensure_seed_settings()
        definition = self._resolve_definition(name)
        async with Database.get_async_session() as session:
            row = await SystemSettingsRepository.get_by_name(session, definition.name)
            if row is None:
                return {
                    "name": definition.name,
                    "category": definition.category,
                    "setting_type": self._setting_type_name(definition.type_),
                    "value": definition.default,
                    "default": definition.default,
                    "description": definition.description,
                    "is_system": definition.is_system,
                    "updated_at": None,
                }
            return self._serialize_row(row, definition)

    @overload
    async def get_system_setting(self, setting: SettingDef[T]) -> T: ...

    @overload
    async def get_system_setting(self, setting: str) -> Any: ...

    async def get_system_setting(self, setting):
        """Typed getter by descriptor or string key."""
        await self.ensure_seed_settings()
        definition = self._resolve_definition(setting)
        async with Database.get_async_session() as session:
            row = await SystemSettingsRepository.get_by_name(session, definition.name)
            if row is None:
                return definition.default
            return self._deserialize_row_value(row, definition.type_)

    async def get_system_settings(self, setting):
        """Backward-compatible alias for get_system_setting."""
        return await self.get_system_setting(setting)

    async def set_typed(self, name: str, value: Any) -> dict:
        """Sets one typed setting and returns serialized entry."""
        updated = await self.bulk_update({name: value})
        return updated[0]

    async def bulk_update(self, values: dict[str, Any]) -> list[dict]:
        """Atomically updates multiple settings in one transaction."""
        if not values:
            return []

        resolved: dict[str, tuple[SettingDef[Any], Any]] = {}
        by_category: dict[str, dict[str, Any]] = defaultdict(dict)

        for raw_name, raw_value in values.items():
            definition = self._resolve_definition(raw_name)
            parsed = self._parse_input_value(raw_value, definition.type_)
            resolved[definition.name] = (definition, parsed)
            by_category[definition.category][definition.name] = parsed

        for category, payload in by_category.items():
            handler = self._handlers_for_update.get(category)
            if handler:
                handler(payload)

        names = list(resolved.keys())
        async with Database.get_async_session() as session:
            rows = await SystemSettingsRepository.get_by_names(session, names)
            rows_by_name = {row.name: row for row in rows}

            for name in names:
                definition, parsed = resolved[name]
                row = rows_by_name.get(name)
                setting_type = self._setting_type_name(definition.type_)
                value_field, stored_value = self._serialize_value(setting_type, parsed)

                if row is None:
                    row = SystemSettingsRepository.create(
                        name=definition.name,
                        category=definition.category,
                        setting_type=setting_type,
                        description=definition.description,
                        is_system=definition.is_system,
                        value_field=value_field,
                        value=stored_value,
                    )
                    session.add(row)
                    rows_by_name[name] = row
                else:
                    row.category = definition.category
                    row.description = definition.description
                    row.is_system = definition.is_system
                    SystemSettingsRepository.set_typed(
                        row,
                        setting_type=setting_type,
                        value_field=value_field,
                        value=stored_value,
                    )

            await session.commit()

            refreshed = await SystemSettingsRepository.get_by_names(session, names)
            refreshed.sort(key=lambda item: names.index(item.name))
            return [
                self._serialize_row(row, self._settings.get(row.name))
                for row in refreshed
            ]

    def _resolve_definition(self, setting: str | SettingDef[Any]) -> SettingDef[Any]:
        if isinstance(setting, SettingDef):
            return setting
        definition = self._settings.get(setting)
        if definition is None:
            raise ValueError(f"Unknown system setting: {setting}")
        return definition

    @staticmethod
    def _setting_type_name(type_: type[Any]) -> str:
        if type_ is bool:
            return "bool"
        if type_ is int:
            return "int"
        if type_ is float:
            return "float"
        if type_ is str:
            return "str"
        if type_ is datetime:
            return "datetime"
        if type_ in (dict, list):
            return "json"
        raise ValueError(f"Unsupported setting type: {type_}")

    @staticmethod
    def _serialize_value(setting_type: str, value: Any) -> tuple[str, Any]:
        if setting_type == "str":
            return "value_str", str(value)
        if setting_type == "int":
            return "value_int", int(value)
        if setting_type == "bool":
            return "value_bool", bool(value)
        if setting_type == "float":
            return "value_float", float(value)
        if setting_type == "datetime":
            if not isinstance(value, datetime):
                raise ValueError("Datetime setting requires datetime value")
            return "value_datetime", value
        if setting_type == "json":
            return "value_json", json.dumps(value, ensure_ascii=False)
        raise ValueError(f"Unsupported setting type: {setting_type}")

    def _deserialize_row_value(self, row, expected_type: type[Any]) -> Any:
        setting_type = row.setting_type
        if setting_type == "str":
            return self._parse_input_value(row.value_str, expected_type)
        if setting_type == "int":
            return self._parse_input_value(row.value_int, expected_type)
        if setting_type == "bool":
            return self._parse_input_value(row.value_bool, expected_type)
        if setting_type == "float":
            return self._parse_input_value(row.value_float, expected_type)
        if setting_type == "datetime":
            return self._parse_input_value(row.value_datetime, expected_type)
        if setting_type == "json":
            parsed = None if row.value_json is None else json.loads(row.value_json)
            return self._parse_input_value(parsed, expected_type)
        raise ValueError(f"Unsupported setting type in DB: {setting_type}")

    def _serialize_row(self, row, definition: SettingDef[Any] | None) -> dict:
        expected_type = definition.type_ if definition else str
        default = definition.default if definition else None
        category = definition.category if definition else row.category
        description = definition.description if definition else (row.description or "")
        is_system = definition.is_system if definition else bool(row.is_system)

        return {
            "name": row.name,
            "category": category,
            "setting_type": row.setting_type,
            "value": self._deserialize_row_value(row, expected_type),
            "default": default,
            "description": description,
            "is_system": is_system,
            "updated_at": row.modified_at.isoformat() if row.modified_at else None,
        }

    def _parse_input_value(self, value: Any, expected_type: type[Any]) -> Any:
        if expected_type is bool:
            return self._parse_bool(value)
        if expected_type is int:
            if isinstance(value, bool):
                raise ValueError("Boolean value is not valid for int setting")
            if value is None:
                raise ValueError("Integer value is required")
            return int(value)
        if expected_type is float:
            if isinstance(value, bool):
                raise ValueError("Boolean value is not valid for float setting")
            if value is None:
                raise ValueError("Float value is required")
            return float(value)
        if expected_type is str:
            if value is None:
                raise ValueError("String value is required")
            return str(value)
        if expected_type is datetime:
            if isinstance(value, datetime):
                return value
            if isinstance(value, str):
                return datetime.fromisoformat(value)
            raise ValueError("Datetime value must be datetime or ISO string")
        if expected_type is dict:
            if isinstance(value, dict):
                return value
            raise ValueError("JSON object value must be dict")
        if expected_type is list:
            if isinstance(value, list):
                return value
            raise ValueError("JSON array value must be list")
        raise ValueError(f"Unsupported setting type: {expected_type}")

    @staticmethod
    def _parse_bool(value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            if value in (0, 1):
                return bool(value)
            raise ValueError("Boolean number must be 0 or 1")
        if isinstance(value, str):
            raw = value.strip().lower()
            if raw in {"true", "1", "yes", "on"}:
                return True
            if raw in {"false", "0", "no", "off"}:
                return False
        raise ValueError("Invalid boolean value")

    def _validate_serial_update(self, payload: dict[str, Any]) -> None:
        # Extra business validation hook for serial settings category.
        if "serial.port" in payload:
            port = str(payload["serial.port"]).strip()
            if not port:
                raise ValueError("Serial port обязателен")
        if "serial.baudrate" in payload and int(payload["serial.baudrate"]) <= 0:
            raise ValueError("Baudrate должен быть больше 0")
        if "serial.timeout" in payload and float(payload["serial.timeout"]) < 0:
            raise ValueError("Timeout не может быть отрицательным")
        if (
            "serial.reconnect_delay" in payload
            and float(payload["serial.reconnect_delay"]) < 0
        ):
            raise ValueError("Reconnect delay не может быть отрицательным")

    def _validate_reports_update(self, payload: dict[str, Any]) -> None:
        if "reports.output_dir" in payload:
            path = str(payload["reports.output_dir"]).strip()
            if not path:
                raise ValueError("Папка для отчетов обязательна")
            try:
                Path(path).expanduser().mkdir(parents=True, exist_ok=True)
            except OSError as exc:
                raise ValueError(
                    f"Не удалось создать папку для отчетов: {exc}"
                ) from exc
