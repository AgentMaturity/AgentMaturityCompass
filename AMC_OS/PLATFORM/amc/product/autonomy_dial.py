"""AMC Autonomy Dial — Wave 2 Feature #1.

Per-task-type Ask-vs-Act policy engine.  Operators configure how autonomously
the agent should behave per task category.  At runtime the dial resolves the
correct action mode (ASK / ACT / CONDITIONAL) and returns the decision with
supporting rationale.

SQLite-backed with per-tenant overrides and a global default ladder.

API mount point: /api/v1/product/autonomy
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_NS = UUID("c1d2e3f4-a5b6-7890-cdef-123456789abc")

# ── Schema ──────────────────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS autonomy_policies (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    policy_id       TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    task_type       TEXT NOT NULL,
    mode            TEXT NOT NULL DEFAULT 'ask',
    confidence_threshold REAL NOT NULL DEFAULT 0.85,
    description     TEXT NOT NULL DEFAULT '',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_autonomy_tenant_type
    ON autonomy_policies(tenant_id, task_type);
CREATE INDEX IF NOT EXISTS idx_autonomy_tenant
    ON autonomy_policies(tenant_id);

CREATE TABLE IF NOT EXISTS autonomy_decisions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    decision_id     TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    task_type       TEXT NOT NULL,
    mode_resolved   TEXT NOT NULL,
    confidence      REAL NOT NULL DEFAULT 0.0,
    policy_id       TEXT,
    rationale       TEXT NOT NULL DEFAULT '',
    context_json    TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_autonomy_dec_tenant
    ON autonomy_decisions(tenant_id, created_at);
"""

# ── Enums ───────────────────────────────────────────────────────────────────


class AutonomyMode(str, Enum):
    ASK = "ask"            # always pause and ask operator
    ACT = "act"            # proceed autonomously without confirmation
    CONDITIONAL = "conditional"  # act if confidence >= threshold, else ask


# Built-in task-type → default mode ladder (can be overridden per tenant)
_DEFAULT_MODES: dict[str, AutonomyMode] = {
    "information_retrieval": AutonomyMode.ACT,
    "summarization": AutonomyMode.ACT,
    "draft_generation": AutonomyMode.CONDITIONAL,
    "email_send": AutonomyMode.ASK,
    "file_write": AutonomyMode.CONDITIONAL,
    "payment": AutonomyMode.ASK,
    "delete": AutonomyMode.ASK,
    "api_write": AutonomyMode.CONDITIONAL,
    "external_communication": AutonomyMode.ASK,
    "code_execution": AutonomyMode.ASK,
    "generic": AutonomyMode.CONDITIONAL,
}


# ── Domain models ────────────────────────────────────────────────────────────


@dataclass
class PolicyInput:
    tenant_id: str
    task_type: str
    mode: AutonomyMode = AutonomyMode.CONDITIONAL
    confidence_threshold: float = 0.85
    description: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class PolicyRecord:
    policy_id: str
    tenant_id: str
    task_type: str
    mode: AutonomyMode
    confidence_threshold: float
    description: str
    metadata: dict[str, Any]
    active: bool
    created_at: str
    updated_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "policy_id": self.policy_id,
            "tenant_id": self.tenant_id,
            "task_type": self.task_type,
            "mode": self.mode.value,
            "confidence_threshold": self.confidence_threshold,
            "description": self.description,
            "metadata": self.metadata,
            "active": self.active,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class AutonomyDecision:
    decision_id: str
    tenant_id: str
    task_type: str
    mode_resolved: AutonomyMode
    confidence: float
    policy_id: str | None
    rationale: str
    should_ask: bool
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "decision_id": self.decision_id,
            "tenant_id": self.tenant_id,
            "task_type": self.task_type,
            "mode_resolved": self.mode_resolved.value,
            "confidence": self.confidence,
            "policy_id": self.policy_id,
            "rationale": self.rationale,
            "should_ask": self.should_ask,
            "created_at": self.created_at,
        }


# ── Core engine ──────────────────────────────────────────────────────────────


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _policy_id(tenant_id: str, task_type: str) -> str:
    return str(uuid5(_NS, f"{tenant_id}:{task_type}"))


class AutonomyDial:
    """Per-task-type autonomy policy store and decision engine."""

    def __init__(self, db_path: Path | None = None) -> None:
        self._db = str(db_path or product_db_path("autonomy.db"))
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_db(self) -> None:
        with self._conn() as conn:
            conn.executescript(_SCHEMA)

    # ── Policy CRUD ─────────────────────────────────────────────────────────

    def set_policy(self, inp: PolicyInput) -> PolicyRecord:
        pid = _policy_id(inp.tenant_id, inp.task_type)
        now = _utc_now()
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO autonomy_policies
                   (policy_id, tenant_id, task_type, mode, confidence_threshold,
                    description, metadata_json, active, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,1,?,?)
                   ON CONFLICT(policy_id) DO UPDATE SET
                     mode=excluded.mode,
                     confidence_threshold=excluded.confidence_threshold,
                     description=excluded.description,
                     metadata_json=excluded.metadata_json,
                     active=1,
                     updated_at=excluded.updated_at""",
                (
                    pid,
                    inp.tenant_id,
                    inp.task_type,
                    inp.mode.value,
                    inp.confidence_threshold,
                    inp.description,
                    json.dumps(inp.metadata),
                    now,
                    now,
                ),
            )
        return self.get_policy(pid)  # type: ignore[return-value]

    def get_policy(self, policy_id: str) -> PolicyRecord | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM autonomy_policies WHERE policy_id=?", (policy_id,)
            ).fetchone()
        return self._row_to_policy(row) if row else None

    def get_policy_for(self, tenant_id: str, task_type: str) -> PolicyRecord | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM autonomy_policies WHERE tenant_id=? AND task_type=? AND active=1",
                (tenant_id, task_type),
            ).fetchone()
        return self._row_to_policy(row) if row else None

    def list_policies(self, tenant_id: str | None = None, active_only: bool = True) -> list[PolicyRecord]:
        if tenant_id is not None:
            q = "SELECT * FROM autonomy_policies WHERE tenant_id=?"
            params: list[Any] = [tenant_id]
        else:
            q = "SELECT * FROM autonomy_policies WHERE 1=1"
            params = []
        if active_only:
            q += " AND active=1"
        with self._conn() as conn:
            rows = conn.execute(q, params).fetchall()
        return [self._row_to_policy(r) for r in rows]

    def delete_policy(self, policy_id: str) -> bool:
        with self._conn() as conn:
            cur = conn.execute(
                "UPDATE autonomy_policies SET active=0, updated_at=? WHERE policy_id=?",
                (_utc_now(), policy_id),
            )
        return cur.rowcount > 0

    # ── Decision engine ─────────────────────────────────────────────────────

    def decide(
        self,
        tenant_id: str,
        task_type: str,
        confidence: float | dict[str, Any] = 1.0,
        context: dict[str, Any] | None = None,
    ) -> AutonomyDecision:
        # Handle case where confidence is actually a context dict
        if isinstance(confidence, dict):
            context = confidence
            confidence = 1.0
        """Resolve the autonomy mode for a task and return a decision record."""
        policy = self.get_policy_for(tenant_id, task_type)
        if policy is None:
            # Fall back to global defaults
            default_mode = _DEFAULT_MODES.get(task_type, AutonomyMode.CONDITIONAL)
            threshold = 0.85
            policy_id = None
            source = "default_ladder"
        else:
            default_mode = policy.mode
            threshold = policy.confidence_threshold
            policy_id = policy.policy_id
            source = f"policy:{policy.policy_id}"

        if default_mode == AutonomyMode.ASK:
            resolved = AutonomyMode.ASK
            should_ask = True
            rationale = f"Policy is ASK for task_type='{task_type}' (source={source})."
        elif default_mode == AutonomyMode.ACT:
            resolved = AutonomyMode.ACT
            should_ask = False
            rationale = f"Policy is ACT for task_type='{task_type}' (source={source})."
        else:  # CONDITIONAL
            if confidence >= threshold:
                resolved = AutonomyMode.ACT
                should_ask = False
                rationale = (
                    f"CONDITIONAL: confidence={confidence:.3f} >= threshold={threshold:.3f}; "
                    f"acting autonomously (source={source})."
                )
            else:
                resolved = AutonomyMode.ASK
                should_ask = True
                rationale = (
                    f"CONDITIONAL: confidence={confidence:.3f} < threshold={threshold:.3f}; "
                    f"asking operator (source={source})."
                )

        dec_id = str(uuid.uuid4())
        now = _utc_now()
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO autonomy_decisions
                   (decision_id, tenant_id, task_type, mode_resolved, confidence,
                    policy_id, rationale, context_json, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    dec_id,
                    tenant_id,
                    task_type,
                    resolved.value,
                    confidence,
                    policy_id,
                    rationale,
                    json.dumps(context or {}),
                    now,
                ),
            )

        log.info("autonomy_decision", decision_id=dec_id, mode=resolved.value, should_ask=should_ask)
        return AutonomyDecision(
            decision_id=dec_id,
            tenant_id=tenant_id,
            task_type=task_type,
            mode_resolved=resolved,
            confidence=confidence,
            policy_id=policy_id,
            rationale=rationale,
            should_ask=should_ask,
            created_at=now,
        )

    def list_decisions(
        self,
        tenant_id: str | None = None,
        task_type: str | None = None,
        limit: int = 100,
    ) -> list[AutonomyDecision]:
        q = "SELECT * FROM autonomy_decisions WHERE 1=1"
        params: list[Any] = []
        if tenant_id:
            q += " AND tenant_id=?"
            params.append(tenant_id)
        if task_type:
            q += " AND task_type=?"
            params.append(task_type)
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as conn:
            rows = conn.execute(q, params).fetchall()
        return [self._row_to_decision(r) for r in rows]

    def default_modes(self) -> dict[str, str]:
        return {k: v.value for k, v in _DEFAULT_MODES.items()}

    # ── Helpers ─────────────────────────────────────────────────────────────

    @staticmethod
    def _row_to_policy(row: sqlite3.Row) -> PolicyRecord:
        return PolicyRecord(
            policy_id=row["policy_id"],
            tenant_id=row["tenant_id"],
            task_type=row["task_type"],
            mode=AutonomyMode(row["mode"]),
            confidence_threshold=row["confidence_threshold"],
            description=row["description"],
            metadata=json.loads(row["metadata_json"]),
            active=bool(row["active"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _row_to_decision(row: sqlite3.Row) -> AutonomyDecision:
        return AutonomyDecision(
            decision_id=row["decision_id"],
            tenant_id=row["tenant_id"],
            task_type=row["task_type"],
            mode_resolved=AutonomyMode(row["mode_resolved"]),
            confidence=row["confidence"],
            policy_id=row["policy_id"],
            rationale=row["rationale"],
            should_ask=row["mode_resolved"] == AutonomyMode.ASK.value,
            created_at=row["created_at"],
        )


# ── Singleton factory ────────────────────────────────────────────────────────

_dial: AutonomyDial | None = None


def get_autonomy_dial() -> AutonomyDial:
    global _dial
    if _dial is None:
        _dial = AutonomyDial()
    return _dial


def reset_dial(db_path: Path | None = None) -> AutonomyDial:
    global _dial
    _dial = AutonomyDial(db_path=db_path)
    return _dial
