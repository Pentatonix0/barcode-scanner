from __future__ import annotations

import asyncio
import threading
import time
from dataclasses import dataclass

import serial
from app.core.config.system_settings_registry import SETTINGS
from app.repositories.base import ProductRepository
from app.services.system_settings_service import SystemSettingsService
from serial.tools import list_ports


@dataclass(frozen=True, slots=True)
class SerialAutoDetectResult:
    port: str
    barcode: str
    checked_ports: int


class SerialSettingsService:
    """Facade over system settings for serial scanner runtime configuration."""

    _AUTO_DETECT_TIMEOUT_SECONDS = 10.0

    def __init__(self, system_settings: SystemSettingsService) -> None:
        self._system_settings = system_settings

    async def ensure_default_settings(self) -> dict:
        await self._system_settings.ensure_seed_settings()
        return await self.get_settings()

    async def get_settings(self) -> dict:
        enabled = await self._system_settings.get_system_setting(SETTINGS.SERIAL_ENABLED)
        port = await self._system_settings.get_system_setting(SETTINGS.SERIAL_PORT)
        baudrate = await self._system_settings.get_system_setting(SETTINGS.SERIAL_BAUDRATE)
        timeout = await self._system_settings.get_system_setting(SETTINGS.SERIAL_TIMEOUT)
        reconnect_delay = await self._system_settings.get_system_setting(
            SETTINGS.SERIAL_RECONNECT_DELAY
        )
        updated_at = await self._resolve_updated_at(SETTINGS.SERIAL_PORT.name)

        return {
            "enabled": bool(enabled),
            "port": str(port),
            "baudrate": int(baudrate),
            "timeout": float(timeout),
            "reconnect_delay": float(reconnect_delay),
            "updated_at": updated_at,
        }

    async def save_settings(self, payload: dict) -> dict:
        normalized = self._normalize_payload(payload)
        await self._system_settings.bulk_update(
            {
                SETTINGS.SERIAL_ENABLED.name: normalized["enabled"],
                SETTINGS.SERIAL_PORT.name: normalized["port"],
                SETTINGS.SERIAL_BAUDRATE.name: normalized["baudrate"],
                SETTINGS.SERIAL_TIMEOUT.name: normalized["timeout"],
                SETTINGS.SERIAL_RECONNECT_DELAY.name: normalized["reconnect_delay"],
            }
        )
        return await self.get_settings()

    async def auto_detect_port(
        self,
        *,
        catalog_repo: ProductRepository,
    ) -> SerialAutoDetectResult:
        settings = await self.get_settings()
        baudrate = int(settings["baudrate"])
        read_timeout = float(settings["timeout"])
        if read_timeout <= 0:
            read_timeout = 0.1

        ports = [item.device for item in list_ports.comports() if item.device]
        if not ports:
            raise ValueError("Доступные COM-порты не найдены")

        stop_event = threading.Event()
        deadline = time.monotonic() + self._AUTO_DETECT_TIMEOUT_SECONDS
        tasks = [
            asyncio.create_task(
                asyncio.to_thread(
                    self._probe_port,
                    port,
                    baudrate,
                    read_timeout,
                    deadline,
                    stop_event,
                )
            )
            for port in ports
        ]

        try:
            pending = set(tasks)
            while pending:
                remaining = max(0.0, deadline - time.monotonic())
                if remaining <= 0:
                    break

                done, pending = await asyncio.wait(
                    pending,
                    timeout=remaining,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if not done:
                    break

                for task in done:
                    result = task.result()
                    if result is None:
                        continue

                    scanned_port, scanned_barcode = result
                    stop_event.set()
                    for pending_task in pending:
                        pending_task.cancel()
                    await asyncio.gather(*pending, return_exceptions=True)

                    product = await catalog_repo.get_by_barcode(scanned_barcode)
                    if product is None:
                        raise ValueError(
                            f"Сканер ответил на порту '{scanned_port}', но barcode '{scanned_barcode}' не найден в каталоге"
                        )

                    return SerialAutoDetectResult(
                        port=scanned_port,
                        barcode=scanned_barcode,
                        checked_ports=len(ports),
                    )

            raise ValueError(
                "Сканер не обнаружен. Отсканируйте тестовый barcode и повторите попытку."
            )
        finally:
            stop_event.set()
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _resolve_updated_at(self, name: str) -> str | None:
        item = await self._system_settings.get_setting_entry(name)
        value = item.get("updated_at")
        return str(value) if value else None

    @staticmethod
    def _probe_port(
        port: str,
        baudrate: int,
        read_timeout: float,
        deadline: float,
        stop_event: threading.Event,
    ) -> tuple[str, str] | None:
        try:
            with serial.Serial(port=port, baudrate=baudrate, timeout=read_timeout) as ser:
                try:
                    ser.reset_input_buffer()
                except Exception:
                    pass

                while not stop_event.is_set() and time.monotonic() < deadline:
                    line = ser.readline()
                    if not line:
                        continue
                    barcode = line.decode(errors="ignore").strip()
                    if not barcode:
                        continue
                    stop_event.set()
                    return port, barcode
        except (serial.SerialException, OSError, ValueError):
            return None
        return None

    def _normalize_payload(self, payload: dict) -> dict:
        return {
            "enabled": bool(payload.get("enabled", True)),
            "port": self._normalize_port(payload.get("port")),
            "baudrate": self._normalize_baudrate(payload.get("baudrate")),
            "timeout": self._normalize_timeout(payload.get("timeout")),
            "reconnect_delay": self._normalize_reconnect_delay(
                payload.get("reconnect_delay")
            ),
        }

    @staticmethod
    def _normalize_port(value: object) -> str:
        port = str(value or "").strip()
        if not port:
            raise ValueError("Serial port обязателен")
        return port

    @staticmethod
    def _normalize_baudrate(value: object) -> int:
        if value is None:
            raise ValueError("Baudrate обязателен")
        try:
            baudrate = int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("Baudrate должен быть целым числом") from exc
        if baudrate <= 0:
            raise ValueError("Baudrate должен быть больше 0")
        return baudrate

    @staticmethod
    def _normalize_timeout(value: object) -> float:
        if value is None:
            raise ValueError("Timeout обязателен")
        try:
            timeout = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("Timeout должен быть числом") from exc
        if timeout < 0:
            raise ValueError("Timeout не может быть отрицательным")
        return timeout

    @staticmethod
    def _normalize_reconnect_delay(value: object) -> float:
        if value is None:
            raise ValueError("Reconnect delay обязателен")
        try:
            reconnect_delay = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("Reconnect delay должен быть числом") from exc
        if reconnect_delay < 0:
            raise ValueError("Reconnect delay не может быть отрицательным")
        return reconnect_delay
