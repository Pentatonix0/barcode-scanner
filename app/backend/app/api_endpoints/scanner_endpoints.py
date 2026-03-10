from app.core.config.init_app_config import app_config
from app.core.core_utils.init_server import (
    get_email_notification_service,
    get_repository,
    get_serial_scanner,
    get_session_service,
    get_ws_manager,
)
from app.dto.scanner_dto.response_dto import ScannerStatusDto
from app.dto.session_dto.response_dto import (
    SessionHistoryDetailsDto,
    SessionHistoryListDto,
    SessionItemsDto,
    SessionStatusDto,
    SessionStopDto,
)
from app.infrastructure.ws_manager import WebSocketManager
from app.repositories.excel_repository import ExcelProductRepository
from app.services.notification_service.email_notification_service import (
    EmailNotificationService,
    SessionEmailPayload,
)
from app.services.scanner_service.session_service import SessionService
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket

scanner_router = APIRouter(
    prefix="",
    tags=["scanner"],
    responses={
        200: {"description": "Success"},
    },
)


def _session_item_error(exc: ValueError) -> HTTPException:
    detail = str(exc)
    if detail in {"Item not found", "Unknown item not found"}:
        return HTTPException(status_code=404, detail=detail)
    return HTTPException(status_code=400, detail=detail)


@scanner_router.get(
    "/scanner/status",
    summary="Scanner status",
    description="Returns serial scanner status and catalog counters.",
    response_model=ScannerStatusDto,
)
async def scanner_status(
    repo: ExcelProductRepository = Depends(get_repository),
) -> ScannerStatusDto:
    scanner = get_serial_scanner()
    meta = repo.meta()
    runtime = scanner.current_settings() if scanner else None
    return ScannerStatusDto(
        port=str(runtime["port"]) if runtime else app_config.serial.serial_port,
        baudrate=int(runtime["baudrate"]) if runtime else app_config.serial.serial_baudrate,
        running=bool(runtime["running"]) if runtime else False,
        catalog_loaded=meta.get("last_loaded_at") is not None,
        catalog_count=meta.get("count", 0),
    )


@scanner_router.post(
    "/session/start",
    summary="Start scanning session",
    response_model=SessionStatusDto,
)
async def start_session(
    service: SessionService = Depends(get_session_service),
) -> SessionStatusDto:
    try:
        await service.start()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    status = await service.status()
    return SessionStatusDto(**status)


@scanner_router.post(
    "/sessions/{session_id}/resume",
    summary="Resume completed scanning session",
    response_model=SessionStatusDto,
)
async def resume_session(
    session_id: int,
    service: SessionService = Depends(get_session_service),
) -> SessionStatusDto:
    try:
        status = await service.resume(session_id=session_id)
    except ValueError as exc:
        detail = str(exc)
        if detail == "Session not found":
            raise HTTPException(status_code=404, detail=detail) from exc
        raise HTTPException(status_code=400, detail=detail) from exc
    return SessionStatusDto(**status)


@scanner_router.post(
    "/session/stop",
    summary="Stop scanning session and persist results",
    response_model=SessionStopDto,
)
async def stop_session(
    service: SessionService = Depends(get_session_service),
    email_service: EmailNotificationService = Depends(get_email_notification_service),
) -> SessionStopDto:
    try:
        (
            session_id,
            excel_path,
            total_items,
            total_unique,
            started_at,
            finished_at,
        ) = await service.stop()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    email_status, email_detail = await email_service.send_session_report(
        SessionEmailPayload(
            session_id=session_id,
            excel_path=excel_path,
            total_items=total_items,
            total_unique=total_unique,
            started_at=started_at,
            finished_at=finished_at,
        )
    )

    return SessionStopDto(
        session_id=session_id,
        excel_path=excel_path,
        total_items=total_items,
        total_unique=total_unique,
        email_status=email_status,
        email_detail=email_detail,
    )


@scanner_router.post(
    "/session/cancel",
    summary="Cancel active scanning session without saving report",
    response_model=SessionStatusDto,
)
async def cancel_session(
    service: SessionService = Depends(get_session_service),
) -> SessionStatusDto:
    try:
        await service.cancel()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    status = await service.status()
    return SessionStatusDto(**status)


@scanner_router.get(
    "/session/status",
    summary="Current session status",
    response_model=SessionStatusDto,
)
async def session_status(
    service: SessionService = Depends(get_session_service),
) -> SessionStatusDto:
    status = await service.status()
    return SessionStatusDto(**status)


@scanner_router.get(
    "/session/items",
    summary="Scanned items in current session",
    response_model=SessionItemsDto,
)
async def session_items(
    service: SessionService = Depends(get_session_service),
) -> SessionItemsDto:
    items = await service.items()
    return SessionItemsDto(**items)


@scanner_router.post(
    "/session/items/{barcode}/decrement",
    summary="Decrement scanned item quantity by one",
    response_model=SessionItemsDto,
)
async def decrement_session_item(
    barcode: str,
    service: SessionService = Depends(get_session_service),
    ws_manager: WebSocketManager = Depends(get_ws_manager),
) -> SessionItemsDto:
    try:
        result = await service.decrement_item(barcode)
    except ValueError as exc:
        raise _session_item_error(exc) from exc

    payload = {
        "type": (
            "session_item_updated"
            if result.get("quantity", 0) > 0
            else "session_item_removed"
        ),
        "barcode": result.get("barcode"),
        "name": result.get("name"),
        "quantity": result.get("quantity", 0),
        "total_items": result.get("total_items", 0),
        "total_unique": result.get("total_unique", 0),
        "total_unknown": result.get("total_unknown", 0),
    }
    await ws_manager.broadcast(payload)
    return SessionItemsDto(**result)


@scanner_router.delete(
    "/session/items/{barcode}",
    summary="Remove scanned item from active session",
    response_model=SessionItemsDto,
)
async def remove_session_item(
    barcode: str,
    service: SessionService = Depends(get_session_service),
    ws_manager: WebSocketManager = Depends(get_ws_manager),
) -> SessionItemsDto:
    try:
        result = await service.remove_item(barcode)
    except ValueError as exc:
        raise _session_item_error(exc) from exc

    await ws_manager.broadcast(
        {
            "type": "session_item_removed",
            "barcode": result.get("barcode"),
            "name": result.get("name"),
            "quantity": 0,
            "total_items": result.get("total_items", 0),
            "total_unique": result.get("total_unique", 0),
            "total_unknown": result.get("total_unknown", 0),
        }
    )
    return SessionItemsDto(**result)


@scanner_router.post(
    "/session/items/{barcode}/increment",
    summary="Increase scanned item quantity",
    response_model=SessionItemsDto,
)
async def increment_session_item(
    barcode: str,
    amount: int = Query(default=1, ge=1, le=10_000),
    service: SessionService = Depends(get_session_service),
    ws_manager: WebSocketManager = Depends(get_ws_manager),
) -> SessionItemsDto:
    try:
        result = await service.increment_item(barcode, amount)
    except ValueError as exc:
        raise _session_item_error(exc) from exc

    await ws_manager.broadcast(
        {
            "type": "session_item_updated",
            "barcode": result.get("barcode"),
            "name": result.get("name"),
            "quantity": result.get("quantity", 0),
            "total_items": result.get("total_items", 0),
            "total_unique": result.get("total_unique", 0),
            "total_unknown": result.get("total_unknown", 0),
        }
    )
    return SessionItemsDto(**result)


@scanner_router.post(
    "/session/unknown-items/{barcode}/decrement",
    summary="Decrement unknown scanned item quantity by one",
    response_model=SessionItemsDto,
)
async def decrement_unknown_session_item(
    barcode: str,
    service: SessionService = Depends(get_session_service),
    ws_manager: WebSocketManager = Depends(get_ws_manager),
) -> SessionItemsDto:
    try:
        result = await service.decrement_unknown_item(barcode)
    except ValueError as exc:
        raise _session_item_error(exc) from exc

    payload = {
        "type": (
            "session_item_updated"
            if result.get("quantity", 0) > 0
            else "session_item_removed"
        ),
        "unknown": True,
        "barcode": result.get("barcode"),
        "name": result.get("name"),
        "quantity": result.get("quantity", 0),
        "total_items": result.get("total_items", 0),
        "total_unique": result.get("total_unique", 0),
        "total_unknown": result.get("total_unknown", 0),
    }
    await ws_manager.broadcast(payload)
    return SessionItemsDto(**result)


@scanner_router.delete(
    "/session/unknown-items/{barcode}",
    summary="Remove unknown scanned item from active session",
    response_model=SessionItemsDto,
)
async def remove_unknown_session_item(
    barcode: str,
    service: SessionService = Depends(get_session_service),
    ws_manager: WebSocketManager = Depends(get_ws_manager),
) -> SessionItemsDto:
    try:
        result = await service.remove_unknown_item(barcode)
    except ValueError as exc:
        raise _session_item_error(exc) from exc

    await ws_manager.broadcast(
        {
            "type": "session_item_removed",
            "unknown": True,
            "barcode": result.get("barcode"),
            "name": result.get("name"),
            "quantity": 0,
            "total_items": result.get("total_items", 0),
            "total_unique": result.get("total_unique", 0),
            "total_unknown": result.get("total_unknown", 0),
        }
    )
    return SessionItemsDto(**result)


@scanner_router.post(
    "/session/undo-last-scan",
    summary="Undo latest scan in active session",
    response_model=SessionItemsDto,
)
async def undo_last_scan(
    service: SessionService = Depends(get_session_service),
    ws_manager: WebSocketManager = Depends(get_ws_manager),
) -> SessionItemsDto:
    try:
        result = await service.undo_last_scan()
    except ValueError as exc:
        raise _session_item_error(exc) from exc

    event_type = (
        "session_unknown_undo" if bool(result.get("unknown")) else "session_undo"
    )
    await ws_manager.broadcast(
        {
            "type": event_type,
            "unknown": bool(result.get("unknown", False)),
            "barcode": result.get("barcode"),
            "name": result.get("name"),
            "quantity": result.get("quantity", 0),
            "total_items": result.get("total_items", 0),
            "total_unique": result.get("total_unique", 0),
            "total_unknown": result.get("total_unknown", 0),
        }
    )
    return SessionItemsDto(**result)


@scanner_router.get(
    "/sessions",
    summary="History of completed scan sessions",
    response_model=SessionHistoryListDto,
)
async def sessions_history(
    service: SessionService = Depends(get_session_service),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> SessionHistoryListDto:
    history = await service.history_list(limit=limit, offset=offset)
    return SessionHistoryListDto(**history)


@scanner_router.get(
    "/sessions/{session_id}",
    summary="Detailed data for a completed scan session",
    response_model=SessionHistoryDetailsDto,
)
async def session_details(
    session_id: int,
    service: SessionService = Depends(get_session_service),
) -> SessionHistoryDetailsDto:
    try:
        session_data = await service.history_detail(session_id=session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return SessionHistoryDetailsDto(**session_data)


@scanner_router.websocket(app_config.websocket.ws_path)
async def websocket_endpoint(
    websocket: WebSocket,
    ws_manager: WebSocketManager = Depends(get_ws_manager),
) -> None:
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except Exception:
        await ws_manager.disconnect(websocket)
