from pydantic import BaseModel


class SessionItemDto(BaseModel):
    barcode: str
    name: str
    quantity: int


class UnknownItemDto(BaseModel):
    barcode: str
    quantity: int


class SessionItemsDto(BaseModel):
    items: list[SessionItemDto]
    unknown_items: list[UnknownItemDto]
    total_items: int
    total_unique: int
    total_unknown: int


class SessionStatusDto(BaseModel):
    active: bool
    session_id: int | None = None
    started_at: str | None
    catalog_loaded: bool
    total_items: int
    total_unique: int
    total_unknown: int


class SessionStopDto(BaseModel):
    session_id: int
    excel_path: str
    total_items: int
    total_unique: int
    email_status: str
    email_detail: str | None


class SessionHistoryEntryDto(BaseModel):
    id: int
    started_at: str
    finished_at: str | None
    total_items: int
    total_unique: int
    total_unknown: int
    excel_path: str


class SessionHistoryListDto(BaseModel):
    sessions: list[SessionHistoryEntryDto]
    total: int
    limit: int
    offset: int


class SessionHistoryDetailsDto(BaseModel):
    id: int
    started_at: str
    finished_at: str | None
    total_items: int
    total_unique: int
    total_unknown: int
    excel_path: str
    items: list[SessionItemDto]
    unknown_items: list[UnknownItemDto]
