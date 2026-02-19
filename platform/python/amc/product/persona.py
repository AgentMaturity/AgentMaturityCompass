"""AMC Preference & Persona Manager — Feature #27.

Stores per-tenant tone/style/brand preferences and applies them to text outputs.
SQLite-backed with full CRUD.
"""
from __future__ import annotations

import json
import re
import sqlite3
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_PERSONA_NAMESPACE = UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")

_PERSONA_SCHEMA = """
CREATE TABLE IF NOT EXISTS personas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id      TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    name            TEXT NOT NULL,
    tone            TEXT NOT NULL DEFAULT 'professional',
    style           TEXT NOT NULL DEFAULT 'concise',
    brand_voice     TEXT NOT NULL DEFAULT '',
    forbidden_words TEXT NOT NULL DEFAULT '[]',
    preferred_words TEXT NOT NULL DEFAULT '{}',
    signature       TEXT NOT NULL DEFAULT '',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_persona_tenant_name ON personas(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_persona_tenant            ON personas(tenant_id);
"""

_VALID_TONES = {"professional", "casual", "formal", "friendly", "empathetic", "assertive"}
_VALID_STYLES = {"concise", "verbose", "bullet", "narrative", "technical", "executive"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_persona_id(tenant_id: str, name: str) -> str:
    return str(uuid5(_PERSONA_NAMESPACE, f"{tenant_id}:{name}"))


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------

@dataclass
class PersonaInput:
    """Input payload for creating or updating a persona."""
    tenant_id: str
    name: str
    tone: str = "professional"
    style: str = "concise"
    brand_voice: str = ""
    forbidden_words: list[str] = field(default_factory=list)
    preferred_words: dict[str, str] = field(default_factory=dict)
    signature: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class PersonaRecord:
    """Stored persona record."""
    persona_id: str
    tenant_id: str
    name: str
    tone: str
    style: str
    brand_voice: str
    forbidden_words: list[str]
    preferred_words: dict[str, str]
    signature: str
    metadata: dict[str, Any]
    active: bool
    created_at: str
    updated_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "persona_id": self.persona_id,
            "tenant_id": self.tenant_id,
            "name": self.name,
            "tone": self.tone,
            "style": self.style,
            "brand_voice": self.brand_voice,
            "forbidden_words": self.forbidden_words,
            "preferred_words": self.preferred_words,
            "signature": self.signature,
            "metadata": self.metadata,
            "active": self.active,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class ApplyResult:
    """Result of applying a persona to text."""
    original: str
    transformed: str
    persona_id: str
    replacements_made: list[str]
    forbidden_hits: list[str]
    signature_appended: bool


# ---------------------------------------------------------------------------
# Core manager
# ---------------------------------------------------------------------------

class PersonaManager:
    """CRUD + application logic for per-tenant personas."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db = Path(db_path) if db_path else product_db_path()
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_db(self) -> None:
        with self._conn() as conn:
            conn.executescript(_PERSONA_SCHEMA)

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def create(self, inp: PersonaInput) -> PersonaRecord:
        """Create a new persona; raises ValueError if name conflicts."""
        tone = inp.tone.lower()
        style = inp.style.lower()
        if tone not in _VALID_TONES:
            raise ValueError(f"Invalid tone '{tone}'. Choose from: {sorted(_VALID_TONES)}")
        if style not in _VALID_STYLES:
            raise ValueError(f"Invalid style '{style}'. Choose from: {sorted(_VALID_STYLES)}")

        now = _utc_now()
        persona_id = _make_persona_id(inp.tenant_id, inp.name)

        with self._conn() as conn:
            try:
                conn.execute(
                    """
                    INSERT INTO personas
                        (persona_id, tenant_id, name, tone, style, brand_voice,
                         forbidden_words, preferred_words, signature, metadata_json,
                         active, created_at, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)
                    """,
                    (
                        persona_id, inp.tenant_id, inp.name, tone, style,
                        inp.brand_voice,
                        json.dumps(inp.forbidden_words),
                        json.dumps(inp.preferred_words),
                        inp.signature,
                        json.dumps(inp.metadata),
                        now, now,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError(
                    f"Persona '{inp.name}' already exists for tenant '{inp.tenant_id}'"
                ) from exc

        log.info("persona.created", persona_id=persona_id, tenant=inp.tenant_id, name=inp.name)
        return self.get(persona_id)  # type: ignore[return-value]

    def get(self, persona_id: str) -> PersonaRecord | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM personas WHERE persona_id=?", (persona_id,)
            ).fetchone()
        return _row_to_record(row) if row else None

    def get_by_name(self, tenant_id: str, name: str) -> PersonaRecord | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM personas WHERE tenant_id=? AND name=?", (tenant_id, name)
            ).fetchone()
        return _row_to_record(row) if row else None

    def list_for_tenant(self, tenant_id: str, active_only: bool = True) -> list[PersonaRecord]:
        sql = "SELECT * FROM personas WHERE tenant_id=?"
        params: list[Any] = [tenant_id]
        if active_only:
            sql += " AND active=1"
        sql += " ORDER BY name"
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [_row_to_record(r) for r in rows]

    def update(self, persona_id: str, updates: dict[str, Any]) -> PersonaRecord:
        """Apply partial updates to an existing persona."""
        record = self.get(persona_id)
        if record is None:
            raise KeyError(f"Persona {persona_id!r} not found")

        allowed = {"tone", "style", "brand_voice", "forbidden_words", "preferred_words",
                   "signature", "metadata", "active"}
        clean: dict[str, Any] = {}
        for k, v in updates.items():
            if k not in allowed:
                continue
            if k in ("forbidden_words",):
                clean["forbidden_words"] = json.dumps(list(v))
            elif k == "preferred_words":
                clean["preferred_words"] = json.dumps(dict(v))
            elif k == "metadata":
                clean["metadata_json"] = json.dumps(dict(v))
            elif k in ("tone", "style"):
                clean[k] = str(v).lower()
            else:
                clean[k] = v

        if not clean:
            return record

        clean["updated_at"] = _utc_now()
        set_clause = ", ".join(f"{k}=?" for k in clean)
        values = list(clean.values()) + [persona_id]

        with self._conn() as conn:
            conn.execute(f"UPDATE personas SET {set_clause} WHERE persona_id=?", values)

        return self.get(persona_id)  # type: ignore[return-value]

    def delete(self, persona_id: str) -> bool:
        """Soft-delete (deactivate) a persona."""
        with self._conn() as conn:
            cur = conn.execute(
                "UPDATE personas SET active=0, updated_at=? WHERE persona_id=?",
                (_utc_now(), persona_id),
            )
        deleted = cur.rowcount > 0
        if deleted:
            log.info("persona.deleted", persona_id=persona_id)
        return deleted

    # ------------------------------------------------------------------
    # Application
    # ------------------------------------------------------------------

    def apply(self, text: str, persona_id: str) -> ApplyResult:
        """Apply persona preferences to output text."""
        record = self.get(persona_id)
        if record is None:
            raise KeyError(f"Persona {persona_id!r} not found")
        return apply_persona(text, record)


def apply_persona(text: str, persona: PersonaRecord) -> ApplyResult:
    """Apply persona preferred/forbidden word rules to text. Returns transformed copy."""
    replacements_made: list[str] = []
    forbidden_hits: list[str] = []
    transformed = text

    # Replace preferred words (wrong → right)
    for wrong, right in persona.preferred_words.items():
        pattern = re.compile(r"\b" + re.escape(wrong) + r"\b", re.IGNORECASE)
        if pattern.search(transformed):
            transformed = pattern.sub(right, transformed)
            replacements_made.append(f"{wrong!r} → {right!r}")

    # Flag forbidden words
    for word in persona.forbidden_words:
        pattern = re.compile(r"\b" + re.escape(word) + r"\b", re.IGNORECASE)
        if pattern.search(transformed):
            forbidden_hits.append(word)

    # Append signature if configured
    sig_appended = False
    if persona.signature and not transformed.rstrip().endswith(persona.signature.strip()):
        transformed = transformed.rstrip() + "\n\n" + persona.signature
        sig_appended = True

    return ApplyResult(
        original=text,
        transformed=transformed,
        persona_id=persona.persona_id,
        replacements_made=replacements_made,
        forbidden_hits=forbidden_hits,
        signature_appended=sig_appended,
    )


# ---------------------------------------------------------------------------
# Row → record helper
# ---------------------------------------------------------------------------

def _row_to_record(row: sqlite3.Row) -> PersonaRecord:
    return PersonaRecord(
        persona_id=row["persona_id"],
        tenant_id=row["tenant_id"],
        name=row["name"],
        tone=row["tone"],
        style=row["style"],
        brand_voice=row["brand_voice"],
        forbidden_words=json.loads(row["forbidden_words"]),
        preferred_words=json.loads(row["preferred_words"]),
        signature=row["signature"],
        metadata=json.loads(row["metadata_json"]),
        active=bool(row["active"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_manager: PersonaManager | None = None


def get_persona_manager(db_path: str | Path | None = None) -> PersonaManager:
    global _manager
    if _manager is None:
        _manager = PersonaManager(db_path=db_path)
    return _manager
