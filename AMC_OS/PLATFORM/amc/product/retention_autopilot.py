"""AMC Product — Subscription Retention Autopilot.

Monitors usage signals, scores churn risk, and triggers win-back flows
for at-risk accounts.

Churn score (0-100): higher = more likely to churn.
Risk bands: low (<30), medium (30-60), high (>60), critical (>80).

Revenue path: reduce monthly churn by 1-2% → significant ARR compounding.
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
CREATE TABLE IF NOT EXISTS retention_usage_signals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_id       TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    signal_type     TEXT NOT NULL,
    value           REAL NOT NULL DEFAULT 0.0,
    unit            TEXT NOT NULL DEFAULT 'count',
    period_start    TEXT NOT NULL,
    period_end      TEXT NOT NULL,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    recorded_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signal_tenant ON retention_usage_signals(tenant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_type   ON retention_usage_signals(signal_type, recorded_at DESC);

CREATE TABLE IF NOT EXISTS retention_risk_scores (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    score_id        TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    churn_score     REAL NOT NULL DEFAULT 0.0,
    risk_band       TEXT NOT NULL DEFAULT 'low',
    contributing_factors_json TEXT NOT NULL DEFAULT '[]',
    computed_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_risk_tenant ON retention_risk_scores(tenant_id, computed_at DESC);

CREATE TABLE IF NOT EXISTS retention_winback_flows (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    flow_id         TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    trigger_reason  TEXT NOT NULL,
    flow_type       TEXT NOT NULL DEFAULT 'email_sequence',
    status          TEXT NOT NULL DEFAULT 'active',
    steps_json      TEXT NOT NULL DEFAULT '[]',
    current_step    INTEGER NOT NULL DEFAULT 0,
    started_at      TEXT NOT NULL,
    completed_at    TEXT,
    outcome         TEXT,
    metadata_json   TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_winback_tenant ON retention_winback_flows(tenant_id, status);

CREATE TABLE IF NOT EXISTS retention_flow_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT NOT NULL UNIQUE,
    flow_id         TEXT NOT NULL,
    step_index      INTEGER NOT NULL,
    action          TEXT NOT NULL,
    result          TEXT NOT NULL DEFAULT 'pending',
    details_json    TEXT NOT NULL DEFAULT '{}',
    executed_at     TEXT NOT NULL,
    FOREIGN KEY (flow_id) REFERENCES retention_winback_flows(flow_id)
);
"""

# ---------------------------------------------------------------------------
# Enums & Models
# ---------------------------------------------------------------------------

class RiskBand(str, Enum):
    LOW      = "low"
    MEDIUM   = "medium"
    HIGH     = "high"
    CRITICAL = "critical"


class WinbackStatus(str, Enum):
    ACTIVE    = "active"
    PAUSED    = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class UsageSignalInput(BaseModel):
    tenant_id: str
    signal_type: str   # e.g. logins_per_week, jobs_run, api_calls, support_tickets
    value: float
    unit: str = "count"
    period_start: str
    period_end: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class ChurnScoreInput(BaseModel):
    tenant_id: str
    signals: list[UsageSignalInput] = Field(default_factory=list)


class WinbackTriggerInput(BaseModel):
    tenant_id: str
    trigger_reason: str
    flow_type: str = "email_sequence"
    steps: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class FlowEventInput(BaseModel):
    flow_id: str
    step_index: int
    action: str
    result: str = "executed"
    details: dict[str, Any] = Field(default_factory=dict)


class UsageSignalRecord(BaseModel):
    signal_id: str
    tenant_id: str
    signal_type: str
    value: float
    unit: str
    period_start: str
    period_end: str
    metadata: dict[str, Any]
    recorded_at: str


class ChurnScoreRecord(BaseModel):
    score_id: str
    tenant_id: str
    churn_score: float
    risk_band: str
    contributing_factors: list[dict[str, Any]]
    computed_at: str


class WinbackFlowRecord(BaseModel):
    flow_id: str
    tenant_id: str
    trigger_reason: str
    flow_type: str
    status: str
    steps: list[dict[str, Any]]
    current_step: int
    started_at: str
    completed_at: str | None
    outcome: str | None
    metadata: dict[str, Any]


class FlowEventRecord(BaseModel):
    event_id: str
    flow_id: str
    step_index: int
    action: str
    result: str
    details: dict[str, Any]
    executed_at: str


# ---------------------------------------------------------------------------
# Scoring logic
# ---------------------------------------------------------------------------

_SIGNAL_WEIGHTS: dict[str, float] = {
    "logins_per_week":   -2.0,   # more logins → lower risk
    "jobs_run":          -1.5,
    "api_calls":         -1.0,
    "feature_adoption":  -2.5,
    "support_tickets":    1.5,   # more tickets → higher risk
    "payment_failures":   5.0,
    "days_since_login":   0.8,
    "cancelled_jobs":     1.2,
    "downgrade_request":  8.0,
}

_DEFAULT_BASE_SCORE = 40.0


def _compute_churn_score(signals: list[UsageSignalRecord]) -> tuple[float, list[dict[str, Any]]]:
    """Simple weighted additive model. Score in [0, 100]."""
    score = _DEFAULT_BASE_SCORE
    factors: list[dict[str, Any]] = []
    for sig in signals:
        weight = _SIGNAL_WEIGHTS.get(sig.signal_type, 0.0)
        contribution = weight * sig.value
        score += contribution
        if weight != 0.0:
            factors.append({
                "signal_type": sig.signal_type,
                "value": sig.value,
                "weight": weight,
                "contribution": round(contribution, 3),
            })
    score = max(0.0, min(100.0, score))
    return round(score, 2), factors


def _score_to_band(score: float) -> RiskBand:
    if score >= 80:
        return RiskBand.CRITICAL
    if score >= 60:
        return RiskBand.HIGH
    if score >= 30:
        return RiskBand.MEDIUM
    return RiskBand.LOW


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------

def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class RetentionAutopilot:
    """Subscription retention: signals, scoring, win-back flows."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._path = str(db_path or product_db_path())
        self._lock = Lock()
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self._path, check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        return c

    def _init_db(self) -> None:
        with self._conn() as c:
            c.executescript(_SCHEMA)

    # ------------------------------------------------------------------
    # Usage signals
    # ------------------------------------------------------------------

    def record_signal(self, inp: UsageSignalInput) -> UsageSignalRecord:
        signal_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO retention_usage_signals
                   (signal_id, tenant_id, signal_type, value, unit,
                    period_start, period_end, metadata_json, recorded_at)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (signal_id, inp.tenant_id, inp.signal_type, inp.value,
                 inp.unit, inp.period_start, inp.period_end,
                 json.dumps(inp.metadata), now),
            )
        return UsageSignalRecord(
            signal_id=signal_id, tenant_id=inp.tenant_id,
            signal_type=inp.signal_type, value=inp.value, unit=inp.unit,
            period_start=inp.period_start, period_end=inp.period_end,
            metadata=inp.metadata, recorded_at=now,
        )

    def get_signals(
        self, tenant_id: str, signal_type: str | None = None, limit: int = 100
    ) -> list[UsageSignalRecord]:
        q = "SELECT * FROM retention_usage_signals WHERE tenant_id=?"
        params: list[Any] = [tenant_id]
        if signal_type:
            q += " AND signal_type=?"; params.append(signal_type)
        q += " ORDER BY recorded_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [
            UsageSignalRecord(
                signal_id=r["signal_id"], tenant_id=r["tenant_id"],
                signal_type=r["signal_type"], value=r["value"], unit=r["unit"],
                period_start=r["period_start"], period_end=r["period_end"],
                metadata=json.loads(r["metadata_json"]), recorded_at=r["recorded_at"],
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Churn scoring
    # ------------------------------------------------------------------

    def compute_churn_score(self, inp: ChurnScoreInput) -> ChurnScoreRecord:
        # Record any new signals provided inline
        for sig in inp.signals:
            self.record_signal(sig)

        # Load latest signals for tenant (last 30 days worth)
        signals = self.get_signals(inp.tenant_id, limit=200)
        score, factors = _compute_churn_score(signals)
        band = _score_to_band(score)

        score_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO retention_risk_scores
                   (score_id, tenant_id, churn_score, risk_band,
                    contributing_factors_json, computed_at)
                   VALUES (?,?,?,?,?,?)""",
                (score_id, inp.tenant_id, score, band.value,
                 json.dumps(factors), now),
            )
        log.info("retention.churn_scored",
                 tenant=inp.tenant_id, score=score, band=band.value)
        return ChurnScoreRecord(
            score_id=score_id, tenant_id=inp.tenant_id,
            churn_score=score, risk_band=band.value,
            contributing_factors=factors, computed_at=now,
        )

    def get_latest_score(self, tenant_id: str) -> ChurnScoreRecord | None:
        with self._conn() as c:
            row = c.execute(
                """SELECT * FROM retention_risk_scores
                   WHERE tenant_id=? ORDER BY computed_at DESC LIMIT 1""",
                (tenant_id,),
            ).fetchone()
        if row is None:
            return None
        return ChurnScoreRecord(
            score_id=row["score_id"], tenant_id=row["tenant_id"],
            churn_score=row["churn_score"], risk_band=row["risk_band"],
            contributing_factors=json.loads(row["contributing_factors_json"]),
            computed_at=row["computed_at"],
        )

    def list_scores(self, tenant_id: str, limit: int = 10) -> list[ChurnScoreRecord]:
        with self._conn() as c:
            rows = c.execute(
                """SELECT * FROM retention_risk_scores
                   WHERE tenant_id=? ORDER BY computed_at DESC LIMIT ?""",
                (tenant_id, limit),
            ).fetchall()
        return [
            ChurnScoreRecord(
                score_id=r["score_id"], tenant_id=r["tenant_id"],
                churn_score=r["churn_score"], risk_band=r["risk_band"],
                contributing_factors=json.loads(r["contributing_factors_json"]),
                computed_at=r["computed_at"],
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Win-back flows
    # ------------------------------------------------------------------

    _DEFAULT_STEPS = [
        {"step": 0, "action": "send_reengagement_email", "delay_hours": 0},
        {"step": 1, "action": "offer_success_call",       "delay_hours": 48},
        {"step": 2, "action": "offer_discount_coupon",    "delay_hours": 120},
        {"step": 3, "action": "escalate_to_csm",          "delay_hours": 240},
    ]

    def trigger_winback(self, inp: WinbackTriggerInput) -> WinbackFlowRecord:
        flow_id = str(uuid.uuid4())
        now = _utc_now()
        steps = inp.steps or self._DEFAULT_STEPS
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO retention_winback_flows
                   (flow_id, tenant_id, trigger_reason, flow_type, status,
                    steps_json, current_step, started_at, metadata_json)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (flow_id, inp.tenant_id, inp.trigger_reason, inp.flow_type,
                 WinbackStatus.ACTIVE.value, json.dumps(steps), 0, now,
                 json.dumps(inp.metadata)),
            )
        log.info("retention.winback_triggered",
                 flow_id=flow_id, tenant=inp.tenant_id, reason=inp.trigger_reason)
        return self._get_flow(flow_id)  # type: ignore[return-value]

    def _get_flow(self, flow_id: str) -> WinbackFlowRecord | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM retention_winback_flows WHERE flow_id=?", (flow_id,)
            ).fetchone()
        if row is None:
            return None
        return WinbackFlowRecord(
            flow_id=row["flow_id"], tenant_id=row["tenant_id"],
            trigger_reason=row["trigger_reason"], flow_type=row["flow_type"],
            status=row["status"], steps=json.loads(row["steps_json"]),
            current_step=row["current_step"], started_at=row["started_at"],
            completed_at=row["completed_at"], outcome=row["outcome"],
            metadata=json.loads(row["metadata_json"]),
        )

    def record_flow_event(self, inp: FlowEventInput) -> FlowEventRecord:
        event_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO retention_flow_events
                   (event_id, flow_id, step_index, action, result, details_json, executed_at)
                   VALUES (?,?,?,?,?,?,?)""",
                (event_id, inp.flow_id, inp.step_index, inp.action,
                 inp.result, json.dumps(inp.details), now),
            )
            # advance step pointer
            c.execute(
                "UPDATE retention_winback_flows SET current_step=? WHERE flow_id=? AND current_step=?",
                (inp.step_index + 1, inp.flow_id, inp.step_index),
            )
        return FlowEventRecord(
            event_id=event_id, flow_id=inp.flow_id, step_index=inp.step_index,
            action=inp.action, result=inp.result,
            details=inp.details, executed_at=now,
        )

    def complete_flow(
        self, flow_id: str, outcome: str = "retained"
    ) -> WinbackFlowRecord:
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """UPDATE retention_winback_flows
                   SET status=?, completed_at=?, outcome=?
                   WHERE flow_id=?""",
                (WinbackStatus.COMPLETED.value, now, outcome, flow_id),
            )
        return self._get_flow(flow_id)  # type: ignore[return-value]

    def list_flows(
        self,
        tenant_id: str,
        status: str | None = None,
        limit: int = 50,
    ) -> list[WinbackFlowRecord]:
        q = "SELECT * FROM retention_winback_flows WHERE tenant_id=?"
        params: list[Any] = [tenant_id]
        if status:
            q += " AND status=?"; params.append(status)
        q += " ORDER BY started_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [
            WinbackFlowRecord(
                flow_id=r["flow_id"], tenant_id=r["tenant_id"],
                trigger_reason=r["trigger_reason"], flow_type=r["flow_type"],
                status=r["status"], steps=json.loads(r["steps_json"]),
                current_step=r["current_step"], started_at=r["started_at"],
                completed_at=r["completed_at"], outcome=r["outcome"],
                metadata=json.loads(r["metadata_json"]),
            )
            for r in rows
        ]


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_autopilot: RetentionAutopilot | None = None
_autopilot_lock = Lock()


def get_retention_autopilot(db_path: str | Path | None = None) -> RetentionAutopilot:
    global _autopilot
    with _autopilot_lock:
        if _autopilot is None:
            _autopilot = RetentionAutopilot(db_path=db_path)
    return _autopilot


__all__ = [
    "RiskBand",
    "WinbackStatus",
    "UsageSignalInput",
    "ChurnScoreInput",
    "WinbackTriggerInput",
    "FlowEventInput",
    "UsageSignalRecord",
    "ChurnScoreRecord",
    "WinbackFlowRecord",
    "FlowEventRecord",
    "RetentionAutopilot",
    "get_retention_autopilot",
]
