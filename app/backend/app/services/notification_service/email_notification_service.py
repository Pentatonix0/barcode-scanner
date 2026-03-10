from __future__ import annotations

import asyncio
import re
import smtplib
from dataclasses import dataclass
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path

from app.core.config.system_settings_registry import (
    DEFAULT_SMTP_BODY_TEMPLATE,
    DEFAULT_SMTP_SUBJECT_TEMPLATE,
    SETTINGS,
)
from app.core.core_utils.secret_cipher import decrypt_secret, encrypt_secret
from app.services.system_settings_service import SystemSettingsService
from loguru import logger

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

DEFAULT_SUBJECT_TEMPLATE = DEFAULT_SMTP_SUBJECT_TEMPLATE
DEFAULT_BODY_TEMPLATE = DEFAULT_SMTP_BODY_TEMPLATE


class _SafeFormat(dict[str, str]):
    """Formatter-словарь: незнакомые placeholders остаются как есть."""

    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


@dataclass(slots=True)
class RuntimeEmailSettings:
    """Runtime-представление SMTP-настроек с расшифрованным паролем."""

    enabled: bool
    host: str
    port: int
    username: str
    password: str
    from_email: str
    to_emails: list[str]
    use_tls: bool
    use_ssl: bool
    subject_template: str
    body_template: str


@dataclass(slots=True)
class StoredEmailSettings:
    """Хранимое представление SMTP-настроек в system_settings."""

    enabled: bool
    host: str
    port: int
    username: str
    password_encrypted: str
    from_email: str
    to_emails: list[str]
    use_tls: bool
    use_ssl: bool
    subject_template: str
    body_template: str
    updated_at: str | None


@dataclass(slots=True)
class SessionEmailPayload:
    """Данные завершенной сессии для формирования темы/текста письма."""

    session_id: int
    excel_path: str
    total_items: int
    total_unique: int
    started_at: datetime
    finished_at: datetime


class EmailNotificationService:
    """Сервис SMTP-настроек и отправки отчетов сессий по email."""

    def __init__(
        self,
        system_settings: SystemSettingsService,
        secret_key: str,
        smtp_timeout_seconds: float = 10.0,
    ) -> None:
        """Сохраняет зависимости сервиса и timeout SMTP-соединения."""
        self._system_settings = system_settings
        self._secret_key = secret_key
        self._smtp_timeout_seconds = smtp_timeout_seconds

    async def get_settings(self) -> dict:
        """Возвращает текущие SMTP-настройки (без пароля) из system_settings."""
        logger.debug("Loading SMTP settings from system_settings")
        stored = await self._load_stored_settings()
        return self._serialize_settings(stored)

    async def ensure_default_settings(self) -> dict:
        """Гарантирует, что дефолтные SMTP-настройки существуют."""
        return await self.get_settings()

    async def save_settings(self, payload: dict) -> dict:
        """Сохраняет SMTP-настройки.

        Если рассылка включена, сначала проверяет соединение с SMTP.
        """
        logger.info(
            "Saving SMTP settings: enabled={}, host={}, port={}, username_set={}, tls={}, ssl={}",
            bool(payload.get("enabled", False)),
            self._normalize_text(payload.get("host")),
            payload.get("port"),
            bool(self._normalize_text(payload.get("username"))),
            bool(payload.get("use_tls", True)),
            bool(payload.get("use_ssl", False)),
        )

        stored = await self._load_stored_settings()
        runtime = self._build_runtime_settings(
            payload=payload,
            stored=stored,
            validate_enabled=True,
        )
        if runtime and runtime.enabled:
            logger.info(
                "Validating SMTP connection before save: host={}, port={}, tls={}, ssl={}",
                runtime.host,
                runtime.port,
                runtime.use_tls,
                runtime.use_ssl,
            )
            await self._test_connection(runtime)
            logger.info("SMTP connection validation passed")

        await self._system_settings.bulk_update(
            self._build_update_payload(stored=stored, payload=payload)
        )

        updated = await self._load_stored_settings()
        logger.info(
            "SMTP settings saved successfully: enabled={}, host={}, port={}",
            updated.enabled,
            updated.host,
            updated.port,
        )
        return self._serialize_settings(updated)

    async def test_settings(self, payload: dict) -> tuple[bool, str]:
        """Валидирует SMTP-подключение для переданного payload."""
        logger.info(
            "Testing SMTP settings: enabled={}, host={}, port={}, username_set={}, tls={}, ssl={}",
            bool(payload.get("enabled", False)),
            self._normalize_text(payload.get("host")),
            payload.get("port"),
            bool(self._normalize_text(payload.get("username"))),
            bool(payload.get("use_tls", True)),
            bool(payload.get("use_ssl", False)),
        )

        stored = await self._load_stored_settings()
        runtime = self._build_runtime_settings(
            payload=payload,
            stored=stored,
            validate_enabled=True,
        )
        logger.debug(
            "SMTP settings prepared: enabled={}, host={}, port={}, password_set={}",
            runtime.enabled,
            runtime.host,
            runtime.port,
            bool(runtime.password),
        )

        if not runtime.enabled:
            logger.info("SMTP test skipped because notifications are disabled")
            return True, "Рассылка отключена"

        await self._test_connection(runtime)
        logger.info(
            "SMTP test succeeded: host={}, port={}, tls={}, ssl={}",
            runtime.host,
            runtime.port,
            runtime.use_tls,
            runtime.use_ssl,
        )
        return True, "Соединение с SMTP успешно установлено"

    async def send_session_report(
        self, payload: SessionEmailPayload
    ) -> tuple[str, str | None]:
        """Отправляет Excel-отчет по email по завершении сессии.

        Возвращает кортеж `(status, detail)`:
        - `sent`, если письмо отправлено;
        - `disabled`, если рассылка отключена;
        - `failed` и текст ошибки при проблемах отправки.
        """
        logger.info(
            "Email flow started for session report: session_id={}, excel_path={}",
            payload.session_id,
            payload.excel_path,
        )
        try:
            runtime = await self._get_runtime_settings()
        except Exception as exc:
            logger.error("Failed to load SMTP settings: {}", exc)
            return "failed", f"Настройки SMTP некорректны: {exc}"

        if runtime is None or not runtime.enabled:
            logger.info(
                "Email flow skipped: notifications disabled (session_id={})",
                payload.session_id,
            )
            return "disabled", None

        try:
            await self._send_report(runtime, payload)
            logger.info(
                "Email flow finished successfully: session_id={}, recipients={}",
                payload.session_id,
                len(runtime.to_emails),
            )
            return "sent", None
        except Exception as exc:
            logger.error("Failed to send session report by email: {}", exc)
            return "failed", str(exc)

    async def _get_runtime_settings(self) -> RuntimeEmailSettings | None:
        """Читает SMTP-настройки из system_settings и готовит runtime-объект."""
        stored = await self._load_stored_settings()
        runtime = self._build_runtime_settings(
            payload=self._serialize_settings(stored),
            stored=stored,
            validate_enabled=False,
        )
        logger.debug(
            "Runtime SMTP settings prepared: enabled={}, host={}, port={}, username_set={}",
            runtime.enabled if runtime else False,
            runtime.host if runtime else "",
            runtime.port if runtime else None,
            bool(runtime.username) if runtime else False,
        )
        return runtime

    async def _load_stored_settings(self) -> StoredEmailSettings:
        """Читает SMTP-ключи из system_settings и собирает runtime-снимок."""
        items = await self._system_settings.list_settings()
        by_name = {item["name"]: item for item in items}

        def read_value(name: str, default):
            entry = by_name.get(name)
            if entry is None:
                return default
            return entry.get("value", default)

        smtp_names = [
            SETTINGS.SMTP_ENABLED.name,
            SETTINGS.SMTP_HOST.name,
            SETTINGS.SMTP_PORT.name,
            SETTINGS.SMTP_USERNAME.name,
            SETTINGS.SMTP_PASSWORD_ENCRYPTED.name,
            SETTINGS.SMTP_FROM_EMAIL.name,
            SETTINGS.SMTP_TO_EMAILS.name,
            SETTINGS.SMTP_USE_TLS.name,
            SETTINGS.SMTP_USE_SSL.name,
            SETTINGS.SMTP_SUBJECT_TEMPLATE.name,
            SETTINGS.SMTP_BODY_TEMPLATE.name,
        ]

        return StoredEmailSettings(
            enabled=bool(read_value(SETTINGS.SMTP_ENABLED.name, False)),
            host=self._normalize_text(read_value(SETTINGS.SMTP_HOST.name, "")),
            port=self._normalize_port(
                read_value(SETTINGS.SMTP_PORT.name, SETTINGS.SMTP_PORT.default),
                fallback=int(SETTINGS.SMTP_PORT.default),
            )
            or int(SETTINGS.SMTP_PORT.default),
            username=self._normalize_text(read_value(SETTINGS.SMTP_USERNAME.name, "")),
            password_encrypted=self._normalize_text(
                read_value(SETTINGS.SMTP_PASSWORD_ENCRYPTED.name, "")
            ),
            from_email=self._normalize_text(read_value(SETTINGS.SMTP_FROM_EMAIL.name, "")),
            to_emails=self._normalize_emails(
                read_value(SETTINGS.SMTP_TO_EMAILS.name, []) or []
            ),
            use_tls=bool(read_value(SETTINGS.SMTP_USE_TLS.name, True)),
            use_ssl=bool(read_value(SETTINGS.SMTP_USE_SSL.name, False)),
            subject_template=self._normalize_text(
                read_value(SETTINGS.SMTP_SUBJECT_TEMPLATE.name, DEFAULT_SUBJECT_TEMPLATE),
                default=DEFAULT_SUBJECT_TEMPLATE,
            ),
            body_template=self._normalize_text(
                read_value(SETTINGS.SMTP_BODY_TEMPLATE.name, DEFAULT_BODY_TEMPLATE),
                default=DEFAULT_BODY_TEMPLATE,
            ),
            updated_at=self._max_updated_at(by_name=by_name, names=smtp_names),
        )

    def _build_runtime_settings(
        self,
        payload: dict,
        stored: StoredEmailSettings,
        validate_enabled: bool,
    ) -> RuntimeEmailSettings | None:
        """Нормализует вход и формирует runtime SMTP-настройки.

        При `validate_enabled=True` проверяет обязательные поля и комбинации
        TLS/SSL, а также корректность email-адресов.
        """
        enabled = bool(payload.get("enabled", stored.enabled))
        host = self._normalize_text(payload.get("host", stored.host))
        port = self._normalize_port(payload.get("port"), fallback=stored.port)
        username = self._normalize_text(payload.get("username", stored.username))
        from_email = self._normalize_text(payload.get("from_email", stored.from_email))
        to_emails = self._normalize_emails(payload.get("to_emails", stored.to_emails) or [])
        use_tls = bool(payload.get("use_tls", stored.use_tls))
        use_ssl = bool(payload.get("use_ssl", stored.use_ssl))
        subject_template = self._normalize_text(
            payload.get("subject_template", stored.subject_template),
            default=DEFAULT_SUBJECT_TEMPLATE,
        )
        body_template = self._normalize_text(
            payload.get("body_template", stored.body_template),
            default=DEFAULT_BODY_TEMPLATE,
        )

        password_payload = payload.get("password")
        has_new_password = password_payload is not None and bool(
            str(password_payload).strip()
        )
        encrypted_password = stored.password_encrypted
        stored_username = self._normalize_text(stored.username)
        password = ""
        password_source = "empty"
        if has_new_password:
            password = str(password_payload).strip()
            password_source = "payload"
        elif encrypted_password:
            try:
                password = decrypt_secret(encrypted_password, self._secret_key)
                password_source = "stored"
            except ValueError as exc:
                if enabled and username:
                    raise ValueError(
                        "Не удалось расшифровать сохраненный SMTP-пароль. "
                        "Укажите новый пароль и сохраните настройки."
                    ) from exc
                password = ""
                password_source = "stored_invalid"

        logger.debug(
            "SMTP settings build: enabled={}, host={}, port={}, username_set={}, to_count={}, tls={}, ssl={}, password_source={}, password_len={}",
            enabled,
            host,
            port,
            bool(username),
            len(to_emails),
            use_tls,
            use_ssl,
            password_source,
            len(password),
        )

        if validate_enabled and use_tls and use_ssl:
            raise ValueError("TLS и SSL нельзя включать одновременно")

        if not enabled:
            return RuntimeEmailSettings(
                enabled=False,
                host=host,
                port=int(port) if port else 0,
                username=username,
                password=password,
                from_email=from_email,
                to_emails=to_emails,
                use_tls=use_tls,
                use_ssl=use_ssl,
                subject_template=subject_template,
                body_template=body_template,
            )

        if validate_enabled:
            if username and username != stored_username and not has_new_password:
                raise ValueError("При смене SMTP логина укажите новый пароль.")
            if not host:
                raise ValueError("SMTP host обязателен")
            if port is None:
                raise ValueError("SMTP port обязателен")
            if port <= 0 or port > 65535:
                raise ValueError("SMTP port должен быть в диапазоне 1..65535")
            if not from_email:
                raise ValueError("Email отправителя обязателен")
            if not to_emails:
                raise ValueError("Укажите хотя бы один email получателя")
            self._validate_email(from_email)
            for email in to_emails:
                self._validate_email(email)
            if username and not password:
                raise ValueError("Пароль SMTP обязателен при указании логина")

        return RuntimeEmailSettings(
            enabled=True,
            host=host,
            port=int(port) if port else int(SETTINGS.SMTP_PORT.default),
            username=username,
            password=password,
            from_email=from_email,
            to_emails=to_emails,
            use_tls=use_tls,
            use_ssl=use_ssl,
            subject_template=subject_template,
            body_template=body_template,
        )

    def _build_update_payload(
        self,
        stored: StoredEmailSettings,
        payload: dict,
    ) -> dict[str, object]:
        """Преобразует вход в словарь typed-обновлений для system_settings."""
        enabled = bool(payload.get("enabled", stored.enabled))
        host = self._normalize_text(payload.get("host", stored.host), default="")
        port = self._normalize_port(payload.get("port"), fallback=stored.port)
        username = self._normalize_text(payload.get("username", stored.username), default="")
        from_email = self._normalize_text(
            payload.get("from_email", stored.from_email),
            default="",
        )
        to_emails = self._normalize_emails(payload.get("to_emails", stored.to_emails) or [])
        use_tls = bool(payload.get("use_tls", stored.use_tls))
        use_ssl = bool(payload.get("use_ssl", stored.use_ssl))
        subject_template = self._normalize_text(
            payload.get("subject_template", stored.subject_template),
            default=DEFAULT_SUBJECT_TEMPLATE,
        )
        body_template = self._normalize_text(
            payload.get("body_template", stored.body_template),
            default=DEFAULT_BODY_TEMPLATE,
        )

        password_encrypted = stored.password_encrypted
        password_payload = payload.get("password")
        if username:
            if password_payload is not None and str(password_payload).strip():
                password_encrypted = encrypt_secret(
                    str(password_payload).strip(),
                    self._secret_key,
                )
                logger.debug("SMTP password updated for username={}", username)
        else:
            password_encrypted = ""
            logger.debug("SMTP username is empty; stored password cleared")

        return {
            SETTINGS.SMTP_ENABLED.name: enabled,
            SETTINGS.SMTP_HOST.name: host,
            SETTINGS.SMTP_PORT.name: int(port) if port else int(SETTINGS.SMTP_PORT.default),
            SETTINGS.SMTP_USERNAME.name: username,
            SETTINGS.SMTP_PASSWORD_ENCRYPTED.name: password_encrypted,
            SETTINGS.SMTP_FROM_EMAIL.name: from_email,
            SETTINGS.SMTP_TO_EMAILS.name: to_emails,
            SETTINGS.SMTP_USE_TLS.name: use_tls,
            SETTINGS.SMTP_USE_SSL.name: use_ssl,
            SETTINGS.SMTP_SUBJECT_TEMPLATE.name: subject_template,
            SETTINGS.SMTP_BODY_TEMPLATE.name: body_template,
        }

    def _serialize_settings(self, stored: StoredEmailSettings) -> dict:
        """Сериализует сохраненные настройки в API-ответ без утечки пароля."""
        return {
            "enabled": bool(stored.enabled),
            "host": stored.host or "",
            "port": stored.port,
            "username": stored.username or "",
            "password_set": bool(stored.password_encrypted),
            "from_email": stored.from_email or "",
            "to_emails": stored.to_emails,
            "use_tls": bool(stored.use_tls),
            "use_ssl": bool(stored.use_ssl),
            "subject_template": stored.subject_template or DEFAULT_SUBJECT_TEMPLATE,
            "body_template": stored.body_template or DEFAULT_BODY_TEMPLATE,
            "updated_at": stored.updated_at,
        }

    @staticmethod
    def _max_updated_at(by_name: dict[str, dict], names: list[str]) -> str | None:
        candidates: list[datetime] = []
        for name in names:
            entry = by_name.get(name)
            if not entry:
                continue
            raw = entry.get("updated_at")
            if not raw:
                continue
            try:
                candidates.append(datetime.fromisoformat(str(raw)))
            except ValueError:
                continue
        if not candidates:
            return None
        return max(candidates).isoformat()

    async def _test_connection(self, settings: RuntimeEmailSettings) -> None:
        """Асинхронная обертка теста SMTP-соединения (через thread)."""
        logger.debug(
            "Opening SMTP connection for test: host={}, port={}, tls={}, ssl={}, username_set={}",
            settings.host,
            settings.port,
            settings.use_tls,
            settings.use_ssl,
            bool(settings.username),
        )
        await asyncio.to_thread(self._test_connection_sync, settings)

    def _test_connection_sync(self, settings: RuntimeEmailSettings) -> None:
        """Sync-тест SMTP: подключиться и корректно закрыть соединение."""
        smtp = self._open_smtp_connection(settings)
        smtp.quit()
        logger.debug("SMTP test connection closed successfully")

    async def _send_report(
        self,
        settings: RuntimeEmailSettings,
        payload: SessionEmailPayload,
    ) -> None:
        """Асинхронная обертка отправки письма (thread), чтобы не блокировать loop."""
        logger.debug(
            "Sending report via SMTP in background thread: session_id={}, host={}, recipients={}",
            payload.session_id,
            settings.host,
            len(settings.to_emails),
        )
        await asyncio.to_thread(self._send_report_sync, settings, payload)

    def _send_report_sync(
        self, settings: RuntimeEmailSettings, payload: SessionEmailPayload
    ) -> None:
        """Формирует email, прикладывает Excel-файл и отправляет через SMTP."""
        excel_path = Path(payload.excel_path)
        if not excel_path.exists():
            raise FileNotFoundError(f"Report file not found: {excel_path}")
        logger.debug(
            "Preparing email message: session_id={}, file={}, size_bytes={}",
            payload.session_id,
            excel_path.name,
            excel_path.stat().st_size,
        )

        context = _SafeFormat(
            session_id=str(payload.session_id),
            started_at=payload.started_at.isoformat(sep=" ", timespec="seconds"),
            finished_at=payload.finished_at.isoformat(sep=" ", timespec="seconds"),
            total_items=str(payload.total_items),
            total_unique=str(payload.total_unique),
            excel_path=str(excel_path),
            generated_at=datetime.now().isoformat(sep=" ", timespec="seconds"),
        )

        subject = settings.subject_template.format_map(context)
        body = settings.body_template.format_map(context)

        message = EmailMessage()
        message["From"] = settings.from_email
        message["To"] = ", ".join(settings.to_emails)
        message["Subject"] = subject
        message.set_content(body)

        with excel_path.open("rb") as file_obj:
            message.add_attachment(
                file_obj.read(),
                maintype="application",
                subtype="vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                filename=excel_path.name,
            )

        smtp = self._open_smtp_connection(settings)
        smtp.send_message(message)
        smtp.quit()
        logger.info(
            "SMTP message sent: session_id={}, from={}, recipients={}, subject={}",
            payload.session_id,
            settings.from_email,
            len(settings.to_emails),
            subject,
        )

    def _open_smtp_connection(self, settings: RuntimeEmailSettings) -> smtplib.SMTP:
        """Создает SMTP-клиент, включает TLS/SSL и выполняет авторизацию при необходимости."""
        logger.debug(
            "Connecting to SMTP server: host={}, port={}, mode={}, tls={}, username_set={}, password_set={}",
            settings.host,
            settings.port,
            "ssl" if settings.use_ssl else "plain",
            settings.use_tls,
            bool(settings.username),
            bool(settings.password),
        )
        if settings.use_ssl:
            smtp = smtplib.SMTP_SSL(
                host=settings.host,
                port=settings.port,
                timeout=self._smtp_timeout_seconds,
            )
        else:
            smtp = smtplib.SMTP(
                host=settings.host,
                port=settings.port,
                timeout=self._smtp_timeout_seconds,
            )
            smtp.ehlo()
            if settings.use_tls:
                smtp.starttls()
                smtp.ehlo()

        if settings.username:
            logger.debug("Running SMTP AUTH for username={}", settings.username)
            smtp.login(settings.username, settings.password)
            logger.debug("SMTP AUTH succeeded for username={}", settings.username)
        return smtp

    def _normalize_text(self, value: str | None, default: str | None = None) -> str:
        """Нормализует строку: trim + fallback к default."""
        if value is None:
            return default or ""
        normalized = str(value).strip()
        if not normalized and default is not None:
            return default
        return normalized

    def _normalize_port(self, value: object, fallback: int | None = None) -> int | None:
        """Нормализует SMTP port к int или возвращает fallback."""
        raw = fallback if value is None else value
        if raw in (None, ""):
            return fallback
        try:
            return int(raw)
        except (TypeError, ValueError) as exc:
            raise ValueError("SMTP port должен быть целым числом") from exc

    def _normalize_emails(self, values: list[str] | tuple[str, ...] | str) -> list[str]:
        """Приводит список email-значений к единому виду (`,`/`;` как разделители)."""
        if isinstance(values, str):
            normalized_values = [values]
        else:
            normalized_values = list(values)

        result: list[str] = []
        for item in normalized_values:
            for part in str(item).replace(";", ",").split(","):
                normalized = part.strip()
                if normalized:
                    result.append(normalized)
        return result

    def _validate_email(self, value: str) -> None:
        """Проверяет формат email и бросает ValueError при невалидном значении."""
        if not EMAIL_RE.match(value):
            raise ValueError(f"Некорректный email: {value}")
