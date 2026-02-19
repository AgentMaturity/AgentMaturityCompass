"""AMC Context Pack Generator — Feature #31.

Build minimal, task-specific context bundles from docs, CRM records, tickets,
and other sources. Stores packs in SQLite for retrieval and caching.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_PACK_NAMESPACE = UUID("c3d4e5f6-a7b8-9012-cdef-123456789012")

_CONTEXT_SCHEMA = """
CREATE TABLE IF NOT EXISTS context_packs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id         TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    task_type       TEXT NOT NULL,
    task_ref        TEXT NOT NULL DEFAULT '',
    sources_json    TEXT NOT NULL DEFAULT '[]',
    snippets_json   TEXT NOT NULL DEFAULT '[]',
    token_budget    INTEGER NOT NULL DEFAULT 2000,
    token_estimate  INTEGER NOT NULL DEFAULT 0,
    priority_fields TEXT NOT NULL DEFAULT '[]',
    summary         TEXT NOT NULL DEFAULT '',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    expires_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_pack_tenant       ON context_packs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pack_task_type    ON context_packs(tenant_id, task_type);
CREATE INDEX IF NOT EXISTS idx_pack_task_ref     ON context_packs(tenant_id, task_ref);
"""

_SOURCE_TYPES = {"doc", "crm", "ticket", "email", "note", "invoice", "custom"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_pack_id(tenant_id: str, task_type: str, task_ref: str, ts: str) -> str:
    return str(uuid5(_PACK_NAMESPACE, f"{tenant_id}:{task_type}:{task_ref}:{ts}"))


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token."""
    return max(1, len(text) // 4)


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------

@dataclass
class ContextSource:
    """A single source document contributing to the pack."""
    source_type: str   # doc, crm, ticket, email, note, invoice, custom
    source_id: str
    title: str
    content: str
    relevance_score: float = 1.0
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "source_type": self.source_type,
            "source_id": self.source_id,
            "title": self.title,
            "content": self.content,
            "relevance_score": self.relevance_score,
            "metadata": self.metadata,
        }


@dataclass
class ContextSnippet:
    """A trimmed snippet extracted from a source."""
    source_id: str
    source_type: str
    title: str
    text: str
    token_estimate: int
    relevance_score: float

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "source_id": self.source_id,
            "source_type": self.source_type,
            "title": self.title,
            "text": self.text,
            "token_estimate": self.token_estimate,
            "relevance_score": self.relevance_score,
        }


@dataclass
class ContextPackInput:
    """Input for building a context pack."""
    tenant_id: str
    task_type: str          # e.g. "proposal", "invoice_review", "support_reply"
    task_ref: str = ""      # e.g. deal ID, ticket ID
    sources: list[ContextSource] = field(default_factory=list)
    token_budget: int = 2000
    priority_fields: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ContextPackRecord:
    """Stored context pack."""
    pack_id: str
    tenant_id: str
    task_type: str
    task_ref: str
    sources: list[dict[str, Any]]
    snippets: list[dict[str, Any]]
    token_budget: int
    token_estimate: int
    priority_fields: list[str]
    summary: str
    metadata: dict[str, Any]
    created_at: str
    expires_at: str | None

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "pack_id": self.pack_id,
            "tenant_id": self.tenant_id,
            "task_type": self.task_type,
            "task_ref": self.task_ref,
            "sources": self.sources,
            "snippets": self.snippets,
            "token_budget": self.token_budget,
            "token_estimate": self.token_estimate,
            "priority_fields": self.priority_fields,
            "summary": self.summary,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "expires_at": self.expires_at,
        }


# ---------------------------------------------------------------------------
# Core generator
# ---------------------------------------------------------------------------

class ContextPackGenerator:
    """Build and store minimal task-specific context packs."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db = Path(db_path) if db_path else product_db_path()
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self) -> None:
        with self._conn() as conn:
            conn.executescript(_CONTEXT_SCHEMA)

    # ------------------------------------------------------------------
    # Build
    # ------------------------------------------------------------------

    def build(self, inp: ContextPackInput) -> ContextPackRecord:
        """Build a minimal context pack from the provided sources."""
        snippets = self._select_snippets(inp)
        total_tokens = sum(s.token_estimate for s in snippets)
        summary = self._generate_summary(inp.task_type, snippets)

        now = _utc_now()
        pack_id = _make_pack_id(inp.tenant_id, inp.task_type, inp.task_ref, now)

        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO context_packs
                    (pack_id, tenant_id, task_type, task_ref, sources_json, snippets_json,
                     token_budget, token_estimate, priority_fields, summary, metadata_json,
                     created_at, expires_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    pack_id,
                    inp.tenant_id,
                    inp.task_type,
                    inp.task_ref,
                    json.dumps([s.dict for s in inp.sources]),
                    json.dumps([s.dict for s in snippets]),
                    inp.token_budget,
                    total_tokens,
                    json.dumps(inp.priority_fields),
                    summary,
                    json.dumps(inp.metadata),
                    now,
                    None,
                ),
            )

        log.info(
            "context_pack.built",
            pack_id=pack_id,
            tenant=inp.tenant_id,
            task_type=inp.task_type,
            snippets=len(snippets),
            tokens=total_tokens,
        )
        return self.get(pack_id)  # type: ignore[return-value]

    def get(self, pack_id: str) -> ContextPackRecord | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM context_packs WHERE pack_id=?", (pack_id,)
            ).fetchone()
        return _row_to_pack(row) if row else None

    def list_packs(
        self,
        tenant_id: str,
        task_type: str | None = None,
        task_ref: str | None = None,
        limit: int = 50,
    ) -> list[ContextPackRecord]:
        sql = "SELECT * FROM context_packs WHERE tenant_id=?"
        params: list[Any] = [tenant_id]
        if task_type:
            sql += " AND task_type=?"
            params.append(task_type)
        if task_ref:
            sql += " AND task_ref=?"
            params.append(task_ref)
        sql += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [_row_to_pack(r) for r in rows]

    def delete(self, pack_id: str) -> bool:
        with self._conn() as conn:
            cur = conn.execute("DELETE FROM context_packs WHERE pack_id=?", (pack_id,))
        return cur.rowcount > 0

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _select_snippets(self, inp: ContextPackInput) -> list[ContextSnippet]:
        """Select snippets greedily up to token_budget."""
        candidates: list[ContextSnippet] = []
        keywords_lower = [k.lower() for k in inp.keywords]

        for src in inp.sources:
            if src.source_type not in _SOURCE_TYPES:
                src = ContextSource(
                    source_type="custom",
                    source_id=src.source_id,
                    title=src.title,
                    content=src.content,
                    relevance_score=src.relevance_score,
                    metadata=src.metadata,
                )
            content = src.content.strip()
            if not content:
                continue

            # Boost relevance if keywords present
            boost = 0.0
            if keywords_lower:
                content_lower = content.lower()
                hits = sum(1 for kw in keywords_lower if kw in content_lower)
                boost = hits / len(keywords_lower)

            # Extract most relevant paragraph
            paragraphs = [p.strip() for p in re.split(r"\n\s*\n", content) if p.strip()]
            if not paragraphs:
                paragraphs = [content]

            best_para = max(
                paragraphs,
                key=lambda p: _score_para(p, keywords_lower),
                default=paragraphs[0],
            )

            # Trim to ~80% of budget if single source
            max_chars = max(200, inp.token_budget * 4 // max(1, len(inp.sources)))
            trimmed = best_para[:max_chars]

            tok_est = _estimate_tokens(trimmed)
            rel = min(1.0, src.relevance_score + boost)

            candidates.append(ContextSnippet(
                source_id=src.source_id,
                source_type=src.source_type,
                title=src.title,
                text=trimmed,
                token_estimate=tok_est,
                relevance_score=rel,
            ))

        # Sort by relevance desc, then greedily fill budget
        candidates.sort(key=lambda s: s.relevance_score, reverse=True)
        selected: list[ContextSnippet] = []
        used_tokens = 0
        for snip in candidates:
            if used_tokens + snip.token_estimate <= inp.token_budget:
                selected.append(snip)
                used_tokens += snip.token_estimate

        return selected

    def _generate_summary(
        self, task_type: str, snippets: list[ContextSnippet]
    ) -> str:
        if not snippets:
            return f"Empty context pack for task type '{task_type}'."
        source_types = sorted({s.source_type for s in snippets})
        total_tokens = sum(s.token_estimate for s in snippets)
        return (
            f"Context pack for task '{task_type}' with {len(snippets)} snippet(s) "
            f"from {', '.join(source_types)} sources (~{total_tokens} tokens)."
        )


def _score_para(para: str, keywords: list[str]) -> float:
    if not keywords:
        return len(para)
    para_lower = para.lower()
    hits = sum(1 for kw in keywords if kw in para_lower)
    return hits * 100 + len(para)


def _row_to_pack(row: sqlite3.Row) -> ContextPackRecord:
    return ContextPackRecord(
        pack_id=row["pack_id"],
        tenant_id=row["tenant_id"],
        task_type=row["task_type"],
        task_ref=row["task_ref"],
        sources=json.loads(row["sources_json"]),
        snippets=json.loads(row["snippets_json"]),
        token_budget=row["token_budget"],
        token_estimate=row["token_estimate"],
        priority_fields=json.loads(row["priority_fields"]),
        summary=row["summary"],
        metadata=json.loads(row["metadata_json"]),
        created_at=row["created_at"],
        expires_at=row["expires_at"],
    )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_generator: ContextPackGenerator | None = None


def get_context_pack_generator(db_path: str | Path | None = None) -> ContextPackGenerator:
    global _generator
    if _generator is None:
        _generator = ContextPackGenerator(db_path=db_path)
    return _generator
