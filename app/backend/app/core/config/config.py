from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Server(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    server_host: str = "localhost"
    server_port: int = 8059
    server_debug: bool = True
    server_access_log: bool = True


class LoggerSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    logger_level: str = "DEBUG"


class CatalogConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    catalog_path: Path = Path("data/catalog.xlsx")
    barcode_column: str = "barcode"


class SerialConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    serial_port: str = "/dev/tty.usbserial-10"
    serial_baudrate: int = 9600
    serial_timeout: float = 0.1
    serial_reconnect_delay: float = 2.0


class WebSocketConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    ws_path: str = "/ws"


class SqliteConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_path: Path = Field(
        default=Path("data/scanner.sqlite"), validation_alias="SQLITE_DB_PATH"
    )


class ExportConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    sessions_dir: Path = Field(
        default=Path("data/sessions"), validation_alias="SESSIONS_EXPORT_DIR"
    )


class CorsConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    cors_allow_origins: str = "*"

    def origins(self) -> list[str]:
        return [
            item.strip() for item in self.cors_allow_origins.split(",") if item.strip()
        ]


class NotificationConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    smtp_secret_key: str = Field(
        default="change-me-smtp-secret",
        validation_alias="SMTP_SECRET_KEY",
    )
    smtp_timeout_seconds: float = Field(
        default=10.0,
        validation_alias="SMTP_TIMEOUT_SECONDS",
    )


class Config:
    server: Server = Server()
    logger: LoggerSettings = LoggerSettings()
    catalog: CatalogConfig = CatalogConfig()
    serial: SerialConfig = SerialConfig()
    websocket: WebSocketConfig = WebSocketConfig()
    sqlite: SqliteConfig = SqliteConfig()
    export: ExportConfig = ExportConfig()
    cors: CorsConfig = CorsConfig()
    notifications: NotificationConfig = NotificationConfig()
