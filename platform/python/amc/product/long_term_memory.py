"""Long-Term Memory Store — persistent cross-session memory with TTL + tagging.

Provides durable, retrievable memory entries with tenant isolation, tag-based
filtering, TTL eviction, and importance-ranked retrieval.  SQLite-backed.

API: /api/v1/product/memory/long-term/*
"""
from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS lt_memories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id       TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL DEFAULT '',
    session_id      TEXT NOT NULL DEFAULT '',
    key             TEXT NOT NULL DEFAULT '',
    content         TEXT NOT NULL,
    content_type    TEXT NOT NULL DEFAULT 'fact',
    importance      REAL NOT NULL DEFAULT 0.5,
    confidence      REAL NOT NULL DEFAULT 1.0,
    tags            TEXT NOT NULL DEFAULT '[]',
    source          TEXT NOT NULL DEFAULT '',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    access_count    INTEGER NOT NULL DEFAULT 0,
    last_accessed   TEXT,
    expires_at      TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ltm_tenant   ON lt_memories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ltm_session  ON lt_memories(session_id);
CREATE INDEX IF NOT EXISTS idx_ltm_key      ON lt_memories(key);
CREATE INDEX IF NOT EXISTS idx_ltm_expires  ON lt_memories(expires_at);
CREATE INDEX IF NOT EXISTS idx_ltm_type     ON lt_memories(content_type);
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _expires_at(ttl_seconds: int | None) -> str | None:
    if ttl_seconds is None or ttl_seconds <= 0:
        return None
    return (datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)).isoformat()


def _is_expired(expires_at: str | None) -> bool:
    if expires_at is None:
        return False
    return datetime.fromisoformat(expires_at) < datetime.now(timezone.utc)


def _token_overlap(a: str, b: str) -> float:
    """Simple Jaccard similarity for keyword matching."""
    ta = set(re.findall(r"\b\w+\b", a.lower()))
    tb = set(re.findall(r"\b\w+\b", b.lower()))
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class MemoryEntry:
    """Input for storing a memory."""

    content: str
    tenant_id: str = ""
    session_id: str = ""
    key: str = ""
    content_type: str = "fact"
    importance: float = 0.5
    confidence: float = 1.0
    tags: list[str] = field(default_factory=list)
    source: str = ""
    ttl_seconds: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class MemoryRecord:
    """A stored long-term memory record."""

    memory_id: str
    tenant_id: str
    session_id: str
    key: str
    content: str
    content_type: str
    importance: float
    confidence: float
    tags: list[str]
    source: str
    metadata: dict[str, Any]
    access_count: int
    last_accessed: str | None
    expires_at: str | None
    created_at: str
    updated_at: str

    @property
    def is_expired(self) -> bool:
        return _is_expired(self.expires_at)

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "memory_id": self.memory_id,
            "tenant_id": self.tenant_id,
            "session_id": self.session_id,
            "key": self.key,
            "content": self.content,
            "content_type": self.content_type,
            "importance": self.importance,
            "confidence": self.confidence,
            "tags": self.tags,
            "source": self.source,
            "metadata": self.metadata,
            "access_count": self.access_count,
            "last_accessed": self.last_accessed,
            "expires_at": self.expires_at,
            "is_expired": self.is_expired,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class RetrievalResult:
    """Query result for memory retrieval."""

    query: str
    tenant_id: str
    matches: list[MemoryRecord]
    total_found: int

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "query": self.query,
            "tenant_id": self.tenant_id,
            "matches": [m.dict for m in self.matches],
            "total_found": self.total_found,
        }


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------


class LongTermMemoryStore:
    """Persistent cross-session memory with TTL, tagging, and ranked retrieval."""

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
    # CRUD
    # ------------------------------------------------------------------

    def store(self, entry: MemoryEntry) -> MemoryRecord:
        """Store or update a memory entry.  Keyed by (tenant_id, key) if key given."""
        memory_id = str(uuid4())
        now = _utc_now()
        exp = _expires_at(entry.ttl_seconds)

        # Upsert by (tenant_id, key) if key is present
        if entry.key:
            existing = self._find_by_key(entry.tenant_id, entry.key)
            if existing:
                self._conn.execute(
                    """
                    UPDATE lt_memories SET
                        content=?, content_type=?, importance=?, confidence=?,
                        tags=?, source=?, metadata_json=?, expires_at=?, updated_at=?
                    WHERE memory_id=?
                    """,
                    (
                        entry.content, entry.content_type, entry.importance,
                        entry.confidence, json.dumps(entry.tags), entry.source,
                        json.dumps(entry.metadata), exp, now, existing.memory_id,
                    ),
                )
                self._conn.commit()
                return self.get(existing.memory_id)  # type: ignore[return-value]

        self._conn.execute(
            """
            INSERT INTO lt_memories
                (memory_id, tenant_id, session_id, key, content, content_type,
                 importance, confidence, tags, source, metadata_json,
                 access_count, last_accessed, expires_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)
            """,
            (
                memory_id, entry.tenant_id, entry.session_id, entry.key,
                entry.content, entry.content_type, entry.importance,
                entry.confidence, json.dumps(entry.tags), entry.source,
                json.dumps(entry.metadata), exp, now, now,
            ),
        )
        self._conn.commit()
        log.debug("lt_memory_stored", memory_id=memory_id, tenant_id=entry.tenant_id)
        return self.get(memory_id)  # type: ignore[return-value]

    def get(self, memory_id: str) -> MemoryRecord | None:
        row = self._conn.execute(
            "SELECT * FROM lt_memories WHERE memory_id=?", (memory_id,)
        ).fetchone()
        if not row:
            return None
        record = self._row_to_record(row)
        if record.is_expired:
            return None
        # Update access count
        self._conn.execute(
            "UPDATE lt_memories SET access_count=access_count+1, last_accessed=? WHERE memory_id=?",
            (_utc_now(), memory_id),
        )
        self._conn.commit()
        return record

    def _find_by_key(self, tenant_id: str, key: str) -> MemoryRecord | None:
        row = self._conn.execute(
            "SELECT * FROM lt_memories WHERE tenant_id=? AND key=? ORDER BY created_at DESC LIMIT 1",
            (tenant_id, key),
        ).fetchone()
        return self._row_to_record(row) if row else None

    def list(
        self,
        tenant_id: str,
        session_id: str | None = None,
        content_type: str | None = None,
        tags: list[str] | None = None,
        include_expired: bool = False,
        limit: int = 100,
        min_importance: float = 0.0,
    ) -> list[MemoryRecord]:
        q = "SELECT * FROM lt_memories WHERE tenant_id=?"
        params: list[Any] = [tenant_id]
        if session_id:
            q += " AND session_id=?"
            params.append(session_id)
        if content_type:
            q += " AND content_type=?"
            params.append(content_type)
        if min_importance > 0.0:
            q += " AND importance>=?"
            params.append(min_importance)
        if not include_expired:
            q += " AND (expires_at IS NULL OR expires_at > ?)"
            params.append(_utc_now())
        q += " ORDER BY importance DESC, access_count DESC, created_at DESC LIMIT ?"
        params.append(limit)
        rows = self._conn.execute(q, params).fetchall()
        records = [self._row_to_record(r) for r in rows]
        # Filter by tags
        if tags:
            tag_set = {t.lower() for t in tags}
            records = [r for r in records if tag_set & {t.lower() for t in r.tags}]
        return records

    def retrieve(
        self,
        query: str,
        tenant_id: str,
        top_k: int = 5,
        content_type: str | None = None,
        tags: list[str] | None = None,
    ) -> RetrievalResult:
        """Keyword-based retrieval ranked by relevance × importance."""
        candidates = self.list(
            tenant_id=tenant_id,
            content_type=content_type,
            tags=tags,
            limit=500,
        )
        # Score by token overlap × importance × confidence
        scored = [
            (r, _token_overlap(query, r.content) * r.importance * r.confidence)
            for r in candidates
        ]
        scored.sort(key=lambda x: x[1], reverse=True)
        matches = [r for r, score in scored[:top_k] if score > 0.0]

        # If no matches by overlap, fallback to top by importance
        if not matches and candidates:
            matches = candidates[:top_k]

        log.debug(
            "lt_memory_retrieved",
            query=query[:50],
            tenant_id=tenant_id,
            matches=len(matches),
        )
        return RetrievalResult(
            query=query,
            tenant_id=tenant_id,
            matches=matches,
            total_found=len(matches),
        )

    def delete(self, memory_id: str) -> bool:
        cur = self._conn.execute(
            "DELETE FROM lt_memories WHERE memory_id=?", (memory_id,)
        )
        self._conn.commit()
        return cur.rowcount > 0

    def purge_expired(self) -> int:
        now = _utc_now()
        cur = self._conn.execute(
            "DELETE FROM lt_memories WHERE expires_at IS NOT NULL AND expires_at <= ?",
            (now,),
        )
        self._conn.commit()
        count = cur.rowcount
        if count:
            log.info("lt_memory_expired_purged", count=count)
        return count

    def stats(self, tenant_id: str) -> dict[str, Any]:
        row = self._conn.execute(
            """
            SELECT COUNT(*) as total,
                   AVG(importance) as avg_importance,
                   COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at <= ? THEN 1 END) as expired_count
            FROM lt_memories WHERE tenant_id=?
            """,
            (_utc_now(), tenant_id),
        ).fetchone()
        return {
            "tenant_id": tenant_id,
            "total_memories": row["total"] if row else 0,
            "avg_importance": round(row["avg_importance"] or 0, 4) if row else 0,
            "expired_count": row["expired_count"] if row else 0,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _row_to_record(self, row: sqlite3.Row) -> MemoryRecord:
        return MemoryRecord(
            memory_id=row["memory_id"],
            tenant_id=row["tenant_id"],
            session_id=row["session_id"],
            key=row["key"],
            content=row["content"],
            content_type=row["content_type"],
            importance=row["importance"],
            confidence=row["confidence"],
            tags=json.loads(row["tags"]),
            source=row["source"],
            metadata=json.loads(row["metadata_json"]),
            access_count=row["access_count"],
            last_accessed=row["last_accessed"],
            expires_at=row["expires_at"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_store: LongTermMemoryStore | None = None


def get_long_term_memory_store(db_path: str | Path | None = None) -> LongTermMemoryStore:
    global _store
    if _store is None:
        _store = LongTermMemoryStore(db_path=db_path)
    return _store


__all__ = [
    "MemoryEntry",
    "MemoryRecord",
    "RetrievalResult",
    "LongTermMemoryStore",
    "get_long_term_memory_store",
]
