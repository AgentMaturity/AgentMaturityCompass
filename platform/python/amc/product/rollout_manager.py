"""AMC Product — Workflow Rollout Manager (Feature 25).

Manages staged deployment of workflow/prompt/policy changes with canary →
gradual rollout → full promotion, metric-gated at each stage.

Key concepts
------------
- **RolloutPlan**: describes the staged rollout for an artifact (workflow or
  prompt) with percentage thresholds and promotion criteria.
- **RolloutStage**: one step in the plan (canary 5% → 25% → 50% → 100%).
- **RolloutDecision**: output of the gate check: promote, hold, or rollback.
- **TrafficSplitter**: given a subject_id, returns whether it should receive
  the new version (deterministic, based on hash).

Revenue path: safely deploy improvements without production regressions →
maintains customer trust and SLA (Lever B + C).
"""
from __future__ import annotations

import hashlib
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

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS rollout_plans (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id         TEXT NOT NULL UNIQUE,
    artifact_id     TEXT NOT NULL,
    artifact_type   TEXT NOT NULL DEFAULT 'workflow',
    description     TEXT NOT NULL DEFAULT '',
    current_stage   INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending',
    success_metric  TEXT NOT NULL DEFAULT 'success_rate',
    min_sample      INTEGER NOT NULL DEFAULT 50,
    promote_threshold REAL NOT NULL DEFAULT 0.95,
    rollback_threshold REAL NOT NULL DEFAULT 0.80,
    stages_json     TEXT NOT NULL DEFAULT '[]',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    completed_at    TEXT
);

CREATE TABLE IF NOT EXISTS rollout_metrics (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_id       TEXT NOT NULL UNIQUE,
    plan_id         TEXT NOT NULL,
    stage           INTEGER NOT NULL,
    subject_id      TEXT NOT NULL DEFAULT '',
    metric_name     TEXT NOT NULL,
    metric_value    REAL NOT NULL,
    observed_at     TEXT NOT NULL,
    FOREIGN KEY (plan_id) REFERENCES rollout_plans(plan_id)
);

CREATE INDEX IF NOT EXISTS idx_rm_plan ON rollout_metrics(plan_id, stage, metric_name);
CREATE INDEX IF NOT EXISTS idx_rp_artifact ON rollout_plans(artifact_id);
"""

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class RolloutStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    ROLLED_BACK = "rolled_back"
    PAUSED = "paused"


class GateDecision(str, Enum):
    PROMOTE = "promote"
    HOLD = "hold"
    ROLLBACK = "rollback"


@dataclass(frozen=True)
class RolloutStage:
    stage_index: int
    traffic_percent: float   # 0–100: percentage of traffic to route to new version
    label: str = ""

    @property
    def as_dict(self) -> dict[str, Any]:
        return {
            "stage_index": self.stage_index,
            "traffic_percent": self.traffic_percent,
            "label": self.label,
        }


_DEFAULT_STAGES = [
    RolloutStage(0, 5.0, "canary"),
    RolloutStage(1, 25.0, "early-adopter"),
    RolloutStage(2, 50.0, "half-traffic"),
    RolloutStage(3, 100.0, "full-rollout"),
]


@dataclass
class RolloutPlan:
    plan_id: str
    artifact_id: str
    artifact_type: str
    description: str
    current_stage: int
    status: RolloutStatus
    success_metric: str
    min_sample: int
    promote_threshold: float
    rollback_threshold: float
    stages: list[RolloutStage]
    created_at: str
    updated_at: str
    completed_at: str | None = None

    @property
    def current_traffic_percent(self) -> float:
        if self.current_stage < len(self.stages):
            return self.stages[self.current_stage].traffic_percent
        return 100.0

    @property
    def current_stage_label(self) -> str:
        if self.current_stage < len(self.stages):
            return self.stages[self.current_stage].label
        return "unknown"

    @property
    def as_dict(self) -> dict[str, Any]:
        return {
            "plan_id": self.plan_id,
            "artifact_id": self.artifact_id,
            "artifact_type": self.artifact_type,
            "description": self.description,
            "current_stage": self.current_stage,
            "current_stage_label": self.current_stage_label,
            "current_traffic_percent": self.current_traffic_percent,
            "status": self.status.value,
            "success_metric": self.success_metric,
            "min_sample": self.min_sample,
            "promote_threshold": self.promote_threshold,
            "rollback_threshold": self.rollback_threshold,
            "stages": [s.as_dict for s in self.stages],
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "completed_at": self.completed_at,
        }


@dataclass
class RolloutGateResult:
    plan_id: str
    stage: int
    stage_label: str
    decision: GateDecision
    sample_size: int
    mean_metric: float
    promote_threshold: float
    rollback_threshold: float
    rationale: str
    next_traffic_percent: float | None = None

    @property
    def as_dict(self) -> dict[str, Any]:
        return {
            "plan_id": self.plan_id,
            "stage": self.stage,
            "stage_label": self.stage_label,
            "decision": self.decision.value,
            "sample_size": self.sample_size,
            "mean_metric": round(self.mean_metric, 6),
            "promote_threshold": self.promote_threshold,
            "rollback_threshold": self.rollback_threshold,
            "rationale": self.rationale,
            "next_traffic_percent": self.next_traffic_percent,
        }


# ---------------------------------------------------------------------------
# RolloutManager
# ---------------------------------------------------------------------------


class RolloutManager:
    """Manages staged rollout plans for workflows and prompts."""

    def __init__(self, db_path: str | Path = "amc_rollout.db") -> None:
        self._db = Path(db_path)
        self._lock = Lock()
        self._init_db()
        log.info("rollout_manager.init", db=str(self._db))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def create_plan(
        self,
        artifact_id: str,
        artifact_type: str = "workflow",
        description: str = "",
        stages: list[dict[str, Any]] | None = None,
        success_metric: str = "success_rate",
        min_sample: int = 50,
        promote_threshold: float = 0.95,
        rollback_threshold: float = 0.80,
    ) -> RolloutPlan:
        """Create a new rollout plan for an artifact."""
        now = datetime.now(timezone.utc).isoformat()
        plan_id = str(uuid.uuid4())

        stage_objects: list[RolloutStage]
        if stages:
            stage_objects = [
                RolloutStage(
                    stage_index=i,
                    traffic_percent=float(s.get("traffic_percent", (i + 1) * 25.0)),
                    label=str(s.get("label", f"stage-{i}")),
                )
                for i, s in enumerate(stages)
            ]
        else:
            stage_objects = list(_DEFAULT_STAGES)

        with self._lock:
            conn = self._connect()
            conn.execute(
                """
                INSERT INTO rollout_plans
                (plan_id, artifact_id, artifact_type, description,
                 current_stage, status, success_metric, min_sample,
                 promote_threshold, rollback_threshold, stages_json,
                 created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    plan_id, artifact_id, artifact_type, description,
                    0, RolloutStatus.PENDING.value,
                    success_metric, min_sample,
                    promote_threshold, rollback_threshold,
                    json.dumps([s.as_dict for s in stage_objects]),
                    now, now,
                ),
            )
            conn.commit()
            conn.close()

        plan = RolloutPlan(
            plan_id=plan_id,
            artifact_id=artifact_id,
            artifact_type=artifact_type,
            description=description,
            current_stage=0,
            status=RolloutStatus.PENDING,
            success_metric=success_metric,
            min_sample=min_sample,
            promote_threshold=promote_threshold,
            rollback_threshold=rollback_threshold,
            stages=stage_objects,
            created_at=now,
            updated_at=now,
        )
        log.info("rollout_manager.plan_created", plan_id=plan_id, artifact_id=artifact_id)
        return plan

    def start_plan(self, plan_id: str) -> RolloutPlan:
        self._update_status(plan_id, RolloutStatus.RUNNING)
        plan = self.get_plan(plan_id)
        if plan is None:
            raise ValueError(f"Plan not found: {plan_id}")
        log.info("rollout_manager.started", plan_id=plan_id)
        return plan

    def is_new_version(self, plan_id: str, subject_id: str) -> bool:
        """Return True if this subject should receive the new artifact version."""
        plan = self.get_plan(plan_id)
        if plan is None or plan.status != RolloutStatus.RUNNING:
            return False
        threshold = plan.current_traffic_percent / 100.0
        h = int(hashlib.sha256(f"{plan_id}:{subject_id}".encode()).hexdigest(), 16)
        bucket = (h % 10_000) / 10_000.0
        return bucket < threshold

    def record_metric(
        self,
        plan_id: str,
        metric_value: float,
        subject_id: str = "",
        stage: int | None = None,
        metric_name: str | None = None,
    ) -> str:
        """Record an observed metric for the current rollout stage."""
        plan = self.get_plan(plan_id)
        if plan is None:
            raise ValueError(f"Plan not found: {plan_id}")
        stage_idx = stage if stage is not None else plan.current_stage
        m_name = metric_name or plan.success_metric
        metric_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            conn = self._connect()
            conn.execute(
                """
                INSERT INTO rollout_metrics
                (metric_id, plan_id, stage, subject_id, metric_name, metric_value, observed_at)
                VALUES (?,?,?,?,?,?,?)
                """,
                (metric_id, plan_id, stage_idx, subject_id, m_name, metric_value, now),
            )
            conn.commit()
            conn.close()
        return metric_id

    def evaluate_gate(self, plan_id: str) -> RolloutGateResult:
        """Evaluate whether to promote, hold, or rollback the current stage."""
        plan = self.get_plan(plan_id)
        if plan is None:
            raise ValueError(f"Plan not found: {plan_id}")

        conn = self._connect()
        rows = conn.execute(
            """
            SELECT metric_value FROM rollout_metrics
            WHERE plan_id=? AND stage=? AND metric_name=?
            ORDER BY observed_at DESC
            """,
            (plan_id, plan.current_stage, plan.success_metric),
        ).fetchall()
        conn.close()

        values = [r["metric_value"] for r in rows]
        n = len(values)
        mean = sum(values) / n if n else 0.0

        if n < plan.min_sample:
            decision = GateDecision.HOLD
            rationale = f"Insufficient data: {n}/{plan.min_sample} samples collected."
            next_pct = None
        elif mean >= plan.promote_threshold:
            # Check if this is the last stage
            if plan.current_stage >= len(plan.stages) - 1:
                decision = GateDecision.PROMOTE
                rationale = f"Final stage passed: {mean:.4f} ≥ promote_threshold {plan.promote_threshold}. Completing rollout."
                next_pct = 100.0
            else:
                decision = GateDecision.PROMOTE
                next_stage = plan.stages[plan.current_stage + 1]
                next_pct = next_stage.traffic_percent
                rationale = (
                    f"Stage {plan.current_stage} ({plan.current_stage_label}) passed "
                    f"({mean:.4f} ≥ {plan.promote_threshold}). "
                    f"Promoting to stage {plan.current_stage + 1} ({next_stage.label}, {next_pct}% traffic)."
                )
        elif mean < plan.rollback_threshold:
            decision = GateDecision.ROLLBACK
            next_pct = 0.0
            rationale = (
                f"Stage {plan.current_stage} failed: {mean:.4f} < rollback_threshold "
                f"{plan.rollback_threshold}. Triggering rollback."
            )
        else:
            decision = GateDecision.HOLD
            rationale = (
                f"Stage {plan.current_stage} metric {mean:.4f} is between thresholds "
                f"[{plan.rollback_threshold}, {plan.promote_threshold}]. Holding for more data."
            )
            next_pct = plan.current_traffic_percent

        # Execute decision
        if decision == GateDecision.PROMOTE:
            self._execute_promote(plan, plan_id)
        elif decision == GateDecision.ROLLBACK:
            self._update_status(plan_id, RolloutStatus.ROLLED_BACK)

        return RolloutGateResult(
            plan_id=plan_id,
            stage=plan.current_stage,
            stage_label=plan.current_stage_label,
            decision=decision,
            sample_size=n,
            mean_metric=mean,
            promote_threshold=plan.promote_threshold,
            rollback_threshold=plan.rollback_threshold,
            rationale=rationale,
            next_traffic_percent=next_pct,
        )

    def get_plan(self, plan_id: str) -> RolloutPlan | None:
        conn = self._connect()
        row = conn.execute(
            "SELECT * FROM rollout_plans WHERE plan_id=?", (plan_id,)
        ).fetchone()
        conn.close()
        return self._row_to_plan(row) if row else None

    def list_plans(
        self,
        artifact_id: str | None = None,
        status: RolloutStatus | None = None,
        limit: int = 50,
    ) -> list[RolloutPlan]:
        clauses: list[str] = []
        params: list[Any] = []
        if artifact_id:
            clauses.append("artifact_id=?")
            params.append(artifact_id)
        if status:
            clauses.append("status=?")
            params.append(status.value)
        where = "WHERE " + " AND ".join(clauses) if clauses else ""
        params.append(limit)
        conn = self._connect()
        rows = conn.execute(
            f"SELECT * FROM rollout_plans {where} ORDER BY created_at DESC LIMIT ?",
            params,
        ).fetchall()
        conn.close()
        return [self._row_to_plan(r) for r in rows if r]

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _execute_promote(self, plan: RolloutPlan, plan_id: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        if plan.current_stage >= len(plan.stages) - 1:
            # Final stage complete
            with self._lock:
                conn = self._connect()
                conn.execute(
                    "UPDATE rollout_plans SET status=?, completed_at=?, updated_at=? WHERE plan_id=?",
                    (RolloutStatus.COMPLETED.value, now, now, plan_id),
                )
                conn.commit()
                conn.close()
        else:
            next_stage = plan.current_stage + 1
            with self._lock:
                conn = self._connect()
                conn.execute(
                    "UPDATE rollout_plans SET current_stage=?, updated_at=? WHERE plan_id=?",
                    (next_stage, now, plan_id),
                )
                conn.commit()
                conn.close()

    def _update_status(self, plan_id: str, status: RolloutStatus) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            conn = self._connect()
            conn.execute(
                "UPDATE rollout_plans SET status=?, updated_at=? WHERE plan_id=?",
                (status.value, now, plan_id),
            )
            conn.commit()
            conn.close()

    def _init_db(self) -> None:
        with self._lock:
            conn = self._connect()
            conn.executescript(_SCHEMA)
            conn.commit()
            conn.close()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _row_to_plan(row: sqlite3.Row) -> RolloutPlan:
        stages_raw = json.loads(row["stages_json"] or "[]")
        stages = [
            RolloutStage(
                stage_index=s.get("stage_index", i),
                traffic_percent=float(s.get("traffic_percent", 100.0)),
                label=s.get("label", f"stage-{i}"),
            )
            for i, s in enumerate(stages_raw)
        ]
        return RolloutPlan(
            plan_id=row["plan_id"],
            artifact_id=row["artifact_id"],
            artifact_type=row["artifact_type"],
            description=row["description"],
            current_stage=row["current_stage"],
            status=RolloutStatus(row["status"]),
            success_metric=row["success_metric"],
            min_sample=row["min_sample"],
            promote_threshold=row["promote_threshold"],
            rollback_threshold=row["rollback_threshold"],
            stages=stages,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            completed_at=row["completed_at"],
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_default_manager: RolloutManager | None = None


def get_rollout_manager(db_path: str | Path = "amc_rollout.db") -> RolloutManager:
    global _default_manager
    if _default_manager is None:
        _default_manager = RolloutManager(db_path=db_path)
    return _default_manager


__all__ = [
    "RolloutStatus",
    "GateDecision",
    "RolloutStage",
    "RolloutPlan",
    "RolloutGateResult",
    "RolloutManager",
    "get_rollout_manager",
]
