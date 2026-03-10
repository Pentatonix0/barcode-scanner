from typing import Any

from pydantic import BaseModel


class CatalogMetaDto(BaseModel):
    count: int
    columns: list[str]
    last_loaded_at: str | None
    file: str


class CatalogItemDto(BaseModel):
    barcode: str
    fields: dict[str, Any]
