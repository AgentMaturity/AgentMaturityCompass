"""Shared persistence helpers for production-grade product modules.

This module centralizes defaults used by product subsystem queues so state can be
shared across workers/processes with consistent configuration. It also documents a
small retention policy used by queue data so operational defaults are explicit and
re-usable.

Retention policy (documented for jobs + escalation items):

- Completed and failed items are retained for ``PRODUCT_QUEUE_RETENTION_DAYS``.
- Open / in-progress items are retained indefinitely until they naturally transition
  to a terminal state.
- The product DB path is configurable through ``AMC_PRODUCT_DB_PATH``.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from amc.core.config import get_settings

PRODUCT_QUEUE_DB_FILE = "amc_product_queues.db"
PRODUCT_DB_PATH_ENV = "AMC_PRODUCT_DB_PATH"
PRODUCT_QUEUE_RETENTION_DAYS = 30


def product_db_path(db_path: str | Path | None = None) -> Path:
    """Resolve the SQLite path used by product queues.

    Args:
        db_path: Explicit path override. ``None`` uses ``AMC_PRODUCT_DB_PATH`` env var
            when set, then falls back to ``workspace_dir / amc_product_queues.db``.

    Returns:
        Path to SQLite DB (or ``":memory:"`` string in path semantics is also accepted
        by SQLite directly by the caller).
    """
    if db_path is not None:
        return Path(db_path)

    explicit = os.getenv(PRODUCT_DB_PATH_ENV)
    if explicit:
        return Path(explicit)

    return get_settings().workspace_dir / PRODUCT_QUEUE_DB_FILE


def queue_retention_cutoff(now: datetime | None = None) -> datetime:
    """Return UTC cutoff timestamp for terminal queue cleanup.

    The default policy keeps terminal jobs/handoff records for
    ``PRODUCT_QUEUE_RETENTION_DAYS`` by default.
    """
    now = now or datetime.now(timezone.utc)
    return now - timedelta(days=PRODUCT_QUEUE_RETENTION_DAYS)


__all__ = [
    "PRODUCT_DB_PATH_ENV",
    "PRODUCT_QUEUE_DB_FILE",
    "PRODUCT_QUEUE_RETENTION_DAYS",
    "product_db_path",
    "queue_retention_cutoff",
]
