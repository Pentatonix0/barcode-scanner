from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SystemSettingValueDto(BaseModel):
    name: str
    category: str
    setting_type: str
    value: Any
    default: Any = None
    description: str = ""
    is_system: bool
    updated_at: str | None


class SystemSettingsListDto(BaseModel):
    items: list[SystemSettingValueDto] = Field(default_factory=list)
