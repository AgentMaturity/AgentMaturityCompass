"""Tool Cost Estimator — Wave-2 Tool Intelligence.

Pre-flight estimation of tool call cost:
  - Token cost (input + output tokens × per-model price)
  - API cost (per-call pricing for external APIs)
  - Estimated wall-clock latency
  - Budget gate: reject if estimated cost exceeds cap

Cost model registry: caller registers per-tool pricing; fallback to defaults.
SQLite-backed for estimate history + model calibration.
"""
from __future__ import annotations

import json
import math
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS cost_models (
    tool_name           TEXT PRIMARY KEY,
    cost_per_call_usd   REAL NOT NULL DEFAULT 0.0,
    cost_per_1k_input_tokens_usd  REAL NOT NULL DEFAULT 0.0,
    cost_per_1k_output_tokens_usd REAL NOT NULL DEFAULT 0.0,
    avg_latency_ms      INTEGER NOT NULL DEFAULT 500,
    avg_input_tokens    INTEGER NOT NULL DEFAULT 0,
    avg_output_tokens   INTEGER NOT NULL DEFAULT 0,
    metadata_json       TEXT NOT NULL DEFAULT '{}',
    updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cost_estimates (
    estimate_id         TEXT PRIMARY KEY,
    tool_name           TEXT NOT NULL,
    estimated_input_tokens   INTEGER NOT NULL DEFAULT 0,
    estimated_output_tokens  INTEGER NOT NULL DEFAULT 0,
    estimated_token_cost_usd REAL NOT NULL DEFAULT 0.0,
    estimated_api_cost_usd   REAL NOT NULL DEFAULT 0.0,
    estimated_total_usd      REAL NOT NULL DEFAULT 0.0,
    estimated_latency_ms     INTEGER NOT NULL DEFAULT 0,
    budget_cap_usd      REAL,
    within_budget       INTEGER NOT NULL DEFAULT 1,
    tenant_id           TEXT NOT NULL DEFAULT '',
    metadata_json       TEXT NOT NULL DEFAULT '{}',
    created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_est_tool ON cost_estimates(tool_name);
CREATE INDEX IF NOT EXISTS idx_cost_est_tenant ON cost_estimates(tenant_id);
"""

# ---------------------------------------------------------------------------
# Built-in defaults (can be overridden per tool)
# ---------------------------------------------------------------------------

# Tokens per word heuristic (English prose ≈ 1.3 tokens/word)
_TOKENS_PER_WORD = 1.3

# Default model pricing (per 1k tokens) — GPT-4o class as reference
_DEFAULT_INPUT_COST = 0.0025    # USD per 1k input tokens
_DEFAULT_OUTPUT_COST = 0.010    # USD per 1k output tokens
_DEFAULT_LATENCY_MS = 1200      # baseline API latency
_DEFAULT_API_COST = 0.0         # no per-call fee by default


def _estimate_tokens(text: str | None, avg_tokens: int = 0) -> int:
    """Estimate token count from text or historical average."""
    if text:
        words = len(text.split())
        return max(1, int(math.ceil(words * _TOKENS_PER_WORD)))
    return avg_tokens or 0


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class CostModel:
    tool_name: str
    cost_per_call_usd: float = 0.0
    cost_per_1k_input_tokens_usd: float = _DEFAULT_INPUT_COST
    cost_per_1k_output_tokens_usd: float = _DEFAULT_OUTPUT_COST
    avg_latency_ms: int = _DEFAULT_LATENCY_MS
    avg_input_tokens: int = 0
    avg_output_tokens: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "tool_name": self.tool_name,
            "cost_per_call_usd": self.cost_per_call_usd,
            "cost_per_1k_input_tokens_usd": self.cost_per_1k_input_tokens_usd,
            "cost_per_1k_output_tokens_usd": self.cost_per_1k_output_tokens_usd,
            "avg_latency_ms": self.avg_latency_ms,
            "avg_input_tokens": self.avg_input_tokens,
            "avg_output_tokens": self.avg_output_tokens,
            "metadata": self.metadata,
        }


@dataclass
class CostEstimate:
    estimate_id: str
    tool_name: str
    estimated_input_tokens: int
    estimated_output_tokens: int
    estimated_token_cost_usd: float
    estimated_api_cost_usd: float
    estimated_total_usd: float
    estimated_latency_ms: int
    budget_cap_usd: float | None
    within_budget: bool
    tenant_id: str
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "estimate_id": self.estimate_id,
            "tool_name": self.tool_name,
            "estimated_input_tokens": self.estimated_input_tokens,
            "estimated_output_tokens": self.estimated_output_tokens,
            "estimated_token_cost_usd": round(self.estimated_token_cost_usd, 8),
            "estimated_api_cost_usd": round(self.estimated_api_cost_usd, 8),
            "estimated_total_usd": round(self.estimated_total_usd, 8),
            "estimated_latency_ms": self.estimated_latency_ms,
            "budget_cap_usd": self.budget_cap_usd,
            "within_budget": self.within_budget,
            "tenant_id": self.tenant_id,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


# ---------------------------------------------------------------------------
# Core estimator
# ---------------------------------------------------------------------------


class ToolCostEstimator:
    """Pre-flight cost estimator for tool calls. SQLite-backed."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(product_db_path(db_path))
        self._conn = self._init_db()

    def _init_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.executescript(_SCHEMA_SQL)
        conn.commit()
        return conn

    def register_model(self, model: CostModel) -> None:
        """Register or update the cost model for a tool."""
        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """INSERT OR REPLACE INTO cost_models
               (tool_name,cost_per_call_usd,cost_per_1k_input_tokens_usd,
                cost_per_1k_output_tokens_usd,avg_latency_ms,
                avg_input_tokens,avg_output_tokens,metadata_json,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                model.tool_name, model.cost_per_call_usd,
                model.cost_per_1k_input_tokens_usd, model.cost_per_1k_output_tokens_usd,
                model.avg_latency_ms, model.avg_input_tokens, model.avg_output_tokens,
                json.dumps(model.metadata), now,
            ),
        )
        self._conn.commit()

    def get_model(self, tool_name: str) -> CostModel:
        """Get cost model for tool; returns defaults if not registered."""
        row = self._conn.execute(
            "SELECT * FROM cost_models WHERE tool_name=?", (tool_name,)
        ).fetchone()
        if row:
            return CostModel(
                tool_name=row["tool_name"],
                cost_per_call_usd=row["cost_per_call_usd"],
                cost_per_1k_input_tokens_usd=row["cost_per_1k_input_tokens_usd"],
                cost_per_1k_output_tokens_usd=row["cost_per_1k_output_tokens_usd"],
                avg_latency_ms=row["avg_latency_ms"],
                avg_input_tokens=row["avg_input_tokens"],
                avg_output_tokens=row["avg_output_tokens"],
                metadata=json.loads(row["metadata_json"]),
            )
        # Return defaults
        return CostModel(tool_name=tool_name)

    def estimate(
        self,
        tool_name: str,
        input_text: str | None = None,
        output_text: str | None = None,
        estimated_input_tokens: int | None = None,
        estimated_output_tokens: int | None = None,
        budget_cap_usd: float | None = None,
        tenant_id: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> CostEstimate:
        """Estimate the cost of calling a tool."""
        model = self.get_model(tool_name)

        # Determine token counts
        in_tokens = (
            estimated_input_tokens
            if estimated_input_tokens is not None
            else _estimate_tokens(input_text, model.avg_input_tokens)
        )
        out_tokens = (
            estimated_output_tokens
            if estimated_output_tokens is not None
            else _estimate_tokens(output_text, model.avg_output_tokens)
        )

        # Compute costs
        token_cost = (
            (in_tokens / 1000) * model.cost_per_1k_input_tokens_usd
            + (out_tokens / 1000) * model.cost_per_1k_output_tokens_usd
        )
        api_cost = model.cost_per_call_usd
        total = token_cost + api_cost

        within_budget = True
        if budget_cap_usd is not None:
            within_budget = total <= budget_cap_usd

        estimate_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        self._conn.execute(
            """INSERT INTO cost_estimates
               (estimate_id,tool_name,estimated_input_tokens,estimated_output_tokens,
                estimated_token_cost_usd,estimated_api_cost_usd,estimated_total_usd,
                estimated_latency_ms,budget_cap_usd,within_budget,
                tenant_id,metadata_json,created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                estimate_id, tool_name, in_tokens, out_tokens,
                token_cost, api_cost, total, model.avg_latency_ms,
                budget_cap_usd, 1 if within_budget else 0,
                tenant_id, json.dumps(metadata or {}), now,
            ),
        )
        self._conn.commit()

        return CostEstimate(
            estimate_id=estimate_id, tool_name=tool_name,
            estimated_input_tokens=in_tokens, estimated_output_tokens=out_tokens,
            estimated_token_cost_usd=token_cost, estimated_api_cost_usd=api_cost,
            estimated_total_usd=total, estimated_latency_ms=model.avg_latency_ms,
            budget_cap_usd=budget_cap_usd, within_budget=within_budget,
            tenant_id=tenant_id, metadata=metadata or {}, created_at=now,
        )

    def estimate_chain(
        self,
        tools: list[str],
        budget_cap_usd: float | None = None,
        tenant_id: str = "",
    ) -> dict[str, Any]:
        """Estimate total cost for a chain of tool calls."""
        estimates = [self.estimate(t, budget_cap_usd=None, tenant_id=tenant_id) for t in tools]
        total_cost = sum(e.estimated_total_usd for e in estimates)
        total_latency = sum(e.estimated_latency_ms for e in estimates)
        within = budget_cap_usd is None or total_cost <= budget_cap_usd
        return {
            "tools": tools,
            "per_tool": [e.dict for e in estimates],
            "total_cost_usd": round(total_cost, 8),
            "total_latency_ms": total_latency,
            "budget_cap_usd": budget_cap_usd,
            "within_budget": within,
        }

    def get_estimate(self, estimate_id: str) -> CostEstimate | None:
        row = self._conn.execute(
            "SELECT * FROM cost_estimates WHERE estimate_id=?", (estimate_id,)
        ).fetchone()
        return self._row_to_estimate(row) if row else None

    def list_estimates(
        self,
        tool_name: str | None = None,
        tenant_id: str | None = None,
        limit: int = 100,
    ) -> list[CostEstimate]:
        q = "SELECT * FROM cost_estimates WHERE 1=1"
        params: list[Any] = []
        if tool_name:
            q += " AND tool_name=?"; params.append(tool_name)
        if tenant_id:
            q += " AND tenant_id=?"; params.append(tenant_id)
        q += " ORDER BY created_at DESC LIMIT ?"; params.append(limit)
        return [self._row_to_estimate(r) for r in self._conn.execute(q, params).fetchall()]

    def list_models(self) -> list[CostModel]:
        rows = self._conn.execute("SELECT * FROM cost_models ORDER BY tool_name").fetchall()
        return [
            CostModel(
                tool_name=r["tool_name"],
                cost_per_call_usd=r["cost_per_call_usd"],
                cost_per_1k_input_tokens_usd=r["cost_per_1k_input_tokens_usd"],
                cost_per_1k_output_tokens_usd=r["cost_per_1k_output_tokens_usd"],
                avg_latency_ms=r["avg_latency_ms"],
                avg_input_tokens=r["avg_input_tokens"],
                avg_output_tokens=r["avg_output_tokens"],
                metadata=json.loads(r["metadata_json"]),
            )
            for r in rows
        ]

    @staticmethod
    def _row_to_estimate(row: sqlite3.Row) -> CostEstimate:
        return CostEstimate(
            estimate_id=row["estimate_id"], tool_name=row["tool_name"],
            estimated_input_tokens=row["estimated_input_tokens"],
            estimated_output_tokens=row["estimated_output_tokens"],
            estimated_token_cost_usd=row["estimated_token_cost_usd"],
            estimated_api_cost_usd=row["estimated_api_cost_usd"],
            estimated_total_usd=row["estimated_total_usd"],
            estimated_latency_ms=row["estimated_latency_ms"],
            budget_cap_usd=row["budget_cap_usd"],
            within_budget=bool(row["within_budget"]),
            tenant_id=row["tenant_id"],
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"],
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_estimator: ToolCostEstimator | None = None


def get_tool_cost_estimator(db_path: str | Path | None = None) -> ToolCostEstimator:
    global _estimator
    if _estimator is None:
        _estimator = ToolCostEstimator(db_path=db_path)
    return _estimator


__all__ = [
    "CostModel",
    "CostEstimate",
    "ToolCostEstimator",
    "get_tool_cost_estimator",
]
