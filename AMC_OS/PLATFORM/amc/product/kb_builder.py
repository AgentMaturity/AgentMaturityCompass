"""
kb_builder.py — Ticket/email → searchable Knowledge Base
Parse support history into structured FAQ/snippets/answers.
"""
from __future__ import annotations

import json
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.product.persistence import product_db_path

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class TicketInput(BaseModel):
    ticket_id: str = ""
    subject: str
    body: str
    resolution: str = ""
    tags: list[str] = Field(default_factory=list)
    source: str = "ticket"  # ticket | email | chat | manual
    metadata: dict[str, Any] = Field(default_factory=dict)


class KBEntry(BaseModel):
    entry_id: str
    question: str
    answer: str
    snippet: str  # short 1-2 sentence summary
    tags: list[str]
    source_tickets: list[str]  # ticket_ids that contributed
    category: str
    confidence: float  # 0.0-1.0
    view_count: int
    helpful_votes: int
    created_at: str
    updated_at: str
    metadata: dict[str, Any]


class IngestTicketResult(BaseModel):
    entry: KBEntry
    is_new: bool  # was this a new KB entry or updated existing?
    merged_with: str  # entry_id of existing entry if merged
    duration_ms: int


class KBSearchRequest(BaseModel):
    query: str
    tags: list[str] = Field(default_factory=list)
    category: str = ""
    limit: int = 10
    min_confidence: float = 0.0


class KBSearchResult(BaseModel):
    entries: list[KBEntry]
    total_found: int
    query: str
    duration_ms: int


class FAQSection(BaseModel):
    category: str
    entries: list[KBEntry]


class FAQResult(BaseModel):
    sections: list[FAQSection]
    total_entries: int
    generated_at: str


# ---------------------------------------------------------------------------
# Category keyword map
# ---------------------------------------------------------------------------

_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "billing": [
        "billing", "invoice", "payment", "charge", "refund", "subscription",
        "plan", "pricing", "cost", "fee", "credit", "receipt", "tax",
    ],
    "api": [
        "api", "endpoint", "request", "response", "rest", "graphql", "webhook",
        "rate limit", "token", "key", "sdk", "integration", "oauth",
    ],
    "auth": [
        "auth", "login", "logout", "password", "sso", "saml", "mfa", "2fa",
        "session", "permission", "role", "access", "unauthorized", "forbidden",
    ],
    "onboarding": [
        "onboarding", "setup", "install", "getting started", "quickstart",
        "welcome", "signup", "register", "first time", "tutorial", "guide",
    ],
}

_DEFAULT_CATEGORY = "general"


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------

class KBBuilder:
    """Parse support tickets/emails into a searchable knowledge base."""

    def __init__(self, db_path: str | None = None) -> None:
        self._db_path = db_path or str(product_db_path("kb_builder.db"))
        self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_db()
        logger.info("KBBuilder initialised", db_path=self._db_path)

    # ------------------------------------------------------------------
    # Schema
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS kb_entries (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                entry_id             TEXT NOT NULL UNIQUE,
                question             TEXT NOT NULL,
                answer               TEXT NOT NULL,
                snippet              TEXT NOT NULL,
                tags_json            TEXT NOT NULL DEFAULT '[]',
                source_tickets_json  TEXT NOT NULL DEFAULT '[]',
                category             TEXT NOT NULL DEFAULT 'general',
                confidence           REAL NOT NULL DEFAULT 0.0,
                view_count           INTEGER NOT NULL DEFAULT 0,
                helpful_votes        INTEGER NOT NULL DEFAULT 0,
                metadata_json        TEXT NOT NULL DEFAULT '{}',
                created_at           TEXT NOT NULL,
                updated_at           TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_kb_category ON kb_entries(category);
            CREATE INDEX IF NOT EXISTS idx_kb_confidence ON kb_entries(confidence);
            """
        )
        self._conn.commit()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_question(subject: str, body: str) -> str:
        subject = subject.strip()
        if subject:
            # Normalise to a question if it doesn't already end with "?"
            q = subject if subject.endswith("?") else subject.rstrip(".") + "?"
            return q
        # Fall back to first sentence of body
        body = body.strip()
        for sep in (".", "!", "?", "\n"):
            idx = body.find(sep)
            if idx > 10:
                return body[: idx + 1].strip()
        return body[:200].strip()

    @staticmethod
    def _extract_answer(resolution: str, body: str) -> str:
        resolution = resolution.strip()
        if resolution:
            return resolution
        # Last non-empty paragraph of body
        paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
        if len(paragraphs) > 1:
            return paragraphs[-1]
        # Fall back to full body
        return body.strip()

    @staticmethod
    def _extract_snippet(answer: str) -> str:
        answer = answer.strip()
        if len(answer) <= 150:
            return answer
        return answer[:150] + "..."

    @staticmethod
    def _infer_category(tags: list[str], text: str) -> str:
        combined = " ".join(tags).lower() + " " + text.lower()
        for category, keywords in _CATEGORY_KEYWORDS.items():
            for kw in keywords:
                if kw in combined:
                    return category
        return _DEFAULT_CATEGORY

    @staticmethod
    def _compute_confidence(ticket: TicketInput) -> float:
        if ticket.resolution.strip():
            return 0.9
        if ticket.body.strip():
            return 0.6
        return 0.3

    def _find_similar(self, question: str) -> KBEntry | None:
        """Word-overlap similarity: >50% overlap triggers a merge."""
        q_words = set(question.lower().split())
        if len(q_words) < 3:
            return None

        cur = self._conn.execute(
            "SELECT * FROM kb_entries ORDER BY updated_at DESC LIMIT 500"
        )
        rows = cur.fetchall()
        for row in rows:
            existing_words = set(row["question"].lower().split())
            if not existing_words:
                continue
            overlap = len(q_words & existing_words)
            union = len(q_words | existing_words)
            if union > 0 and (overlap / union) > 0.50:
                return self._row_to_entry(row)
        return None

    @staticmethod
    def _row_to_entry(row: sqlite3.Row) -> KBEntry:
        return KBEntry(
            entry_id=row["entry_id"],
            question=row["question"],
            answer=row["answer"],
            snippet=row["snippet"],
            tags=json.loads(row["tags_json"]),
            source_tickets=json.loads(row["source_tickets_json"]),
            category=row["category"],
            confidence=row["confidence"],
            view_count=row["view_count"],
            helpful_votes=row["helpful_votes"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            metadata=json.loads(row["metadata_json"]),
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def ingest_ticket(self, ticket: TicketInput) -> IngestTicketResult:
        """Parse a support ticket and upsert it into the KB."""
        t0 = time.monotonic()
        now = datetime.now(timezone.utc).isoformat()

        question = self._extract_question(ticket.subject, ticket.body)
        answer = self._extract_answer(ticket.resolution, ticket.body)
        snippet = self._extract_snippet(answer)
        confidence = self._compute_confidence(ticket)
        category = self._infer_category(ticket.tags, question + " " + answer)

        existing = self._find_similar(question)
        is_new = existing is None
        merged_with = ""

        if existing:
            # Merge: update answer + source tickets + confidence (take max)
            merged_with = existing.entry_id
            source_tickets = list(
                dict.fromkeys(existing.source_tickets + ([ticket.ticket_id] if ticket.ticket_id else []))
            )
            merged_tags = list(dict.fromkeys(existing.tags + ticket.tags))
            new_confidence = max(existing.confidence, confidence)
            self._conn.execute(
                """
                UPDATE kb_entries
                   SET answer               = ?,
                       snippet              = ?,
                       tags_json            = ?,
                       source_tickets_json  = ?,
                       confidence           = ?,
                       view_count           = view_count + 1,
                       updated_at           = ?
                 WHERE entry_id = ?
                """,
                (
                    answer,
                    snippet,
                    json.dumps(merged_tags),
                    json.dumps(source_tickets),
                    new_confidence,
                    now,
                    existing.entry_id,
                ),
            )
            self._conn.commit()
            entry = self.get_entry(existing.entry_id)
        else:
            entry_id = str(uuid.uuid4())
            source_tickets = [ticket.ticket_id] if ticket.ticket_id else []
            self._conn.execute(
                """
                INSERT INTO kb_entries
                    (entry_id, question, answer, snippet, tags_json,
                     source_tickets_json, category, confidence, view_count,
                     helpful_votes, metadata_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
                """,
                (
                    entry_id,
                    question,
                    answer,
                    snippet,
                    json.dumps(ticket.tags),
                    json.dumps(source_tickets),
                    category,
                    confidence,
                    json.dumps(ticket.metadata),
                    now,
                    now,
                ),
            )
            self._conn.commit()
            entry = self.get_entry(entry_id)

        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.info(
            "ticket ingested",
            ticket_id=ticket.ticket_id,
            is_new=is_new,
            merged_with=merged_with,
            duration_ms=duration_ms,
        )
        return IngestTicketResult(
            entry=entry,  # type: ignore[arg-type]
            is_new=is_new,
            merged_with=merged_with,
            duration_ms=duration_ms,
        )

    def search(self, request: KBSearchRequest) -> KBSearchResult:
        """Full-text LIKE search over question + answer + tags."""
        t0 = time.monotonic()
        like = f"%{request.query}%"

        conditions = [
            "(question LIKE ? OR answer LIKE ? OR tags_json LIKE ?)",
            "confidence >= ?",
        ]
        params: list[Any] = [like, like, like, request.min_confidence]

        if request.category:
            conditions.append("category = ?")
            params.append(request.category)

        if request.tags:
            tag_conditions = " AND ".join(["tags_json LIKE ?" for _ in request.tags])
            conditions.append(f"({tag_conditions})")
            for tag in request.tags:
                params.append(f'%"{tag}"%')

        where = " AND ".join(conditions)
        sql = f"SELECT * FROM kb_entries WHERE {where} ORDER BY confidence DESC, helpful_votes DESC LIMIT ?"
        params.append(request.limit)

        rows = self._conn.execute(sql, params).fetchall()
        entries = [self._row_to_entry(r) for r in rows]

        # Count total (without LIMIT)
        count_sql = f"SELECT COUNT(*) FROM kb_entries WHERE {where}"
        total = self._conn.execute(count_sql, params[:-1]).fetchone()[0]

        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.debug("kb search", query=request.query, total=total, duration_ms=duration_ms)
        return KBSearchResult(
            entries=entries,
            total_found=total,
            query=request.query,
            duration_ms=duration_ms,
        )

    def get_faq(self, categories: list[str] | None = None) -> FAQResult:
        """Group KB entries by category into FAQ sections."""
        if categories:
            placeholders = ",".join(["?" for _ in categories])
            rows = self._conn.execute(
                f"SELECT * FROM kb_entries WHERE category IN ({placeholders}) ORDER BY category, helpful_votes DESC",
                categories,
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT * FROM kb_entries ORDER BY category, helpful_votes DESC"
            ).fetchall()

        sections: dict[str, list[KBEntry]] = {}
        for row in rows:
            entry = self._row_to_entry(row)
            sections.setdefault(entry.category, []).append(entry)

        faq_sections = [
            FAQSection(category=cat, entries=entries)
            for cat, entries in sorted(sections.items())
        ]
        return FAQResult(
            sections=faq_sections,
            total_entries=len(rows),
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    def vote(self, entry_id: str, helpful: bool) -> bool:
        """Record a helpfulness vote for a KB entry."""
        col = "helpful_votes" if helpful else "view_count"
        cur = self._conn.execute(
            f"UPDATE kb_entries SET {col} = {col} + 1, updated_at = ? WHERE entry_id = ?",
            (datetime.now(timezone.utc).isoformat(), entry_id),
        )
        self._conn.commit()
        ok = cur.rowcount > 0
        logger.info("kb vote", entry_id=entry_id, helpful=helpful, ok=ok)
        return ok

    def get_entry(self, entry_id: str) -> KBEntry | None:
        row = self._conn.execute(
            "SELECT * FROM kb_entries WHERE entry_id = ?", (entry_id,)
        ).fetchone()
        if row is None:
            return None
        return self._row_to_entry(row)

    def list_entries(self, limit: int = 50, offset: int = 0) -> list[KBEntry]:
        rows = self._conn.execute(
            "SELECT * FROM kb_entries ORDER BY updated_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        return [self._row_to_entry(r) for r in rows]


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_instance: KBBuilder | None = None


def get_kb_builder() -> KBBuilder:
    global _instance
    if _instance is None:
        _instance = KBBuilder()
    return _instance


# ---------------------------------------------------------------------------
# Module exports
# ---------------------------------------------------------------------------

__all__ = [
    "TicketInput",
    "KBEntry",
    "IngestTicketResult",
    "KBSearchRequest",
    "KBSearchResult",
    "FAQSection",
    "FAQResult",
    "KBBuilder",
    "get_kb_builder",
]
