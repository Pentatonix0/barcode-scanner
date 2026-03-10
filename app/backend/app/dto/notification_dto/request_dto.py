from pydantic import BaseModel, Field


class EmailSettingsUpsertDto(BaseModel):
    enabled: bool = False
    host: str | None = None
    port: int | None = Field(default=None, ge=1, le=65535)
    username: str | None = None
    password: str | None = None
    from_email: str | None = None
    to_emails: list[str] = Field(default_factory=list)
    use_tls: bool = True
    use_ssl: bool = False
    subject_template: str | None = None
    body_template: str | None = None
