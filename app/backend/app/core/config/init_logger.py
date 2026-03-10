import sys

from app.core.config.config import LoggerSettings
from loguru import logger


def init_logger(settings: LoggerSettings) -> None:
    logger.remove()
    logger.add(sys.stdout, level=settings.logger_level)
