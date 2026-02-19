"""AMC Domain Glossary + Terminology Enforcer — Feature #29.

Register domain terms, detect terminology violations in text, and suggest
corrections. SQLite-backed with full CRUD.
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

_GLOSSARY_NAMESPACE = UUID("b2c3d4e5-f6a7-8901-bcde-f12345678901")

_GLOSSARY_SCHEMA = """
CREATE TABLE IF NOT EXISTS glossary_terms (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    term_id         TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    canonical       TEXT NOT NULL,
    variants_json   TEXT NOT NULL DEFAULT '[]',
    definition      TEXT NOT NULL DEFAULT '',
    domain          TEXT NOT NULL DEFAULT 'general',
    severity        TEXT NOT NULL DEFAULT 'warning',
    active          INTEGER NOT NULL DEFAULT 1,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_glossary_tenant_canonical ON glossary_terms(tenant_id, canonical);
CREATE INDEX IF NOT EXISTS idx_glossary_tenant                  ON glossary_terms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_glossary_domain                  ON glossary_terms(domain);
"""

_VALID_SEVERITIES = {"info", "warning", "error"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_term_id(tenant_id: str, canonical: str) -> str:
    return str(uuid5(_GLOSSARY_NAMESPACE, f"{tenant_id}:{canonical.lower()}"))


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------

@dataclass
class TermInput:
    """Input payload for registering a glossary term."""
    tenant_id: str
    canonical: str
    variants: list[str] = field(default_factory=list)
    definition: str = ""
    domain: str = "general"
    severity: str = "warning"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class TermRecord:
    """Stored glossary term."""
    term_id: str
    tenant_id: str
    canonical: str
    variants: list[str]
    definition: str
    domain: str
    severity: str
    active: bool
    metadata: dict[str, Any]
    created_at: str
    updated_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "term_id": self.term_id,
            "tenant_id": self.tenant_id,
            "canonical": self.canonical,
            "variants": self.variants,
            "definition": self.definition,
            "domain": self.domain,
            "severity": self.severity,
            "active": self.active,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class Violation:
    """A single terminology violation found in text."""
    term_id: str
    canonical: str
    found_variant: str
    severity: str
    start: int
    end: int
    suggestion: str


@dataclass
class EnforcementResult:
    """Result of running enforcement on a piece of text."""
    tenant_id: str
    violations: list[Violation]
    corrected_text: str
    violation_count: int
    error_count: int
    warning_count: int
    info_count: int

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "violations": [
                {
                    "term_id": v.term_id,
                    "canonical": v.canonical,
                    "found_variant": v.found_variant,
                    "severity": v.severity,
                    "start": v.start,
                    "end": v.end,
                    "suggestion": v.suggestion,
                }
                for v in self.violations
            ],
            "corrected_text": self.corrected_text,
            "violation_count": self.violation_count,
            "error_count": self.error_count,
            "warning_count": self.warning_count,
            "info_count": self.info_count,
        }


# ---------------------------------------------------------------------------
# Core manager
# ---------------------------------------------------------------------------

class GlossaryManager:
    """Manage domain glossary terms and enforce terminology in text."""

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
            conn.executescript(_GLOSSARY_SCHEMA)

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def register(self, inp: TermInput) -> TermRecord:
        """Register a new term; upsert if canonical already exists."""
        severity = inp.severity.lower()
        if severity not in _VALID_SEVERITIES:
            raise ValueError(f"Invalid severity '{severity}'. Choose from: {sorted(_VALID_SEVERITIES)}")

        now = _utc_now()
        term_id = _make_term_id(inp.tenant_id, inp.canonical)

        with self._conn() as conn:
            existing = conn.execute(
                "SELECT id FROM glossary_terms WHERE term_id=?", (term_id,)
            ).fetchone()

            if existing:
                conn.execute(
                    """
                    UPDATE glossary_terms SET
                        variants_json=?, definition=?, domain=?, severity=?,
                        metadata_json=?, active=1, updated_at=?
                    WHERE term_id=?
                    """,
                    (
                        json.dumps(inp.variants),
                        inp.definition,
                        inp.domain,
                        severity,
                        json.dumps(inp.metadata),
                        now,
                        term_id,
                    ),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO glossary_terms
                        (term_id, tenant_id, canonical, variants_json, definition,
                         domain, severity, active, metadata_json, created_at, updated_at)
                    VALUES (?,?,?,?,?,?,?,1,?,?,?)
                    """,
                    (
                        term_id, inp.tenant_id, inp.canonical,
                        json.dumps(inp.variants),
                        inp.definition, inp.domain, severity,
                        json.dumps(inp.metadata), now, now,
                    ),
                )

        log.info("glossary.registered", term_id=term_id, canonical=inp.canonical, tenant=inp.tenant_id)
        return self.get(term_id)  # type: ignore[return-value]

    def get(self, term_id: str) -> TermRecord | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM glossary_terms WHERE term_id=?", (term_id,)
            ).fetchone()
        return _row_to_term(row) if row else None

    def list_terms(
        self,
        tenant_id: str,
        domain: str | None = None,
        active_only: bool = True,
    ) -> list[TermRecord]:
        sql = "SELECT * FROM glossary_terms WHERE tenant_id=?"
        params: list[Any] = [tenant_id]
        if active_only:
            sql += " AND active=1"
        if domain:
            sql += " AND domain=?"
            params.append(domain)
        sql += " ORDER BY canonical"
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [_row_to_term(r) for r in rows]

    def delete(self, term_id: str) -> bool:
        with self._conn() as conn:
            cur = conn.execute(
                "UPDATE glossary_terms SET active=0, updated_at=? WHERE term_id=?",
                (_utc_now(), term_id),
            )
        return cur.rowcount > 0

    # ------------------------------------------------------------------
    # Enforcement
    # ------------------------------------------------------------------

    def enforce(self, text: str, tenant_id: str, auto_correct: bool = True) -> EnforcementResult:
        """Scan text for terminology violations and optionally auto-correct."""
        terms = self.list_terms(tenant_id)
        violations: list[Violation] = []
        corrected = text

        for term in terms:
            # Build set of non-canonical variants to catch
            for variant in term.variants:
                if variant.lower() == term.canonical.lower():
                    continue
                pattern = re.compile(r"\b" + re.escape(variant) + r"\b", re.IGNORECASE)
                for m in pattern.finditer(text):
                    violations.append(
                        Violation(
                            term_id=term.term_id,
                            canonical=term.canonical,
                            found_variant=m.group(),
                            severity=term.severity,
                            start=m.start(),
                            end=m.end(),
                            suggestion=f"Replace '{m.group()}' with '{term.canonical}'",
                        )
                    )
                if auto_correct:
                    corrected = pattern.sub(term.canonical, corrected)

        errors = sum(1 for v in violations if v.severity == "error")
        warnings = sum(1 for v in violations if v.severity == "warning")
        infos = sum(1 for v in violations if v.severity == "info")

        return EnforcementResult(
            tenant_id=tenant_id,
            violations=violations,
            corrected_text=corrected,
            violation_count=len(violations),
            error_count=errors,
            warning_count=warnings,
            info_count=infos,
        )


def _row_to_term(row: sqlite3.Row) -> TermRecord:
    return TermRecord(
        term_id=row["term_id"],
        tenant_id=row["tenant_id"],
        canonical=row["canonical"],
        variants=json.loads(row["variants_json"]),
        definition=row["definition"],
        domain=row["domain"],
        severity=row["severity"],
        active=bool(row["active"]),
        metadata=json.loads(row["metadata_json"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_manager: GlossaryManager | None = None


def get_glossary_manager(db_path: str | Path | None = None) -> GlossaryManager:
    global _manager
    if _manager is None:
        _manager = GlossaryManager(db_path=db_path)
    return _manager
