"""AMC Product — Self-Serve Portal.

Allows external users and integrations to submit jobs, track progress,
and download results without direct access to internal systems.

Job lifecycle:  submitted → queued → running → completed | failed | cancelled

Revenue path: self-serve onboarding → lower CAC, higher volume → Lever B.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS portal_jobs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id          TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    submitter_id    TEXT NOT NULL,
    job_type        TEXT NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    payload_json    TEXT NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'submitted',
    priority        INTEGER NOT NULL DEFAULT 5,
    progress_pct    REAL NOT NULL DEFAULT 0.0,
    status_message  TEXT NOT NULL DEFAULT '',
    result_json     TEXT,
    error_detail    TEXT,
    submitted_at    TEXT NOT NULL,
    started_at      TEXT,
    completed_at    TEXT,
    expires_at      TEXT,
    metadata_json   TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_portal_tenant  ON portal_jobs(tenant_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_status  ON portal_jobs(status);
CREATE INDEX IF NOT EXISTS idx_portal_submitter ON portal_jobs(submitter_id);

CREATE TABLE IF NOT EXISTS portal_progress_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT NOT NULL UNIQUE,
    job_id          TEXT NOT NULL,
    progress_pct    REAL NOT NULL,
    message         TEXT NOT NULL DEFAULT '',
    details_json    TEXT NOT NULL DEFAULT '{}',
    recorded_at     TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES portal_jobs(job_id)
);
CREATE INDEX IF NOT EXISTS idx_portal_prog_job ON portal_progress_events(job_id, recorded_at);

CREATE TABLE IF NOT EXISTS portal_result_files (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id         TEXT NOT NULL UNIQUE,
    job_id          TEXT NOT NULL,
    filename        TEXT NOT NULL,
    content_type    TEXT NOT NULL DEFAULT 'application/octet-stream',
    size_bytes      INTEGER NOT NULL DEFAULT 0,
    storage_ref     TEXT NOT NULL,
    checksum        TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES portal_jobs(job_id)
);
"""

# ---------------------------------------------------------------------------
# Enums & Models
# ---------------------------------------------------------------------------

class JobStatus(str, Enum):
    SUBMITTED  = "submitted"
    QUEUED     = "queued"
    RUNNING    = "running"
    COMPLETED  = "completed"
    FAILED     = "failed"
    CANCELLED  = "cancelled"


_TERMINAL_STATUSES = {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED}
_VALID_TRANSITIONS: dict[JobStatus, set[JobStatus]] = {
    JobStatus.SUBMITTED:  {JobStatus.QUEUED, JobStatus.CANCELLED},
    JobStatus.QUEUED:     {JobStatus.RUNNING, JobStatus.CANCELLED},
    JobStatus.RUNNING:    {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED},
    JobStatus.COMPLETED:  set(),
    JobStatus.FAILED:     set(),
    JobStatus.CANCELLED:  set(),
}


class JobSubmitInput(BaseModel):
    tenant_id: str
    submitter_id: str
    job_type: str
    title: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    priority: int = Field(default=5, ge=1, le=10)
    expires_at: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class JobStatusUpdateInput(BaseModel):
    job_id: str
    new_status: JobStatus
    progress_pct: float = Field(default=0.0, ge=0.0, le=100.0)
    status_message: str = ""
    result: dict[str, Any] | None = None
    error_detail: str | None = None


class ProgressEventInput(BaseModel):
    job_id: str
    progress_pct: float = Field(default=0.0, ge=0.0, le=100.0)
    message: str = ""
    details: dict[str, Any] = Field(default_factory=dict)


class ResultFileInput(BaseModel):
    job_id: str
    filename: str
    content_type: str = "application/octet-stream"
    size_bytes: int = 0
    storage_ref: str
    checksum: str = ""


class PortalJobRecord(BaseModel):
    job_id: str
    tenant_id: str
    submitter_id: str
    job_type: str
    title: str
    payload: dict[str, Any]
    status: str
    priority: int
    progress_pct: float
    status_message: str
    result: dict[str, Any] | None
    error_detail: str | None
    submitted_at: str
    started_at: str | None
    completed_at: str | None
    expires_at: str | None
    metadata: dict[str, Any]


class ProgressEventRecord(BaseModel):
    event_id: str
    job_id: str
    progress_pct: float
    message: str
    details: dict[str, Any]
    recorded_at: str


class ResultFileRecord(BaseModel):
    file_id: str
    job_id: str
    filename: str
    content_type: str
    size_bytes: int
    storage_ref: str
    checksum: str
    created_at: str


# ---------------------------------------------------------------------------
# Portal Manager
# ---------------------------------------------------------------------------

def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class PortalManager:
    """Self-serve portal: job submission, tracking, result download."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._path = str(db_path or product_db_path())
        self._lock = Lock()
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self._path, check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA foreign_keys=ON")
        return c

    def _init_db(self) -> None:
        with self._conn() as c:
            c.executescript(_SCHEMA)

    # ------------------------------------------------------------------
    # Job submission
    # ------------------------------------------------------------------

    def submit_job(self, inp: JobSubmitInput) -> PortalJobRecord:
        job_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO portal_jobs
                   (job_id, tenant_id, submitter_id, job_type, title, payload_json,
                    status, priority, submitted_at, expires_at, metadata_json)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (job_id, inp.tenant_id, inp.submitter_id, inp.job_type,
                 inp.title, json.dumps(inp.payload), JobStatus.SUBMITTED.value,
                 inp.priority, now, inp.expires_at, json.dumps(inp.metadata)),
            )
        log.info("portal.job_submitted", job_id=job_id, tenant=inp.tenant_id, type=inp.job_type)
        return self.get_job(job_id)  # type: ignore[return-value]

    def get_job(self, job_id: str) -> PortalJobRecord | None:
        with self._conn() as c:
            row = c.execute("SELECT * FROM portal_jobs WHERE job_id=?", (job_id,)).fetchone()
        if row is None:
            return None
        return self._row_to_job(row)

    def _row_to_job(self, row: sqlite3.Row) -> PortalJobRecord:
        return PortalJobRecord(
            job_id=row["job_id"], tenant_id=row["tenant_id"],
            submitter_id=row["submitter_id"], job_type=row["job_type"],
            title=row["title"], payload=json.loads(row["payload_json"]),
            status=row["status"], priority=row["priority"],
            progress_pct=row["progress_pct"], status_message=row["status_message"],
            result=json.loads(row["result_json"]) if row["result_json"] else None,
            error_detail=row["error_detail"],
            submitted_at=row["submitted_at"], started_at=row["started_at"],
            completed_at=row["completed_at"], expires_at=row["expires_at"],
            metadata=json.loads(row["metadata_json"]),
        )

    def update_status(self, inp: JobStatusUpdateInput) -> PortalJobRecord:
        job = self.get_job(inp.job_id)
        if job is None:
            raise ValueError(f"Job {inp.job_id!r} not found")
        current = JobStatus(job.status)
        if inp.new_status not in _VALID_TRANSITIONS[current]:
            raise ValueError(
                f"Cannot transition {current.value} → {inp.new_status.value}"
            )
        now = _utc_now()
        started_at = job.started_at
        completed_at = job.completed_at
        if inp.new_status == JobStatus.RUNNING and started_at is None:
            started_at = now
        if inp.new_status in _TERMINAL_STATUSES:
            completed_at = now

        with self._lock, self._conn() as c:
            c.execute(
                """UPDATE portal_jobs
                   SET status=?, progress_pct=?, status_message=?,
                       result_json=?, error_detail=?, started_at=?, completed_at=?
                   WHERE job_id=?""",
                (inp.new_status.value, inp.progress_pct, inp.status_message,
                 json.dumps(inp.result) if inp.result is not None else None,
                 inp.error_detail, started_at, completed_at, inp.job_id),
            )
        log.info("portal.job_status_updated", job_id=inp.job_id, status=inp.new_status.value)
        return self.get_job(inp.job_id)  # type: ignore[return-value]

    def list_jobs(
        self,
        tenant_id: str | None = None,
        submitter_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[PortalJobRecord]:
        q = "SELECT * FROM portal_jobs WHERE 1=1"
        params: list[Any] = []
        if tenant_id:
            q += " AND tenant_id=?"; params.append(tenant_id)
        if submitter_id:
            q += " AND submitter_id=?"; params.append(submitter_id)
        if status:
            q += " AND status=?"; params.append(status)
        q += " ORDER BY submitted_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [self._row_to_job(r) for r in rows]

    def cancel_job(self, job_id: str, reason: str = "") -> PortalJobRecord:
        return self.update_status(JobStatusUpdateInput(
            job_id=job_id,
            new_status=JobStatus.CANCELLED,
            status_message=reason or "Cancelled by user",
        ))

    # ------------------------------------------------------------------
    # Progress events
    # ------------------------------------------------------------------

    def record_progress(self, inp: ProgressEventInput) -> ProgressEventRecord:
        event_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO portal_progress_events
                   (event_id, job_id, progress_pct, message, details_json, recorded_at)
                   VALUES (?,?,?,?,?,?)""",
                (event_id, inp.job_id, inp.progress_pct,
                 inp.message, json.dumps(inp.details), now),
            )
            # also update job progress
            c.execute(
                "UPDATE portal_jobs SET progress_pct=?, status_message=? WHERE job_id=?",
                (inp.progress_pct, inp.message, inp.job_id),
            )
        return ProgressEventRecord(
            event_id=event_id, job_id=inp.job_id, progress_pct=inp.progress_pct,
            message=inp.message, details=inp.details, recorded_at=now,
        )

    def get_progress_events(self, job_id: str, limit: int = 100) -> list[ProgressEventRecord]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM portal_progress_events WHERE job_id=? ORDER BY recorded_at LIMIT ?",
                (job_id, limit),
            ).fetchall()
        return [
            ProgressEventRecord(
                event_id=r["event_id"], job_id=r["job_id"],
                progress_pct=r["progress_pct"], message=r["message"],
                details=json.loads(r["details_json"]), recorded_at=r["recorded_at"],
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Result files
    # ------------------------------------------------------------------

    def attach_result_file(self, inp: ResultFileInput) -> ResultFileRecord:
        file_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO portal_result_files
                   (file_id, job_id, filename, content_type, size_bytes, storage_ref, checksum, created_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (file_id, inp.job_id, inp.filename, inp.content_type,
                 inp.size_bytes, inp.storage_ref, inp.checksum, now),
            )
        return ResultFileRecord(
            file_id=file_id, job_id=inp.job_id, filename=inp.filename,
            content_type=inp.content_type, size_bytes=inp.size_bytes,
            storage_ref=inp.storage_ref, checksum=inp.checksum, created_at=now,
        )

    def list_result_files(self, job_id: str) -> list[ResultFileRecord]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM portal_result_files WHERE job_id=? ORDER BY created_at",
                (job_id,),
            ).fetchall()
        return [
            ResultFileRecord(
                file_id=r["file_id"], job_id=r["job_id"], filename=r["filename"],
                content_type=r["content_type"], size_bytes=r["size_bytes"],
                storage_ref=r["storage_ref"], checksum=r["checksum"],
                created_at=r["created_at"],
            )
            for r in rows
        ]


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_portal: PortalManager | None = None
_portal_lock = Lock()


def get_portal_manager(db_path: str | Path | None = None) -> PortalManager:
    global _portal
    with _portal_lock:
        if _portal is None:
            _portal = PortalManager(db_path=db_path)
    return _portal


__all__ = [
    "JobStatus",
    "JobSubmitInput",
    "JobStatusUpdateInput",
    "ProgressEventInput",
    "ResultFileInput",
    "PortalJobRecord",
    "ProgressEventRecord",
    "ResultFileRecord",
    "PortalManager",
    "get_portal_manager",
]
