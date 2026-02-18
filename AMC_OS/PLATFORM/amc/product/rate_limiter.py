"""AMC Product — Rate Limit Manager across APIs.

Per-connector limits, queue/schedule calls, next-available-window reporting,
quota tracking. SQLite-backed.

API: /api/v1/product/rate-limits/*
"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import UUID, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_NAMESPACE = UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS rate_limit_configs (
    config_id               TEXT NOT NULL PRIMARY KEY,
    connector_id            TEXT NOT NULL UNIQUE,
    name                    TEXT NOT NULL,
    requests_per_window     INTEGER NOT NULL DEFAULT 100,
    window_s                REAL NOT NULL DEFAULT 60.0,
    burst_limit             INTEGER NOT NULL DEFAULT 0,
    enabled                 INTEGER NOT NULL DEFAULT 1,
    metadata_json           TEXT NOT NULL DEFAULT '{}',
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rlc_connector ON rate_limit_configs(connector_id);

CREATE TABLE IF NOT EXISTS rate_limit_usage (
    usage_id        TEXT NOT NULL PRIMARY KEY,
    config_id       TEXT NOT NULL,
    connector_id    TEXT NOT NULL,
    window_start    TEXT NOT NULL,
    window_end      TEXT NOT NULL,
    count           INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    FOREIGN KEY (config_id) REFERENCES rate_limit_configs(config_id)
);
CREATE INDEX IF NOT EXISTS idx_rlu_connector_window
    ON rate_limit_usage(connector_id, window_start, window_end);

CREATE TABLE IF NOT EXISTS rate_limit_queue (
    queue_id        TEXT NOT NULL PRIMARY KEY,
    config_id       TEXT NOT NULL,
    connector_id    TEXT NOT NULL,
    payload_json    TEXT NOT NULL DEFAULT '{}',
    priority        INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending',
    scheduled_at    TEXT,
    executed_at     TEXT,
    created_at      TEXT NOT NULL,
    FOREIGN KEY (config_id) REFERENCES rate_limit_configs(config_id)
);
CREATE INDEX IF NOT EXISTS idx_rlq_connector_status
    ON rate_limit_queue(connector_id, status, priority DESC);

CREATE TABLE IF NOT EXISTS quota_tracking (
    quota_id        TEXT NOT NULL PRIMARY KEY,
    connector_id    TEXT NOT NULL,
    period          TEXT NOT NULL,
    quota_limit     INTEGER NOT NULL DEFAULT 0,
    used            INTEGER NOT NULL DEFAULT 0,
    reset_at        TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    UNIQUE(connector_id, period)
);
CREATE INDEX IF NOT EXISTS idx_qt_connector ON quota_tracking(connector_id, period);
"""


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class QueueStatus(str, Enum):
    PENDING = "pending"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class QuotaPeriod(str, Enum):
    MINUTE = "minute"
    HOUR = "hour"
    DAY = "day"
    MONTH = "month"


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class RateLimitConfig:
    config_id: str
    connector_id: str
    name: str
    requests_per_window: int
    window_s: float
    burst_limit: int
    enabled: bool
    metadata: dict[str, Any]
    created_at: str
    updated_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "config_id": self.config_id,
            "connector_id": self.connector_id,
            "name": self.name,
            "requests_per_window": self.requests_per_window,
            "window_s": self.window_s,
            "burst_limit": self.burst_limit,
            "enabled": self.enabled,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class UsageWindow:
    usage_id: str
    config_id: str
    connector_id: str
    window_start: str
    window_end: str
    count: int
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "usage_id": self.usage_id,
            "config_id": self.config_id,
            "connector_id": self.connector_id,
            "window_start": self.window_start,
            "window_end": self.window_end,
            "count": self.count,
            "created_at": self.created_at,
        }


@dataclass
class QueuedCall:
    queue_id: str
    config_id: str
    connector_id: str
    payload: dict[str, Any]
    priority: int
    status: QueueStatus
    scheduled_at: str | None
    executed_at: str | None
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "queue_id": self.queue_id,
            "config_id": self.config_id,
            "connector_id": self.connector_id,
            "payload": self.payload,
            "priority": self.priority,
            "status": self.status.value,
            "scheduled_at": self.scheduled_at,
            "executed_at": self.executed_at,
            "created_at": self.created_at,
        }


@dataclass
class QuotaRecord:
    quota_id: str
    connector_id: str
    period: QuotaPeriod
    quota_limit: int
    used: int
    reset_at: str
    created_at: str
    updated_at: str

    @property
    def remaining(self) -> int:
        return max(0, self.quota_limit - self.used)

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "quota_id": self.quota_id,
            "connector_id": self.connector_id,
            "period": self.period.value,
            "quota_limit": self.quota_limit,
            "used": self.used,
            "remaining": self.remaining,
            "reset_at": self.reset_at,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _config_id(connector_id: str) -> str:
    return str(uuid5(_NAMESPACE, f"config:{connector_id}"))


def _usage_id(connector_id: str, window_start: str) -> str:
    return str(uuid5(_NAMESPACE, f"usage:{connector_id}:{window_start}"))


def _queue_id(connector_id: str, ts: str, priority: int) -> str:
    return str(uuid5(_NAMESPACE, f"queue:{connector_id}:{ts}:{priority}"))


def _quota_id(connector_id: str, period: str) -> str:
    return str(uuid5(_NAMESPACE, f"quota:{connector_id}:{period}"))


def _row_to_config(row: sqlite3.Row) -> RateLimitConfig:
    return RateLimitConfig(
        config_id=row["config_id"],
        connector_id=row["connector_id"],
        name=row["name"],
        requests_per_window=row["requests_per_window"],
        window_s=row["window_s"],
        burst_limit=row["burst_limit"],
        enabled=bool(row["enabled"]),
        metadata=json.loads(row["metadata_json"] or "{}"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_usage(row: sqlite3.Row) -> UsageWindow:
    return UsageWindow(
        usage_id=row["usage_id"],
        config_id=row["config_id"],
        connector_id=row["connector_id"],
        window_start=row["window_start"],
        window_end=row["window_end"],
        count=row["count"],
        created_at=row["created_at"],
    )


def _row_to_queued(row: sqlite3.Row) -> QueuedCall:
    return QueuedCall(
        queue_id=row["queue_id"],
        config_id=row["config_id"],
        connector_id=row["connector_id"],
        payload=json.loads(row["payload_json"] or "{}"),
        priority=row["priority"],
        status=QueueStatus(row["status"]),
        scheduled_at=row["scheduled_at"],
        executed_at=row["executed_at"],
        created_at=row["created_at"],
    )


def _row_to_quota(row: sqlite3.Row) -> QuotaRecord:
    return QuotaRecord(
        quota_id=row["quota_id"],
        connector_id=row["connector_id"],
        period=QuotaPeriod(row["period"]),
        quota_limit=row["quota_limit"],
        used=row["used"],
        reset_at=row["reset_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


# ---------------------------------------------------------------------------
# RateLimitManager
# ---------------------------------------------------------------------------


class RateLimitManager:
    """Thread-safe rate limit manager with window-based counters, queuing, and quota tracking."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path: Path = product_db_path(db_path)
        self._lock = Lock()
        self._init_db()
        log.info("rate_limit_manager.init", db=str(self._db_path))

    # ------------------------------------------------------------------
    # Config CRUD
    # ------------------------------------------------------------------

    def create_config(
        self,
        connector_id: str,
        name: str,
        requests_per_window: int = 100,
        window_s: float = 60.0,
        burst_limit: int = 0,
        metadata: dict[str, Any] | None = None,
    ) -> RateLimitConfig:
        now = _iso(_utc_now())
        config_id = _config_id(connector_id)
        meta = metadata or {}
        with self._lock:
            conn = self._connect()
            conn.execute(
                """INSERT OR REPLACE INTO rate_limit_configs
                   (config_id, connector_id, name, requests_per_window,
                    window_s, burst_limit, enabled, metadata_json, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (config_id, connector_id, name, requests_per_window,
                 window_s, burst_limit, 1, json.dumps(meta), now, now),
            )
            conn.commit()
            conn.close()
        cfg = RateLimitConfig(
            config_id=config_id, connector_id=connector_id, name=name,
            requests_per_window=requests_per_window, window_s=window_s,
            burst_limit=burst_limit, enabled=True, metadata=meta,
            created_at=now, updated_at=now,
        )
        log.info("rate_limit_manager.config_created",
                 config_id=config_id, connector_id=connector_id)
        return cfg

    def get_config(self, config_id: str) -> RateLimitConfig | None:
        conn = self._connect()
        row = conn.execute(
            "SELECT * FROM rate_limit_configs WHERE config_id=?", (config_id,)
        ).fetchone()
        conn.close()
        return _row_to_config(row) if row else None

    def get_config_by_connector(self, connector_id: str) -> RateLimitConfig | None:
        conn = self._connect()
        row = conn.execute(
            "SELECT * FROM rate_limit_configs WHERE connector_id=?", (connector_id,)
        ).fetchone()
        conn.close()
        return _row_to_config(row) if row else None

    def list_configs(self) -> list[RateLimitConfig]:
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM rate_limit_configs ORDER BY created_at DESC"
        ).fetchall()
        conn.close()
        return [_row_to_config(r) for r in rows]

    # ------------------------------------------------------------------
    # Rate checking & recording
    # ------------------------------------------------------------------

    def check_limit(
        self, connector_id: str, now: datetime | None = None
    ) -> dict[str, Any]:
        """Check whether the connector has quota remaining in the current window.

        Returns a dict: {allowed, remaining, next_window (ISO), retry_after_s}.
        """
        cfg = self.get_config_by_connector(connector_id)
        if cfg is None or not cfg.enabled:
            return {
                "allowed": True,
                "remaining": 999999,
                "next_window": _iso(_utc_now()),
                "retry_after_s": 0.0,
            }

        ts = now or _utc_now()
        window_start, window_end = self._current_window(ts, cfg.window_s)
        ws_iso = _iso(window_start)
        we_iso = _iso(window_end)

        conn = self._connect()
        row = conn.execute(
            """SELECT count FROM rate_limit_usage
               WHERE connector_id=? AND window_start=?""",
            (connector_id, ws_iso),
        ).fetchone()
        conn.close()

        current_count = row["count"] if row else 0
        limit = cfg.burst_limit if cfg.burst_limit > 0 else cfg.requests_per_window
        remaining = max(0, limit - current_count)
        allowed = remaining > 0

        retry_after_s = 0.0
        if not allowed:
            retry_after_s = (window_end - ts).total_seconds()
            retry_after_s = max(0.0, retry_after_s)

        return {
            "allowed": allowed,
            "remaining": remaining,
            "next_window": we_iso,
            "retry_after_s": retry_after_s,
        }

    def record_call(
        self, connector_id: str, now: datetime | None = None
    ) -> UsageWindow:
        """Increment the request counter for the current window."""
        cfg = self.get_config_by_connector(connector_id)
        if cfg is None:
            raise ValueError(f"No config for connector: {connector_id}")

        ts = now or _utc_now()
        window_start, window_end = self._current_window(ts, cfg.window_s)
        ws_iso = _iso(window_start)
        we_iso = _iso(window_end)
        usage_id = _usage_id(connector_id, ws_iso)
        created_at = _iso(ts)

        with self._lock:
            conn = self._connect()
            existing = conn.execute(
                "SELECT * FROM rate_limit_usage WHERE usage_id=?", (usage_id,)
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE rate_limit_usage SET count=count+1 WHERE usage_id=?",
                    (usage_id,),
                )
            else:
                conn.execute(
                    """INSERT INTO rate_limit_usage
                       (usage_id, config_id, connector_id, window_start, window_end,
                        count, created_at)
                       VALUES (?,?,?,?,?,?,?)""",
                    (usage_id, cfg.config_id, connector_id,
                     ws_iso, we_iso, 1, created_at),
                )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM rate_limit_usage WHERE usage_id=?", (usage_id,)
            ).fetchone()
            conn.close()
        return _row_to_usage(row)

    # ------------------------------------------------------------------
    # Queue management
    # ------------------------------------------------------------------

    def enqueue_call(
        self,
        connector_id: str,
        payload: dict[str, Any],
        priority: int = 0,
    ) -> QueuedCall:
        cfg = self.get_config_by_connector(connector_id)
        if cfg is None:
            raise ValueError(f"No config for connector: {connector_id}")

        now = _utc_now()
        now_iso = _iso(now)
        queue_id = _queue_id(connector_id, now_iso, priority)
        next_win = self.get_next_window(connector_id, now)
        scheduled_at = _iso(next_win)

        with self._lock:
            conn = self._connect()
            conn.execute(
                """INSERT INTO rate_limit_queue
                   (queue_id, config_id, connector_id, payload_json, priority,
                    status, scheduled_at, executed_at, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (queue_id, cfg.config_id, connector_id, json.dumps(payload),
                 priority, QueueStatus.PENDING.value, scheduled_at, None, now_iso),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM rate_limit_queue WHERE queue_id=?", (queue_id,)
            ).fetchone()
            conn.close()
        log.info("rate_limit_manager.call_enqueued",
                 queue_id=queue_id, connector_id=connector_id)
        return _row_to_queued(row)

    def get_next_window(
        self, connector_id: str, now: datetime | None = None
    ) -> datetime:
        """Return the datetime when the next rate-limit window opens."""
        cfg = self.get_config_by_connector(connector_id)
        ts = now or _utc_now()
        if cfg is None:
            return ts
        _, window_end = self._current_window(ts, cfg.window_s)
        # Check if current window has capacity; if so, now is the next slot
        status = self.check_limit(connector_id, ts)
        if status["allowed"]:
            return ts
        return window_end

    def get_queue(
        self, connector_id: str, status: QueueStatus | None = None
    ) -> list[QueuedCall]:
        conn = self._connect()
        if status:
            rows = conn.execute(
                """SELECT * FROM rate_limit_queue
                   WHERE connector_id=? AND status=?
                   ORDER BY priority DESC, created_at ASC""",
                (connector_id, status.value),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM rate_limit_queue
                   WHERE connector_id=?
                   ORDER BY priority DESC, created_at ASC""",
                (connector_id,),
            ).fetchall()
        conn.close()
        return [_row_to_queued(r) for r in rows]

    def execute_queued(
        self, queue_id: str, result: dict[str, Any] | None = None
    ) -> QueuedCall:
        now_iso = _iso(_utc_now())
        with self._lock:
            conn = self._connect()
            conn.execute(
                """UPDATE rate_limit_queue
                   SET status=?, executed_at=?
                   WHERE queue_id=?""",
                (QueueStatus.COMPLETED.value, now_iso, queue_id),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM rate_limit_queue WHERE queue_id=?", (queue_id,)
            ).fetchone()
            conn.close()
        if row is None:
            raise ValueError(f"Queue entry not found: {queue_id}")
        log.info("rate_limit_manager.queued_executed", queue_id=queue_id)
        return _row_to_queued(row)

    # ------------------------------------------------------------------
    # Quota tracking
    # ------------------------------------------------------------------

    def track_quota(
        self,
        connector_id: str,
        period: QuotaPeriod,
        quota_limit: int,
        reset_at: datetime,
    ) -> QuotaRecord:
        now_iso = _iso(_utc_now())
        quota_id = _quota_id(connector_id, period.value)
        reset_iso = _iso(reset_at)
        with self._lock:
            conn = self._connect()
            conn.execute(
                """INSERT INTO quota_tracking
                   (quota_id, connector_id, period, quota_limit, used,
                    reset_at, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?)
                   ON CONFLICT(connector_id, period)
                   DO UPDATE SET quota_limit=excluded.quota_limit,
                                 reset_at=excluded.reset_at,
                                 updated_at=excluded.updated_at""",
                (quota_id, connector_id, period.value, quota_limit, 0,
                 reset_iso, now_iso, now_iso),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM quota_tracking WHERE connector_id=? AND period=?",
                (connector_id, period.value),
            ).fetchone()
            conn.close()
        log.info("rate_limit_manager.quota_tracked",
                 connector_id=connector_id, period=period.value)
        return _row_to_quota(row)

    def consume_quota(
        self, connector_id: str, period: QuotaPeriod, amount: int = 1
    ) -> QuotaRecord:
        now_iso = _iso(_utc_now())
        with self._lock:
            conn = self._connect()
            conn.execute(
                """UPDATE quota_tracking
                   SET used=used+?, updated_at=?
                   WHERE connector_id=? AND period=?""",
                (amount, now_iso, connector_id, period.value),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM quota_tracking WHERE connector_id=? AND period=?",
                (connector_id, period.value),
            ).fetchone()
            conn.close()
        if row is None:
            raise ValueError(
                f"Quota record not found for connector={connector_id}, period={period.value}"
            )
        log.info("rate_limit_manager.quota_consumed",
                 connector_id=connector_id, period=period.value, amount=amount)
        return _row_to_quota(row)

    def get_quota(
        self, connector_id: str, period: QuotaPeriod
    ) -> QuotaRecord | None:
        conn = self._connect()
        row = conn.execute(
            "SELECT * FROM quota_tracking WHERE connector_id=? AND period=?",
            (connector_id, period.value),
        ).fetchone()
        conn.close()
        return _row_to_quota(row) if row else None

    def get_usage_summary(self, connector_id: str) -> dict[str, Any]:
        """Return a summary of current window usage and all quota periods."""
        status = self.check_limit(connector_id)
        quota_rows: list[dict[str, Any]] = []
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM quota_tracking WHERE connector_id=?", (connector_id,)
        ).fetchall()
        conn.close()
        for r in rows:
            quota_rows.append(_row_to_quota(r).dict)

        cfg = self.get_config_by_connector(connector_id)
        return {
            "connector_id": connector_id,
            "config": cfg.dict if cfg else None,
            "current_window": status,
            "quotas": quota_rows,
        }

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    @staticmethod
    def _current_window(
        ts: datetime, window_s: float
    ) -> tuple[datetime, datetime]:
        """Return (window_start, window_end) for the given timestamp."""
        epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
        elapsed = (ts - epoch).total_seconds()
        window_index = int(elapsed // window_s)
        start = epoch + timedelta(seconds=window_index * window_s)
        end = start + timedelta(seconds=window_s)
        return start, end

    def _init_db(self) -> None:
        with self._lock:
            conn = self._connect()
            conn.executescript(_SCHEMA)
            conn.commit()
            conn.close()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn


# ---------------------------------------------------------------------------
# Module exports
# ---------------------------------------------------------------------------

__all__ = [
    "QueueStatus",
    "QuotaPeriod",
    "RateLimitConfig",
    "UsageWindow",
    "QueuedCall",
    "QuotaRecord",
    "RateLimitManager",
]


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

import threading as _threading

_rl_instance: RateLimitManager | None = None
_rl_lock = _threading.Lock()


def get_rate_limit_manager() -> RateLimitManager:
    global _rl_instance
    if _rl_instance is None:
        with _rl_lock:
            if _rl_instance is None:
                _rl_instance = RateLimitManager()
    return _rl_instance


def reset_rate_limit_manager(db_path: str | None = None) -> RateLimitManager:
    global _rl_instance
    with _rl_lock:
        _rl_instance = RateLimitManager(db_path=db_path)
    return _rl_instance
