"""AMC Product — Cost + Latency Optimization Router (Feature 47).

Routes each agent task to the best model/tool configuration based on a
cost-quality-latency trade-off matrix.  Decisions are persisted in SQLite so
routing quality can be audited and improved over time.

Key concepts
------------
- **RoutingProfile**: a named configuration combining model tier, tool timeout,
  max-tokens, and quality floor.
- **TaskDescriptor**: the callers's declared requirements (quality, latency SLA,
  cost cap, task type).
- **RoutingDecision**: the selected profile + rationale, persisted in DB.
- **PerformanceRecord**: observed latency/cost after execution, fed back to
  improve future routing.

Revenue path: directly lowers operating cost per run → either widens margin
(Lever A) or enables aggressive price competition (Lever B).
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

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS routing_decisions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    decision_id  TEXT NOT NULL UNIQUE,
    task_id      TEXT NOT NULL,
    tenant_id    TEXT NOT NULL DEFAULT '',
    workflow_id  TEXT NOT NULL DEFAULT '',
    task_type    TEXT NOT NULL DEFAULT 'generic',
    quality_floor REAL NOT NULL DEFAULT 0.7,
    latency_sla_ms INTEGER NOT NULL DEFAULT 10000,
    cost_cap_usd  REAL NOT NULL DEFAULT 0.10,
    selected_profile TEXT NOT NULL,
    estimated_cost_usd REAL NOT NULL DEFAULT 0.0,
    estimated_latency_ms INTEGER NOT NULL DEFAULT 0,
    rationale    TEXT NOT NULL DEFAULT '',
    observed_cost_usd REAL,
    observed_latency_ms INTEGER,
    outcome_quality REAL,
    created_at   TEXT NOT NULL,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_routing_tenant ON routing_decisions(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_routing_profile ON routing_decisions(selected_profile);
CREATE INDEX IF NOT EXISTS idx_routing_workflow ON routing_decisions(workflow_id);

CREATE TABLE IF NOT EXISTS routing_profiles (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_name TEXT NOT NULL UNIQUE,
    model_tier   TEXT NOT NULL,
    max_tokens   INTEGER NOT NULL DEFAULT 2048,
    tool_timeout_ms INTEGER NOT NULL DEFAULT 5000,
    cost_per_1k_tokens_usd REAL NOT NULL DEFAULT 0.002,
    avg_latency_ms INTEGER NOT NULL DEFAULT 1500,
    quality_score REAL NOT NULL DEFAULT 0.85,
    task_types   TEXT NOT NULL DEFAULT '["generic"]',
    enabled      INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL
);
"""

# ---------------------------------------------------------------------------
# Enums & dataclasses
# ---------------------------------------------------------------------------


class ModelTier(str, Enum):
    MICRO = "micro"       # cheapest, fastest, lower quality
    STANDARD = "standard"  # balanced
    PREMIUM = "premium"   # highest quality, highest cost
    CUSTOM = "custom"     # user-defined profile


class TaskType(str, Enum):
    GENERIC = "generic"
    REASONING = "reasoning"
    EXTRACTION = "extraction"
    CODING = "coding"
    SUMMARIZATION = "summarization"
    CLASSIFICATION = "classification"
    GENERATION = "generation"


@dataclass(frozen=True)
class RoutingProfile:
    profile_name: str
    model_tier: ModelTier
    max_tokens: int
    tool_timeout_ms: int
    cost_per_1k_tokens_usd: float
    avg_latency_ms: int
    quality_score: float
    task_types: list[str] = field(default_factory=lambda: ["generic"])
    enabled: bool = True


@dataclass(frozen=True)
class TaskDescriptor:
    task_id: str
    task_type: TaskType = TaskType.GENERIC
    quality_floor: float = 0.7      # 0-1 minimum acceptable quality
    latency_sla_ms: int = 10_000    # max acceptable latency in ms
    cost_cap_usd: float = 0.10      # max spend for this task
    estimated_tokens: int = 1_000   # expected token usage
    tenant_id: str = ""
    workflow_id: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class RoutingDecision:
    decision_id: str
    task_id: str
    tenant_id: str
    workflow_id: str
    task_type: str
    quality_floor: float
    latency_sla_ms: int
    cost_cap_usd: float
    selected_profile: str
    estimated_cost_usd: float
    estimated_latency_ms: int
    rationale: str
    created_at: str
    observed_cost_usd: float | None = None
    observed_latency_ms: int | None = None
    outcome_quality: float | None = None
    completed_at: str | None = None

    @property
    def as_dict(self) -> dict[str, Any]:
        return {
            "decision_id": self.decision_id,
            "task_id": self.task_id,
            "tenant_id": self.tenant_id,
            "workflow_id": self.workflow_id,
            "task_type": self.task_type,
            "quality_floor": self.quality_floor,
            "latency_sla_ms": self.latency_sla_ms,
            "cost_cap_usd": self.cost_cap_usd,
            "selected_profile": self.selected_profile,
            "estimated_cost_usd": self.estimated_cost_usd,
            "estimated_latency_ms": self.estimated_latency_ms,
            "rationale": self.rationale,
            "observed_cost_usd": self.observed_cost_usd,
            "observed_latency_ms": self.observed_latency_ms,
            "outcome_quality": self.outcome_quality,
            "created_at": self.created_at,
            "completed_at": self.completed_at,
        }


# ---------------------------------------------------------------------------
# Built-in default profiles
# ---------------------------------------------------------------------------

_DEFAULT_PROFILES: list[RoutingProfile] = [
    RoutingProfile(
        profile_name="micro-generic",
        model_tier=ModelTier.MICRO,
        max_tokens=1024,
        tool_timeout_ms=3000,
        cost_per_1k_tokens_usd=0.0005,
        avg_latency_ms=500,
        quality_score=0.65,
        task_types=["generic", "classification", "summarization"],
    ),
    RoutingProfile(
        profile_name="standard-generic",
        model_tier=ModelTier.STANDARD,
        max_tokens=2048,
        tool_timeout_ms=5000,
        cost_per_1k_tokens_usd=0.002,
        avg_latency_ms=1500,
        quality_score=0.82,
        task_types=["generic", "extraction", "summarization", "generation"],
    ),
    RoutingProfile(
        profile_name="standard-coding",
        model_tier=ModelTier.STANDARD,
        max_tokens=4096,
        tool_timeout_ms=8000,
        cost_per_1k_tokens_usd=0.003,
        avg_latency_ms=2500,
        quality_score=0.88,
        task_types=["coding", "reasoning"],
    ),
    RoutingProfile(
        profile_name="premium-reasoning",
        model_tier=ModelTier.PREMIUM,
        max_tokens=8192,
        tool_timeout_ms=15000,
        cost_per_1k_tokens_usd=0.015,
        avg_latency_ms=4000,
        quality_score=0.96,
        task_types=["reasoning", "coding", "extraction", "generic"],
    ),
    RoutingProfile(
        profile_name="premium-generation",
        model_tier=ModelTier.PREMIUM,
        max_tokens=4096,
        tool_timeout_ms=10000,
        cost_per_1k_tokens_usd=0.012,
        avg_latency_ms=3000,
        quality_score=0.94,
        task_types=["generation", "summarization", "generic"],
    ),
]


# ---------------------------------------------------------------------------
# Router core
# ---------------------------------------------------------------------------


class CostLatencyRouter:
    """Route tasks to the optimal model/tool profile.

    Decision algorithm:
    1. Filter profiles by task_type compatibility.
    2. Filter by quality_floor and latency_sla_ms.
    3. Filter by cost_cap_usd (estimated at ``estimated_tokens / 1000 * cost_per_1k``).
    4. Among remaining candidates, pick lowest estimated cost first; if tie,
       prefer lowest latency.
    5. If no candidate passes all constraints, relax cost cap by 20% and retry.
       If still none, fall back to the profile with highest quality below cap.
    """

    def __init__(self, db_path: str | Path = "amc_routing.db") -> None:
        self._db = Path(db_path)
        self._lock = Lock()
        self._init_db()
        self._seed_default_profiles()
        log.info("cost_latency_router.init", db=str(self._db))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def route(self, task: TaskDescriptor) -> RoutingDecision:
        """Select the best profile for the task and persist the decision."""
        profiles = self._load_profiles()
        decision = self._select_profile(task, profiles)
        self._persist_decision(decision)
        log.info(
            "cost_latency_router.routed",
            task_id=task.task_id,
            profile=decision.selected_profile,
            est_cost=decision.estimated_cost_usd,
            est_latency_ms=decision.estimated_latency_ms,
        )
        return decision

    def record_outcome(
        self,
        decision_id: str,
        observed_cost_usd: float,
        observed_latency_ms: int,
        outcome_quality: float | None = None,
    ) -> None:
        """Feed observed performance back to update the routing record."""
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            conn = self._connect()
            conn.execute(
                """
                UPDATE routing_decisions
                SET observed_cost_usd=?, observed_latency_ms=?, outcome_quality=?,
                    completed_at=?
                WHERE decision_id=?
                """,
                (observed_cost_usd, observed_latency_ms, outcome_quality, now, decision_id),
            )
            conn.commit()
            conn.close()
        log.info(
            "cost_latency_router.outcome",
            decision_id=decision_id,
            observed_cost=observed_cost_usd,
            observed_latency_ms=observed_latency_ms,
        )

    def register_profile(self, profile: RoutingProfile) -> None:
        """Add or update a routing profile."""
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            conn = self._connect()
            conn.execute(
                """
                INSERT OR REPLACE INTO routing_profiles
                (profile_name, model_tier, max_tokens, tool_timeout_ms,
                 cost_per_1k_tokens_usd, avg_latency_ms, quality_score,
                 task_types, enabled, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    profile.profile_name,
                    profile.model_tier.value,
                    profile.max_tokens,
                    profile.tool_timeout_ms,
                    profile.cost_per_1k_tokens_usd,
                    profile.avg_latency_ms,
                    profile.quality_score,
                    json.dumps(profile.task_types),
                    1 if profile.enabled else 0,
                    now,
                ),
            )
            conn.commit()
            conn.close()

    def get_decision(self, decision_id: str) -> RoutingDecision | None:
        conn = self._connect()
        row = conn.execute(
            "SELECT * FROM routing_decisions WHERE decision_id=?", (decision_id,)
        ).fetchone()
        conn.close()
        return self._row_to_decision(row) if row else None

    def query_decisions(
        self,
        tenant_id: str | None = None,
        workflow_id: str | None = None,
        profile: str | None = None,
        limit: int = 100,
    ) -> list[RoutingDecision]:
        clauses: list[str] = []
        params: list[Any] = []
        if tenant_id:
            clauses.append("tenant_id=?")
            params.append(tenant_id)
        if workflow_id:
            clauses.append("workflow_id=?")
            params.append(workflow_id)
        if profile:
            clauses.append("selected_profile=?")
            params.append(profile)
        where = "WHERE " + " AND ".join(clauses) if clauses else ""
        params.append(limit)
        conn = self._connect()
        rows = conn.execute(
            f"SELECT * FROM routing_decisions {where} ORDER BY created_at DESC LIMIT ?",
            params,
        ).fetchall()
        conn.close()
        return [self._row_to_decision(r) for r in rows if r]

    def cost_summary(self, tenant_id: str | None = None) -> dict[str, Any]:
        """Aggregate cost/latency stats across all routing decisions."""
        where = "WHERE tenant_id=?" if tenant_id else ""
        params = [tenant_id] if tenant_id else []
        conn = self._connect()
        row = conn.execute(
            f"""
            SELECT
                COUNT(*) as total,
                SUM(estimated_cost_usd) as total_est_cost,
                SUM(observed_cost_usd) as total_obs_cost,
                AVG(observed_latency_ms) as avg_latency_ms,
                AVG(outcome_quality) as avg_quality,
                selected_profile
            FROM routing_decisions {where}
            GROUP BY selected_profile
            ORDER BY COUNT(*) DESC
            """,
            params,
        ).fetchall()
        conn.close()
        return {
            "profile_breakdown": [
                {
                    "profile": r["selected_profile"],
                    "count": r["total"],
                    "total_estimated_cost_usd": round(r["total_est_cost"] or 0, 6),
                    "total_observed_cost_usd": round(r["total_obs_cost"] or 0, 6),
                    "avg_observed_latency_ms": round(r["avg_latency_ms"] or 0, 1),
                    "avg_quality": round(r["avg_quality"] or 0, 4),
                }
                for r in row
            ]
        }

    # ------------------------------------------------------------------
    # Selection logic
    # ------------------------------------------------------------------

    def _select_profile(self, task: TaskDescriptor, profiles: list[RoutingProfile]) -> RoutingDecision:
        now = datetime.now(timezone.utc).isoformat()
        task_type_str = task.task_type.value if isinstance(task.task_type, TaskType) else str(task.task_type)

        # Step 1: Filter by task type compatibility
        compatible = [
            p for p in profiles
            if p.enabled and (
                task_type_str in p.task_types or "generic" in p.task_types
            )
        ]

        # Step 2: Quality + latency
        quality_ok = [
            p for p in compatible
            if p.quality_score >= task.quality_floor and p.avg_latency_ms <= task.latency_sla_ms
        ]

        # Step 3: Cost estimation
        def _est_cost(p: RoutingProfile) -> float:
            return (task.estimated_tokens / 1000.0) * p.cost_per_1k_tokens_usd

        cost_ok = [p for p in quality_ok if _est_cost(p) <= task.cost_cap_usd]

        # Relaxed fallback: loosen cost cap by 20%
        if not cost_ok:
            relaxed_cap = task.cost_cap_usd * 1.2
            cost_ok = [p for p in quality_ok if _est_cost(p) <= relaxed_cap]

        # Final fallback: best quality under original cap (even if latency/quality miss)
        if not cost_ok:
            cost_ok = sorted(compatible, key=lambda p: p.quality_score, reverse=True)

        if not cost_ok:
            # Absolute last resort — use lowest cost profile available
            cost_ok = sorted(profiles, key=lambda p: p.cost_per_1k_tokens_usd)

        # Sort: lowest cost first, then lowest latency
        cost_ok.sort(key=lambda p: (_est_cost(p), p.avg_latency_ms))
        chosen = cost_ok[0]

        rationale = (
            f"Selected '{chosen.profile_name}' (tier={chosen.model_tier.value}, "
            f"quality={chosen.quality_score:.2f}, latency≈{chosen.avg_latency_ms}ms) "
            f"for task_type='{task_type_str}', quality_floor={task.quality_floor}, "
            f"latency_sla={task.latency_sla_ms}ms, cost_cap=${task.cost_cap_usd:.4f}. "
            f"Est. cost: ${_est_cost(chosen):.6f}."
        )

        return RoutingDecision(
            decision_id=str(uuid.uuid4()),
            task_id=task.task_id,
            tenant_id=task.tenant_id,
            workflow_id=task.workflow_id,
            task_type=task_type_str,
            quality_floor=task.quality_floor,
            latency_sla_ms=task.latency_sla_ms,
            cost_cap_usd=task.cost_cap_usd,
            selected_profile=chosen.profile_name,
            estimated_cost_usd=round(_est_cost(chosen), 8),
            estimated_latency_ms=chosen.avg_latency_ms,
            rationale=rationale,
            created_at=now,
        )

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        with self._lock:
            conn = self._connect()
            conn.executescript(_SCHEMA)
            conn.commit()
            conn.close()

    def _seed_default_profiles(self) -> None:
        conn = self._connect()
        existing = {
            r["profile_name"]
            for r in conn.execute("SELECT profile_name FROM routing_profiles").fetchall()
        }
        conn.close()
        for p in _DEFAULT_PROFILES:
            if p.profile_name not in existing:
                self.register_profile(p)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _load_profiles(self) -> list[RoutingProfile]:
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM routing_profiles WHERE enabled=1"
        ).fetchall()
        conn.close()
        return [
            RoutingProfile(
                profile_name=r["profile_name"],
                model_tier=ModelTier(r["model_tier"]),
                max_tokens=r["max_tokens"],
                tool_timeout_ms=r["tool_timeout_ms"],
                cost_per_1k_tokens_usd=r["cost_per_1k_tokens_usd"],
                avg_latency_ms=r["avg_latency_ms"],
                quality_score=r["quality_score"],
                task_types=json.loads(r["task_types"] or '["generic"]'),
                enabled=bool(r["enabled"]),
            )
            for r in rows
        ]

    def _persist_decision(self, d: RoutingDecision) -> None:
        with self._lock:
            conn = self._connect()
            conn.execute(
                """
                INSERT OR IGNORE INTO routing_decisions
                (decision_id, task_id, tenant_id, workflow_id, task_type,
                 quality_floor, latency_sla_ms, cost_cap_usd,
                 selected_profile, estimated_cost_usd, estimated_latency_ms,
                 rationale, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    d.decision_id, d.task_id, d.tenant_id, d.workflow_id,
                    d.task_type, d.quality_floor, d.latency_sla_ms,
                    d.cost_cap_usd, d.selected_profile, d.estimated_cost_usd,
                    d.estimated_latency_ms, d.rationale, d.created_at,
                ),
            )
            conn.commit()
            conn.close()

    @staticmethod
    def _row_to_decision(row: sqlite3.Row) -> RoutingDecision:
        return RoutingDecision(
            decision_id=row["decision_id"],
            task_id=row["task_id"],
            tenant_id=row["tenant_id"],
            workflow_id=row["workflow_id"],
            task_type=row["task_type"],
            quality_floor=row["quality_floor"],
            latency_sla_ms=row["latency_sla_ms"],
            cost_cap_usd=row["cost_cap_usd"],
            selected_profile=row["selected_profile"],
            estimated_cost_usd=row["estimated_cost_usd"],
            estimated_latency_ms=row["estimated_latency_ms"],
            rationale=row["rationale"],
            created_at=row["created_at"],
            observed_cost_usd=row["observed_cost_usd"],
            observed_latency_ms=row["observed_latency_ms"],
            outcome_quality=row["outcome_quality"],
            completed_at=row["completed_at"],
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_default_router: CostLatencyRouter | None = None


def get_cost_latency_router(db_path: str | Path = "amc_routing.db") -> CostLatencyRouter:
    global _default_router
    if _default_router is None:
        _default_router = CostLatencyRouter(db_path=db_path)
    return _default_router


__all__ = [
    "ModelTier",
    "TaskType",
    "RoutingProfile",
    "TaskDescriptor",
    "RoutingDecision",
    "CostLatencyRouter",
    "get_cost_latency_router",
]
