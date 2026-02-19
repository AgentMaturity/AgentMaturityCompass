"""Structlog setup for AMC Platform."""

from __future__ import annotations

import logging
import sys

import structlog

try:
    _unicode_decoder = structlog.processors.UnicodeDecoder()
except AttributeError:  # compatibility across structlog releases
    _unicode_decoder = lambda event_dict: event_dict


def configure_logging(*, debug: bool = False, json_output: bool | None = None) -> None:
    """Configure structlog + standard logging.

    Args:
        debug: Enable verbose development logging.
        json_output: If None, defaults to not debug.
    """
    if json_output is None:
        json_output = not debug

    logging.basicConfig(level=logging.DEBUG if debug else logging.INFO)

    processors = [
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        _unicode_decoder,
    ]

    if json_output:
        formatter = structlog.processors.JSONRenderer()
    else:
        formatter = structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=processors + [formatter],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
        wrapper_class=structlog.stdlib.BoundLogger,
    )

    handler = logging.StreamHandler(sys.stdout)
    logging.getLogger().handlers[:] = [handler]
    logging.getLogger("asyncio").setLevel(logging.WARNING)


def get_logger(name: str):
    return structlog.get_logger(name)
