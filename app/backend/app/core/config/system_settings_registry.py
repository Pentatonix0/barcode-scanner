from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Generic, TypeVar

from app.core.config.init_app_config import app_config

T = TypeVar("T")


@dataclass(frozen=True, slots=True)
class SettingDef(Generic[T]):
    name: str
    type_: type[T]
    default: T
    category: str
    description: str = ""
    is_system: bool = True


SettingValueType = str | int | bool | float | datetime | dict[str, Any] | list[Any]

DEFAULT_SMTP_SUBJECT_TEMPLATE = "Отчет сессии сканирования #{session_id}"
DEFAULT_SMTP_BODY_TEMPLATE = (
    "Сессия #{session_id}\n"
    "Начало: {started_at}\n"
    "Окончание: {finished_at}\n"
    "Всего сканов: {total_items}\n"
    "Уникальных: {total_unique}\n"
    "Файл отчета: {excel_path}"
)


def _default_reports_output_dir() -> str:
    home = Path.home()
    if sys.platform == "linux":
        xdg_documents = os.environ.get("XDG_DOCUMENTS_DIR", "").strip()
        if xdg_documents:
            documents_dir = Path(os.path.expandvars(xdg_documents)).expanduser()
            if documents_dir.is_absolute():
                return str(documents_dir / "Barcode Reader" / "Reports")
    return str(home / "Documents" / "Barcode Reader" / "Reports")


class SETTINGS:
    SERIAL_ENABLED = SettingDef[bool](
        name="serial.enabled",
        type_=bool,
        default=True,
        category="serial",
        description="Enable or disable serial scanner listener.",
    )
    SERIAL_PORT = SettingDef[str](
        name="serial.port",
        type_=str,
        default=app_config.serial.serial_port,
        category="serial",
        description="Serial port path/name (COMx on Windows).",
    )
    SERIAL_BAUDRATE = SettingDef[int](
        name="serial.baudrate",
        type_=int,
        default=app_config.serial.serial_baudrate,
        category="serial",
        description="Serial baudrate for scanner connection.",
    )
    SERIAL_TIMEOUT = SettingDef[float](
        name="serial.timeout",
        type_=float,
        default=app_config.serial.serial_timeout,
        category="serial",
        description="Read timeout in seconds.",
    )
    SERIAL_RECONNECT_DELAY = SettingDef[float](
        name="serial.reconnect_delay",
        type_=float,
        default=app_config.serial.serial_reconnect_delay,
        category="serial",
        description="Reconnect delay in seconds after serial errors.",
    )
    REPORTS_OUTPUT_DIR = SettingDef[str](
        name="reports.output_dir",
        type_=str,
        default=_default_reports_output_dir(),
        category="reports",
        description="Directory used to store generated session Excel reports.",
    )
    SMTP_ENABLED = SettingDef[bool](
        name="smtp.enabled",
        type_=bool,
        default=False,
        category="smtp",
        description="Enable or disable email report notifications.",
    )
    SMTP_HOST = SettingDef[str](
        name="smtp.host",
        type_=str,
        default="",
        category="smtp",
        description="SMTP server hostname.",
    )
    SMTP_PORT = SettingDef[int](
        name="smtp.port",
        type_=int,
        default=587,
        category="smtp",
        description="SMTP server port.",
    )
    SMTP_USERNAME = SettingDef[str](
        name="smtp.username",
        type_=str,
        default="",
        category="smtp",
        description="SMTP username for authentication.",
    )
    SMTP_PASSWORD_ENCRYPTED = SettingDef[str](
        name="smtp.password_encrypted",
        type_=str,
        default="",
        category="smtp",
        description="Encrypted SMTP password.",
    )
    SMTP_FROM_EMAIL = SettingDef[str](
        name="smtp.from_email",
        type_=str,
        default="",
        category="smtp",
        description="Sender email address.",
    )
    SMTP_TO_EMAILS = SettingDef[list](
        name="smtp.to_emails",
        type_=list,
        default=[],
        category="smtp",
        description="Recipient email list.",
    )
    SMTP_USE_TLS = SettingDef[bool](
        name="smtp.use_tls",
        type_=bool,
        default=True,
        category="smtp",
        description="Use STARTTLS for SMTP connection.",
    )
    SMTP_USE_SSL = SettingDef[bool](
        name="smtp.use_ssl",
        type_=bool,
        default=False,
        category="smtp",
        description="Use SSL/TLS socket for SMTP connection.",
    )
    SMTP_SUBJECT_TEMPLATE = SettingDef[str](
        name="smtp.subject_template",
        type_=str,
        default=DEFAULT_SMTP_SUBJECT_TEMPLATE,
        category="smtp",
        description="Email subject template for session report.",
    )
    SMTP_BODY_TEMPLATE = SettingDef[str](
        name="smtp.body_template",
        type_=str,
        default=DEFAULT_SMTP_BODY_TEMPLATE,
        category="smtp",
        description="Email body template for session report.",
    )


ALL_SYSTEM_SETTINGS: tuple[SettingDef[Any], ...] = (
    SETTINGS.SERIAL_ENABLED,
    SETTINGS.SERIAL_PORT,
    SETTINGS.SERIAL_BAUDRATE,
    SETTINGS.SERIAL_TIMEOUT,
    SETTINGS.SERIAL_RECONNECT_DELAY,
    SETTINGS.REPORTS_OUTPUT_DIR,
    SETTINGS.SMTP_ENABLED,
    SETTINGS.SMTP_HOST,
    SETTINGS.SMTP_PORT,
    SETTINGS.SMTP_USERNAME,
    SETTINGS.SMTP_PASSWORD_ENCRYPTED,
    SETTINGS.SMTP_FROM_EMAIL,
    SETTINGS.SMTP_TO_EMAILS,
    SETTINGS.SMTP_USE_TLS,
    SETTINGS.SMTP_USE_SSL,
    SETTINGS.SMTP_SUBJECT_TEMPLATE,
    SETTINGS.SMTP_BODY_TEMPLATE,
)

SYSTEM_SETTINGS_BY_NAME: dict[str, SettingDef[Any]] = {
    item.name: item for item in ALL_SYSTEM_SETTINGS
}
