from pydantic import BaseModel, Field


class SerialSettingsUpsertDto(BaseModel):
    enabled: bool = True
    port: str = Field(min_length=1, max_length=255)
    baudrate: int = Field(ge=1, le=10_000_000)
    timeout: float = Field(ge=0, le=60)
    reconnect_delay: float = Field(ge=0, le=60)
