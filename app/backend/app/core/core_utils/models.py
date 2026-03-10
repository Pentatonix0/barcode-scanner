from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Product:
    barcode: str
    fields: dict[str, Any]
