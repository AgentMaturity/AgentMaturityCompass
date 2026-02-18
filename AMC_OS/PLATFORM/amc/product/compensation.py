"""AMC Product — Compensation / Rollback Workflows.

CompensationPlan, step registration with compensating actions,
partial failure recovery, execution log. SQLite-backed.

API: /api/v1/product/compensation/*
"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import UUID, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_NAMESPACE = UUID("c0a8e750-1234-5678-9abc-def012345678")

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS compensation_plans (
    plan_id         TEXT NOT NULL PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'pending',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cp_status ON compensation_plans(status);

CREATE TABLE IF NOT EXISTS compensation_steps (
    step_id         TEXT NOT NULL PRIMARY KEY,
    plan_id         TEXT NOT NULL,
    name            TEXT NOT NULL,
    seq             INTEGER NOT NULL,
    action_fn       TEXT NOT NULL DEFAULT '',
    compensate_fn   TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'pending',
    input_json      TEXT NOT NULL DEFAULT '{}',
    output_json     TEXT NOT NULL DEFAULT '{}',
    error           TEXT,
    executed_at     TEXT,
    compensated_at  TEXT,
    created_at      TEXT NOT NULL,
    FOREIGN KEY (plan_id) REFERENCES compensation_plans(plan_id)
);
CREATE INDEX IF NOT EXISTS idx_cs_plan_seq ON compensation_steps(plan_id, seq);

CREATE TABLE IF NOT EXISTS compensation_log (
    log_id          TEXT NOT NULL PRIMARY KEY,
    plan_id         TEXT NOT NULL,
    step_id         TEXT,
    action          TEXT NOT NULL,
    result          TEXT NOT NULL DEFAULT '',
    error           TEXT,
    executed_at     TEXT NOT NULL,
    FOREIGN KEY (plan_id) REFERENCES compensation_plans(plan_id)
);
CREATE INDEX IF NOT EXISTS idx_cl_plan ON compensation_log(plan_id, executed_at);
"""


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class CompensationStatus(str, Enum):
    PENDING = "pending"
    EXECUTING = "executing"
    COMPLETED = "completed"
    COMPENSATING = "compensating"
    COMPENSATED = "compensated"
    FAILED = "failed"


class StepStatus(str, Enum):
    PENDING = "pending"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    COMPENSATED = "compensated"
    SKIPPED = "skipped"


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class CompensationPlan:
    plan_id: str
    name: str
    description: str
    status: CompensationStatus
    metadata: dict[str, Any]
    created_at: str
    updated_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "plan_id": self.plan_id,
            "name": self.name,
            "description": self.description,
            "status": self.status.value,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class CompensationStep:
    step_id: str
    plan_id: str
    name: str
    seq: int
    action_fn: str
    compensate_fn: str
    status: StepStatus
    input_data: dict[str, Any]
    output_data: dict[str, Any]
    error: str | None
    executed_at: str | None
    compensated_at: str | None
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "step_id": self.step_id,
            "plan_id": self.plan_id,
            "name": self.name,
            "seq": self.seq,
            "action_fn": self.action_fn,
            "compensate_fn": self.compensate_fn,
            "status": self.status.value,
            "input_data": self.input_data,
            "output_data": self.output_data,
            "error": self.error,
            "executed_at": self.executed_at,
            "compensated_at": self.compensated_at,
            "created_at": self.created_at,
        }


@dataclass
class CompensationLogEntry:
    log_id: str
    plan_id: str
    step_id: str | None
    action: str
    result: str
    error: str | None
    executed_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "log_id": self.log_id,
            "plan_id": self.plan_id,
            "step_id": self.step_id,
            "action": self.action,
            "result": self.result,
            "error": self.error,
            "executed_at": self.executed_at,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _plan_id(name: str, ts: str) -> str:
    return str(uuid5(_NAMESPACE, f"plan:{name}:{ts}"))


def _step_id(plan_id: str, name: str, seq: int) -> str:
    return str(uuid5(_NAMESPACE, f"step:{plan_id}:{name}:{seq}"))


def _log_id(plan_id: str, action: str, ts: str) -> str:
    return str(uuid5(_NAMESPACE, f"log:{plan_id}:{action}:{ts}"))


def _row_to_plan(row: sqlite3.Row) -> CompensationPlan:
    return CompensationPlan(
        plan_id=row["plan_id"],
        name=row["name"],
        description=row["description"],
        status=CompensationStatus(row["status"]),
        metadata=json.loads(row["metadata_json"] or "{}"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_step(row: sqlite3.Row) -> CompensationStep:
    return CompensationStep(
        step_id=row["step_id"],
        plan_id=row["plan_id"],
        name=row["name"],
        seq=row["seq"],
        action_fn=row["action_fn"],
        compensate_fn=row["compensate_fn"],
        status=StepStatus(row["status"]),
        input_data=json.loads(row["input_json"] or "{}"),
        output_data=json.loads(row["output_json"] or "{}"),
        error=row["error"],
        executed_at=row["executed_at"],
        compensated_at=row["compensated_at"],
        created_at=row["created_at"],
    )


def _row_to_log(row: sqlite3.Row) -> CompensationLogEntry:
    return CompensationLogEntry(
        log_id=row["log_id"],
        plan_id=row["plan_id"],
        step_id=row["step_id"],
        action=row["action"],
        result=row["result"],
        error=row["error"],
        executed_at=row["executed_at"],
    )


# ---------------------------------------------------------------------------
# CompensationEngine
# ---------------------------------------------------------------------------


class CompensationEngine:
    """SQLite-backed saga/compensation workflow engine.

    Thread-safe via a per-instance ``threading.Lock``.
    """

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path: Path = product_db_path(db_path)
        self._lock = Lock()
        self._init_db()
        log.info("compensation_engine.init", db=str(self._db_path))

    # ------------------------------------------------------------------
    # Plan CRUD
    # ------------------------------------------------------------------

    def create_plan(
        self,
        name: str,
        description: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> CompensationPlan:
        now = _utc_now()
        plan_id = _plan_id(name, now)
        meta = metadata or {}
        with self._lock:
            conn = self._connect()
            conn.execute(
                """INSERT INTO compensation_plans
                   (plan_id, name, description, status, metadata_json, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?)""",
                (plan_id, name, description, CompensationStatus.PENDING.value,
                 json.dumps(meta), now, now),
            )
            conn.commit()
            conn.close()
        plan = CompensationPlan(
            plan_id=plan_id, name=name, description=description,
            status=CompensationStatus.PENDING, metadata=meta,
            created_at=now, updated_at=now,
        )
        log.info("compensation_engine.plan_created", plan_id=plan_id, name=name)
        return plan

    def get_plan(self, plan_id: str) -> CompensationPlan | None:
        conn = self._connect()
        row = conn.execute(
            "SELECT * FROM compensation_plans WHERE plan_id=?", (plan_id,)
        ).fetchone()
        conn.close()
        return _row_to_plan(row) if row else None

    def list_plans(
        self, status: CompensationStatus | None = None
    ) -> list[CompensationPlan]:
        conn = self._connect()
        if status:
            rows = conn.execute(
                "SELECT * FROM compensation_plans WHERE status=? ORDER BY created_at DESC",
                (status.value,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM compensation_plans ORDER BY created_at DESC"
            ).fetchall()
        conn.close()
        return [_row_to_plan(r) for r in rows]

    def complete_plan(self, plan_id: str) -> CompensationPlan:
        return self._update_plan_status(plan_id, CompensationStatus.COMPLETED)

    def fail_plan(self, plan_id: str, error: str = "") -> CompensationPlan:
        self._log(plan_id, None, "plan_failed", "", error)
        return self._update_plan_status(plan_id, CompensationStatus.FAILED)

    # ------------------------------------------------------------------
    # Step management
    # ------------------------------------------------------------------

    def register_step(
        self,
        plan_id: str,
        name: str,
        seq: int,
        action_fn: str = "",
        compensate_fn: str = "",
        input_data: dict[str, Any] | None = None,
    ) -> CompensationStep:
        now = _utc_now()
        step_id = _step_id(plan_id, name, seq)
        inp = input_data or {}
        with self._lock:
            conn = self._connect()
            conn.execute(
                """INSERT OR REPLACE INTO compensation_steps
                   (step_id, plan_id, name, seq, action_fn, compensate_fn,
                    status, input_json, output_json, error,
                    executed_at, compensated_at, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (step_id, plan_id, name, seq, action_fn, compensate_fn,
                 StepStatus.PENDING.value, json.dumps(inp), "{}", None,
                 None, None, now),
            )
            conn.commit()
            conn.close()
        step = CompensationStep(
            step_id=step_id, plan_id=plan_id, name=name, seq=seq,
            action_fn=action_fn, compensate_fn=compensate_fn,
            status=StepStatus.PENDING, input_data=inp, output_data={},
            error=None, executed_at=None, compensated_at=None, created_at=now,
        )
        log.info("compensation_engine.step_registered",
                 plan_id=plan_id, step_id=step_id, seq=seq)
        return step

    def execute_step(
        self,
        plan_id: str,
        step_id: str,
        output_data: dict[str, Any] | None = None,
    ) -> CompensationStep:
        now = _utc_now()
        out = output_data or {}
        with self._lock:
            conn = self._connect()
            conn.execute(
                """UPDATE compensation_steps
                   SET status=?, output_json=?, executed_at=?
                   WHERE plan_id=? AND step_id=?""",
                (StepStatus.COMPLETED.value, json.dumps(out), now, plan_id, step_id),
            )
            conn.commit()
            conn.close()
        self._log(plan_id, step_id, "execute_step", "completed", None)
        log.info("compensation_engine.step_executed", plan_id=plan_id, step_id=step_id)
        return self._get_step(step_id)  # type: ignore[return-value]

    def fail_step(
        self, plan_id: str, step_id: str, error: str = ""
    ) -> CompensationStep:
        """Mark step as failed, then trigger compensation from this step."""
        now = _utc_now()
        with self._lock:
            conn = self._connect()
            conn.execute(
                """UPDATE compensation_steps
                   SET status=?, error=?, executed_at=?
                   WHERE plan_id=? AND step_id=?""",
                (StepStatus.FAILED.value, error, now, plan_id, step_id),
            )
            # Mark plan as compensating
            conn.execute(
                "UPDATE compensation_plans SET status=?, updated_at=? WHERE plan_id=?",
                (CompensationStatus.COMPENSATING.value, now, plan_id),
            )
            conn.commit()
            conn.close()
        self._log(plan_id, step_id, "fail_step", "failed", error)
        log.warning("compensation_engine.step_failed",
                    plan_id=plan_id, step_id=step_id, error=error)
        # Trigger compensation cascade
        self.compensate_from(plan_id, step_id)
        return self._get_step(step_id)  # type: ignore[return-value]

    def compensate_step(self, plan_id: str, step_id: str) -> CompensationStep:
        now = _utc_now()
        with self._lock:
            conn = self._connect()
            conn.execute(
                """UPDATE compensation_steps
                   SET status=?, compensated_at=?
                   WHERE plan_id=? AND step_id=?""",
                (StepStatus.COMPENSATED.value, now, plan_id, step_id),
            )
            conn.commit()
            conn.close()
        self._log(plan_id, step_id, "compensate_step", "compensated", None)
        log.info("compensation_engine.step_compensated",
                 plan_id=plan_id, step_id=step_id)
        return self._get_step(step_id)  # type: ignore[return-value]

    def compensate_from(
        self, plan_id: str, failed_step_id: str
    ) -> list[CompensationStep]:
        """Partial failure recovery: compensate all completed steps in reverse seq order.

        Steps that were completed (seq < failed step seq) are compensated in
        reverse order. The failed step itself is left as 'failed'.
        """
        # Fetch failed step seq
        failed_step = self._get_step(failed_step_id)
        if failed_step is None:
            log.warning("compensation_engine.compensate_from.step_not_found",
                        step_id=failed_step_id)
            return []

        conn = self._connect()
        rows = conn.execute(
            """SELECT * FROM compensation_steps
               WHERE plan_id=? AND seq < ? AND status=?
               ORDER BY seq DESC""",
            (plan_id, failed_step.seq, StepStatus.COMPLETED.value),
        ).fetchall()
        conn.close()

        compensated: list[CompensationStep] = []
        for row in rows:
            step = _row_to_step(row)
            result = self.compensate_step(plan_id, step.step_id)
            compensated.append(result)

        # Mark plan as compensated if all done
        self._update_plan_status(plan_id, CompensationStatus.COMPENSATED)
        log.info("compensation_engine.compensate_from.done",
                 plan_id=plan_id, compensated_count=len(compensated))
        return compensated

    def get_steps(self, plan_id: str) -> list[CompensationStep]:
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM compensation_steps WHERE plan_id=? ORDER BY seq ASC",
            (plan_id,),
        ).fetchall()
        conn.close()
        return [_row_to_step(r) for r in rows]

    # ------------------------------------------------------------------
    # Log
    # ------------------------------------------------------------------

    def get_log(self, plan_id: str) -> list[CompensationLogEntry]:
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM compensation_log WHERE plan_id=? ORDER BY executed_at ASC",
            (plan_id,),
        ).fetchall()
        conn.close()
        return [_row_to_log(r) for r in rows]

    def _log(
        self,
        plan_id: str,
        step_id: str | None,
        action: str,
        result: str,
        error: str | None,
    ) -> None:
        now = _utc_now()
        log_id = _log_id(plan_id, action, now)
        with self._lock:
            conn = self._connect()
            conn.execute(
                """INSERT INTO compensation_log
                   (log_id, plan_id, step_id, action, result, error, executed_at)
                   VALUES (?,?,?,?,?,?,?)""",
                (log_id, plan_id, step_id, action, result, error, now),
            )
            conn.commit()
            conn.close()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_step(self, step_id: str) -> CompensationStep | None:
        conn = self._connect()
        row = conn.execute(
            "SELECT * FROM compensation_steps WHERE step_id=?", (step_id,)
        ).fetchone()
        conn.close()
        return _row_to_step(row) if row else None

    def _update_plan_status(
        self, plan_id: str, status: CompensationStatus
    ) -> CompensationPlan:
        now = _utc_now()
        with self._lock:
            conn = self._connect()
            conn.execute(
                "UPDATE compensation_plans SET status=?, updated_at=? WHERE plan_id=?",
                (status.value, now, plan_id),
            )
            conn.commit()
            conn.close()
        plan = self.get_plan(plan_id)
        if plan is None:
            raise ValueError(f"Plan not found: {plan_id}")
        return plan

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
    "CompensationStatus",
    "StepStatus",
    "CompensationPlan",
    "CompensationStep",
    "CompensationLogEntry",
    "CompensationEngine",
]


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

import threading as _threading

_compensation_instance: CompensationEngine | None = None
_compensation_lock = _threading.Lock()


def get_compensation_engine() -> CompensationEngine:
    global _compensation_instance
    if _compensation_instance is None:
        with _compensation_lock:
            if _compensation_instance is None:
                _compensation_instance = CompensationEngine()
    return _compensation_instance


def reset_compensation_engine(db_path: str | None = None) -> CompensationEngine:
    global _compensation_instance
    with _compensation_lock:
        _compensation_instance = CompensationEngine(db_path=db_path)
    return _compensation_instance
