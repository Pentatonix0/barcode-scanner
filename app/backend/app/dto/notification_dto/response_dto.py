from pydantic import BaseModel, Field


class EmailSettingsDto(BaseModel):
    enabled: bool
    host: str
    port: int | None
    username: str
    password_set: bool
    from_email: str
    to_emails: list[str] = Field(default_factory=list)
    use_tls: bool
    use_ssl: bool
    subject_template: str
    body_template: str
    updated_at: str | None


class EmailTestResultDto(BaseModel):
    ok: bool
    detail: str
