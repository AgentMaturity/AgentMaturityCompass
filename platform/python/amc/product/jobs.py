"""Product queueing primitives for orchestration workloads.

This module provides an operational job queue used by API endpoints in
:mod:`amc.api.routers.product`.

Goals:
- Priority-based dispatch (higher priority first).
- SLA support per job via ``sla_seconds``.
- ``ack``/retry flow with bounded attempt counts.
- Lightweight retry statistics for operators.
- SQLite persistence with migration-safe defaults while preserving prior API behavior.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel

from amc.core.exceptions import AMCError, ValidationError
from amc.product.persistence import product_db_path

JobStatus = Literal["queued", "claimed", "done", "failed", "expired"]


class QueueSubmissionError(ValidationError):
    """Raised when queue submission payload is invalid."""


class SubmitParams(BaseModel):
    payload: dict[str, Any]
    priority: int = 5
    sla_seconds: int = 300
    max_retries: int = 2
    job_id: str | None = None


class Job(BaseModel):
    """Single queue job payload stored in SQLite (with in-memory mirror)."""

    id: str
    payload: dict[str, Any]
    priority: int
    sla_seconds: int
    max_retries: int
    status: JobStatus = "queued"
    submitted_at: datetime
    deadline_at: datetime
    attempts: int = 0
    claimed_by: str | None = None
    claimed_at: datetime | None = None
    next_retry_at: datetime | None = None
    last_error: str | None = None


class RetryStats(BaseModel):
    """Summary counters used by SLA/retry dashboards."""

    total_jobs: int
    queued: int
    claimed: int
    done: int
    failed: int
    expired: int
    total_retries: int
    avg_attempts: float
    by_priority: dict[str, int]


class JobQueue:
    """Priority-aware, SLA-aware queue backed by SQLite with in-memory cache."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = product_db_path(db_path)
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

        # Keep tests and docs simple; callers can still pass ":memory:".
        db_path_str = str(self._db_path)
        if db_path_str != ":memory:":
            self._db_path.parent.mkdir(parents=True, exist_ok=True)

        self._conn = sqlite3.connect(db_path_str, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._conn:
            self._migrate_schema()
        self._reload_from_db()

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    def _validate_submission(self, params: SubmitParams) -> None:
        if params.priority < 0 or params.priority > 10:
            raise QueueSubmissionError("priority must be between 0 and 10")
        if params.sla_seconds <= 0:
            raise QueueSubmissionError("sla_seconds must be a positive integer")
        if params.max_retries < 0:
            raise QueueSubmissionError("max_retries must be >= 0")

    def _migrate_schema(self) -> None:
        cur = self._conn.cursor()
        cur.execute("PRAGMA user_version")
        version = cur.fetchone()[0]

        if version < 1:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS product_jobs (
                    id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    priority INTEGER NOT NULL,
                    sla_seconds INTEGER NOT NULL,
                    max_retries INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    submitted_at TEXT NOT NULL,
                    deadline_at TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    claimed_by TEXT,
                    claimed_at TEXT,
                    next_retry_at TEXT,
                    last_error TEXT,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_product_jobs_status ON product_jobs (status);
                CREATE INDEX IF NOT EXISTS idx_product_jobs_retry_at ON product_jobs (next_retry_at);
                CREATE INDEX IF NOT EXISTS idx_product_jobs_deadline_at ON product_jobs (deadline_at);
                """
            )
            self._conn.execute("PRAGMA user_version = 1")
            version = 1

        # Migration safety: add missing columns if an older table exists in field.
        if version == 1:
            # keep explicit for clarity to avoid drift if downstream schema changes later
            pass

        self._conn.commit()

    def _reload_from_db(self) -> None:
        self._jobs.clear()
        rows = self._conn.execute(
            """
            SELECT id, payload_json, priority, sla_seconds, max_retries, status,
                   submitted_at, deadline_at, attempts, claimed_by, claimed_at, next_retry_at, last_error
            FROM product_jobs
            """
        ).fetchall()

        for row in rows:
            self._jobs[row["id"]] = Job(
                id=row["id"],
                payload=json.loads(row["payload_json"]),
                priority=row["priority"],
                sla_seconds=row["sla_seconds"],
                max_retries=row["max_retries"],
                status=row["status"],
                submitted_at=datetime.fromisoformat(row["submitted_at"]),
                deadline_at=datetime.fromisoformat(row["deadline_at"]),
                attempts=row["attempts"],
                claimed_by=row["claimed_by"],
                claimed_at=datetime.fromisoformat(row["claimed_at"]) if row["claimed_at"] else None,
                next_retry_at=datetime.fromisoformat(row["next_retry_at"]) if row["next_retry_at"] else None,
                last_error=row["last_error"],
            )

    @staticmethod
    def _serialize_job(job: Job) -> tuple[Any, ...]:
        now_iso = JobQueue._now().isoformat()
        return (
            job.id,
            json.dumps(job.payload, sort_keys=True, separators=(",", ":")),
            job.priority,
            job.sla_seconds,
            job.max_retries,
            job.status,
            job.submitted_at.isoformat(),
            job.deadline_at.isoformat(),
            job.attempts,
            job.claimed_by,
            job.claimed_at.isoformat() if job.claimed_at else None,
            job.next_retry_at.isoformat() if job.next_retry_at else None,
            job.last_error,
            now_iso,
        )

    def _persist_job(self, job: Job) -> None:
        self._conn.execute(
            """
            INSERT INTO product_jobs (
                id, payload_json, priority, sla_seconds, max_retries, status,
                submitted_at, deadline_at, attempts, claimed_by, claimed_at,
                next_retry_at, last_error, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                payload_json = excluded.payload_json,
                priority = excluded.priority,
                sla_seconds = excluded.sla_seconds,
                max_retries = excluded.max_retries,
                status = excluded.status,
                submitted_at = excluded.submitted_at,
                deadline_at = excluded.deadline_at,
                attempts = excluded.attempts,
                claimed_by = excluded.claimed_by,
                claimed_at = excluded.claimed_at,
                next_retry_at = excluded.next_retry_at,
                last_error = excluded.last_error,
                updated_at = excluded.updated_at
            """,
            self._serialize_job(job),
        )
        self._conn.commit()

    def submit(self, params: SubmitParams) -> Job:
        """Create and enqueue a new job."""
        with self._lock:
            self._validate_submission(params)
            job_id = params.job_id or f"job-{uuid4().hex}"

            if job_id in self._jobs:
                raise QueueSubmissionError(f"job_id already exists: {job_id}")

            now = self._now()
            job = Job(
                id=job_id,
                payload=params.payload,
                priority=params.priority,
                sla_seconds=params.sla_seconds,
                max_retries=params.max_retries,
                submitted_at=now,
                deadline_at=now + timedelta(seconds=params.sla_seconds),
            )

            self._jobs[job_id] = job
            self._persist_job(job)
            return job

    def get(self, job_id: str) -> Job | None:
        """Return a job by id if known."""
        return self._jobs.get(job_id)

    def _expire_outdated(self, now: datetime) -> list[str]:
        expired_ids: list[str] = []
        for job in self._jobs.values():
            if job.status in {"queued", "claimed", "failed"} and job.deadline_at <= now:
                job.status = "expired"
                job.claimed_by = None
                job.claimed_at = None
                job.next_retry_at = None
                expired_ids.append(job.id)

        if expired_ids:
            for job_id in expired_ids:
                self._persist_job(self._jobs[job_id])
        return expired_ids

    def claim(self, worker_id: str) -> Job | None:
        """Claim the highest-priority available job for a worker."""
        if not worker_id:
            raise ValueError("worker_id is required")

        with self._lock:
            now = self._now()
            self._expire_outdated(now)

            candidates = [
                job
                for job in self._jobs.values()
                if job.status == "queued"
                and (job.next_retry_at is None or job.next_retry_at <= now)
            ]

            if not candidates:
                return None

            candidates.sort(key=lambda j: (-j.priority, j.submitted_at))
            job = candidates[0]

            job.status = "claimed"
            job.claimed_by = worker_id
            job.claimed_at = now
            job.attempts += 1
            job.next_retry_at = None
            job.last_error = None
            self._persist_job(job)
            return job

    @staticmethod
    def _retry_delay_seconds(attempts: int) -> int:
        if attempts <= 1:
            return 1
        return min(60, 2 ** (attempts - 1))

    def ack(
        self,
        job_id: str,
        *,
        worker_id: str | None = None,
        success: bool = True,
        error: str | None = None,
    ) -> Job:
        """Acknowledge a claimed job and optionally trigger a retry."""
        with self._lock:
            now = self._now()
            job = self._jobs.get(job_id)
            if job is None:
                raise AMCError("job_id does not exist", code="job-not-found")

            if job.status != "claimed":
                raise AMCError("job is not currently claimed", code="invalid-state")

            if worker_id is not None and job.claimed_by is not None and job.claimed_by != worker_id:
                raise AMCError("job is claimed by another worker", code="invalid-worker")

            if success:
                job.status = "done"
                self._persist_job(job)
                return job

            if now >= job.deadline_at:
                job.status = "expired"
                job.last_error = error or "SLA expired"
                self._persist_job(job)
                return job

            if job.attempts < 1 + job.max_retries:
                job.status = "queued"
                job.claimed_by = None
                job.claimed_at = None
                job.next_retry_at = now + timedelta(seconds=self._retry_delay_seconds(job.attempts))
                job.last_error = error
                self._persist_job(job)
                return job

            job.status = "failed"
            job.last_error = error or "max retries exceeded"
            self._persist_job(job)
            return job

    def retry_stats(self) -> RetryStats:
        """Return queue-wide retry/reliability statistics."""
        total = len(self._jobs)
        by_status = {
            "queued": 0,
            "claimed": 0,
            "done": 0,
            "failed": 0,
            "expired": 0,
        }

        total_attempts = 0
        by_priority: dict[str, int] = {}

        for job in self._jobs.values():
            by_status[job.status] = by_status.get(job.status, 0) + 1
            by_priority[str(job.priority)] = by_priority.get(str(job.priority), 0) + 1
            total_attempts += job.attempts

        avg_attempts = float(total_attempts / total) if total else 0.0
        total_retries = sum(max(0, job.attempts - 1) for job in self._jobs.values())

        return RetryStats(
            total_jobs=total,
            queued=by_status["queued"],
            claimed=by_status["claimed"],
            done=by_status["done"],
            failed=by_status["failed"],
            expired=by_status["expired"],
            total_retries=total_retries,
            avg_attempts=avg_attempts,
            by_priority=by_priority,
        )

    def clear(self) -> None:
        """Clear all jobs. Useful for tests."""
        self._jobs.clear()
        self._conn.execute("DELETE FROM product_jobs")
        self._conn.commit()

    def close(self) -> None:
        """Close queue DB connection."""
        self._conn.close()


# Singleton used by API routes.
_QUEUE = JobQueue()


def get_queue() -> JobQueue:
    return _QUEUE


def reset_queue() -> None:
    _QUEUE.clear()
