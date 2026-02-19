"""AMC Product — Retry Engine with Backoff and Segment-Level Smart Rerun.

RetryPolicy (exponential/linear/fixed), segment-level retry (not full job),
context preservation.

API: /api/v1/product/retry/*
"""

from __future__ import annotations

import json
import math
import random
import sqlite3
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Any
from uuid import NAMESPACE_URL, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)


def _ev(e: Any) -> str:
    """Return the string value of an enum member (compatible with all Python versions)."""
    return e.value if hasattr(e, "value") else str(e)

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS retry_policies (
    policy_id     TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    strategy      TEXT NOT NULL DEFAULT 'exponential',
    max_attempts  INTEGER NOT NULL DEFAULT 3,
    base_delay_s  REAL NOT NULL DEFAULT 1.0,
    max_delay_s   REAL NOT NULL DEFAULT 300.0,
    multiplier    REAL NOT NULL DEFAULT 2.0,
    jitter        INTEGER NOT NULL DEFAULT 1,
    metadata_json TEXT,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS retry_jobs (
    job_id        TEXT PRIMARY KEY,
    policy_id     TEXT NOT NULL,
    segment_id    TEXT NOT NULL,
    context_json  TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    attempt       INTEGER NOT NULL DEFAULT 0,
    last_error    TEXT,
    next_retry_at TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    FOREIGN KEY (policy_id) REFERENCES retry_policies(policy_id)
);

CREATE TABLE IF NOT EXISTS retry_log (
    log_id      TEXT PRIMARY KEY,
    job_id      TEXT NOT NULL,
    attempt     INTEGER NOT NULL,
    status      TEXT NOT NULL,
    error       TEXT,
    delay_s     REAL,
    executed_at TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES retry_jobs(job_id)
);

CREATE INDEX IF NOT EXISTS idx_retry_jobs_policy_id ON retry_jobs(policy_id);
CREATE INDEX IF NOT EXISTS idx_retry_jobs_segment_id ON retry_jobs(segment_id);
CREATE INDEX IF NOT EXISTS idx_retry_jobs_status ON retry_jobs(status);
CREATE INDEX IF NOT EXISTS idx_retry_jobs_next_retry_at ON retry_jobs(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_retry_log_job_id ON retry_log(job_id);
"""

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class RetryStrategy(str, Enum):
    exponential = "exponential"
    linear = "linear"
    fixed = "fixed"


class RetryJobStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    exhausted = "exhausted"


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class RetryPolicy:
    policy_id: str
    name: str
    strategy: RetryStrategy
    max_attempts: int
    base_delay_s: float
    max_delay_s: float
    multiplier: float
    jitter: bool
    metadata: dict[str, Any]
    created_at: str

    def dict(self) -> dict[str, Any]:
        return {
            "policy_id": self.policy_id,
            "name": self.name,
            "strategy": self.strategy,
            "max_attempts": self.max_attempts,
            "base_delay_s": self.base_delay_s,
            "max_delay_s": self.max_delay_s,
            "multiplier": self.multiplier,
            "jitter": self.jitter,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


@dataclass
class RetryJob:
    job_id: str
    policy_id: str
    segment_id: str
    context: dict[str, Any]
    status: RetryJobStatus
    attempt: int
    last_error: str | None
    next_retry_at: str | None
    created_at: str
    updated_at: str

    def dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "policy_id": self.policy_id,
            "segment_id": self.segment_id,
            "context": self.context,
            "status": self.status,
            "attempt": self.attempt,
            "last_error": self.last_error,
            "next_retry_at": self.next_retry_at,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class RetryLogEntry:
    log_id: str
    job_id: str
    attempt: int
    status: RetryJobStatus
    error: str | None
    delay_s: float | None
    executed_at: str

    def dict(self) -> dict[str, Any]:
        return {
            "log_id": self.log_id,
            "job_id": self.job_id,
            "attempt": self.attempt,
            "status": self.status,
            "error": self.error,
            "delay_s": self.delay_s,
            "executed_at": self.executed_at,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now_dt() -> datetime:
    return datetime.now(timezone.utc)


def _make_policy_id(name: str, created_at: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"retry_policy:{name}:{created_at}"))


def _make_job_id(policy_id: str, segment_id: str, created_at: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"retry_job:{policy_id}:{segment_id}:{created_at}"))


def _make_log_id(job_id: str, attempt: int, executed_at: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"retry_log:{job_id}:{attempt}:{executed_at}"))


def _row_to_policy(row: sqlite3.Row) -> RetryPolicy:
    return RetryPolicy(
        policy_id=row["policy_id"],
        name=row["name"],
        strategy=RetryStrategy(row["strategy"]),
        max_attempts=row["max_attempts"],
        base_delay_s=row["base_delay_s"],
        max_delay_s=row["max_delay_s"],
        multiplier=row["multiplier"],
        jitter=bool(row["jitter"]),
        metadata=json.loads(row["metadata_json"]) if row["metadata_json"] else {},
        created_at=row["created_at"],
    )


def _row_to_job(row: sqlite3.Row) -> RetryJob:
    return RetryJob(
        job_id=row["job_id"],
        policy_id=row["policy_id"],
        segment_id=row["segment_id"],
        context=json.loads(row["context_json"]) if row["context_json"] else {},
        status=RetryJobStatus(row["status"]),
        attempt=row["attempt"],
        last_error=row["last_error"],
        next_retry_at=row["next_retry_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_log_entry(row: sqlite3.Row) -> RetryLogEntry:
    return RetryLogEntry(
        log_id=row["log_id"],
        job_id=row["job_id"],
        attempt=row["attempt"],
        status=RetryJobStatus(row["status"]),
        error=row["error"],
        delay_s=row["delay_s"],
        executed_at=row["executed_at"],
    )


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class RetryEngine:
    """Segment-level retry engine with configurable backoff policies."""

    def __init__(self, db_path: str | None = None) -> None:
        if db_path is None:
            from amc.product.persistence import product_db_path
            db_path = str(product_db_path("retry_engine.db"))
        self._db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self) -> None:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                conn.executescript(_SCHEMA)
                conn.commit()
            finally:
                conn.close()
        log.info("retry_engine.db_init", db_path=self._db_path)

    # ------------------------------------------------------------------
    # Policy management
    # ------------------------------------------------------------------

    def create_policy(
        self,
        name: str,
        strategy: RetryStrategy | str = RetryStrategy.exponential,
        max_attempts: int = 3,
        base_delay_s: float = 1.0,
        max_delay_s: float = 300.0,
        multiplier: float = 2.0,
        jitter: bool = True,
        metadata: dict[str, Any] | None = None,
    ) -> RetryPolicy:
        now = _now()
        policy_id = _make_policy_id(name, now)
        metadata = metadata or {}

        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute(
                    """
                    INSERT INTO retry_policies
                      (policy_id, name, strategy, max_attempts, base_delay_s,
                       max_delay_s, multiplier, jitter, metadata_json, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        policy_id,
                        name,
                        _ev(strategy),
                        max_attempts,
                        base_delay_s,
                        max_delay_s,
                        multiplier,
                        1 if jitter else 0,
                        json.dumps(metadata),
                        now,
                    ),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM retry_policies WHERE policy_id = ?", (policy_id,)
                ).fetchone()
            finally:
                conn.close()

        record = _row_to_policy(row)
        log.info("retry_policy.created", policy_id=policy_id, name=name, strategy=strategy)
        return record

    def get_policy(self, policy_id: str) -> RetryPolicy | None:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                row = conn.execute(
                    "SELECT * FROM retry_policies WHERE policy_id = ?", (policy_id,)
                ).fetchone()
            finally:
                conn.close()
        return _row_to_policy(row) if row else None

    def list_policies(self) -> list[RetryPolicy]:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(
                    "SELECT * FROM retry_policies ORDER BY created_at DESC"
                ).fetchall()
            finally:
                conn.close()
        return [_row_to_policy(r) for r in rows]

    # ------------------------------------------------------------------
    # Job management
    # ------------------------------------------------------------------

    def submit_job(
        self,
        policy_id: str,
        segment_id: str,
        context: dict[str, Any] | None = None,
    ) -> RetryJob:
        """Submit a segment-level retry job (not a full pipeline rerun)."""
        now = _now()
        job_id = _make_job_id(policy_id, segment_id, now)
        context = context or {}

        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute(
                    """
                    INSERT INTO retry_jobs
                      (job_id, policy_id, segment_id, context_json, status,
                       attempt, last_error, next_retry_at, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)
                    """,
                    (
                        job_id,
                        policy_id,
                        segment_id,
                        json.dumps(context),
                        _ev(RetryJobStatus.pending),
                        now,  # next_retry_at = now (immediately eligible)
                        now,
                        now,
                    ),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM retry_jobs WHERE job_id = ?", (job_id,)
                ).fetchone()
            finally:
                conn.close()

        record = _row_to_job(row)
        log.info("retry_job.submitted", job_id=job_id, segment_id=segment_id, policy_id=policy_id)
        return record

    def get_job(self, job_id: str) -> RetryJob | None:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                row = conn.execute(
                    "SELECT * FROM retry_jobs WHERE job_id = ?", (job_id,)
                ).fetchone()
            finally:
                conn.close()
        return _row_to_job(row) if row else None

    def list_jobs(
        self,
        status: RetryJobStatus | str | None = None,
        segment_id: str | None = None,
        limit: int = 50,
    ) -> list[RetryJob]:
        clauses: list[str] = []
        params: list[Any] = []

        if status is not None:
            clauses.append("status = ?")
            params.append(_ev(status))
        if segment_id is not None:
            clauses.append("segment_id = ?")
            params.append(segment_id)

        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        sql = f"SELECT * FROM retry_jobs {where} ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(sql, params).fetchall()
            finally:
                conn.close()
        return [_row_to_job(r) for r in rows]

    # ------------------------------------------------------------------
    # Backoff computation
    # ------------------------------------------------------------------

    def compute_delay(self, policy: RetryPolicy, attempt: int) -> float:
        """Compute delay seconds for the given attempt number (1-based)."""
        if policy.strategy == RetryStrategy.exponential:
            delay = policy.base_delay_s * (policy.multiplier ** (attempt - 1))
        elif policy.strategy == RetryStrategy.linear:
            delay = policy.base_delay_s * attempt
        else:  # fixed
            delay = policy.base_delay_s

        delay = min(delay, policy.max_delay_s)

        if policy.jitter:
            # Full jitter: random in [0, delay]
            delay = random.uniform(0, delay)

        return delay

    # ------------------------------------------------------------------
    # Job lifecycle
    # ------------------------------------------------------------------

    def attempt_job(self, job_id: str) -> RetryJob:
        """Mark job as running and record a log entry for this attempt."""
        now = _now()

        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                job_row = conn.execute(
                    "SELECT * FROM retry_jobs WHERE job_id = ?", (job_id,)
                ).fetchone()
                if job_row is None:
                    raise ValueError(f"Retry job not found: {job_id}")

                attempt = job_row["attempt"] + 1
                conn.execute(
                    "UPDATE retry_jobs SET status = ?, attempt = ?, updated_at = ? WHERE job_id = ?",
                    (_ev(RetryJobStatus.running), attempt, now, job_id),
                )

                log_id = _make_log_id(job_id, attempt, now)
                conn.execute(
                    """
                    INSERT INTO retry_log (log_id, job_id, attempt, status, error, delay_s, executed_at)
                    VALUES (?, ?, ?, ?, NULL, NULL, ?)
                    """,
                    (log_id, job_id, attempt, _ev(RetryJobStatus.running), now),
                )
                conn.commit()

                row = conn.execute(
                    "SELECT * FROM retry_jobs WHERE job_id = ?", (job_id,)
                ).fetchone()
            finally:
                conn.close()

        record = _row_to_job(row)
        log.info("retry_job.attempt_started", job_id=job_id, attempt=record.attempt)
        return record

    def complete_job(self, job_id: str, result: dict[str, Any] | None = None) -> RetryJob:
        """Mark job completed; merge result into context if provided."""
        now = _now()

        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                job_row = conn.execute(
                    "SELECT * FROM retry_jobs WHERE job_id = ?", (job_id,)
                ).fetchone()
                if job_row is None:
                    raise ValueError(f"Retry job not found: {job_id}")

                context = json.loads(job_row["context_json"]) if job_row["context_json"] else {}
                if result:
                    context.update(result)

                conn.execute(
                    """
                    UPDATE retry_jobs
                    SET status = ?, context_json = ?, last_error = NULL, updated_at = ?
                    WHERE job_id = ?
                    """,
                    (_ev(RetryJobStatus.completed), json.dumps(context), now, job_id),
                )

                # Update log entry for current attempt
                conn.execute(
                    """
                    UPDATE retry_log SET status = ?
                    WHERE job_id = ? AND attempt = ? AND status = ?
                    """,
                    (_ev(RetryJobStatus.completed), job_id, job_row["attempt"] + 1, _ev(RetryJobStatus.running)),
                )
                conn.commit()

                row = conn.execute(
                    "SELECT * FROM retry_jobs WHERE job_id = ?", (job_id,)
                ).fetchone()
            finally:
                conn.close()

        record = _row_to_job(row)
        log.info("retry_job.completed", job_id=job_id)
        return record

    def fail_attempt(self, job_id: str, error: str) -> RetryJob:
        """Record failed attempt; schedule next retry or mark exhausted."""
        now = _now()

        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                job_row = conn.execute(
                    "SELECT * FROM retry_jobs WHERE job_id = ?", (job_id,)
                ).fetchone()
                if job_row is None:
                    raise ValueError(f"Retry job not found: {job_id}")

                policy_row = conn.execute(
                    "SELECT * FROM retry_policies WHERE policy_id = ?", (job_row["policy_id"],)
                ).fetchone()
                if policy_row is None:
                    raise ValueError(f"Policy not found: {job_row['policy_id']}")

                policy = _row_to_policy(policy_row)
                current_attempt = job_row["attempt"]

                if current_attempt >= policy.max_attempts:
                    new_status = _ev(RetryJobStatus.exhausted)
                    next_retry_at: str | None = None
                    delay_s: float | None = None
                else:
                    new_status = _ev(RetryJobStatus.pending)
                    delay_s = self.compute_delay(policy, current_attempt + 1)
                    next_dt = _now_dt() + timedelta(seconds=delay_s)
                    next_retry_at = next_dt.isoformat()

                conn.execute(
                    """
                    UPDATE retry_jobs
                    SET status = ?, last_error = ?, next_retry_at = ?, updated_at = ?
                    WHERE job_id = ?
                    """,
                    (new_status, error, next_retry_at, now, job_id),
                )

                # Update the running log entry
                conn.execute(
                    """
                    UPDATE retry_log SET status = ?, error = ?, delay_s = ?
                    WHERE job_id = ? AND attempt = ? AND status = ?
                    """,
                    (
                        _ev(RetryJobStatus.failed),
                        error,
                        delay_s,
                        job_id,
                        current_attempt,
                        _ev(RetryJobStatus.running),
                    ),
                )
                conn.commit()

                row = conn.execute(
                    "SELECT * FROM retry_jobs WHERE job_id = ?", (job_id,)
                ).fetchone()
            finally:
                conn.close()

        record = _row_to_job(row)
        log.warning(
            "retry_job.attempt_failed",
            job_id=job_id,
            attempt=record.attempt,
            status=record.status,
            error=error,
            next_retry_at=record.next_retry_at,
        )
        return record

    def get_due_jobs(self, now: datetime | None = None) -> list[RetryJob]:
        """Return pending jobs whose next_retry_at is <= now."""
        ts = (now or _now_dt()).isoformat()

        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(
                    """
                    SELECT * FROM retry_jobs
                    WHERE status = ? AND next_retry_at <= ?
                    ORDER BY next_retry_at ASC
                    """,
                    (_ev(RetryJobStatus.pending), ts),
                ).fetchall()
            finally:
                conn.close()
        return [_row_to_job(r) for r in rows]

    def get_retry_log(self, job_id: str) -> list[RetryLogEntry]:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(
                    "SELECT * FROM retry_log WHERE job_id = ? ORDER BY attempt ASC",
                    (job_id,),
                ).fetchall()
            finally:
                conn.close()
        return [_row_to_log_entry(r) for r in rows]

    def preserve_context(self, job_id: str, context_update: dict[str, Any]) -> RetryJob:
        """Merge context_update into the job's existing context (segment-level preservation)."""
        now = _now()

        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                job_row = conn.execute(
                    "SELECT * FROM retry_jobs WHERE job_id = ?", (job_id,)
                ).fetchone()
                if job_row is None:
                    raise ValueError(f"Retry job not found: {job_id}")

                context = json.loads(job_row["context_json"]) if job_row["context_json"] else {}
                context.update(context_update)

                conn.execute(
                    "UPDATE retry_jobs SET context_json = ?, updated_at = ? WHERE job_id = ?",
                    (json.dumps(context), now, job_id),
                )
                conn.commit()

                row = conn.execute(
                    "SELECT * FROM retry_jobs WHERE job_id = ?", (job_id,)
                ).fetchone()
            finally:
                conn.close()

        record = _row_to_job(row)
        log.info("retry_job.context_preserved", job_id=job_id, keys=list(context_update.keys()))
        return record


# ---------------------------------------------------------------------------
# Singleton / factory
# ---------------------------------------------------------------------------

_retry_engine_instance: RetryEngine | None = None
_retry_engine_lock = threading.Lock()


def _get_retry_engine() -> RetryEngine:
    global _retry_engine_instance
    with _retry_engine_lock:
        if _retry_engine_instance is None:
            db_path = str(product_db_path())
            _retry_engine_instance = RetryEngine(db_path)
    return _retry_engine_instance


def reset_retry_engine(db_path: str) -> RetryEngine:
    """Create a fresh retry engine — used in tests for isolation."""
    global _retry_engine_instance
    with _retry_engine_lock:
        _retry_engine_instance = RetryEngine(db_path)
    return _retry_engine_instance
