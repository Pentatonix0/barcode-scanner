from pydantic import BaseModel


class SerialSettingsDto(BaseModel):
    enabled: bool
    port: str
    baudrate: int
    timeout: float
    reconnect_delay: float
    running: bool
    updated_at: str | None


class SerialAutoDetectResponseDto(BaseModel):
    port: str
    barcode: str
    checked_ports: int
