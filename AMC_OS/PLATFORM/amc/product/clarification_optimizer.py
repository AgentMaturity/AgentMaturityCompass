"""Clarification Question Minimizer — Wave-2 Tool Intelligence.

Given a list of candidate clarification questions and available context,
selects the 1–3 highest-information questions so operators are interrupted
as rarely as possible.

Information-gain scoring uses:
  - Context coverage: questions whose answers are already in context score lower
  - Ambiguity coverage: overlapping questions are deduplicated
  - Scope diversity: prefer questions that cover different aspects
  - Criticality: questions about blockers/required fields score higher

SQLite-backed for audit and learning.
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

_SCHEMA = """
CREATE TABLE IF NOT EXISTS clarification_sessions (
    session_id      TEXT PRIMARY KEY,
    task_summary    TEXT NOT NULL DEFAULT '',
    context_json    TEXT NOT NULL DEFAULT '{}',
    candidate_count INTEGER NOT NULL DEFAULT 0,
    selected_json   TEXT NOT NULL DEFAULT '[]',
    skipped_json    TEXT NOT NULL DEFAULT '[]',
    tenant_id       TEXT NOT NULL DEFAULT '',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clarify_tenant ON clarification_sessions(tenant_id);

CREATE TABLE IF NOT EXISTS clarification_resolutions (
    resolution_id   TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL,
    question        TEXT NOT NULL,
    answer          TEXT NOT NULL DEFAULT '',
    resolved_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clarify_res_session ON clarification_resolutions(session_id);
"""

# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

_CRITICAL_WORDS = re.compile(
    r"\b(required|mandatory|must|critical|essential|deadline|budget|"
    r"who|what is|which|how many|when|where)\b",
    re.IGNORECASE,
)
_SCOPE_CATEGORIES = {
    "who": re.compile(r"\b(who|owner|responsible|team|person|agent)\b", re.IGNORECASE),
    "what": re.compile(r"\b(what|which|type|kind|format|schema)\b", re.IGNORECASE),
    "when": re.compile(r"\b(when|deadline|date|schedule|timeline|sla)\b", re.IGNORECASE),
    "how": re.compile(r"\b(how|method|approach|process|steps|way)\b", re.IGNORECASE),
    "constraint": re.compile(r"\b(limit|budget|max|min|constraint|require)\b", re.IGNORECASE),
}


def _context_coverage(question: str, context: dict[str, Any]) -> float:
    """Return fraction of question topic already covered by context [0,1]."""
    q_lower = question.lower()
    context_text = " ".join(str(v) for v in context.values()).lower()
    words = set(re.findall(r"\w{4,}", q_lower))
    if not words:
        return 0.0
    covered = sum(1 for w in words if w in context_text)
    return covered / len(words)


def _criticality_score(question: str) -> float:
    hits = len(_CRITICAL_WORDS.findall(question))
    return min(hits * 0.25, 1.0)


def _scope_category(question: str) -> str:
    for cat, pat in _SCOPE_CATEGORIES.items():
        if pat.search(question):
            return cat
    return "other"


def _question_score(
    question: str,
    context: dict[str, Any],
    used_scopes: set[str],
) -> float:
    """Composite information-gain score [0,1]."""
    coverage = _context_coverage(question, context)
    crit = _criticality_score(question)
    scope = _scope_category(question)
    novelty = 0.0 if scope in used_scopes else 0.3  # diversity bonus

    # Lower score if already answered by context
    base = (1.0 - coverage) * 0.5 + crit * 0.2 + novelty
    return round(min(base, 1.0), 4)


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class ClarificationQuestion:
    text: str
    score: float
    category: str
    reason: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "score": self.score,
            "category": self.category,
            "reason": self.reason,
        }


@dataclass
class ClarificationResult:
    session_id: str
    task_summary: str
    selected: list[ClarificationQuestion]
    skipped: list[str]
    tenant_id: str
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "task_summary": self.task_summary,
            "selected": [q.dict for q in self.selected],
            "skipped": self.skipped,
            "tenant_id": self.tenant_id,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


@dataclass
class ResolutionRecord:
    resolution_id: str
    session_id: str
    question: str
    answer: str
    resolved_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "resolution_id": self.resolution_id,
            "session_id": self.session_id,
            "question": self.question,
            "answer": self.answer,
            "resolved_at": self.resolved_at,
        }


# ---------------------------------------------------------------------------
# Core optimizer
# ---------------------------------------------------------------------------


class ClarificationOptimizer:
    """Select the minimal set of highest-information clarification questions."""

    MAX_QUESTIONS = 3

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(product_db_path(db_path))
        self._conn = self._init_db()

    def _init_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.executescript(_SCHEMA)
        conn.commit()
        return conn

    def optimize(
        self,
        candidates: list[str],
        context: dict[str, Any] | None = None,
        task_summary: str = "",
        max_questions: int | None = None,
        tenant_id: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> ClarificationResult:
        """Score and select the top N highest-information questions."""
        ctx = context or {}
        limit = max(1, min(max_questions or self.MAX_QUESTIONS, self.MAX_QUESTIONS))

        # Deduplicate
        seen_texts: set[str] = set()
        unique: list[str] = []
        for c in candidates:
            norm = c.strip().lower()
            if norm and norm not in seen_texts:
                seen_texts.add(norm)
                unique.append(c.strip())

        # Score
        used_scopes: set[str] = set()
        scored: list[ClarificationQuestion] = []
        for q in unique:
            sc = _question_score(q, ctx, used_scopes)
            cat = _scope_category(q)
            already_covered = _context_coverage(q, ctx) > 0.6
            reason = (
                "Already answerable from context — skip" if already_covered
                else f"Score={sc:.2f}; category={cat}"
            )
            scored.append(ClarificationQuestion(text=q, score=sc, category=cat, reason=reason))

        scored.sort(key=lambda x: x.score, reverse=True)

        # Greedy selection: pick top-k, enforcing scope diversity
        selected: list[ClarificationQuestion] = []
        skipped: list[str] = []
        used_scopes_selected: set[str] = set()

        for item in scored:
            if len(selected) >= limit:
                skipped.append(item.text)
                continue
            if _context_coverage(item.text, ctx) > 0.75:
                skipped.append(item.text)
                continue
            selected.append(item)
            used_scopes_selected.add(item.category)

        skipped += [item.text for item in scored[len(selected) + len(skipped):]]

        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        self._conn.execute(
            """INSERT INTO clarification_sessions
               (session_id,task_summary,context_json,candidate_count,
                selected_json,skipped_json,tenant_id,metadata_json,created_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                session_id, task_summary, json.dumps(ctx), len(candidates),
                json.dumps([q.dict for q in selected]),
                json.dumps(skipped),
                tenant_id, json.dumps(metadata or {}), now,
            ),
        )
        self._conn.commit()

        return ClarificationResult(
            session_id=session_id, task_summary=task_summary,
            selected=selected, skipped=skipped,
            tenant_id=tenant_id, metadata=metadata or {}, created_at=now,
        )

    def record_resolution(
        self, session_id: str, question: str, answer: str
    ) -> ResolutionRecord:
        """Record a user's answer to a clarification question."""
        resolution_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """INSERT INTO clarification_resolutions
               (resolution_id,session_id,question,answer,resolved_at)
               VALUES (?,?,?,?,?)""",
            (resolution_id, session_id, question, answer, now),
        )
        self._conn.commit()
        return ResolutionRecord(
            resolution_id=resolution_id, session_id=session_id,
            question=question, answer=answer, resolved_at=now,
        )

    def get_session(self, session_id: str) -> ClarificationResult | None:
        row = self._conn.execute(
            "SELECT * FROM clarification_sessions WHERE session_id=?", (session_id,)
        ).fetchone()
        if not row:
            return None
        selected_raw = json.loads(row["selected_json"])
        selected = [
            ClarificationQuestion(
                text=q["text"], score=q["score"],
                category=q["category"], reason=q["reason"],
            )
            for q in selected_raw
        ]
        return ClarificationResult(
            session_id=row["session_id"], task_summary=row["task_summary"],
            selected=selected, skipped=json.loads(row["skipped_json"]),
            tenant_id=row["tenant_id"], metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"],
        )

    def list_resolutions(self, session_id: str) -> list[ResolutionRecord]:
        rows = self._conn.execute(
            "SELECT * FROM clarification_resolutions WHERE session_id=? ORDER BY resolved_at",
            (session_id,),
        ).fetchall()
        return [
            ResolutionRecord(
                resolution_id=r["resolution_id"], session_id=r["session_id"],
                question=r["question"], answer=r["answer"], resolved_at=r["resolved_at"],
            )
            for r in rows
        ]

    def list_sessions(self, tenant_id: str | None = None, limit: int = 50) -> list[ClarificationResult]:
        q = "SELECT * FROM clarification_sessions WHERE 1=1"
        params: list[Any] = []
        if tenant_id:
            q += " AND tenant_id=?"; params.append(tenant_id)
        q += " ORDER BY created_at DESC LIMIT ?"; params.append(limit)
        rows = self._conn.execute(q, params).fetchall()
        results = []
        for row in rows:
            selected_raw = json.loads(row["selected_json"])
            selected = [
                ClarificationQuestion(
                    text=qd["text"], score=qd["score"],
                    category=qd["category"], reason=qd["reason"],
                )
                for qd in selected_raw
            ]
            results.append(ClarificationResult(
                session_id=row["session_id"], task_summary=row["task_summary"],
                selected=selected, skipped=json.loads(row["skipped_json"]),
                tenant_id=row["tenant_id"], metadata=json.loads(row["metadata_json"]),
                created_at=row["created_at"],
            ))
        return results


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_optimizer: ClarificationOptimizer | None = None


def get_clarification_optimizer(db_path: str | Path | None = None) -> ClarificationOptimizer:
    global _optimizer
    if _optimizer is None:
        _optimizer = ClarificationOptimizer(db_path=db_path)
    return _optimizer


__all__ = [
    "ClarificationQuestion",
    "ClarificationResult",
    "ResolutionRecord",
    "ClarificationOptimizer",
    "get_clarification_optimizer",
]
