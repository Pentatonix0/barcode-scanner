import argparse
from contextlib import asynccontextmanager

import uvicorn
from app.api_endpoints.catalog_endpoints import catalog_router
from app.api_endpoints.notification_endpoints import notification_router
from app.api_endpoints.scanner_endpoints import scanner_router
from app.api_endpoints.serial_settings_endpoints import serial_settings_router
from app.api_endpoints.system_settings_endpoints import system_settings_router
from app.core.config.init_app_config import app_config
from app.core.config.init_logger import init_logger
from app.core.core_utils.init_server import init_server, shutdown_server
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting scanner service")
    init_logger(app_config.logger)
    try:
        await init_server()
        yield
    finally:
        await shutdown_server()
        logger.info("Scanner service stopped")


app = FastAPI(
    title="Warehouse Scanner API",
    version="1.0.0",
    description="API for barcode scanning with live WebSocket updates.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=app_config.cors.origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


app.include_router(catalog_router)
app.include_router(scanner_router)
app.include_router(notification_router)
app.include_router(serial_settings_router)
app.include_router(system_settings_router)


def _parse_runtime_server_options() -> tuple[str, int]:
    """Read optional host/port overrides from CLI args.

    This keeps local/dev defaults from app config, but allows Electron main
    process to pass dynamic values when spawning backend binary.
    """
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--host", type=str, default=app_config.server.server_host)
    parser.add_argument("--port", type=int, default=app_config.server.server_port)
    args, _ = parser.parse_known_args()
    return args.host, args.port


if __name__ == "__main__":
    try:
        is_frozen = getattr(__import__("sys"), "frozen", False)
        host, port = _parse_runtime_server_options()
        uvicorn.run(
            app if is_frozen else "main:app",
            host=host,
            port=port,
            reload=app_config.server.server_debug and not is_frozen,
            log_level="info",
            access_log=app_config.server.server_access_log,
        )
    except Exception as exc:
        logger.critical(exc)
        raise
