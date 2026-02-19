"""Memory Consolidation Engine — Deduplicate and compact agent memory.

Merges redundant memory items into stable summaries, detects contradictions,
and produces a compact fact store. SQLite-backed.
"""
from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_MEMORY_NAMESPACE = UUID("e4f5a6b7-c8d9-0123-ef01-234567890004")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS memory_items (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id             TEXT NOT NULL UNIQUE,
    session_id          TEXT NOT NULL DEFAULT '',
    tenant_id           TEXT NOT NULL DEFAULT '',
    content             TEXT NOT NULL,
    content_type        TEXT NOT NULL DEFAULT 'fact',
    source              TEXT NOT NULL DEFAULT '',
    confidence          REAL NOT NULL DEFAULT 1.0,
    importance          REAL NOT NULL DEFAULT 0.5,
    tags                TEXT NOT NULL DEFAULT '[]',
    metadata_json       TEXT NOT NULL DEFAULT '{}',
    consolidated        INTEGER NOT NULL DEFAULT 0,
    consolidation_id    TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mem_session  ON memory_items(session_id);
CREATE INDEX IF NOT EXISTS idx_mem_tenant   ON memory_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mem_type     ON memory_items(content_type);
CREATE INDEX IF NOT EXISTS idx_mem_consol   ON memory_items(consolidated);

CREATE TABLE IF NOT EXISTS consolidations (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    consolidation_id    TEXT NOT NULL UNIQUE,
    session_id          TEXT NOT NULL DEFAULT '',
    tenant_id           TEXT NOT NULL DEFAULT '',
    summary             TEXT NOT NULL,
    facts               TEXT NOT NULL DEFAULT '[]',
    contradictions      TEXT NOT NULL DEFAULT '[]',
    source_item_ids     TEXT NOT NULL DEFAULT '[]',
    item_count          INTEGER NOT NULL DEFAULT 0,
    confidence          REAL NOT NULL DEFAULT 1.0,
    metadata_json       TEXT NOT NULL DEFAULT '{}',
    created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consol_session ON consolidations(session_id);
CREATE INDEX IF NOT EXISTS idx_consol_tenant  ON consolidations(tenant_id);
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_item_id(content: str, session_id: str) -> str:
    return str(uuid5(_MEMORY_NAMESPACE, f"{session_id}:{content[:100]}"))


def _make_consolidation_id(session_id: str, ts: str) -> str:
    return str(uuid5(_MEMORY_NAMESPACE, f"consol:{session_id}:{ts}"))


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower().strip())


def _token_overlap(a: str, b: str) -> float:
    """Jaccard similarity on word tokens."""
    ta = set(re.findall(r"\b\w+\b", _normalize(a)))
    tb = set(re.findall(r"\b\w+\b", _normalize(b)))
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _detect_contradiction(a: str, b: str) -> bool:
    """Heuristic: high token overlap + opposing negation polarity."""
    na = _normalize(a)
    nb = _normalize(b)
    neg_pattern = r"\b(not|no|never|don't|doesn't|isn't|aren't|cannot|can't|won't|wouldn't)\b"
    neg_a = bool(re.search(neg_pattern, na))
    neg_b = bool(re.search(neg_pattern, nb))
    # Strip negations before measuring topic overlap
    stripped_a = re.sub(neg_pattern, "", na)
    stripped_b = re.sub(neg_pattern, "", nb)
    overlap = _token_overlap(stripped_a, stripped_b)
    return overlap > 0.50 and (neg_a != neg_b)


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class MemoryItem:
    """Input for adding a single memory entry."""

    content: str
    session_id: str = ""
    tenant_id: str = ""
    content_type: str = "fact"
    source: str = ""
    confidence: float = 1.0
    importance: float = 0.5
    tags: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class MemoryRecord:
    """Stored memory item row."""

    item_id: str
    session_id: str
    tenant_id: str
    content: str
    content_type: str
    source: str
    confidence: float
    importance: float
    tags: list[str]
    metadata: dict[str, Any]
    consolidated: bool
    consolidation_id: str | None
    created_at: str
    updated_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "item_id": self.item_id,
            "session_id": self.session_id,
            "tenant_id": self.tenant_id,
            "content": self.content,
            "content_type": self.content_type,
            "source": self.source,
            "confidence": self.confidence,
            "importance": self.importance,
            "tags": self.tags,
            "metadata": self.metadata,
            "consolidated": self.consolidated,
            "consolidation_id": self.consolidation_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class ConsolidationResult:
    """Result of consolidating a batch of memory items."""

    consolidation_id: str
    session_id: str
    tenant_id: str
    summary: str
    facts: list[str]
    contradictions: list[dict[str, str]]
    source_item_ids: list[str]
    item_count: int
    confidence: float
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "consolidation_id": self.consolidation_id,
            "session_id": self.session_id,
            "tenant_id": self.tenant_id,
            "summary": self.summary,
            "facts": self.facts,
            "contradictions": self.contradictions,
            "source_item_ids": self.source_item_ids,
            "item_count": self.item_count,
            "confidence": round(self.confidence, 4),
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


# ---------------------------------------------------------------------------
# Core engine
# ---------------------------------------------------------------------------


class MemoryConsolidationEngine:
    """Merge redundant memory items, detect contradictions, produce compact facts."""

    DUPLICATE_THRESHOLD = 0.70    # Jaccard ≥ 0.70 → treat as duplicate
    CONTRADICTION_THRESHOLD = 0.50  # used internally by _detect_contradiction

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
    # Item CRUD
    # ------------------------------------------------------------------

    def add_item(self, item: MemoryItem) -> MemoryRecord:
        """Store a single memory item (idempotent on content+session)."""
        item_id = _make_item_id(item.content, item.session_id)
        now = _utc_now()
        self._conn.execute(
            """
            INSERT OR IGNORE INTO memory_items
                (item_id, session_id, tenant_id, content, content_type, source,
                 confidence, importance, tags, metadata_json,
                 consolidated, consolidation_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
            """,
            (
                item_id,
                item.session_id,
                item.tenant_id,
                item.content,
                item.content_type,
                item.source,
                item.confidence,
                item.importance,
                json.dumps(item.tags),
                json.dumps(item.metadata),
                now,
                now,
            ),
        )
        self._conn.commit()
        return self.get_item(item_id)  # type: ignore[return-value]

    def get_item(self, item_id: str) -> MemoryRecord | None:
        row = self._conn.execute(
            "SELECT * FROM memory_items WHERE item_id=?", (item_id,)
        ).fetchone()
        return self._row_to_record(row) if row else None

    def list_items(
        self,
        session_id: str | None = None,
        tenant_id: str | None = None,
        content_type: str | None = None,
        consolidated: bool | None = None,
        limit: int = 200,
    ) -> list[MemoryRecord]:
        q = "SELECT * FROM memory_items WHERE 1=1"
        params: list[Any] = []
        if session_id is not None:
            q += " AND session_id=?"
            params.append(session_id)
        if tenant_id is not None:
            q += " AND tenant_id=?"
            params.append(tenant_id)
        if content_type is not None:
            q += " AND content_type=?"
            params.append(content_type)
        if consolidated is not None:
            q += " AND consolidated=?"
            params.append(1 if consolidated else 0)
        q += " ORDER BY importance DESC, created_at DESC LIMIT ?"
        params.append(limit)
        rows = self._conn.execute(q, params).fetchall()
        return [self._row_to_record(r) for r in rows]

    def delete_item(self, item_id: str) -> bool:
        cur = self._conn.execute(
            "DELETE FROM memory_items WHERE item_id=?", (item_id,)
        )
        self._conn.commit()
        return cur.rowcount > 0

    # ------------------------------------------------------------------
    # Consolidation
    # ------------------------------------------------------------------

    def consolidate(
        self,
        session_id: str = "",
        tenant_id: str = "",
        content_type: str | None = None,
        min_items: int = 2,
    ) -> ConsolidationResult:
        """Consolidate unconsolidated memory items: merge duplicates, flag contradictions."""
        items = self.list_items(
            session_id=session_id,
            tenant_id=tenant_id,
            content_type=content_type,
            consolidated=False,
        )
        ts = _utc_now()
        cid = _make_consolidation_id(session_id, ts)

        if len(items) < min_items:
            return ConsolidationResult(
                consolidation_id=cid,
                session_id=session_id,
                tenant_id=tenant_id,
                summary=(
                    f"Insufficient items for consolidation "
                    f"(need ≥ {min_items}, got {len(items)})"
                ),
                facts=[],
                contradictions=[],
                source_item_ids=[],
                item_count=0,
                confidence=0.0,
                metadata={},
                created_at=ts,
            )

        # Greedy duplicate grouping
        groups: list[list[MemoryRecord]] = []
        used: set[int] = set()
        for i, item in enumerate(items):
            if i in used:
                continue
            group = [item]
            used.add(i)
            for j, other in enumerate(items):
                if j <= i or j in used:
                    continue
                if _token_overlap(item.content, other.content) >= self.DUPLICATE_THRESHOLD:
                    group.append(other)
                    used.add(j)
            groups.append(group)

        # Contradiction detection across all pairs
        contradictions: list[dict[str, str]] = []
        for i, item_a in enumerate(items):
            for j, item_b in enumerate(items):
                if j <= i:
                    continue
                if _detect_contradiction(item_a.content, item_b.content):
                    contradictions.append({
                        "item_a_id": item_a.item_id,
                        "item_a": item_a.content[:200],
                        "item_b_id": item_b.item_id,
                        "item_b": item_b.content[:200],
                        "type": "negation_conflict",
                    })

        # Build compact facts — one per group, highest confidence*importance wins
        facts: list[str] = []
        for group in groups:
            best = max(group, key=lambda r: r.confidence * r.importance)
            if len(group) == 1:
                facts.append(best.content)
            else:
                facts.append(
                    f"{best.content} [merged from {len(group)} similar items]"
                )

        parts = [f"Consolidated {len(items)} items into {len(facts)} facts."]
        if contradictions:
            parts.append(f"Detected {len(contradictions)} contradiction(s).")
        merged_count = len(items) - len(facts)
        if merged_count > 0:
            parts.append(f"Merged {merged_count} duplicate(s).")
        summary = " ".join(parts)

        avg_confidence = sum(r.confidence for r in items) / len(items)
        source_ids = [item.item_id for item in items]

        self._conn.execute(
            """
            INSERT OR REPLACE INTO consolidations
                (consolidation_id, session_id, tenant_id, summary, facts,
                 contradictions, source_item_ids, item_count, confidence,
                 metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)
            """,
            (
                cid,
                session_id,
                tenant_id,
                summary,
                json.dumps(facts),
                json.dumps(contradictions),
                json.dumps(source_ids),
                len(items),
                avg_confidence,
                ts,
            ),
        )
        for item in items:
            self._conn.execute(
                """
                UPDATE memory_items
                SET consolidated=1, consolidation_id=?, updated_at=?
                WHERE item_id=?
                """,
                (cid, ts, item.item_id),
            )
        self._conn.commit()

        log.info(
            "memory_consolidated",
            session_id=session_id,
            items=len(items),
            facts=len(facts),
            contradictions=len(contradictions),
        )

        return ConsolidationResult(
            consolidation_id=cid,
            session_id=session_id,
            tenant_id=tenant_id,
            summary=summary,
            facts=facts,
            contradictions=contradictions,
            source_item_ids=source_ids,
            item_count=len(items),
            confidence=avg_confidence,
            metadata={},
            created_at=ts,
        )

    def get_consolidation(self, consolidation_id: str) -> ConsolidationResult | None:
        row = self._conn.execute(
            "SELECT * FROM consolidations WHERE consolidation_id=?",
            (consolidation_id,),
        ).fetchone()
        return self._row_to_consolidation(row) if row else None

    def list_consolidations(
        self,
        session_id: str | None = None,
        tenant_id: str | None = None,
        limit: int = 50,
    ) -> list[ConsolidationResult]:
        q = "SELECT * FROM consolidations WHERE 1=1"
        params: list[Any] = []
        if session_id is not None:
            q += " AND session_id=?"
            params.append(session_id)
        if tenant_id is not None:
            q += " AND tenant_id=?"
            params.append(tenant_id)
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        rows = self._conn.execute(q, params).fetchall()
        return [self._row_to_consolidation(r) for r in rows]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _row_to_record(self, row: sqlite3.Row) -> MemoryRecord:
        return MemoryRecord(
            item_id=row["item_id"],
            session_id=row["session_id"],
            tenant_id=row["tenant_id"],
            content=row["content"],
            content_type=row["content_type"],
            source=row["source"],
            confidence=row["confidence"],
            importance=row["importance"],
            tags=json.loads(row["tags"]),
            metadata=json.loads(row["metadata_json"]),
            consolidated=bool(row["consolidated"]),
            consolidation_id=row["consolidation_id"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _row_to_consolidation(self, row: sqlite3.Row) -> ConsolidationResult:
        return ConsolidationResult(
            consolidation_id=row["consolidation_id"],
            session_id=row["session_id"],
            tenant_id=row["tenant_id"],
            summary=row["summary"],
            facts=json.loads(row["facts"]),
            contradictions=json.loads(row["contradictions"]),
            source_item_ids=json.loads(row["source_item_ids"]),
            item_count=row["item_count"],
            confidence=row["confidence"],
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"],
        )


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_engine: MemoryConsolidationEngine | None = None


def get_memory_consolidation_engine(
    db_path: str | Path | None = None,
) -> MemoryConsolidationEngine:
    global _engine
    if _engine is None:
        _engine = MemoryConsolidationEngine(db_path=db_path)
    return _engine


__all__ = [
    "MemoryItem",
    "MemoryRecord",
    "ConsolidationResult",
    "MemoryConsolidationEngine",
    "get_memory_consolidation_engine",
]
