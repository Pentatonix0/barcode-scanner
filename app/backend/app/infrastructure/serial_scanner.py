import asyncio
import threading
import time
from typing import Optional

import serial
from app.core.core_utils.errors import InvalidBarcodeError, ProductNotFoundError
from app.infrastructure.ws_manager import WebSocketManager
from app.services.scanner_service.session_service import SessionService
from fastapi.encoders import jsonable_encoder
from loguru import logger


class SerialScanner:
    def __init__(
        self,
        port: str,
        baudrate: int,
        session_service: SessionService,
        ws_manager: WebSocketManager,
        loop: asyncio.AbstractEventLoop,
        timeout: float = 0.1,
        reconnect_delay: float = 2.0,
        enabled: bool = True,
    ) -> None:
        self._port = port
        self._baudrate = baudrate
        self._timeout = timeout
        self._reconnect_delay = reconnect_delay
        self._enabled = enabled
        self._session_service = session_service
        self._ws_manager = ws_manager
        self._loop = loop
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._state_lock = threading.Lock()

    @property
    def is_running(self) -> bool:
        thread = self._thread
        return thread is not None and thread.is_alive()

    def start(self) -> None:
        with self._state_lock:
            if self.is_running:
                return
            if not self._enabled:
                logger.info("Serial scanner start skipped: scanner is disabled")
                return
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._run, daemon=True)
            self._thread.start()

    def stop(self) -> None:
        with self._state_lock:
            self._stop_event.set()
            thread = self._thread
            self._thread = None
        if thread:
            thread.join(timeout=2)

    def reconfigure(
        self,
        *,
        port: str,
        baudrate: int,
        timeout: float,
        reconnect_delay: float,
        enabled: bool,
    ) -> None:
        self.stop()
        with self._state_lock:
            self._port = port
            self._baudrate = baudrate
            self._timeout = timeout
            self._reconnect_delay = reconnect_delay
            self._enabled = enabled
        self.start()

    def current_settings(self) -> dict:
        with self._state_lock:
            return {
                "enabled": self._enabled,
                "port": self._port,
                "baudrate": self._baudrate,
                "timeout": self._timeout,
                "reconnect_delay": self._reconnect_delay,
                "running": self.is_running,
            }

    def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                with serial.Serial(
                    self._port,
                    self._baudrate,
                    timeout=self._timeout,
                ) as ser:
                    logger.info("Listening on {} @ {}", self._port, self._baudrate)
                    while not self._stop_event.is_set():
                        line = ser.readline()
                        if not line:
                            continue
                        barcode = line.decode(errors="ignore").strip()
                        if not barcode:
                            continue
                        asyncio.run_coroutine_threadsafe(
                            self._process_barcode(barcode), self._loop
                        )
            except serial.SerialException as exc:
                logger.warning("Serial error: {}", exc)
                time.sleep(self._reconnect_delay)
            except Exception as exc:
                logger.exception("Unexpected scanner error: {}", exc)
                time.sleep(self._reconnect_delay)

    async def _process_barcode(self, barcode: str) -> None:
        try:
            result = await self._session_service.process_barcode(barcode)
        except InvalidBarcodeError:
            await self._ws_manager.broadcast({"type": "invalid", "barcode": barcode})
            return
        except ProductNotFoundError:
            unknown_result = await self._session_service.process_unknown_barcode(barcode)
            if not unknown_result:
                await self._ws_manager.broadcast({"type": "not_found", "barcode": barcode})
                return
            await self._ws_manager.broadcast(
                {
                    "type": "unknown_scan",
                    "unknown": True,
                    "barcode": unknown_result.barcode,
                    "name": unknown_result.barcode,
                    "quantity": unknown_result.quantity,
                    "total_unknown": unknown_result.total_unknown,
                    "total_items": unknown_result.total_items,
                    "total_unique": unknown_result.total_unique,
                }
            )
            return
        except Exception as exc:
            await self._ws_manager.broadcast(
                {"type": "error", "barcode": barcode, "detail": str(exc)}
            )
            return

        if not result:
            return

        await self._ws_manager.broadcast(
            {
                "type": "scan",
                "barcode": result.product.barcode,
                "name": self._extract_product_name(result.product.fields, result.product.barcode),
                "fields": jsonable_encoder(result.product.fields),
                "quantity": result.quantity,
                "total_items": result.total_items,
                "total_unique": result.total_unique,
                "total_unknown": result.total_unknown,
            }
        )

    @staticmethod
    def _extract_product_name(fields: dict, fallback: str) -> str:
        """Extract preferred display name from product fields."""
        lower_to_key = {str(key).strip().lower(): key for key in fields.keys()}
        for candidate in ("name", "наименование", "title", "product_name"):
            key = lower_to_key.get(candidate)
            if key is None:
                continue
            value = fields.get(key)
            if value is None:
                continue
            text = str(value).strip()
            if text:
                return text
        return fallback
