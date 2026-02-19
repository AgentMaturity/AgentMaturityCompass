"""AMC Product — Agent Onboarding Wizard.

Multi-step setup flow for new agents: OAuth connections, workflow selection,
preferences, and first-run success path. Backed by a SQLite state machine.

Steps
-----
1. welcome       — collect org/tenant metadata
2. oauth         — register OAuth integrations (Google, Slack, HubSpot, …)
3. workflows     — choose which AMC workflows to activate
4. preferences   — tone, language, timezone, notification channels
5. first_run     — trigger a supervised first job to validate the stack
6. complete      — success; wizard closed

Revenue path: faster Time-to-Value → lower churn → Lever A.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Any

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS onboarding_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    agent_id        TEXT NOT NULL,
    current_step    TEXT NOT NULL DEFAULT 'welcome',
    status          TEXT NOT NULL DEFAULT 'in_progress',
    data_json       TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    completed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_onboard_tenant ON onboarding_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_onboard_agent  ON onboarding_sessions(agent_id);

CREATE TABLE IF NOT EXISTS onboarding_oauth_connections (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conn_id         TEXT NOT NULL UNIQUE,
    session_id      TEXT NOT NULL,
    provider        TEXT NOT NULL,
    scopes          TEXT NOT NULL DEFAULT '[]',
    status          TEXT NOT NULL DEFAULT 'pending',
    access_token    TEXT,
    refresh_token   TEXT,
    expires_at      TEXT,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES onboarding_sessions(session_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_session ON onboarding_oauth_connections(session_id);

CREATE TABLE IF NOT EXISTS onboarding_workflow_selections (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    selection_id    TEXT NOT NULL UNIQUE,
    session_id      TEXT NOT NULL,
    workflow_id     TEXT NOT NULL,
    workflow_name   TEXT NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 1,
    config_json     TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (session_id) REFERENCES onboarding_sessions(session_id)
);

CREATE TABLE IF NOT EXISTS onboarding_first_run_results (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id       TEXT NOT NULL UNIQUE,
    session_id      TEXT NOT NULL,
    job_id          TEXT NOT NULL,
    success         INTEGER NOT NULL DEFAULT 0,
    output_preview  TEXT NOT NULL DEFAULT '',
    metrics_json    TEXT NOT NULL DEFAULT '{}',
    run_at          TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES onboarding_sessions(session_id)
);
"""

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class OnboardingStep(str, Enum):
    WELCOME    = "welcome"
    OAUTH      = "oauth"
    WORKFLOWS  = "workflows"
    PREFERENCES = "preferences"
    FIRST_RUN  = "first_run"
    COMPLETE   = "complete"

STEP_ORDER = [
    OnboardingStep.WELCOME,
    OnboardingStep.OAUTH,
    OnboardingStep.WORKFLOWS,
    OnboardingStep.PREFERENCES,
    OnboardingStep.FIRST_RUN,
    OnboardingStep.COMPLETE,
]

class OnboardingStatus(str, Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED   = "completed"
    ABANDONED   = "abandoned"

class OAuthStatus(str, Enum):
    PENDING    = "pending"
    CONNECTED  = "connected"
    FAILED     = "failed"
    REVOKED    = "revoked"

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

from pydantic import BaseModel, Field


class StartSessionInput(BaseModel):
    tenant_id: str
    agent_id: str
    org_name: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class StepAdvanceInput(BaseModel):
    session_id: str
    step_data: dict[str, Any] = Field(default_factory=dict)


class OAuthConnectionInput(BaseModel):
    session_id: str
    provider: str
    scopes: list[str] = Field(default_factory=list)
    access_token: str | None = None
    refresh_token: str | None = None
    expires_at: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class WorkflowSelectionInput(BaseModel):
    session_id: str
    workflow_id: str
    workflow_name: str
    enabled: bool = True
    config: dict[str, Any] = Field(default_factory=dict)


class FirstRunInput(BaseModel):
    session_id: str
    job_id: str
    success: bool
    output_preview: str = ""
    metrics: dict[str, Any] = Field(default_factory=dict)


class PreferencesInput(BaseModel):
    session_id: str
    tone: str = "professional"
    language: str = "en"
    timezone: str = "UTC"
    notification_channels: list[str] = Field(default_factory=list)
    extra: dict[str, Any] = Field(default_factory=dict)


class OnboardingSessionRecord(BaseModel):
    session_id: str
    tenant_id: str
    agent_id: str
    current_step: str
    status: str
    data: dict[str, Any]
    created_at: str
    updated_at: str
    completed_at: str | None


class OAuthConnectionRecord(BaseModel):
    conn_id: str
    session_id: str
    provider: str
    scopes: list[str]
    status: str
    metadata: dict[str, Any]
    created_at: str


class WorkflowSelectionRecord(BaseModel):
    selection_id: str
    session_id: str
    workflow_id: str
    workflow_name: str
    enabled: bool
    config: dict[str, Any]


class FirstRunResult(BaseModel):
    result_id: str
    session_id: str
    job_id: str
    success: bool
    output_preview: str
    metrics: dict[str, Any]
    run_at: str


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------

def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class OnboardingWizard:
    """Manages the onboarding state machine for AMC agents."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._path = str(db_path or product_db_path())
        self._lock = Lock()
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_db(self) -> None:
        with self._conn() as c:
            c.executescript(_SCHEMA)

    # ------------------------------------------------------------------
    # Session lifecycle
    # ------------------------------------------------------------------

    def start_session(self, inp: StartSessionInput) -> OnboardingSessionRecord:
        sid = str(uuid.uuid4())
        now = _utc_now()
        data = {"org_name": inp.org_name, **inp.metadata}
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO onboarding_sessions
                   (session_id, tenant_id, agent_id, current_step, status,
                    data_json, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (sid, inp.tenant_id, inp.agent_id,
                 OnboardingStep.WELCOME.value, OnboardingStatus.IN_PROGRESS.value,
                 json.dumps(data), now, now),
            )
        return self.get_session(sid)  # type: ignore[return-value]

    def get_session(self, session_id: str) -> OnboardingSessionRecord | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM onboarding_sessions WHERE session_id=?", (session_id,)
            ).fetchone()
        if row is None:
            return None
        return OnboardingSessionRecord(
            session_id=row["session_id"],
            tenant_id=row["tenant_id"],
            agent_id=row["agent_id"],
            current_step=row["current_step"],
            status=row["status"],
            data=json.loads(row["data_json"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            completed_at=row["completed_at"],
        )

    def advance_step(self, inp: StepAdvanceInput) -> OnboardingSessionRecord:
        """Move session to next step, merging step_data into session data."""
        with self._lock:
            sess = self.get_session(inp.session_id)
            if sess is None:
                raise ValueError(f"Session {inp.session_id!r} not found")
            if sess.status != OnboardingStatus.IN_PROGRESS:
                raise ValueError(f"Session is {sess.status}, cannot advance")

            current_idx = next(
                (i for i, s in enumerate(STEP_ORDER) if s.value == sess.current_step), None
            )
            if current_idx is None:
                raise ValueError(f"Unknown step {sess.current_step!r}")
            if current_idx + 1 >= len(STEP_ORDER):
                raise ValueError("Already at final step")

            next_step = STEP_ORDER[current_idx + 1]
            merged_data = {**sess.data, **inp.step_data}
            now = _utc_now()

            new_status: str = sess.status
            completed_at: str | None = sess.completed_at
            if next_step == OnboardingStep.COMPLETE:
                new_status = OnboardingStatus.COMPLETED.value
                completed_at = now

            with self._conn() as c:
                c.execute(
                    """UPDATE onboarding_sessions
                       SET current_step=?, data_json=?, status=?,
                           updated_at=?, completed_at=?
                       WHERE session_id=?""",
                    (next_step.value, json.dumps(merged_data),
                     new_status, now, completed_at, inp.session_id),
                )
        return self.get_session(inp.session_id)  # type: ignore[return-value]

    def abandon_session(self, session_id: str) -> OnboardingSessionRecord:
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                "UPDATE onboarding_sessions SET status=?, updated_at=? WHERE session_id=?",
                (OnboardingStatus.ABANDONED.value, now, session_id),
            )
        return self.get_session(session_id)  # type: ignore[return-value]

    def list_sessions(
        self,
        tenant_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[OnboardingSessionRecord]:
        q = "SELECT * FROM onboarding_sessions WHERE 1=1"
        params: list[Any] = []
        if tenant_id:
            q += " AND tenant_id=?"; params.append(tenant_id)
        if status:
            q += " AND status=?"; params.append(status)
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [
            OnboardingSessionRecord(
                session_id=r["session_id"], tenant_id=r["tenant_id"],
                agent_id=r["agent_id"], current_step=r["current_step"],
                status=r["status"], data=json.loads(r["data_json"]),
                created_at=r["created_at"], updated_at=r["updated_at"],
                completed_at=r["completed_at"],
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # OAuth connections
    # ------------------------------------------------------------------

    def add_oauth_connection(self, inp: OAuthConnectionInput) -> OAuthConnectionRecord:
        conn_id = str(uuid.uuid4())
        now = _utc_now()
        status = OAuthStatus.CONNECTED if inp.access_token else OAuthStatus.PENDING
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO onboarding_oauth_connections
                   (conn_id, session_id, provider, scopes, status,
                    access_token, refresh_token, expires_at, metadata_json, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (conn_id, inp.session_id, inp.provider,
                 json.dumps(inp.scopes), status.value,
                 inp.access_token, inp.refresh_token, inp.expires_at,
                 json.dumps(inp.metadata), now),
            )
        return self._get_oauth_conn(conn_id)  # type: ignore[return-value]

    def _get_oauth_conn(self, conn_id: str) -> OAuthConnectionRecord | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM onboarding_oauth_connections WHERE conn_id=?", (conn_id,)
            ).fetchone()
        if row is None:
            return None
        return OAuthConnectionRecord(
            conn_id=row["conn_id"], session_id=row["session_id"],
            provider=row["provider"], scopes=json.loads(row["scopes"]),
            status=row["status"], metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"],
        )

    def list_oauth_connections(self, session_id: str) -> list[OAuthConnectionRecord]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM onboarding_oauth_connections WHERE session_id=? ORDER BY created_at",
                (session_id,),
            ).fetchall()
        return [
            OAuthConnectionRecord(
                conn_id=r["conn_id"], session_id=r["session_id"],
                provider=r["provider"], scopes=json.loads(r["scopes"]),
                status=r["status"], metadata=json.loads(r["metadata_json"]),
                created_at=r["created_at"],
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Workflow selections
    # ------------------------------------------------------------------

    def select_workflow(self, inp: WorkflowSelectionInput) -> WorkflowSelectionRecord:
        sel_id = str(uuid.uuid4())
        with self._lock, self._conn() as c:
            # upsert by session+workflow
            existing = c.execute(
                "SELECT selection_id FROM onboarding_workflow_selections WHERE session_id=? AND workflow_id=?",
                (inp.session_id, inp.workflow_id),
            ).fetchone()
            if existing:
                c.execute(
                    "UPDATE onboarding_workflow_selections SET enabled=?, config_json=? WHERE selection_id=?",
                    (int(inp.enabled), json.dumps(inp.config), existing["selection_id"]),
                )
                sel_id = existing["selection_id"]
            else:
                c.execute(
                    """INSERT INTO onboarding_workflow_selections
                       (selection_id, session_id, workflow_id, workflow_name, enabled, config_json)
                       VALUES (?,?,?,?,?,?)""",
                    (sel_id, inp.session_id, inp.workflow_id,
                     inp.workflow_name, int(inp.enabled), json.dumps(inp.config)),
                )
        return self._get_workflow_selection(sel_id)  # type: ignore[return-value]

    def _get_workflow_selection(self, sel_id: str) -> WorkflowSelectionRecord | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM onboarding_workflow_selections WHERE selection_id=?", (sel_id,)
            ).fetchone()
        if row is None:
            return None
        return WorkflowSelectionRecord(
            selection_id=row["selection_id"], session_id=row["session_id"],
            workflow_id=row["workflow_id"], workflow_name=row["workflow_name"],
            enabled=bool(row["enabled"]), config=json.loads(row["config_json"]),
        )

    def list_workflow_selections(self, session_id: str) -> list[WorkflowSelectionRecord]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM onboarding_workflow_selections WHERE session_id=?", (session_id,)
            ).fetchall()
        return [
            WorkflowSelectionRecord(
                selection_id=r["selection_id"], session_id=r["session_id"],
                workflow_id=r["workflow_id"], workflow_name=r["workflow_name"],
                enabled=bool(r["enabled"]), config=json.loads(r["config_json"]),
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # First-run
    # ------------------------------------------------------------------

    def record_first_run(self, inp: FirstRunInput) -> FirstRunResult:
        result_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO onboarding_first_run_results
                   (result_id, session_id, job_id, success, output_preview, metrics_json, run_at)
                   VALUES (?,?,?,?,?,?,?)""",
                (result_id, inp.session_id, inp.job_id, int(inp.success),
                 inp.output_preview, json.dumps(inp.metrics), now),
            )
        return FirstRunResult(
            result_id=result_id, session_id=inp.session_id, job_id=inp.job_id,
            success=inp.success, output_preview=inp.output_preview,
            metrics=inp.metrics, run_at=now,
        )

    def get_first_run_result(self, session_id: str) -> FirstRunResult | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM onboarding_first_run_results WHERE session_id=? ORDER BY run_at DESC LIMIT 1",
                (session_id,),
            ).fetchone()
        if row is None:
            return None
        return FirstRunResult(
            result_id=row["result_id"], session_id=row["session_id"],
            job_id=row["job_id"], success=bool(row["success"]),
            output_preview=row["output_preview"],
            metrics=json.loads(row["metrics_json"]), run_at=row["run_at"],
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_wizard: OnboardingWizard | None = None
_wizard_lock = Lock()


def get_onboarding_wizard(db_path: str | Path | None = None) -> OnboardingWizard:
    global _wizard
    with _wizard_lock:
        if _wizard is None:
            _wizard = OnboardingWizard(db_path=db_path)
    return _wizard


__all__ = [
    "OnboardingStep",
    "OnboardingStatus",
    "OAuthStatus",
    "StartSessionInput",
    "StepAdvanceInput",
    "OAuthConnectionInput",
    "WorkflowSelectionInput",
    "FirstRunInput",
    "PreferencesInput",
    "OnboardingSessionRecord",
    "OAuthConnectionRecord",
    "WorkflowSelectionRecord",
    "FirstRunResult",
    "OnboardingWizard",
    "get_onboarding_wizard",
]
