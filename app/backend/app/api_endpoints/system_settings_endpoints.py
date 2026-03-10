from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.core_utils.init_server import get_system_settings_service
from app.dto.system_settings_dto.request_dto import SystemSettingsPatchDto
from app.dto.system_settings_dto.response_dto import (
    SystemSettingValueDto,
    SystemSettingsListDto,
)
from app.services.system_settings_service import SystemSettingsService

system_settings_router = APIRouter(
    prefix="/system-settings",
    tags=["system-settings"],
    responses={200: {"description": "Success"}, 400: {"description": "Bad request"}},
)


@system_settings_router.get(
    "",
    summary="List all system settings with metadata",
    response_model=SystemSettingsListDto,
)
async def list_system_settings(
    service: SystemSettingsService = Depends(get_system_settings_service),
) -> SystemSettingsListDto:
    items = await service.list_settings()
    return SystemSettingsListDto(items=[SystemSettingValueDto(**item) for item in items])


@system_settings_router.get(
    "/{name}",
    summary="Get one system setting by name",
    response_model=SystemSettingValueDto,
)
async def get_system_setting(
    name: str,
    service: SystemSettingsService = Depends(get_system_settings_service),
) -> SystemSettingValueDto:
    try:
        item = await service.get_setting_entry(name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return SystemSettingValueDto(**item)


@system_settings_router.patch(
    "",
    summary="Bulk update system settings atomically",
    response_model=SystemSettingsListDto,
)
async def patch_system_settings(
    payload: SystemSettingsPatchDto,
    service: SystemSettingsService = Depends(get_system_settings_service),
) -> SystemSettingsListDto:
    try:
        updated = await service.bulk_update(
            {item.name: item.value for item in payload.items}
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SystemSettingsListDto(
        items=[SystemSettingValueDto(**item) for item in updated]
    )
