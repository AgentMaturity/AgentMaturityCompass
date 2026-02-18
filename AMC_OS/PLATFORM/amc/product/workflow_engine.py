"""AMC Product — Durable Workflow Engine with Checkpoints.

WorkflowEngine class, step definitions, checkpoint/resume support,
step status tracking (pending/running/completed/failed), SQLite-backed.

API: /api/v1/product/workflows/*
"""

from __future__ import annotations

import json
import sqlite3
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable
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
CREATE TABLE IF NOT EXISTS workflows (
    workflow_id   TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    input_json    TEXT,
    output_json   TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    completed_at  TEXT
);

CREATE TABLE IF NOT EXISTS workflow_steps (
    step_id      TEXT PRIMARY KEY,
    workflow_id  TEXT NOT NULL,
    name         TEXT NOT NULL,
    seq          INTEGER NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    fn_name      TEXT,
    input_json   TEXT,
    output_json  TEXT,
    error        TEXT,
    started_at   TEXT,
    completed_at TEXT,
    created_at   TEXT NOT NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflows(workflow_id)
);

CREATE TABLE IF NOT EXISTS workflow_checkpoints (
    checkpoint_id TEXT PRIMARY KEY,
    workflow_id   TEXT NOT NULL,
    step_id       TEXT,
    state_json    TEXT,
    created_at    TEXT NOT NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflows(workflow_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_id ON workflow_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_workflow_id ON workflow_checkpoints(workflow_id);
"""

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class WorkflowStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    paused = "paused"


class StepStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    skipped = "skipped"


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class StepDefinition:
    name: str
    fn_name: str
    seq: int
    description: str = ""
    timeout_s: float = 300.0
    retries: int = 0

    def dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "fn_name": self.fn_name,
            "seq": self.seq,
            "description": self.description,
            "timeout_s": self.timeout_s,
            "retries": self.retries,
        }


@dataclass
class WorkflowRecord:
    workflow_id: str
    name: str
    description: str
    status: WorkflowStatus
    input_json: str | None
    output_json: str | None
    created_at: str
    updated_at: str
    completed_at: str | None

    def dict(self) -> dict[str, Any]:
        return {
            "workflow_id": self.workflow_id,
            "name": self.name,
            "description": self.description,
            "status": self.status,
            "input_json": self.input_json,
            "output_json": self.output_json,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "completed_at": self.completed_at,
        }


@dataclass
class StepRecord:
    step_id: str
    workflow_id: str
    name: str
    seq: int
    status: StepStatus
    fn_name: str | None
    input_json: str | None
    output_json: str | None
    error: str | None
    started_at: str | None
    completed_at: str | None
    created_at: str

    def dict(self) -> dict[str, Any]:
        return {
            "step_id": self.step_id,
            "workflow_id": self.workflow_id,
            "name": self.name,
            "seq": self.seq,
            "status": self.status,
            "fn_name": self.fn_name,
            "input_json": self.input_json,
            "output_json": self.output_json,
            "error": self.error,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "created_at": self.created_at,
        }


@dataclass
class CheckpointRecord:
    checkpoint_id: str
    workflow_id: str
    step_id: str | None
    state_json: str | None
    created_at: str

    def dict(self) -> dict[str, Any]:
        return {
            "checkpoint_id": self.checkpoint_id,
            "workflow_id": self.workflow_id,
            "step_id": self.step_id,
            "state_json": self.state_json,
            "created_at": self.created_at,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_workflow_id(name: str, created_at: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"workflow:{name}:{created_at}"))


def _make_step_id(workflow_id: str, seq: int, name: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"step:{workflow_id}:{seq}:{name}"))


def _make_checkpoint_id(workflow_id: str, step_id: str | None, created_at: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"checkpoint:{workflow_id}:{step_id}:{created_at}"))


def _row_to_workflow(row: sqlite3.Row) -> WorkflowRecord:
    return WorkflowRecord(
        workflow_id=row["workflow_id"],
        name=row["name"],
        description=row["description"] or "",
        status=WorkflowStatus(row["status"]),
        input_json=row["input_json"],
        output_json=row["output_json"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        completed_at=row["completed_at"],
    )


def _row_to_step(row: sqlite3.Row) -> StepRecord:
    return StepRecord(
        step_id=row["step_id"],
        workflow_id=row["workflow_id"],
        name=row["name"],
        seq=row["seq"],
        status=StepStatus(row["status"]),
        fn_name=row["fn_name"],
        input_json=row["input_json"],
        output_json=row["output_json"],
        error=row["error"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
        created_at=row["created_at"],
    )


def _row_to_checkpoint(row: sqlite3.Row) -> CheckpointRecord:
    return CheckpointRecord(
        checkpoint_id=row["checkpoint_id"],
        workflow_id=row["workflow_id"],
        step_id=row["step_id"],
        state_json=row["state_json"],
        created_at=row["created_at"],
    )


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class WorkflowEngine:
    """Durable workflow engine with SQLite-backed checkpoints."""

    def __init__(self, db_path: str) -> None:
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
        log.info("workflow_engine.db_init", db_path=self._db_path)

    # ------------------------------------------------------------------
    # Workflow CRUD
    # ------------------------------------------------------------------

    def create_workflow(
        self,
        name: str,
        description: str,
        steps: list[StepDefinition],
        input_data: dict[str, Any] | None = None,
    ) -> WorkflowRecord:
        now = _now()
        workflow_id = _make_workflow_id(name, now)
        input_json = json.dumps(input_data) if input_data is not None else None

        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute(
                    """
                    INSERT INTO workflows
                      (workflow_id, name, description, status, input_json, output_json,
                       created_at, updated_at, completed_at)
                    VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL)
                    """,
                    (workflow_id, name, description, _ev(WorkflowStatus.pending), input_json, now, now),
                )
                for step_def in steps:
                    step_id = _make_step_id(workflow_id, step_def.seq, step_def.name)
                    conn.execute(
                        """
                        INSERT INTO workflow_steps
                          (step_id, workflow_id, name, seq, status, fn_name,
                           input_json, output_json, error, started_at, completed_at, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?)
                        """,
                        (
                            step_id,
                            workflow_id,
                            step_def.name,
                            step_def.seq,
                            _ev(StepStatus.pending),
                            step_def.fn_name,
                            now,
                        ),
                    )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM workflows WHERE workflow_id = ?", (workflow_id,)
                ).fetchone()
            finally:
                conn.close()

        record = _row_to_workflow(row)
        log.info("workflow.created", workflow_id=workflow_id, name=name, steps=len(steps))
        return record

    def start_workflow(self, workflow_id: str) -> WorkflowRecord:
        now = _now()
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute(
                    "UPDATE workflows SET status = ?, updated_at = ? WHERE workflow_id = ?",
                    (_ev(WorkflowStatus.running), now, workflow_id),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM workflows WHERE workflow_id = ?", (workflow_id,)
                ).fetchone()
            finally:
                conn.close()

        if row is None:
            raise ValueError(f"Workflow not found: {workflow_id}")
        record = _row_to_workflow(row)
        log.info("workflow.started", workflow_id=workflow_id)
        return record

    def complete_workflow(self, workflow_id: str, output_data: dict[str, Any] | None = None) -> WorkflowRecord:
        now = _now()
        output_json = json.dumps(output_data) if output_data is not None else None
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute(
                    """
                    UPDATE workflows
                    SET status = ?, output_json = ?, updated_at = ?, completed_at = ?
                    WHERE workflow_id = ?
                    """,
                    (_ev(WorkflowStatus.completed), output_json, now, now, workflow_id),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM workflows WHERE workflow_id = ?", (workflow_id,)
                ).fetchone()
            finally:
                conn.close()

        if row is None:
            raise ValueError(f"Workflow not found: {workflow_id}")
        record = _row_to_workflow(row)
        log.info("workflow.completed", workflow_id=workflow_id)
        return record

    def fail_workflow(self, workflow_id: str, error: str) -> WorkflowRecord:
        now = _now()
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute(
                    "UPDATE workflows SET status = ?, output_json = ?, updated_at = ? WHERE workflow_id = ?",
                    (_ev(WorkflowStatus.failed), json.dumps({"error": error}), now, workflow_id),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM workflows WHERE workflow_id = ?", (workflow_id,)
                ).fetchone()
            finally:
                conn.close()

        if row is None:
            raise ValueError(f"Workflow not found: {workflow_id}")
        record = _row_to_workflow(row)
        log.warning("workflow.failed", workflow_id=workflow_id, error=error)
        return record

    def get_workflow(self, workflow_id: str) -> WorkflowRecord | None:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                row = conn.execute(
                    "SELECT * FROM workflows WHERE workflow_id = ?", (workflow_id,)
                ).fetchone()
            finally:
                conn.close()
        return _row_to_workflow(row) if row else None

    def list_workflows(self, status: WorkflowStatus | str | None = None, limit: int = 50) -> list[WorkflowRecord]:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                if status is not None:
                    rows = conn.execute(
                        "SELECT * FROM workflows WHERE status = ? ORDER BY created_at DESC LIMIT ?",
                        (status.value if hasattr(status, "value") else str(status), limit),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT * FROM workflows ORDER BY created_at DESC LIMIT ?", (limit,)
                    ).fetchall()
            finally:
                conn.close()
        return [_row_to_workflow(r) for r in rows]

    # ------------------------------------------------------------------
    # Step operations
    # ------------------------------------------------------------------

    def execute_step(
        self,
        workflow_id: str,
        step_id: str,
        fn: Callable[..., Any],
        output_data: dict[str, Any] | None = None,
    ) -> StepRecord:
        """Mark step running, call fn, then complete or fail based on result."""
        now = _now()
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute(
                    "UPDATE workflow_steps SET status = ?, started_at = ? WHERE step_id = ?",
                    (_ev(StepStatus.running), now, step_id),
                )
                conn.commit()
            finally:
                conn.close()

        try:
            result = fn(output_data or {})
            return self.complete_step(workflow_id, step_id, result if isinstance(result, dict) else (output_data or {}))
        except Exception as exc:
            return self.fail_step(workflow_id, step_id, str(exc))

    def complete_step(
        self, workflow_id: str, step_id: str, output_data: dict[str, Any] | None = None
    ) -> StepRecord:
        now = _now()
        output_json = json.dumps(output_data) if output_data is not None else None
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute(
                    """
                    UPDATE workflow_steps
                    SET status = ?, output_json = ?, completed_at = ?
                    WHERE step_id = ?
                    """,
                    (_ev(StepStatus.completed), output_json, now, step_id),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM workflow_steps WHERE step_id = ?", (step_id,)
                ).fetchone()
            finally:
                conn.close()

        if row is None:
            raise ValueError(f"Step not found: {step_id}")
        record = _row_to_step(row)
        log.info("step.completed", workflow_id=workflow_id, step_id=step_id)
        return record

    def fail_step(self, workflow_id: str, step_id: str, error: str) -> StepRecord:
        now = _now()
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute(
                    """
                    UPDATE workflow_steps
                    SET status = ?, error = ?, completed_at = ?
                    WHERE step_id = ?
                    """,
                    (_ev(StepStatus.failed), error, now, step_id),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM workflow_steps WHERE step_id = ?", (step_id,)
                ).fetchone()
            finally:
                conn.close()

        if row is None:
            raise ValueError(f"Step not found: {step_id}")
        record = _row_to_step(row)
        log.warning("step.failed", workflow_id=workflow_id, step_id=step_id, error=error)
        return record

    def get_steps(self, workflow_id: str) -> list[StepRecord]:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(
                    "SELECT * FROM workflow_steps WHERE workflow_id = ? ORDER BY seq ASC",
                    (workflow_id,),
                ).fetchall()
            finally:
                conn.close()
        return [_row_to_step(r) for r in rows]

    # ------------------------------------------------------------------
    # Checkpoint operations
    # ------------------------------------------------------------------

    def checkpoint(
        self, workflow_id: str, step_id: str | None, state: dict[str, Any]
    ) -> CheckpointRecord:
        now = _now()
        checkpoint_id = _make_checkpoint_id(workflow_id, step_id, now)
        state_json = json.dumps(state)

        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute(
                    """
                    INSERT INTO workflow_checkpoints
                      (checkpoint_id, workflow_id, step_id, state_json, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (checkpoint_id, workflow_id, step_id, state_json, now),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM workflow_checkpoints WHERE checkpoint_id = ?",
                    (checkpoint_id,),
                ).fetchone()
            finally:
                conn.close()

        record = _row_to_checkpoint(row)
        log.info("workflow.checkpoint", workflow_id=workflow_id, step_id=step_id, checkpoint_id=checkpoint_id)
        return record

    def resume_workflow(self, workflow_id: str) -> WorkflowRecord:
        """Resume a paused/failed workflow from its last checkpoint."""
        now = _now()

        # Find last checkpoint
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                cp_row = conn.execute(
                    """
                    SELECT * FROM workflow_checkpoints
                    WHERE workflow_id = ?
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    (workflow_id,),
                ).fetchone()

                if cp_row:
                    step_id = cp_row["step_id"]
                    # Reset steps after the checkpoint step to pending
                    if step_id:
                        step_row = conn.execute(
                            "SELECT seq FROM workflow_steps WHERE step_id = ?", (step_id,)
                        ).fetchone()
                        if step_row:
                            conn.execute(
                                """
                                UPDATE workflow_steps SET status = ?
                                WHERE workflow_id = ? AND seq > ?
                                """,
                                (_ev(StepStatus.pending), workflow_id, step_row["seq"]),
                            )

                conn.execute(
                    "UPDATE workflows SET status = ?, updated_at = ? WHERE workflow_id = ?",
                    (_ev(WorkflowStatus.running), now, workflow_id),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM workflows WHERE workflow_id = ?", (workflow_id,)
                ).fetchone()
            finally:
                conn.close()

        if row is None:
            raise ValueError(f"Workflow not found: {workflow_id}")
        record = _row_to_workflow(row)
        log.info("workflow.resumed", workflow_id=workflow_id, last_checkpoint=cp_row["checkpoint_id"] if cp_row else None)
        return record

    def get_checkpoints(self, workflow_id: str) -> list[CheckpointRecord]:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(
                    "SELECT * FROM workflow_checkpoints WHERE workflow_id = ? ORDER BY created_at ASC",
                    (workflow_id,),
                ).fetchall()
            finally:
                conn.close()
        return [_row_to_checkpoint(r) for r in rows]


# ---------------------------------------------------------------------------
# Singleton / factory
# ---------------------------------------------------------------------------

_engine_instance: WorkflowEngine | None = None
_engine_lock = threading.Lock()


def _get_engine() -> WorkflowEngine:
    global _engine_instance
    with _engine_lock:
        if _engine_instance is None:
            db_path = str(product_db_path())
            _engine_instance = WorkflowEngine(db_path)
    return _engine_instance


def reset_engine(db_path: str) -> WorkflowEngine:
    """Create a fresh engine — used in tests for isolation."""
    global _engine_instance
    with _engine_lock:
        _engine_instance = WorkflowEngine(db_path)
    return _engine_instance
