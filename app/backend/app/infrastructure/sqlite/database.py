from __future__ import annotations

from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncGenerator, Generator, Optional

from app.infrastructure.sqlite.models import Base
from sqlalchemy import Engine, create_engine
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import Session, sessionmaker


@dataclass(slots=True)
class SqliteConfig:
    path: Path
    echo: bool = False


class Database:
    _async_engine: Optional[AsyncEngine] = None
    _async_session_factory: Optional[async_sessionmaker[AsyncSession]] = None
    _sync_engine: Optional[Engine] = None
    _sync_session_factory: Optional[sessionmaker[Session]] = None
    _initialized: bool = False

    @classmethod
    def initialize(cls, config: SqliteConfig) -> None:
        if cls._initialized:
            return

        db_path = Path(config.path).expanduser()
        db_path.parent.mkdir(parents=True, exist_ok=True)

        async_url = f"sqlite+aiosqlite:///{db_path}"
        sync_url = f"sqlite:///{db_path}"

        cls._async_engine = create_async_engine(
            async_url,
            echo=config.echo,
            future=True,
        )
        cls._async_session_factory = async_sessionmaker(
            cls._async_engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )

        cls._sync_engine = create_engine(
            sync_url,
            echo=config.echo,
            future=True,
            connect_args={"check_same_thread": False},
        )
        cls._sync_session_factory = sessionmaker(
            cls._sync_engine,
            class_=Session,
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )

        cls._initialized = True

    @classmethod
    def _ensure_initialized(cls) -> None:
        if not cls._initialized:
            raise RuntimeError(
                "Database.initialize must be called before requesting sessions"
            )

    @classmethod
    @asynccontextmanager
    async def get_async_session(cls) -> AsyncGenerator[AsyncSession, None]:
        cls._ensure_initialized()
        session = cls._async_session_factory()
        try:
            yield session
        finally:
            await session.close()

    @classmethod
    @contextmanager
    def get_session(cls) -> Generator[Session, None, None]:
        cls._ensure_initialized()
        session = cls._sync_session_factory()
        try:
            yield session
        finally:
            session.close()

    @classmethod
    def create_all(cls) -> None:
        cls._ensure_initialized()
        if cls._sync_engine is None:
            raise RuntimeError("Sync engine is not initialized")
        Base.metadata.create_all(bind=cls._sync_engine)


__all__ = ["SqliteConfig", "Database", "Base"]
