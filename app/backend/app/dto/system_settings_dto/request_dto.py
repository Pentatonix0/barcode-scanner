from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SystemSettingPatchItemDto(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    value: Any


class SystemSettingsPatchDto(BaseModel):
    items: list[SystemSettingPatchItemDto] = Field(default_factory=list)
