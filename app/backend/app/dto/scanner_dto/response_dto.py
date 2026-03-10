from pydantic import BaseModel


class ScannerStatusDto(BaseModel):
    port: str
    baudrate: int
    running: bool
    catalog_loaded: bool
    catalog_count: int
