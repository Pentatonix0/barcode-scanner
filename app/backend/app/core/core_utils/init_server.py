import asyncio
from pathlib import Path
from typing import Optional

from app.core.config.init_app_config import app_config
from app.db.db_models import load_models
from app.infrastructure.serial_scanner import SerialScanner
from app.infrastructure.sqlite.database import Database, SqliteConfig
from app.infrastructure.ws_manager import WebSocketManager
from app.repositories.excel_repository import ExcelProductRepository
from app.services.notification_service.email_notification_service import (
    EmailNotificationService,
)
from app.services.scanner_service.scan_service import ScanService
from app.services.scanner_service.serial_settings_service import SerialSettingsService
from app.services.scanner_service.session_service import SessionService
from app.services.system_settings_service import SystemSettingsService
from loguru import logger

_repo: Optional[ExcelProductRepository] = None
_service: Optional[ScanService] = None
_session_service: Optional[SessionService] = None
_email_notification_service: Optional[EmailNotificationService] = None
_system_settings_service: Optional[SystemSettingsService] = None
_serial_settings_service: Optional[SerialSettingsService] = None
_ws_manager: Optional[WebSocketManager] = None
_serial_scanner: Optional[SerialScanner] = None


async def init_server() -> None:
    global _repo, _service, _session_service, _email_notification_service
    global _system_settings_service, _serial_settings_service
    global _ws_manager, _serial_scanner

    Database.initialize(SqliteConfig(path=app_config.sqlite.database_path))
    load_models()
    Database.create_all()

    catalog_path = Path(app_config.catalog.catalog_path).expanduser()
    catalog_path.parent.mkdir(parents=True, exist_ok=True)

    _repo = ExcelProductRepository(
        file_path=catalog_path,
        barcode_column=app_config.catalog.barcode_column,
    )
    await _repo.reload()

    _ws_manager = WebSocketManager()
    _service = ScanService(repository=_repo)
    _system_settings_service = SystemSettingsService()
    await _system_settings_service.ensure_seed_settings()

    _session_service = SessionService(
        catalog_repo=_repo,
        scan_service=_service,
        export_dir=app_config.export.sessions_dir,
        system_settings=_system_settings_service,
    )

    _email_notification_service = EmailNotificationService(
        system_settings=_system_settings_service,
        secret_key=app_config.notifications.smtp_secret_key,
        smtp_timeout_seconds=app_config.notifications.smtp_timeout_seconds,
    )
    await _email_notification_service.ensure_default_settings()

    _serial_settings_service = SerialSettingsService(_system_settings_service)
    serial_settings = await _serial_settings_service.ensure_default_settings()

    loop = asyncio.get_running_loop()
    _serial_scanner = SerialScanner(
        port=serial_settings["port"],
        baudrate=serial_settings["baudrate"],
        timeout=serial_settings["timeout"],
        reconnect_delay=serial_settings["reconnect_delay"],
        enabled=serial_settings["enabled"],
        session_service=_session_service,
        ws_manager=_ws_manager,
        loop=loop,
    )
    _serial_scanner.start()

    logger.success("Scanner service initialized")


async def shutdown_server() -> None:
    global _serial_scanner
    if _serial_scanner:
        _serial_scanner.stop()
        _serial_scanner = None


def get_repository() -> ExcelProductRepository:
    if not _repo:
        raise RuntimeError("Repository is not initialized")
    return _repo


def get_scan_service() -> ScanService:
    if not _service:
        raise RuntimeError("Scan service is not initialized")
    return _service


def get_session_service() -> SessionService:
    if not _session_service:
        raise RuntimeError("Session service is not initialized")
    return _session_service


def get_ws_manager() -> WebSocketManager:
    if not _ws_manager:
        raise RuntimeError("WebSocket manager is not initialized")
    return _ws_manager


def get_serial_scanner() -> Optional[SerialScanner]:
    return _serial_scanner


def get_email_notification_service() -> EmailNotificationService:
    if not _email_notification_service:
        raise RuntimeError("Email notification service is not initialized")
    return _email_notification_service


def get_serial_settings_service() -> SerialSettingsService:
    if not _serial_settings_service:
        raise RuntimeError("Serial settings service is not initialized")
    return _serial_settings_service


def get_system_settings_service() -> SystemSettingsService:
    if not _system_settings_service:
        raise RuntimeError("System settings service is not initialized")
    return _system_settings_service
