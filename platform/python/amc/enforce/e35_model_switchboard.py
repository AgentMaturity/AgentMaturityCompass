"""
AMC Enforce — E35: Model Switchboard With Safety Tiers
===============================================================================

Purpose
-------
Routes agent requests to different model configurations (tiers) based on risk
level.  Lower-risk work uses cheaper, faster models; high/critical risk
escalates to frontier models with tighter constraints.  All routing decisions
and token costs are persisted in SQLite for auditing and budget tracking.

Usage
-----

.. code-block:: python

    from amc.enforce.e35_model_switchboard import ModelSwitchboard, RoutingRequest

    switchboard = ModelSwitchboard(db_path="/tmp/switchboard.db")

    request = RoutingRequest(
        session_id="sess-1",
        task_type="data_analysis",
        risk_level="low",
        required_tools=["read_file"],
        content_classification="internal",
    )
    decision = switchboard.route(request)
    print(decision.selected_tier)  # "economy"

    cost = switchboard.record_usage(decision, tokens_used=1500)
    print(cost.cost_usd)
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class ModelTier(BaseModel):
    """A model configuration tier with associated safety constraints.

    Attributes
    ----------
    tier_name:
        Short identifier (e.g. ``"economy"``, ``"standard"``, ``"secure"``).
    model_id:
        Model identifier string passed to the inference provider.
    max_tokens:
        Maximum tokens per request in this tier.
    temperature:
        Sampling temperature for the model.
    tools_allowed:
        Allowlist of tool names permitted at this tier (empty = all denied).
    risk_levels:
        Risk level strings handled by this tier.
    cost_per_1k_tokens:
        Estimated USD cost per 1 000 tokens for budget tracking.
    """

    tier_name: str
    model_id: str
    max_tokens: int
    temperature: float
    tools_allowed: list[str] = Field(default_factory=list)
    risk_levels: list[str] = Field(default_factory=list)
    cost_per_1k_tokens: float


class RoutingPolicy(BaseModel):
    """Top-level routing policy containing tier definitions and mappings.

    Attributes
    ----------
    tiers:
        All configured model tiers.
    default_tier:
        Fallback tier name when no specific mapping matches.
    escalation_tier:
        Tier used for escalations (highest-capability model).
    risk_to_tier:
        Mapping of risk level string to tier name.
    """

    tiers: list[ModelTier]
    default_tier: str
    escalation_tier: str
    risk_to_tier: dict[str, str] = Field(default_factory=dict)


class RoutingRequest(BaseModel):
    """An incoming request to be routed to a model tier.

    Attributes
    ----------
    session_id:
        Originating session.
    task_type:
        High-level task category (e.g. ``"data_analysis"``).
    risk_level:
        One of ``"low"`` | ``"medium"`` | ``"high"`` | ``"critical"``.
    required_tools:
        Tools the model must be permitted to call.
    content_classification:
        Data sensitivity classification (e.g. ``"internal"``, ``"confidential"``).
    """

    session_id: str
    task_type: str
    risk_level: Literal["low", "medium", "high", "critical"]
    required_tools: list[str] = Field(default_factory=list)
    content_classification: str


class RoutingDecision(BaseModel):
    """Routing outcome for a single request.

    Attributes
    ----------
    request_id:
        Unique decision identifier.
    selected_tier:
        Name of the tier selected.
    model_id:
        Model identifier for the selected tier.
    reasoning:
        Human-readable routing rationale.
    estimated_cost:
        Estimated cost in USD (based on max_tokens for the tier).
    decided_at:
        Timestamp of the decision.
    """

    request_id: str
    selected_tier: str
    model_id: str
    reasoning: str
    estimated_cost: float
    decided_at: datetime


class CostRecord(BaseModel):
    """Persisted record of actual token usage and cost.

    Attributes
    ----------
    session_id:
        Session that generated the cost.
    tier:
        Tier used.
    model_id:
        Model used.
    tokens_used:
        Actual tokens consumed.
    cost_usd:
        Actual cost in USD.
    recorded_at:
        Timestamp of recording.
    """

    session_id: str
    tier: str
    model_id: str
    tokens_used: int
    cost_usd: float
    recorded_at: datetime


# ---------------------------------------------------------------------------
# Default policy
# ---------------------------------------------------------------------------

_DEFAULT_POLICY = RoutingPolicy(
    tiers=[
        ModelTier(
            tier_name="economy",
            model_id="anthropic/claude-haiku-3-5",
            max_tokens=4096,
            temperature=0.3,
            tools_allowed=["read_file", "search", "list_files", "get_metadata"],
            risk_levels=["low", "medium"],
            cost_per_1k_tokens=0.0008,
        ),
        ModelTier(
            tier_name="standard",
            model_id="anthropic/claude-sonnet-4",
            max_tokens=8192,
            temperature=0.5,
            tools_allowed=[
                "read_file",
                "write_file",
                "search",
                "list_files",
                "get_metadata",
                "run_query",
                "send_notification",
            ],
            risk_levels=["medium"],
            cost_per_1k_tokens=0.003,
        ),
        ModelTier(
            tier_name="secure",
            model_id="anthropic/claude-opus-4",
            max_tokens=16384,
            temperature=0.1,
            tools_allowed=[
                "read_file",
                "write_file",
                "search",
                "list_files",
                "get_metadata",
                "run_query",
                "send_payment",
                "delete_resource",
                "approve_action",
                "audit_log",
            ],
            risk_levels=["high", "critical"],
            cost_per_1k_tokens=0.015,
        ),
    ],
    default_tier="standard",
    escalation_tier="secure",
    risk_to_tier={
        "low": "economy",
        "medium": "standard",
        "high": "secure",
        "critical": "secure",
    },
)

# ---------------------------------------------------------------------------
# SQL schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS routing_decisions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id      TEXT NOT NULL UNIQUE,
    session_id      TEXT NOT NULL,
    task_type       TEXT NOT NULL,
    risk_level      TEXT NOT NULL,
    required_tools  TEXT NOT NULL,
    content_class   TEXT NOT NULL,
    selected_tier   TEXT NOT NULL,
    model_id        TEXT NOT NULL,
    reasoning       TEXT NOT NULL,
    estimated_cost  REAL NOT NULL,
    decided_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cost_records (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id   TEXT,
    session_id   TEXT NOT NULL,
    tier         TEXT NOT NULL,
    model_id     TEXT NOT NULL,
    tokens_used  INTEGER NOT NULL,
    cost_usd     REAL NOT NULL,
    recorded_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_routing_session ON routing_decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_cost_session ON cost_records(session_id);
CREATE INDEX IF NOT EXISTS idx_cost_tier ON cost_records(tier);
"""


class ModelSwitchboard:
    """Routes requests to model tiers based on risk level and policy.

    Parameters
    ----------
    policy:
        Routing policy.  Defaults to the built-in three-tier policy.
    db_path:
        SQLite database path.
    """

    def __init__(
        self,
        policy: RoutingPolicy | None = None,
        *,
        db_path: str | Path = "/tmp/amc_switchboard.db",
    ) -> None:
        self.policy = policy or _DEFAULT_POLICY
        self._tier_index: dict[str, ModelTier] = {t.tier_name: t for t in self.policy.tiers}
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def route(self, request: RoutingRequest) -> RoutingDecision:
        """Select the appropriate model tier for *request* and persist the decision.

        Routing logic:
        1. Look up risk_level in ``risk_to_tier`` mapping.
        2. Verify that all required tools are allowed in the selected tier.
        3. If tools are missing, escalate to ``escalation_tier``.
        4. Fall back to ``default_tier`` if no mapping found.
        """
        now = datetime.now(timezone.utc)
        request_id = str(uuid.uuid4())

        # Step 1: map risk level to tier
        tier_name = self.policy.risk_to_tier.get(request.risk_level, self.policy.default_tier)
        tier = self._tier_index.get(tier_name)
        reasoning_parts: list[str] = [
            f"risk_level='{request.risk_level}' maps to tier='{tier_name}'."
        ]

        # Step 2 & 3: verify tool allowlist; escalate if needed
        if tier and request.required_tools:
            missing = [t for t in request.required_tools if t not in tier.tools_allowed]
            if missing:
                old_tier = tier_name
                tier_name = self.policy.escalation_tier
                tier = self._tier_index.get(tier_name)
                reasoning_parts.append(
                    f"Escalated from '{old_tier}' to '{tier_name}' because "
                    f"required tools {missing} are not in tier allowlist."
                )

        # Step 4: default fallback
        if tier is None:
            tier_name = self.policy.default_tier
            tier = self._tier_index[tier_name]
            reasoning_parts.append(f"Fell back to default tier '{tier_name}'.")

        estimated_cost = (tier.max_tokens / 1000.0) * tier.cost_per_1k_tokens

        decision = RoutingDecision(
            request_id=request_id,
            selected_tier=tier_name,
            model_id=tier.model_id,
            reasoning=" ".join(reasoning_parts),
            estimated_cost=round(estimated_cost, 6),
            decided_at=now,
        )

        self._persist_decision(request, decision)
        log.info(
            "switchboard.routed",
            request_id=request_id,
            risk=request.risk_level,
            tier=tier_name,
            model=tier.model_id,
        )
        return decision

    def get_tier(self, tier_name: str) -> ModelTier | None:
        """Return a :class:`ModelTier` by name, or ``None``."""
        return self._tier_index.get(tier_name)

    def record_usage(self, decision: RoutingDecision, tokens_used: int) -> CostRecord:
        """Record actual token usage against a routing decision."""
        tier = self._tier_index.get(decision.selected_tier)
        cost_per_1k = tier.cost_per_1k_tokens if tier else 0.0
        cost_usd = round((tokens_used / 1000.0) * cost_per_1k, 8)
        now = datetime.now(timezone.utc)

        # Retrieve session_id from the persisted decision
        session_id = self._get_session_id(decision.request_id) or "unknown"

        record = CostRecord(
            session_id=session_id,
            tier=decision.selected_tier,
            model_id=decision.model_id,
            tokens_used=tokens_used,
            cost_usd=cost_usd,
            recorded_at=now,
        )
        with self._tx() as cur:
            cur.execute(
                """
                INSERT INTO cost_records
                (request_id, session_id, tier, model_id, tokens_used, cost_usd, recorded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    decision.request_id,
                    session_id,
                    decision.selected_tier,
                    decision.model_id,
                    tokens_used,
                    cost_usd,
                    now.isoformat(),
                ),
            )
        log.debug(
            "switchboard.usage_recorded",
            request_id=decision.request_id,
            tokens=tokens_used,
            cost=cost_usd,
        )
        return record

    def get_session_costs(self, session_id: str) -> list[CostRecord]:
        """Return all cost records for *session_id*."""
        with self._tx() as cur:
            rows = cur.execute(
                """
                SELECT session_id, tier, model_id, tokens_used, cost_usd, recorded_at
                FROM cost_records WHERE session_id = ?
                ORDER BY id
                """,
                (session_id,),
            ).fetchall()
        return [
            CostRecord(
                session_id=r[0],
                tier=r[1],
                model_id=r[2],
                tokens_used=r[3],
                cost_usd=r[4],
                recorded_at=datetime.fromisoformat(r[5]),
            )
            for r in rows
        ]

    def get_cost_summary(self) -> dict[str, Any]:
        """Return aggregated cost totals by tier and overall."""
        with self._tx() as cur:
            rows = cur.execute(
                """
                SELECT tier, SUM(tokens_used), SUM(cost_usd), COUNT(*)
                FROM cost_records GROUP BY tier
                """
            ).fetchall()
            total_row = cur.execute(
                "SELECT SUM(tokens_used), SUM(cost_usd) FROM cost_records"
            ).fetchone()

        by_tier: dict[str, dict[str, Any]] = {}
        for r in rows:
            by_tier[r[0]] = {
                "total_tokens": r[1] or 0,
                "total_cost_usd": round(r[2] or 0.0, 8),
                "record_count": r[3] or 0,
            }

        return {
            "by_tier": by_tier,
            "total_tokens": total_row[0] or 0 if total_row else 0,
            "total_cost_usd": round(total_row[1] or 0.0, 8) if total_row else 0.0,
        }

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    @contextmanager
    def _tx(self):
        conn = sqlite3.connect(self.db_path)
        try:
            cur = conn.cursor()
            yield cur
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._tx() as cur:
            cur.executescript(_SCHEMA)

    def _persist_decision(self, request: RoutingRequest, decision: RoutingDecision) -> None:
        with self._tx() as cur:
            cur.execute(
                """
                INSERT OR REPLACE INTO routing_decisions
                (request_id, session_id, task_type, risk_level, required_tools,
                 content_class, selected_tier, model_id, reasoning,
                 estimated_cost, decided_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    decision.request_id,
                    request.session_id,
                    request.task_type,
                    request.risk_level,
                    json.dumps(request.required_tools),
                    request.content_classification,
                    decision.selected_tier,
                    decision.model_id,
                    decision.reasoning,
                    decision.estimated_cost,
                    decision.decided_at.isoformat(),
                ),
            )

    def _get_session_id(self, request_id: str) -> str | None:
        with self._tx() as cur:
            row = cur.execute(
                "SELECT session_id FROM routing_decisions WHERE request_id = ?",
                (request_id,),
            ).fetchone()
        return row[0] if row else None
