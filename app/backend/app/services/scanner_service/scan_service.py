from app.core.core_utils.errors import InvalidBarcodeError, ProductNotFoundError
from app.core.core_utils.models import Product
from app.repositories.base import ProductRepository


class ScanService:
    """Сервис бизнес-валидации одного скана.

    Отвечает только за проверку входного barcode и поиск товара в репозитории.
    Не управляет сессией сканирования и не хранит состояние сканов.
    """

    def __init__(self, repository: ProductRepository) -> None:
        """Сохраняет источник данных, из которого будут искаться товары."""
        self._repository = repository

    async def scan(self, barcode: str) -> Product:
        """Возвращает товар по barcode или выбрасывает доменную ошибку.

        Шаги:
        1. Нормализация входа (trim + защита от пустого значения).
        2. Поиск товара через репозиторий.
        3. Явная ошибка, если barcode не найден.
        """
        # Нормализуем вход: удаляем пробелы и преобразуем None к пустой строке.
        barcode = barcode.strip() if barcode else ""
        if not barcode:
            # Пустой/некорректный barcode: сразу доменная ошибка валидации.
            raise InvalidBarcodeError("Barcode is empty")

        # Ищем товар в текущем источнике данных (Excel/другой репозиторий).
        product = await self._repository.get_by_barcode(barcode)
        if not product:
            # Barcode валиден по формату, но отсутствует в каталоге.
            raise ProductNotFoundError(f"Barcode '{barcode}' not found")

        # Успех: возвращаем найденную карточку товара.
        return product
