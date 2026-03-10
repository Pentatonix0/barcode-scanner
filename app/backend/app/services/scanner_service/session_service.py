from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from app.core.config.system_settings_registry import SETTINGS
from app.core.core_utils.models import Product
from app.db.db_models.scan_session_model import ScanSession
from app.db.db_models.scanned_item_model import ScannedItem
from app.db.db_models.unknown_item_model import UnknownItem
from app.db.repositories.scan_session_repository import ScanSessionRepository
from app.db.repositories.scanned_item_repository import ScannedItemRepository
from app.db.repositories.unknown_item_repository import UnknownItemRepository
from app.infrastructure.sqlite.database import Database
from app.repositories.excel_repository import ExcelProductRepository
from app.services.scanner_service.scan_service import ScanService
from app.services.system_settings_service import SystemSettingsService
from loguru import logger
from openpyxl import Workbook
from sqlalchemy.exc import SQLAlchemyError


@dataclass
class ScanResult:
    """Результат успешной обработки одного скана внутри активной сессии."""

    product: Product
    quantity: int
    total_items: int
    total_unique: int
    total_unknown: int


@dataclass
class UnknownScanResult:
    """Результат обработки скана barcode, отсутствующего в каталоге."""

    barcode: str
    quantity: int
    total_unknown: int
    total_items: int
    total_unique: int


class SessionService:
    """Сервис управления жизненным циклом сессии сканирования.

    Отвечает за:
    - старт/остановку/отмену сессии;
    - накопление текущих сканов в памяти;
    - операции ручной коррекции количества;
    - сохранение завершенной сессии в БД и экспорт в Excel.
    """

    def __init__(
        self,
        catalog_repo: ExcelProductRepository,
        scan_service: ScanService,
        export_dir: Path,
        system_settings: SystemSettingsService | None = None,
    ) -> None:
        """Инициализирует зависимости и внутреннее состояние текущей сессии."""
        self._catalog_repo = catalog_repo
        self._scan_service = scan_service
        self._default_export_dir = Path(export_dir).expanduser()
        self._system_settings = system_settings
        self._active = False
        self._session_id: int | None = None
        self._started_at: datetime | None = None
        self._items: dict[str, int] = {}
        self._unknown_items: dict[str, int] = {}
        self._item_names: dict[str, str] = {}
        self._scan_history: list[tuple[str, bool]] = []
        self._total_items = 0
        self._total_unique = 0
        self._total_unknown = 0
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        """Запускает новую сессию сканирования.

        Проверяет, что каталог загружен, затем сбрасывает все счетчики и
        переводит сервис в режим активной сессии.
        """
        meta = self._catalog_repo.meta()
        if meta.get("last_loaded_at") is None:
            raise ValueError("Catalog is not loaded")

        async with self._lock:
            if self._active:
                raise ValueError("Session already active")
            self._active = True
            self._session_id = None
            self._started_at = datetime.now()
            self._items = {}
            self._unknown_items = {}
            self._item_names = {}
            self._scan_history = []
            self._total_items = 0
            self._total_unique = 0
            self._total_unknown = 0

    async def stop(self) -> tuple[int, str, int, int, datetime, datetime]:
        """Останавливает активную сессию и возвращает итоговые данные.

        Шаги:
        1. Под lock снимает снимок текущего состояния.
        2. Сбрасывает in-memory состояние активной сессии.
        3. Сохраняет сессию в БД.
        4. Экспортирует результат в Excel.
        """
        async with self._lock:
            if not self._active:
                raise ValueError("Session is not active")
            active_session_id = self._session_id
            started_at = self._started_at or datetime.now()
            items_snapshot = dict(self._items)
            unknown_items_snapshot = dict(self._unknown_items)
            total_items = self._total_items
            total_unique = self._total_unique
            total_unknown = self._total_unknown
            self._active = False
            self._session_id = None
            self._started_at = None
            self._items = {}
            self._unknown_items = {}
            self._item_names = {}
            self._scan_history = []
            self._total_items = 0
            self._total_unique = 0
            self._total_unknown = 0

        finished_at = datetime.now()
        session_id = await self._persist(
            started_at,
            finished_at,
            total_items,
            total_unique,
            total_unknown,
            items_snapshot,
            unknown_items_snapshot,
            session_id=active_session_id,
        )
        excel_path = await self._export_excel(
            session_id, items_snapshot, unknown_items_snapshot
        )
        await self._save_excel_path(session_id, excel_path)
        return (
            session_id,
            excel_path,
            total_items,
            total_unique,
            started_at,
            finished_at,
        )

    async def cancel(self) -> None:
        """Отменяет активную сессию без сохранения в БД и без экспорта."""
        async with self._lock:
            if not self._active:
                raise ValueError("Session is not active")
            self._active = False
            self._session_id = None
            self._started_at = None
            self._items = {}
            self._unknown_items = {}
            self._item_names = {}
            self._scan_history = []
            self._total_items = 0
            self._total_unique = 0
            self._total_unknown = 0

    async def status(self) -> dict:
        """Возвращает текущий статус сессии и признак загрузки каталога."""
        meta = self._catalog_repo.meta()
        async with self._lock:
            return {
                "active": self._active,
                "session_id": self._session_id,
                "started_at": (
                    self._started_at.isoformat() if self._started_at else None
                ),
                "catalog_loaded": meta.get("last_loaded_at") is not None,
                "total_items": self._total_items,
                "total_unique": self._total_unique,
                "total_unknown": self._total_unknown,
            }

    async def resume(self, session_id: int) -> dict:
        """Возобновляет завершенную сессию и загружает её позиции в память."""
        if session_id <= 0:
            raise ValueError("Session id is required")

        meta = self._catalog_repo.meta()
        if meta.get("last_loaded_at") is None:
            raise ValueError("Catalog is not loaded")

        async with self._lock:
            if self._active:
                raise ValueError("Session already active")

        async with Database.get_async_session() as session:
            session_row = await ScanSessionRepository.get_by_id(
                session=session, session_id=session_id
            )
            if session_row is None:
                raise ValueError("Session not found")
            scanned_items = await ScannedItemRepository.list_by_session_id(
                session=session, session_id=session_id
            )
            unknown_items = await UnknownItemRepository.list_by_session_id(
                session=session, session_id=session_id
            )

        known_items_map = {item.barcode: item.quantity for item in scanned_items}
        unknown_items_map = {item.barcode: item.quantity for item in unknown_items}
        item_names = await self._resolve_item_names(list(known_items_map.keys()))

        restored_history: list[tuple[str, bool]] = []
        for item in scanned_items:
            restored_history.extend([(item.barcode, False)] * max(item.quantity, 0))
        for item in unknown_items:
            restored_history.extend([(item.barcode, True)] * max(item.quantity, 0))

        async with self._lock:
            if self._active:
                raise ValueError("Session already active")
            self._active = True
            self._session_id = session_id
            self._started_at = session_row.started_at
            self._items = known_items_map
            self._unknown_items = unknown_items_map
            self._item_names = item_names
            self._scan_history = restored_history
            self._total_items = sum(known_items_map.values())
            self._total_unique = len(known_items_map)
            self._total_unknown = sum(unknown_items_map.values())

        return await self.status()

    async def items(self) -> dict:
        """Возвращает текущие позиции сессии в порядке последних сканов сверху."""
        async with self._lock:
            items = [
                {
                    "barcode": barcode,
                    "name": self._item_names.get(barcode, barcode),
                    "quantity": self._items[barcode],
                }
                for barcode in self._ordered_barcodes()
            ]
            unknown_items = [
                {
                    "barcode": barcode,
                    "quantity": self._unknown_items[barcode],
                }
                for barcode in self._ordered_unknown_barcodes()
            ]
            return {
                "items": items,
                "unknown_items": unknown_items,
                "total_items": self._total_items,
                "total_unique": self._total_unique,
                "total_unknown": self._total_unknown,
            }

    async def history_list(self, limit: int = 50, offset: int = 0) -> dict:
        """Возвращает пагинированный список завершенных сессий из БД."""
        safe_limit = min(max(limit, 1), 200)
        safe_offset = max(offset, 0)

        async with Database.get_async_session() as session:
            sessions, total = await ScanSessionRepository.list_paginated(
                session=session,
                limit=safe_limit,
                offset=safe_offset,
            )
        export_dir = await self._resolve_export_dir()
        return {
            "sessions": [
                self._serialize_session(entry, fallback_export_dir=export_dir)
                for entry in sessions
            ],
            "total": total,
            "limit": safe_limit,
            "offset": safe_offset,
        }

    async def history_detail(self, session_id: int) -> dict:
        """Возвращает подробности одной завершенной сессии по `session_id`."""
        async with Database.get_async_session() as session:
            session_row = await ScanSessionRepository.get_by_id(
                session=session, session_id=session_id
            )
            if session_row is None:
                raise ValueError("Session not found")

            scanned_items = await ScannedItemRepository.list_by_session_id(
                session=session, session_id=session_id
            )
            unknown_items = await UnknownItemRepository.list_by_session_id(
                session=session, session_id=session_id
            )
        export_dir = await self._resolve_export_dir()
        item_names = await self._resolve_item_names(
            [item.barcode for item in scanned_items]
        )

        return {
            **self._serialize_session(session_row, fallback_export_dir=export_dir),
            "items": [
                {
                    "barcode": item.barcode,
                    "name": item_names.get(item.barcode, item.barcode),
                    "quantity": item.quantity,
                }
                for item in scanned_items
            ],
            "unknown_items": [
                {
                    "barcode": item.barcode,
                    "quantity": item.quantity,
                }
                for item in unknown_items
            ],
        }

    async def process_barcode(self, barcode: str) -> ScanResult | None:
        """Обрабатывает скан barcode в активной сессии.

        Если сессия неактивна, возвращает `None`.
        При активной сессии валидирует/находит товар через `ScanService`,
        обновляет счетчики и возвращает результат инкремента.
        """
        # Быстрый pre-check активности без долгого удержания lock на время I/O.
        async with self._lock:
            if not self._active:
                return None

        product = await self._scan_service.scan(barcode)

        # Повторно проверяем активность: пока шел поиск товара, сессию могли остановить.
        async with self._lock:
            if not self._active:
                return None
            current = self._items.get(product.barcode, 0)
            if current == 0:
                self._total_unique += 1
            current += 1
            self._items[product.barcode] = current
            self._item_names[product.barcode] = self._extract_product_name(
                product, product.barcode
            )
            self._scan_history.append((product.barcode, False))
            self._total_items += 1
            return ScanResult(
                product=product,
                quantity=current,
                total_items=self._total_items,
                total_unique=self._total_unique,
                total_unknown=self._total_unknown,
            )

    async def process_unknown_barcode(self, barcode: str) -> UnknownScanResult | None:
        """Сохраняет скан неизвестного barcode в активной сессии."""
        normalized = barcode.strip()
        if not normalized:
            return None

        async with self._lock:
            if not self._active:
                return None

            current = self._unknown_items.get(normalized, 0)
            current += 1
            self._unknown_items[normalized] = current
            self._scan_history.append((normalized, True))
            self._total_unknown += 1

            return UnknownScanResult(
                barcode=normalized,
                quantity=current,
                total_unknown=self._total_unknown,
                total_items=self._total_items,
                total_unique=self._total_unique,
            )

    async def decrement_item(self, barcode: str) -> dict:
        """Уменьшает количество позиции на 1 в активной сессии."""
        normalized = barcode.strip()
        if not normalized:
            raise ValueError("Barcode is required")

        async with self._lock:
            if not self._active:
                raise ValueError("Session is not active")

            current = self._items.get(normalized)
            if current is None:
                raise ValueError("Item not found")

            if current <= 1:
                self._items.pop(normalized, None)
                self._total_unique -= 1
            else:
                self._items[normalized] = current - 1

            self._total_items -= 1
            self._remove_from_scan_history(normalized, 1, unknown=False)
            return {
                **self._items_snapshot(),
                "barcode": normalized,
                "name": self._item_names.get(normalized, normalized),
                "quantity": self._items.get(normalized, 0),
            }

    async def remove_item(self, barcode: str) -> dict:
        """Полностью удаляет позицию из активной сессии."""
        normalized = barcode.strip()
        if not normalized:
            raise ValueError("Barcode is required")

        async with self._lock:
            if not self._active:
                raise ValueError("Session is not active")

            current = self._items.get(normalized)
            if current is None:
                raise ValueError("Item not found")

            self._items.pop(normalized, None)
            self._total_items -= current
            self._total_unique -= 1
            self._remove_from_scan_history(normalized, current, unknown=False)
            return {
                **self._items_snapshot(),
                "barcode": normalized,
                "name": self._item_names.get(normalized, normalized),
                "quantity": 0,
                "removed_quantity": current,
            }

    async def decrement_unknown_item(self, barcode: str) -> dict:
        """Уменьшает количество нераспознанной позиции на 1 в активной сессии."""
        normalized = barcode.strip()
        if not normalized:
            raise ValueError("Barcode is required")

        async with self._lock:
            if not self._active:
                raise ValueError("Session is not active")

            current = self._unknown_items.get(normalized)
            if current is None:
                raise ValueError("Unknown item not found")

            if current <= 1:
                self._unknown_items.pop(normalized, None)
            else:
                self._unknown_items[normalized] = current - 1

            self._total_unknown -= 1
            self._remove_from_scan_history(normalized, 1, unknown=True)
            return {
                **self._items_snapshot(),
                "barcode": normalized,
                "name": normalized,
                "quantity": self._unknown_items.get(normalized, 0),
                "unknown": True,
            }

    async def remove_unknown_item(self, barcode: str) -> dict:
        """Полностью удаляет нераспознанную позицию из активной сессии."""
        normalized = barcode.strip()
        if not normalized:
            raise ValueError("Barcode is required")

        async with self._lock:
            if not self._active:
                raise ValueError("Session is not active")

            current = self._unknown_items.get(normalized)
            if current is None:
                raise ValueError("Unknown item not found")

            self._unknown_items.pop(normalized, None)
            self._total_unknown -= current
            self._remove_from_scan_history(normalized, current, unknown=True)
            return {
                **self._items_snapshot(),
                "barcode": normalized,
                "name": normalized,
                "quantity": 0,
                "removed_quantity": current,
                "unknown": True,
            }

    async def increment_item(self, barcode: str, amount: int = 1) -> dict:
        """Увеличивает количество позиции (используется, например, для Undo)."""
        normalized = barcode.strip()
        if not normalized:
            raise ValueError("Barcode is required")
        if amount < 1:
            raise ValueError("Amount should be positive")

        async with self._lock:
            if not self._active:
                raise ValueError("Session is not active")

            current = self._items.get(normalized, 0)
            if current == 0:
                self._total_unique += 1
            next_quantity = current + amount
            self._items[normalized] = next_quantity
            if normalized not in self._item_names:
                self._item_names[normalized] = normalized
            self._total_items += amount
            self._scan_history.extend([(normalized, False)] * amount)
            return {
                **self._items_snapshot(),
                "barcode": normalized,
                "name": self._item_names.get(normalized, normalized),
                "quantity": next_quantity,
                "added_quantity": amount,
            }

    async def undo_last_scan(self) -> dict:
        """Откатывает последний скан по стеку `_scan_history`."""
        async with self._lock:
            if not self._active:
                raise ValueError("Session is not active")
            if not self._scan_history:
                raise ValueError("Nothing to undo")

            barcode, is_unknown = self._scan_history.pop()
            if is_unknown:
                current = self._unknown_items.get(barcode)
                if current is None:
                    raise ValueError("Nothing to undo")
                if current <= 1:
                    self._unknown_items.pop(barcode, None)
                    next_quantity = 0
                else:
                    next_quantity = current - 1
                    self._unknown_items[barcode] = next_quantity
                self._total_unknown -= 1
                return {
                    **self._items_snapshot(),
                    "barcode": barcode,
                    "name": barcode,
                    "quantity": next_quantity,
                    "unknown": True,
                }

            current = self._items.get(barcode)
            if current is None:
                raise ValueError("Nothing to undo")

            if current <= 1:
                self._items.pop(barcode, None)
                self._total_unique -= 1
                next_quantity = 0
            else:
                next_quantity = current - 1
                self._items[barcode] = next_quantity

            self._total_items -= 1
            return {
                **self._items_snapshot(),
                "barcode": barcode,
                "name": self._item_names.get(barcode, barcode),
                "quantity": next_quantity,
                "unknown": False,
            }

    async def _persist(
        self,
        started_at: datetime,
        finished_at: datetime,
        total_items: int,
        total_unique: int,
        total_unknown: int,
        items: dict[str, int],
        unknown_items: dict[str, int],
        session_id: int | None = None,
    ) -> int:
        """Сохраняет завершенную сессию и её позиции в БД, возвращает `session_id`."""
        try:
            async with Database.get_async_session() as session:
                if session_id is None:
                    scan_session = await ScanSessionRepository.create(
                        session=session,
                        started_at=started_at,
                        finished_at=finished_at,
                        total_items=total_items,
                        total_unique=total_unique,
                        total_unknown=total_unknown,
                    )
                else:
                    scan_session = await ScanSessionRepository.update_summary(
                        session=session,
                        session_id=session_id,
                        finished_at=finished_at,
                        total_items=total_items,
                        total_unique=total_unique,
                        total_unknown=total_unknown,
                    )
                    if scan_session is None:
                        raise RuntimeError("Session not found while persisting")
                    await ScannedItemRepository.delete_by_session_id(
                        session=session, session_id=scan_session.id
                    )
                    await UnknownItemRepository.delete_by_session_id(
                        session=session, session_id=scan_session.id
                    )
                scanned_items = [
                    ScannedItem(
                        session_id=scan_session.id,
                        barcode=barcode,
                        quantity=quantity,
                    )
                    for barcode, quantity in items.items()
                ]
                await ScannedItemRepository.bulk_create(
                    session=session, items=scanned_items
                )
                unknown_scanned_items = [
                    UnknownItem(
                        session_id=scan_session.id,
                        barcode=barcode,
                        quantity=quantity,
                    )
                    for barcode, quantity in unknown_items.items()
                ]
                await UnknownItemRepository.bulk_create(
                    session=session, items=unknown_scanned_items
                )
        except SQLAlchemyError as exc:
            raise RuntimeError("Failed to persist session") from exc

        return scan_session.id

    async def _export_excel(
        self, session_id: int, items: dict[str, int], unknown_items: dict[str, int]
    ) -> str:
        """Экспортирует позиции завершенной сессии в Excel-файл и возвращает путь."""
        meta = self._catalog_repo.meta()
        columns = list(meta.get("columns") or [])
        barcode_header = str(meta.get("barcode_column") or "barcode")

        if not columns:
            columns = [barcode_header]

        export_dir = await self._resolve_export_dir()
        export_dir.mkdir(parents=True, exist_ok=True)
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Scanned Items"
        sheet.append(["SCAN_QTY", *columns])

        barcode_header_lower = barcode_header.lower()

        for barcode, quantity in items.items():
            product = await self._catalog_repo.get_by_barcode(barcode)
            fields = product.fields if product else {}
            row_values = []
            for column in columns:
                if column.lower() == barcode_header_lower:
                    row_values.append(barcode)
                else:
                    row_values.append(fields.get(column))
            sheet.append([quantity, *row_values])

        unknown_sheet = workbook.create_sheet("Unknown Items")
        unknown_sheet.append(["UNKNOWN_SCAN_QTY", "barcode"])
        for barcode, quantity in unknown_items.items():
            unknown_sheet.append([quantity, barcode])

        path = export_dir / f"session_{session_id}.xlsx"
        workbook.save(path)
        return str(path)

    def _serialize_session(
        self, entry: ScanSession, fallback_export_dir: Path | None = None
    ) -> dict:
        """Преобразует ORM-модель завершенной сессии в DTO-совместимый словарь."""
        fallback_dir = fallback_export_dir or self._default_export_dir
        return {
            "id": entry.id,
            "started_at": entry.started_at.isoformat(),
            "finished_at": entry.finished_at.isoformat() if entry.finished_at else None,
            "total_items": entry.total_items,
            "total_unique": entry.total_unique,
            "total_unknown": entry.total_unknown,
            "excel_path": (
                entry.excel_path
                if entry.excel_path
                else str(fallback_dir / f"session_{entry.id}.xlsx")
            ),
        }

    def _items_snapshot(self) -> dict:
        """Возвращает текущий снимок позиций и агрегатов in-memory сессии."""
        items = [
            {
                "barcode": barcode,
                "name": self._item_names.get(barcode, barcode),
                "quantity": self._items[barcode],
            }
            for barcode in self._ordered_barcodes()
        ]
        unknown_items = [
            {
                "barcode": barcode,
                "quantity": self._unknown_items[barcode],
            }
            for barcode in self._ordered_unknown_barcodes()
        ]
        return {
            "items": items,
            "unknown_items": unknown_items,
            "total_items": self._total_items,
            "total_unique": self._total_unique,
            "total_unknown": self._total_unknown,
        }

    async def _resolve_item_names(self, barcodes: list[str]) -> dict[str, str]:
        """Возвращает отображаемые названия товаров по списку barcode."""
        names: dict[str, str] = {}
        for barcode in set(barcodes):
            product = await self._catalog_repo.get_by_barcode(barcode)
            if product is None:
                names[barcode] = barcode
                continue
            names[barcode] = self._extract_product_name(product, barcode)
        return names

    def _extract_product_name(self, product: Product, fallback: str) -> str:
        """Возвращает display-name товара (в приоритете поле `name`)."""
        fields = product.fields or {}
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

    def _remove_from_scan_history(
        self, barcode: str, amount: int, *, unknown: bool
    ) -> None:
        """Удаляет последние `amount` вхождений barcode из стека истории сканов."""
        if amount <= 0:
            return
        removed = 0
        for idx in range(len(self._scan_history) - 1, -1, -1):
            current_barcode, current_unknown = self._scan_history[idx]
            if current_barcode != barcode or current_unknown != unknown:
                continue
            self._scan_history.pop(idx)
            removed += 1
            if removed >= amount:
                break

    def _ordered_barcodes(self) -> list[str]:
        """Строит порядок позиций: сначала последние сканированные, затем остальные.

        Порядок формируется так:
        - проходим `_scan_history` с конца (новые сканы -> верх списка);
        - добавляем уникальные barcode, которые все еще есть в `_items`;
        - в конце добавляем редкие остатки, отсутствующие в истории.
        """
        ordered: list[str] = []
        seen: set[str] = set()

        for barcode, is_unknown in reversed(self._scan_history):
            if is_unknown:
                continue
            if barcode in seen:
                continue
            if barcode not in self._items:
                continue
            seen.add(barcode)
            ordered.append(barcode)

        for barcode in self._items.keys():
            if barcode in seen:
                continue
            ordered.append(barcode)

        return ordered

    def _ordered_unknown_barcodes(self) -> list[str]:
        """Строит порядок неизвестных barcode: последние сканы сверху."""
        ordered: list[str] = []
        seen: set[str] = set()

        for barcode, is_unknown in reversed(self._scan_history):
            if not is_unknown:
                continue
            if barcode in seen:
                continue
            if barcode not in self._unknown_items:
                continue
            seen.add(barcode)
            ordered.append(barcode)

        for barcode in self._unknown_items.keys():
            if barcode in seen:
                continue
            ordered.append(barcode)

        return ordered

    async def _resolve_export_dir(self) -> Path:
        if self._system_settings is None:
            return self._default_export_dir

        try:
            raw_path = await self._system_settings.get_system_setting(
                SETTINGS.REPORTS_OUTPUT_DIR
            )
        except Exception as exc:
            logger.warning(
                "Failed to read reports.output_dir from system settings, fallback to default: {}",
                exc,
            )
            return self._default_export_dir

        normalized = str(raw_path or "").strip()
        if not normalized:
            return self._default_export_dir

        return Path(normalized).expanduser()

    async def _save_excel_path(self, session_id: int, excel_path: str) -> None:
        """Сохраняет фактический путь Excel-отчета в запись сессии."""
        try:
            async with Database.get_async_session() as session:
                updated = await ScanSessionRepository.update_excel_path(
                    session=session,
                    session_id=session_id,
                    excel_path=excel_path,
                )
                if updated is None:
                    raise RuntimeError("Session not found while updating excel path")
        except SQLAlchemyError as exc:
            raise RuntimeError("Failed to save session excel path") from exc
