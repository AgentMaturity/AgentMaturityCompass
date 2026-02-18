"""AMC Product — Personalized Output Styles.

Per-recipient tone, length, and format preferences with style application to text.
Complements the persona module (tenant-level) with recipient-level granularity.

Revenue path: higher message relevance → better reply rates → customer success metrics.
"""
from __future__ import annotations

import json
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS output_style_profiles (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id      TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    recipient_id    TEXT NOT NULL,
    display_name    TEXT NOT NULL DEFAULT '',
    tone            TEXT NOT NULL DEFAULT 'professional',
    length          TEXT NOT NULL DEFAULT 'medium',
    format          TEXT NOT NULL DEFAULT 'prose',
    language        TEXT NOT NULL DEFAULT 'en',
    salutation      TEXT NOT NULL DEFAULT '',
    sign_off        TEXT NOT NULL DEFAULT '',
    avoid_words_json TEXT NOT NULL DEFAULT '[]',
    prefer_words_json TEXT NOT NULL DEFAULT '{}',
    custom_rules_json TEXT NOT NULL DEFAULT '[]',
    active          INTEGER NOT NULL DEFAULT 1,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_style_recipient
    ON output_style_profiles(tenant_id, recipient_id);
CREATE INDEX IF NOT EXISTS idx_style_tenant ON output_style_profiles(tenant_id);

CREATE TABLE IF NOT EXISTS output_style_applications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id  TEXT NOT NULL UNIQUE,
    profile_id      TEXT NOT NULL,
    input_text      TEXT NOT NULL,
    output_text     TEXT NOT NULL,
    transformations_json TEXT NOT NULL DEFAULT '[]',
    applied_at      TEXT NOT NULL,
    FOREIGN KEY (profile_id) REFERENCES output_style_profiles(profile_id)
);
CREATE INDEX IF NOT EXISTS idx_style_app_profile ON output_style_applications(profile_id, applied_at DESC);
"""

# ---------------------------------------------------------------------------
# Enums & Models
# ---------------------------------------------------------------------------

class Tone(str, Enum):
    PROFESSIONAL = "professional"
    CASUAL       = "casual"
    FORMAL       = "formal"
    FRIENDLY     = "friendly"
    EMPATHETIC   = "empathetic"
    ASSERTIVE    = "assertive"


class OutputLength(str, Enum):
    BRIEF   = "brief"     # 1-2 sentences
    SHORT   = "short"     # 1 paragraph
    MEDIUM  = "medium"    # 2-4 paragraphs
    LONG    = "long"      # 5+ paragraphs
    CUSTOM  = "custom"


class OutputFormat(str, Enum):
    PROSE       = "prose"
    BULLETS     = "bullets"
    NUMBERED    = "numbered"
    EXECUTIVE   = "executive"    # TL;DR first
    TECHNICAL   = "technical"    # code-friendly
    PLAIN_TEXT  = "plain_text"


class StyleProfileInput(BaseModel):
    tenant_id: str
    recipient_id: str
    display_name: str = ""
    tone: Tone = Tone.PROFESSIONAL
    length: OutputLength = OutputLength.MEDIUM
    format: OutputFormat = OutputFormat.PROSE
    language: str = "en"
    salutation: str = ""
    sign_off: str = ""
    avoid_words: list[str] = Field(default_factory=list)
    prefer_words: dict[str, str] = Field(default_factory=dict)
    custom_rules: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class StyleProfileUpdateInput(BaseModel):
    profile_id: str
    tone: Tone | None = None
    length: OutputLength | None = None
    format: OutputFormat | None = None
    language: str | None = None
    salutation: str | None = None
    sign_off: str | None = None
    avoid_words: list[str] | None = None
    prefer_words: dict[str, str] | None = None
    custom_rules: list[str] | None = None
    active: bool | None = None


class ApplyStyleInput(BaseModel):
    profile_id: str
    text: str
    record_application: bool = True


class StyleProfileRecord(BaseModel):
    profile_id: str
    tenant_id: str
    recipient_id: str
    display_name: str
    tone: str
    length: str
    format: str
    language: str
    salutation: str
    sign_off: str
    avoid_words: list[str]
    prefer_words: dict[str, str]
    custom_rules: list[str]
    active: bool
    metadata: dict[str, Any]
    created_at: str
    updated_at: str


class StyleApplicationRecord(BaseModel):
    application_id: str
    profile_id: str
    input_text: str
    output_text: str
    transformations: list[dict[str, Any]]
    applied_at: str


# ---------------------------------------------------------------------------
# Style application engine
# ---------------------------------------------------------------------------

def _apply_tone_prefix(text: str, tone: str) -> tuple[str, list[dict[str, Any]]]:
    """Add a tone-specific opening framing (minimal transformation)."""
    transformations: list[dict[str, Any]] = []
    prefixes = {
        "formal": "",
        "professional": "",
        "casual": "",
        "friendly": "",
        "empathetic": "",
        "assertive": "",
    }
    # For now, tone is expressed via persona system; no text mutation here.
    # Future: send to LLM rewriter.
    return text, transformations


def _apply_word_substitutions(
    text: str,
    avoid_words: list[str],
    prefer_words: dict[str, str],
) -> tuple[str, list[dict[str, Any]]]:
    transformations: list[dict[str, Any]] = []
    for avoid in avoid_words:
        # Replace avoid word with preferred alternative or empty
        replacement = prefer_words.get(avoid, "")
        pattern = re.compile(r"\b" + re.escape(avoid) + r"\b", re.IGNORECASE)
        new_text, n = pattern.subn(replacement, text)
        if n:
            transformations.append({
                "type": "word_substitution",
                "from": avoid,
                "to": replacement,
                "count": n,
            })
            text = new_text
    # Apply additional prefer_words replacements
    for source, target in prefer_words.items():
        if source in avoid_words:
            continue  # already handled
        pattern = re.compile(r"\b" + re.escape(source) + r"\b", re.IGNORECASE)
        new_text, n = pattern.subn(target, text)
        if n:
            transformations.append({
                "type": "preferred_substitution",
                "from": source,
                "to": target,
                "count": n,
            })
            text = new_text
    return text, transformations


def _apply_length(text: str, length: str) -> tuple[str, list[dict[str, Any]]]:
    """Truncate to length target (word counts are approximate)."""
    transformations: list[dict[str, Any]] = []
    word_limits = {
        "brief":  30,
        "short":  100,
        "medium": 300,
        "long":   1000,
        "custom": None,
    }
    limit = word_limits.get(length)
    if limit:
        words = text.split()
        if len(words) > limit:
            text = " ".join(words[:limit]) + "…"
            transformations.append({"type": "length_truncation", "limit": limit})
    return text, transformations


def _apply_format(text: str, format_: str, salutation: str, sign_off: str) -> tuple[str, list[dict[str, Any]]]:
    transformations: list[dict[str, Any]] = []
    parts = []
    if salutation:
        parts.append(salutation)
    if format_ == "bullets":
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        parts.append("\n".join(f"• {s}" for s in sentences))
        transformations.append({"type": "format_to_bullets"})
    elif format_ == "numbered":
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        parts.append("\n".join(f"{i+1}. {s}" for i, s in enumerate(sentences)))
        transformations.append({"type": "format_to_numbered"})
    elif format_ == "executive":
        sentences = text.split(". ")
        tldr = sentences[0] if sentences else text
        parts.append(f"TL;DR: {tldr}")
        if len(sentences) > 1:
            parts.append("\n" + ". ".join(sentences[1:]))
        transformations.append({"type": "format_executive"})
    else:
        parts.append(text)
    if sign_off:
        parts.append(f"\n{sign_off}")
    return "\n".join(parts), transformations


def apply_style_to_text(
    text: str, profile: StyleProfileRecord
) -> tuple[str, list[dict[str, Any]]]:
    """Apply all profile transformations to text. Returns (result, transformations)."""
    all_transforms: list[dict[str, Any]] = []

    text, t = _apply_word_substitutions(text, profile.avoid_words, profile.prefer_words)
    all_transforms.extend(t)

    text, t = _apply_length(text, profile.length)
    all_transforms.extend(t)

    text, t = _apply_format(text, profile.format, profile.salutation, profile.sign_off)
    all_transforms.extend(t)

    return text, all_transforms


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------

def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class PersonalizedOutputManager:
    """Per-recipient style profiles and text transformation."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._path = str(db_path or product_db_path())
        self._lock = Lock()
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self._path, check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA foreign_keys=ON")
        return c

    def _init_db(self) -> None:
        with self._conn() as c:
            c.executescript(_SCHEMA)

    def _row_to_profile(self, row: sqlite3.Row) -> StyleProfileRecord:
        return StyleProfileRecord(
            profile_id=row["profile_id"], tenant_id=row["tenant_id"],
            recipient_id=row["recipient_id"], display_name=row["display_name"],
            tone=row["tone"], length=row["length"], format=row["format"],
            language=row["language"], salutation=row["salutation"],
            sign_off=row["sign_off"],
            avoid_words=json.loads(row["avoid_words_json"]),
            prefer_words=json.loads(row["prefer_words_json"]),
            custom_rules=json.loads(row["custom_rules_json"]),
            active=bool(row["active"]),
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"], updated_at=row["updated_at"],
        )

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def create_profile(self, inp: StyleProfileInput) -> StyleProfileRecord:
        profile_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            try:
                c.execute(
                    """INSERT INTO output_style_profiles
                       (profile_id, tenant_id, recipient_id, display_name,
                        tone, length, format, language, salutation, sign_off,
                        avoid_words_json, prefer_words_json, custom_rules_json,
                        active, metadata_json, created_at, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (profile_id, inp.tenant_id, inp.recipient_id, inp.display_name,
                     inp.tone.value, inp.length.value, inp.format.value,
                     inp.language, inp.salutation, inp.sign_off,
                     json.dumps(inp.avoid_words), json.dumps(inp.prefer_words),
                     json.dumps(inp.custom_rules), 1, json.dumps(inp.metadata),
                     now, now),
                )
            except sqlite3.IntegrityError:
                raise ValueError(
                    f"Style profile for recipient {inp.recipient_id!r} in tenant {inp.tenant_id!r} already exists"
                )
        log.info("output_style.created", profile_id=profile_id, recipient=inp.recipient_id)
        return self.get_profile(profile_id)  # type: ignore[return-value]

    def get_profile(self, profile_id: str) -> StyleProfileRecord | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM output_style_profiles WHERE profile_id=?", (profile_id,)
            ).fetchone()
        return self._row_to_profile(row) if row else None

    def get_profile_for_recipient(
        self, tenant_id: str, recipient_id: str
    ) -> StyleProfileRecord | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM output_style_profiles WHERE tenant_id=? AND recipient_id=?",
                (tenant_id, recipient_id),
            ).fetchone()
        return self._row_to_profile(row) if row else None

    def update_profile(self, inp: StyleProfileUpdateInput) -> StyleProfileRecord:
        profile = self.get_profile(inp.profile_id)
        if profile is None:
            raise ValueError(f"Profile {inp.profile_id!r} not found")
        now = _utc_now()
        fields: dict[str, Any] = {"updated_at": now}
        if inp.tone is not None:
            fields["tone"] = inp.tone.value
        if inp.length is not None:
            fields["length"] = inp.length.value
        if inp.format is not None:
            fields["format"] = inp.format.value
        if inp.language is not None:
            fields["language"] = inp.language
        if inp.salutation is not None:
            fields["salutation"] = inp.salutation
        if inp.sign_off is not None:
            fields["sign_off"] = inp.sign_off
        if inp.avoid_words is not None:
            fields["avoid_words_json"] = json.dumps(inp.avoid_words)
        if inp.prefer_words is not None:
            fields["prefer_words_json"] = json.dumps(inp.prefer_words)
        if inp.custom_rules is not None:
            fields["custom_rules_json"] = json.dumps(inp.custom_rules)
        if inp.active is not None:
            fields["active"] = int(inp.active)
        set_clause = ", ".join(f"{k}=?" for k in fields)
        vals = list(fields.values()) + [inp.profile_id]
        with self._lock, self._conn() as c:
            c.execute(f"UPDATE output_style_profiles SET {set_clause} WHERE profile_id=?", vals)
        return self.get_profile(inp.profile_id)  # type: ignore[return-value]

    def list_profiles(
        self, tenant_id: str, active_only: bool = True, limit: int = 100
    ) -> list[StyleProfileRecord]:
        q = "SELECT * FROM output_style_profiles WHERE tenant_id=?"
        params: list[Any] = [tenant_id]
        if active_only:
            q += " AND active=1"
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [self._row_to_profile(r) for r in rows]

    def delete_profile(self, profile_id: str) -> bool:
        with self._lock, self._conn() as c:
            n = c.execute(
                "DELETE FROM output_style_profiles WHERE profile_id=?", (profile_id,)
            ).rowcount
        return n > 0

    # ------------------------------------------------------------------
    # Style application
    # ------------------------------------------------------------------

    def apply_style(self, inp: ApplyStyleInput) -> StyleApplicationRecord:
        profile = self.get_profile(inp.profile_id)
        if profile is None:
            raise ValueError(f"Profile {inp.profile_id!r} not found")
        if not profile.active:
            raise ValueError(f"Profile {inp.profile_id!r} is inactive")

        output_text, transforms = apply_style_to_text(inp.text, profile)

        application_id = str(uuid.uuid4())
        now = _utc_now()
        if inp.record_application:
            with self._lock, self._conn() as c:
                c.execute(
                    """INSERT INTO output_style_applications
                       (application_id, profile_id, input_text, output_text,
                        transformations_json, applied_at)
                       VALUES (?,?,?,?,?,?)""",
                    (application_id, inp.profile_id, inp.text, output_text,
                     json.dumps(transforms), now),
                )
        return StyleApplicationRecord(
            application_id=application_id, profile_id=inp.profile_id,
            input_text=inp.text, output_text=output_text,
            transformations=transforms, applied_at=now,
        )

    def get_application_history(
        self, profile_id: str, limit: int = 50
    ) -> list[StyleApplicationRecord]:
        with self._conn() as c:
            rows = c.execute(
                """SELECT * FROM output_style_applications
                   WHERE profile_id=? ORDER BY applied_at DESC LIMIT ?""",
                (profile_id, limit),
            ).fetchall()
        return [
            StyleApplicationRecord(
                application_id=r["application_id"], profile_id=r["profile_id"],
                input_text=r["input_text"], output_text=r["output_text"],
                transformations=json.loads(r["transformations_json"]),
                applied_at=r["applied_at"],
            )
            for r in rows
        ]


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_output_mgr: PersonalizedOutputManager | None = None
_output_lock = Lock()


def get_output_manager(db_path: str | Path | None = None) -> PersonalizedOutputManager:
    global _output_mgr
    with _output_lock:
        if _output_mgr is None:
            _output_mgr = PersonalizedOutputManager(db_path=db_path)
    return _output_mgr


__all__ = [
    "Tone",
    "OutputLength",
    "OutputFormat",
    "StyleProfileInput",
    "StyleProfileUpdateInput",
    "ApplyStyleInput",
    "StyleProfileRecord",
    "StyleApplicationRecord",
    "apply_style_to_text",
    "PersonalizedOutputManager",
    "get_output_manager",
]
