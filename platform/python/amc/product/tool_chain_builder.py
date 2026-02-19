"""Tool Chain Builder — Wave-2 Tool Intelligence.

Given a goal description and a catalog of available tools (with capability tags),
synthesizes a minimal ordered tool sequence that satisfies the goal.

Algorithm:
  1. Match goal tokens to tool capabilities (TF-IDF-style scoring)
  2. Build a chain: tools sorted by coverage of goal sub-goals
  3. Prune redundant tools (output of T_i covers input of T_{i+1})
  4. Detect unsatisfied goal aspects and report gaps

SQLite-backed chain store for persistence and reuse.
"""
from __future__ import annotations

import json
import re
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
CREATE TABLE IF NOT EXISTS tool_chains (
    chain_id        TEXT PRIMARY KEY,
    goal            TEXT NOT NULL DEFAULT '',
    steps_json      TEXT NOT NULL DEFAULT '[]',
    gaps_json       TEXT NOT NULL DEFAULT '[]',
    coverage_score  REAL NOT NULL DEFAULT 0.0,
    tenant_id       TEXT NOT NULL DEFAULT '',
    session_id      TEXT NOT NULL DEFAULT '',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chains_tenant ON tool_chains(tenant_id);

CREATE TABLE IF NOT EXISTS chain_tool_catalog (
    tool_id         TEXT PRIMARY KEY,
    tool_name       TEXT NOT NULL UNIQUE,
    capabilities    TEXT NOT NULL DEFAULT '[]',
    input_types     TEXT NOT NULL DEFAULT '[]',
    output_types    TEXT NOT NULL DEFAULT '[]',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    active          INTEGER NOT NULL DEFAULT 1
);
"""

# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

_STOPWORDS = {
    "a", "an", "the", "and", "or", "to", "of", "in", "for", "with",
    "from", "at", "by", "is", "are", "be", "was", "were", "as", "on",
    "it", "its", "this", "that", "will", "can", "should", "would",
}


def _tokenize(text: str) -> list[str]:
    tokens = re.findall(r"\w{3,}", text.lower())
    return [t for t in tokens if t not in _STOPWORDS]


def _overlap_score(goal_tokens: set[str], capability_tokens: set[str]) -> float:
    if not goal_tokens or not capability_tokens:
        return 0.0
    intersection = goal_tokens & capability_tokens
    return len(intersection) / len(goal_tokens)


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class ChainTool:
    """A tool registered in the chain builder catalog."""
    tool_id: str
    tool_name: str
    capabilities: list[str]    # human-language capability descriptions
    input_types: list[str]     # e.g. ["text", "url", "json"]
    output_types: list[str]    # e.g. ["json", "markdown"]
    metadata: dict[str, Any] = field(default_factory=dict)
    active: bool = True

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "tool_id": self.tool_id,
            "tool_name": self.tool_name,
            "capabilities": self.capabilities,
            "input_types": self.input_types,
            "output_types": self.output_types,
            "metadata": self.metadata,
            "active": self.active,
        }


@dataclass
class ChainStep:
    step_number: int
    tool_name: str
    tool_id: str
    rationale: str
    coverage_contribution: float
    input_from: str | None      # previous tool name or "user"
    output_to: str | None       # next tool name or "final"

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "step_number": self.step_number,
            "tool_name": self.tool_name,
            "tool_id": self.tool_id,
            "rationale": self.rationale,
            "coverage_contribution": self.coverage_contribution,
            "input_from": self.input_from,
            "output_to": self.output_to,
        }


@dataclass
class ToolChain:
    chain_id: str
    goal: str
    steps: list[ChainStep]
    gaps: list[str]            # goal aspects not covered by any tool
    coverage_score: float      # fraction of goal tokens covered [0,1]
    tenant_id: str
    session_id: str
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "chain_id": self.chain_id,
            "goal": self.goal,
            "steps": [s.dict for s in self.steps],
            "gaps": self.gaps,
            "coverage_score": self.coverage_score,
            "tenant_id": self.tenant_id,
            "session_id": self.session_id,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


# ---------------------------------------------------------------------------
# Core builder
# ---------------------------------------------------------------------------


class ToolChainBuilder:
    """Synthesize minimal tool chains from goal + catalog. SQLite-backed."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(product_db_path(db_path))
        self._conn = self._init_db()

    def _init_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.executescript(_SCHEMA_SQL)
        conn.commit()
        return conn

    # ── Catalog management ────────────────────────────────────────────────

    def register_tool(
        self,
        tool_name: str,
        capabilities: list[str],
        input_types: list[str] | None = None,
        output_types: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ChainTool:
        tool_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        # Upsert: check if exists
        existing = self._conn.execute(
            "SELECT tool_id FROM chain_tool_catalog WHERE tool_name=?", (tool_name,)
        ).fetchone()
        if existing:
            tool_id = existing["tool_id"]
            self._conn.execute(
                """UPDATE chain_tool_catalog
                   SET capabilities=?, input_types=?, output_types=?, metadata_json=?, active=1
                   WHERE tool_name=?""",
                (
                    json.dumps(capabilities), json.dumps(input_types or []),
                    json.dumps(output_types or []), json.dumps(metadata or {}),
                    tool_name,
                ),
            )
        else:
            self._conn.execute(
                """INSERT INTO chain_tool_catalog
                   (tool_id,tool_name,capabilities,input_types,output_types,metadata_json,active)
                   VALUES (?,?,?,?,?,?,1)""",
                (
                    tool_id, tool_name, json.dumps(capabilities),
                    json.dumps(input_types or []), json.dumps(output_types or []),
                    json.dumps(metadata or {}),
                ),
            )
        self._conn.commit()
        return ChainTool(
            tool_id=tool_id, tool_name=tool_name, capabilities=capabilities,
            input_types=input_types or [], output_types=output_types or [],
            metadata=metadata or {},
        )

    def list_catalog(self, active_only: bool = True) -> list[ChainTool]:
        q = "SELECT * FROM chain_tool_catalog"
        if active_only:
            q += " WHERE active=1"
        q += " ORDER BY tool_name"
        return [self._row_to_chain_tool(r) for r in self._conn.execute(q).fetchall()]

    # ── Chain synthesis ───────────────────────────────────────────────────

    def build(
        self,
        goal: str,
        max_steps: int = 6,
        tenant_id: str = "",
        session_id: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> ToolChain:
        """Synthesize minimal chain for goal from registered catalog."""
        goal_tokens = set(_tokenize(goal))
        catalog = self.list_catalog(active_only=True)

        # Score each tool against goal
        scored: list[tuple[float, ChainTool]] = []
        for tool in catalog:
            cap_text = " ".join(tool.capabilities)
            cap_tokens = set(_tokenize(cap_text))
            score = _overlap_score(goal_tokens, cap_tokens)
            if score > 0:
                scored.append((score, tool))

        scored.sort(key=lambda x: x[0], reverse=True)

        # Greedy chain: pick tools that incrementally cover new goal tokens
        covered_tokens: set[str] = set()
        steps: list[ChainStep] = []
        prev_tool: str | None = None

        for rank_score, tool in scored[:max_steps]:
            cap_tokens = set(_tokenize(" ".join(tool.capabilities)))
            new_coverage = cap_tokens - covered_tokens
            if not new_coverage:
                continue  # tool doesn't add new coverage
            covered_tokens |= cap_tokens & goal_tokens
            contribution = len(cap_tokens & goal_tokens & new_coverage) / max(len(goal_tokens), 1)
            step_num = len(steps) + 1
            step = ChainStep(
                step_number=step_num,
                tool_name=tool.tool_name,
                tool_id=tool.tool_id,
                rationale=f"Covers: {', '.join(sorted(cap_tokens & goal_tokens & new_coverage)[:5])}",
                coverage_contribution=round(contribution, 4),
                input_from=prev_tool or "user",
                output_to=None,  # filled in below
            )
            steps.append(step)
            prev_tool = tool.tool_name

        # Wire up output_to
        for i, step in enumerate(steps):
            step.output_to = steps[i + 1].tool_name if i + 1 < len(steps) else "final"

        # Gaps: goal tokens not covered by any tool
        uncovered = goal_tokens - covered_tokens
        gaps = [t for t in sorted(uncovered) if len(t) > 3][:10]

        coverage_score = (
            len(covered_tokens & goal_tokens) / len(goal_tokens) if goal_tokens else 0.0
        )

        chain_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        self._conn.execute(
            """INSERT INTO tool_chains
               (chain_id,goal,steps_json,gaps_json,coverage_score,
                tenant_id,session_id,metadata_json,created_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                chain_id, goal,
                json.dumps([s.dict for s in steps]),
                json.dumps(gaps),
                round(coverage_score, 4),
                tenant_id, session_id, json.dumps(metadata or {}), now,
            ),
        )
        self._conn.commit()

        return ToolChain(
            chain_id=chain_id, goal=goal, steps=steps, gaps=gaps,
            coverage_score=round(coverage_score, 4),
            tenant_id=tenant_id, session_id=session_id,
            metadata=metadata or {}, created_at=now,
        )

    def get_chain(self, chain_id: str) -> ToolChain | None:
        row = self._conn.execute(
            "SELECT * FROM tool_chains WHERE chain_id=?", (chain_id,)
        ).fetchone()
        return self._row_to_chain(row) if row else None

    def list_chains(
        self,
        tenant_id: str | None = None,
        session_id: str | None = None,
        limit: int = 50,
    ) -> list[ToolChain]:
        q = "SELECT * FROM tool_chains WHERE 1=1"
        params: list[Any] = []
        if tenant_id:
            q += " AND tenant_id=?"; params.append(tenant_id)
        if session_id:
            q += " AND session_id=?"; params.append(session_id)
        q += " ORDER BY created_at DESC LIMIT ?"; params.append(limit)
        return [self._row_to_chain(r) for r in self._conn.execute(q, params).fetchall()]

    # ------------------------------------------------------------------
    # Private
    # ------------------------------------------------------------------

    @staticmethod
    def _row_to_chain_tool(row: sqlite3.Row) -> ChainTool:
        return ChainTool(
            tool_id=row["tool_id"], tool_name=row["tool_name"],
            capabilities=json.loads(row["capabilities"]),
            input_types=json.loads(row["input_types"]),
            output_types=json.loads(row["output_types"]),
            metadata=json.loads(row["metadata_json"]),
            active=bool(row["active"]),
        )

    @staticmethod
    def _row_to_chain(row: sqlite3.Row) -> ToolChain:
        steps_raw = json.loads(row["steps_json"])
        steps = [
            ChainStep(
                step_number=s["step_number"], tool_name=s["tool_name"],
                tool_id=s["tool_id"], rationale=s["rationale"],
                coverage_contribution=s["coverage_contribution"],
                input_from=s["input_from"], output_to=s["output_to"],
            )
            for s in steps_raw
        ]
        return ToolChain(
            chain_id=row["chain_id"], goal=row["goal"],
            steps=steps, gaps=json.loads(row["gaps_json"]),
            coverage_score=row["coverage_score"],
            tenant_id=row["tenant_id"], session_id=row["session_id"],
            metadata=json.loads(row["metadata_json"]), created_at=row["created_at"],
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_builder: ToolChainBuilder | None = None


def get_tool_chain_builder(db_path: str | Path | None = None) -> ToolChainBuilder:
    global _builder
    if _builder is None:
        _builder = ToolChainBuilder(db_path=db_path)
    return _builder


__all__ = [
    "ChainTool",
    "ChainStep",
    "ToolChain",
    "ToolChainBuilder",
    "get_tool_chain_builder",
]
