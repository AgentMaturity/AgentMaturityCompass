"""Tool Discovery Engine — Natural Language Tool Discovery.

Registers tools with capabilities/descriptions, performs semantic search
by intent, ranks by fit + historical success. SQLite-backed.
"""
from __future__ import annotations

import json
import math
import re
import sqlite3
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_DISCOVERY_NAMESPACE = UUID("b1c2d3e4-f5a6-7890-bcde-f01234567891")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS tool_registry (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_id         TEXT NOT NULL UNIQUE,
    tool_name       TEXT NOT NULL UNIQUE,
    description     TEXT NOT NULL DEFAULT '',
    capabilities    TEXT NOT NULL DEFAULT '[]',
    tags            TEXT NOT NULL DEFAULT '[]',
    category        TEXT NOT NULL DEFAULT 'general',
    input_schema    TEXT NOT NULL DEFAULT '{}',
    output_schema   TEXT NOT NULL DEFAULT '{}',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tool_registry_category ON tool_registry(category);
CREATE INDEX IF NOT EXISTS idx_tool_registry_active   ON tool_registry(active);

CREATE TABLE IF NOT EXISTS tool_usage_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    history_id  TEXT NOT NULL UNIQUE,
    tool_id     TEXT NOT NULL,
    session_id  TEXT NOT NULL DEFAULT '',
    intent      TEXT NOT NULL DEFAULT '',
    succeeded   INTEGER NOT NULL DEFAULT 1,
    latency_ms  INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tool_usage_tool_id ON tool_usage_history(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_usage_created ON tool_usage_history(created_at);
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_tool_id(tool_name: str) -> str:
    return str(uuid5(_DISCOVERY_NAMESPACE, tool_name))


def _make_history_id(tool_id: str, session_id: str, ts: str) -> str:
    return str(uuid5(_DISCOVERY_NAMESPACE, f"{tool_id}:{session_id}:{ts}"))


def _tokenize(text: str) -> list[str]:
    """Simple word tokenizer for TF-IDF-like scoring."""
    return re.findall(r"\b[a-z][a-z0-9_]{1,}\b", (text or "").lower())


def _tf_idf_score(
    query_tokens: list[str],
    doc_tokens: list[str],
    corpus_freq: Counter,  # type: ignore[type-arg]
) -> float:
    """TF-IDF overlap score between a query and a document."""
    if not query_tokens or not doc_tokens:
        return 0.0
    doc_freq: Counter = Counter(doc_tokens)  # type: ignore[type-arg]
    score = 0.0
    for token in query_tokens:
        tf = doc_freq.get(token, 0) / max(len(doc_tokens), 1)
        idf = math.log(1.0 + 1.0 / max(corpus_freq.get(token, 1), 1))
        score += tf * idf
    return score


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class ToolRegistration:
    """Input payload for registering a tool."""

    tool_name: str
    description: str
    capabilities: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    category: str = "general"
    input_schema: dict[str, Any] = field(default_factory=dict)
    output_schema: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolRecord:
    """Stored tool record from the registry."""

    tool_id: str
    tool_name: str
    description: str
    capabilities: list[str]
    tags: list[str]
    category: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    metadata: dict[str, Any]
    active: bool
    created_at: str
    updated_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "tool_id": self.tool_id,
            "tool_name": self.tool_name,
            "description": self.description,
            "capabilities": self.capabilities,
            "tags": self.tags,
            "category": self.category,
            "input_schema": self.input_schema,
            "output_schema": self.output_schema,
            "metadata": self.metadata,
            "active": self.active,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class DiscoveryResult:
    """A single ranked tool match for a discovery query."""

    tool_id: str
    tool_name: str
    description: str
    capabilities: list[str]
    tags: list[str]
    category: str
    relevance_score: float
    success_rate: float
    total_calls: int
    rank: int

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "tool_id": self.tool_id,
            "tool_name": self.tool_name,
            "description": self.description,
            "capabilities": self.capabilities,
            "tags": self.tags,
            "category": self.category,
            "relevance_score": round(self.relevance_score, 4),
            "success_rate": round(self.success_rate, 4),
            "total_calls": self.total_calls,
            "rank": self.rank,
        }


# ---------------------------------------------------------------------------
# Core engine
# ---------------------------------------------------------------------------


class ToolDiscoveryEngine:
    """Register and discover tools by natural language intent."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(product_db_path(db_path))
        self._conn = self._init_db()

    def _init_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.executescript(_SCHEMA)
        conn.commit()
        return conn

    # ------------------------------------------------------------------
    # Registry CRUD
    # ------------------------------------------------------------------

    def register_tool(self, reg: ToolRegistration) -> ToolRecord:
        """Register or update a tool in the registry."""
        tool_id = _make_tool_id(reg.tool_name)
        now = _utc_now()
        existing = self.get_tool(tool_id)

        if existing:
            self._conn.execute(
                """
                UPDATE tool_registry
                SET description=?, capabilities=?, tags=?, category=?,
                    input_schema=?, output_schema=?, metadata_json=?,
                    active=1, updated_at=?
                WHERE tool_id=?
                """,
                (
                    reg.description,
                    json.dumps(reg.capabilities),
                    json.dumps(reg.tags),
                    reg.category,
                    json.dumps(reg.input_schema),
                    json.dumps(reg.output_schema),
                    json.dumps(reg.metadata),
                    now,
                    tool_id,
                ),
            )
        else:
            self._conn.execute(
                """
                INSERT INTO tool_registry
                    (tool_id, tool_name, description, capabilities, tags, category,
                     input_schema, output_schema, metadata_json, active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    tool_id,
                    reg.tool_name,
                    reg.description,
                    json.dumps(reg.capabilities),
                    json.dumps(reg.tags),
                    reg.category,
                    json.dumps(reg.input_schema),
                    json.dumps(reg.output_schema),
                    json.dumps(reg.metadata),
                    now,
                    now,
                ),
            )
        self._conn.commit()
        log.info("tool_registered", tool_id=tool_id, tool_name=reg.tool_name)
        return self.get_tool(tool_id)  # type: ignore[return-value]

    def get_tool(self, tool_id: str) -> ToolRecord | None:
        row = self._conn.execute(
            "SELECT * FROM tool_registry WHERE tool_id=?", (tool_id,)
        ).fetchone()
        return self._row_to_record(row) if row else None

    def get_tool_by_name(self, tool_name: str) -> ToolRecord | None:
        row = self._conn.execute(
            "SELECT * FROM tool_registry WHERE tool_name=?", (tool_name,)
        ).fetchone()
        return self._row_to_record(row) if row else None

    def list_tools(
        self,
        category: str | None = None,
        active_only: bool = True,
    ) -> list[ToolRecord]:
        q = "SELECT * FROM tool_registry WHERE 1=1"
        params: list[Any] = []
        if active_only:
            q += " AND active=1"
        if category:
            q += " AND category=?"
            params.append(category)
        q += " ORDER BY tool_name"
        rows = self._conn.execute(q, params).fetchall()
        return [self._row_to_record(r) for r in rows]

    def deactivate_tool(self, tool_id: str) -> bool:
        cur = self._conn.execute(
            "UPDATE tool_registry SET active=0, updated_at=? WHERE tool_id=?",
            (_utc_now(), tool_id),
        )
        self._conn.commit()
        return cur.rowcount > 0

    # ------------------------------------------------------------------
    # Discovery / semantic search
    # ------------------------------------------------------------------

    def discover(
        self,
        intent: str,
        top_k: int = 5,
        category: str | None = None,
        min_success_rate: float = 0.0,
    ) -> list[DiscoveryResult]:
        """Search tools by natural language intent and rank by relevance + history."""
        tools = self.list_tools(category=category, active_only=True)
        if not tools:
            return []

        query_tokens = _tokenize(intent)

        # Build per-tool doc strings and corpus frequency for IDF
        corpus_docs: list[list[str]] = []
        for t in tools:
            doc_text = " ".join([
                t.tool_name,
                t.description,
                " ".join(t.capabilities),
                " ".join(t.tags),
                t.category,
            ])
            corpus_docs.append(_tokenize(doc_text))

        corpus_freq: Counter = Counter()  # type: ignore[type-arg]
        for doc in corpus_docs:
            corpus_freq.update(set(doc))

        stats = self._get_all_stats()
        results: list[DiscoveryResult] = []

        for i, tool in enumerate(tools):
            doc_tokens = corpus_docs[i]
            sem_score = _tf_idf_score(query_tokens, doc_tokens, corpus_freq)

            # Exact capability/tag keyword overlap bonus
            cap_tags = {c.lower() for c in tool.capabilities + tool.tags}
            overlap = len(cap_tags & set(query_tokens))
            bonus = overlap * 0.15

            tool_stats = stats.get(tool.tool_id, {"success_rate": 1.0, "total": 0})
            success_rate = tool_stats["success_rate"]
            total_calls = tool_stats["total"]

            if total_calls > 0 and success_rate < min_success_rate:
                continue

            # 70% semantic, 20% capability/tag overlap, 10% historical success
            history_bonus = success_rate * 0.1 if total_calls > 0 else 0.05
            final_score = sem_score * 0.7 + bonus + history_bonus

            results.append(
                DiscoveryResult(
                    tool_id=tool.tool_id,
                    tool_name=tool.tool_name,
                    description=tool.description,
                    capabilities=tool.capabilities,
                    tags=tool.tags,
                    category=tool.category,
                    relevance_score=final_score,
                    success_rate=success_rate,
                    total_calls=total_calls,
                    rank=0,
                )
            )

        results.sort(key=lambda r: r.relevance_score, reverse=True)
        top = results[:top_k]
        for rank, res in enumerate(top, start=1):
            res.rank = rank
        return top

    # ------------------------------------------------------------------
    # Usage history
    # ------------------------------------------------------------------

    def record_usage(
        self,
        tool_id: str,
        session_id: str = "",
        intent: str = "",
        succeeded: bool = True,
        latency_ms: int = 0,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Record a tool usage event for historical success tracking."""
        ts = _utc_now()
        history_id = _make_history_id(tool_id, session_id, ts)
        self._conn.execute(
            """
            INSERT OR IGNORE INTO tool_usage_history
                (history_id, tool_id, session_id, intent, succeeded,
                 latency_ms, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                history_id,
                tool_id,
                session_id,
                intent,
                1 if succeeded else 0,
                latency_ms,
                json.dumps(metadata or {}),
                ts,
            ),
        )
        self._conn.commit()
        return history_id

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_all_stats(self) -> dict[str, dict[str, Any]]:
        rows = self._conn.execute(
            """
            SELECT tool_id,
                   COUNT(*)        AS total,
                   SUM(succeeded)  AS successes
            FROM tool_usage_history
            GROUP BY tool_id
            """
        ).fetchall()
        out: dict[str, dict[str, Any]] = {}
        for row in rows:
            total = row["total"] or 0
            successes = row["successes"] or 0
            out[row["tool_id"]] = {
                "total": total,
                "success_rate": successes / total if total > 0 else 1.0,
            }
        return out

    def _row_to_record(self, row: sqlite3.Row) -> ToolRecord:
        return ToolRecord(
            tool_id=row["tool_id"],
            tool_name=row["tool_name"],
            description=row["description"],
            capabilities=json.loads(row["capabilities"]),
            tags=json.loads(row["tags"]),
            category=row["category"],
            input_schema=json.loads(row["input_schema"]),
            output_schema=json.loads(row["output_schema"]),
            metadata=json.loads(row["metadata_json"]),
            active=bool(row["active"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_engine: ToolDiscoveryEngine | None = None


def get_tool_discovery_engine(
    db_path: str | Path | None = None,
) -> ToolDiscoveryEngine:
    global _engine
    if _engine is None:
        _engine = ToolDiscoveryEngine(db_path=db_path)
    return _engine


__all__ = [
    "ToolRegistration",
    "ToolRecord",
    "DiscoveryResult",
    "ToolDiscoveryEngine",
    "get_tool_discovery_engine",
]
