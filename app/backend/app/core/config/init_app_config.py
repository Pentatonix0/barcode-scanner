from app.core.config.config import Config
from loguru import logger


def init_app_config() -> Config:
    try:
        cfg = Config()
        logger.info("Configuration loaded")
        return cfg
    except Exception as exc:
        logger.error(f"Failed to load configuration: {exc}")
        raise


app_config = init_app_config()
