from fastapi import APIRouter, Depends, HTTPException

from app.core.core_utils.init_server import (
    get_repository,
    get_serial_scanner,
    get_serial_settings_service,
)
from app.dto.serial_dto.request_dto import SerialSettingsUpsertDto
from app.dto.serial_dto.response_dto import (
    SerialAutoDetectResponseDto,
    SerialSettingsDto,
)
from app.repositories.excel_repository import ExcelProductRepository
from app.services.scanner_service.serial_settings_service import SerialSettingsService

serial_settings_router = APIRouter(
    prefix="/serial",
    tags=["serial"],
    responses={200: {"description": "Success"}, 400: {"description": "Bad request"}},
)


@serial_settings_router.get(
    "/settings",
    summary="Get serial scanner settings",
    response_model=SerialSettingsDto,
)
async def get_serial_settings(
    service: SerialSettingsService = Depends(get_serial_settings_service),
) -> SerialSettingsDto:
    data = await service.get_settings()
    scanner = get_serial_scanner()
    data["running"] = bool(scanner and scanner.is_running)
    return SerialSettingsDto(**data)


@serial_settings_router.put(
    "/settings",
    summary="Save serial scanner settings and apply immediately",
    response_model=SerialSettingsDto,
)
async def put_serial_settings(
    payload: SerialSettingsUpsertDto,
    service: SerialSettingsService = Depends(get_serial_settings_service),
) -> SerialSettingsDto:
    try:
        data = await service.save_settings(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    scanner = get_serial_scanner()
    if scanner is not None:
        scanner.reconfigure(
            port=data["port"],
            baudrate=data["baudrate"],
            timeout=data["timeout"],
            reconnect_delay=data["reconnect_delay"],
            enabled=data["enabled"],
        )
        data["running"] = scanner.is_running
    else:
        data["running"] = False

    return SerialSettingsDto(**data)


@serial_settings_router.post(
    "/auto-detect",
    summary="Auto-detect scanner serial port (fixed 10s, barcode must exist in catalog)",
    response_model=SerialAutoDetectResponseDto,
)
async def auto_detect_serial_port(
    service: SerialSettingsService = Depends(get_serial_settings_service),
    repo: ExcelProductRepository = Depends(get_repository),
) -> SerialAutoDetectResponseDto:
    scanner = get_serial_scanner()
    was_running = bool(scanner and scanner.is_running)

    if scanner and was_running:
        scanner.stop()

    try:
        result = await service.auto_detect_port(catalog_repo=repo)
        return SerialAutoDetectResponseDto(
            port=result.port,
            barcode=result.barcode,
            checked_ports=result.checked_ports,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    finally:
        if scanner and was_running:
            scanner.start()
