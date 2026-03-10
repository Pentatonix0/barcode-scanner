from abc import ABC, abstractmethod
from typing import Optional

from app.core.core_utils.models import Product


class ProductRepository(ABC):
    @abstractmethod
    async def get_by_barcode(self, barcode: str) -> Optional[Product]:
        raise NotImplementedError

    @abstractmethod
    async def reload(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def meta(self) -> dict:
        raise NotImplementedError
