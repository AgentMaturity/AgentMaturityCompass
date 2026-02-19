"""Working Memory Scratchpad Manager — Session-isolated scratchpad.

Structured scratchpad with lifecycle rules (keep/discard/promote), TTL,
and session isolation. SQLite-backed.
"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_SCRATCHPAD_NAMESPACE = UUID("f5a6b7c8-d9e0-1234-f012-345678900005")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS scratchpad_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id        TEXT NOT NULL UNIQUE,
    session_id      TEXT NOT NULL,
    tenant_id       TEXT NOT NULL DEFAULT '',
    key             TEXT NOT NULL,
    value_json      TEXT NOT NULL,
    content_type    TEXT NOT NULL DEFAULT 'text',
    lifecycle       TEXT NOT NULL DEFAULT 'keep',
    ttl_seconds     INTEGER,
    expires_at      TEXT,
    promoted_to     TEXT,
    tags            TEXT NOT NULL DEFAULT '[]',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scratch_session_key
    ON scratchpad_entries(session_id, key);
CREATE INDEX IF NOT EXISTS idx_scratch_session   ON scratchpad_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_scratch_expires   ON scratchpad_entries(expires_at);
CREATE INDEX IF NOT EXISTS idx_scratch_lifecycle ON scratchpad_entries(lifecycle);
"""


class Lifecycle(str, Enum):
    KEEP = "keep"       # retain until explicitly cleared
    DISCARD = "discard" # ephemeral: auto-purge on session sweep
    PROMOTE = "promote" # migrate to long-term memory on session end


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_str() -> str:
    return _utc_now().isoformat()


def _make_entry_id(session_id: str, key: str) -> str:
    return str(uuid5(_SCRATCHPAD_NAMESPACE, f"{session_id}:{key}"))


def _compute_expiry(ttl_seconds: int | None) -> str | None:
    if ttl_seconds is None or ttl_seconds <= 0:
        return None
    return (_utc_now() + timedelta(seconds=ttl_seconds)).isoformat()


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class ScratchEntry:
    """Input for writing a scratchpad entry."""

    session_id: str
    key: str
    value: Any
    content_type: str = "text"
    lifecycle: Lifecycle = Lifecycle.KEEP
    ttl_seconds: int | None = None
    tags: list[str] = field(default_factory=list)
    tenant_id: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ScratchRecord:
    """Stored scratchpad record."""

    entry_id: str
    session_id: str
    tenant_id: str
    key: str
    value: Any
    content_type: str
    lifecycle: str
    ttl_seconds: int | None
    expires_at: str | None
    promoted_to: str | None
    tags: list[str]
    metadata: dict[str, Any]
    created_at: str
    updated_at: str

    @property
    def is_expired(self) -> bool:
        if not self.expires_at:
            return False
        return datetime.fromisoformat(self.expires_at) <= _utc_now()

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "entry_id": self.entry_id,
            "session_id": self.session_id,
            "tenant_id": self.tenant_id,
            "key": self.key,
            "value": self.value,
            "content_type": self.content_type,
            "lifecycle": self.lifecycle,
            "ttl_seconds": self.ttl_seconds,
            "expires_at": self.expires_at,
            "promoted_to": self.promoted_to,
            "tags": self.tags,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "is_expired": self.is_expired,
        }


@dataclass
class SessionSweepResult:
    """Result of sweeping a session's scratchpad."""

    session_id: str
    total_entries: int
    expired_discarded: int
    promoted: int
    kept: int
    promoted_keys: list[str]
    discarded_keys: list[str]

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "total_entries": self.total_entries,
            "expired_discarded": self.expired_discarded,
            "promoted": self.promoted,
            "kept": self.kept,
            "promoted_keys": self.promoted_keys,
            "discarded_keys": self.discarded_keys,
        }


# ---------------------------------------------------------------------------
# Core manager
# ---------------------------------------------------------------------------


class ScratchpadManager:
    """Session-isolated working memory with lifecycle and TTL enforcement."""

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
    # Write / update
    # ------------------------------------------------------------------

    def set(self, entry: ScratchEntry) -> ScratchRecord:
        """Create or update a scratchpad entry (upsert on session+key)."""
        entry_id = _make_entry_id(entry.session_id, entry.key)
        now = _utc_now_str()
        expires = _compute_expiry(entry.ttl_seconds)
        self._conn.execute(
            """
            INSERT INTO scratchpad_entries
                (entry_id, session_id, tenant_id, key, value_json, content_type,
                 lifecycle, ttl_seconds, expires_at, promoted_to, tags,
                 metadata_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
            ON CONFLICT(session_id, key) DO UPDATE SET
                value_json    = excluded.value_json,
                content_type  = excluded.content_type,
                lifecycle     = excluded.lifecycle,
                ttl_seconds   = excluded.ttl_seconds,
                expires_at    = excluded.expires_at,
                tags          = excluded.tags,
                metadata_json = excluded.metadata_json,
                updated_at    = excluded.updated_at
            """,
            (
                entry_id,
                entry.session_id,
                entry.tenant_id,
                entry.key,
                json.dumps(entry.value),
                entry.content_type,
                entry.lifecycle.value,
                entry.ttl_seconds,
                expires,
                json.dumps(entry.tags),
                json.dumps(entry.metadata),
                now,
                now,
            ),
        )
        self._conn.commit()
        return self.get(entry.session_id, entry.key)  # type: ignore[return-value]

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def get(self, session_id: str, key: str) -> ScratchRecord | None:
        """Fetch a scratchpad entry; auto-removes if expired."""
        row = self._conn.execute(
            "SELECT * FROM scratchpad_entries WHERE session_id=? AND key=?",
            (session_id, key),
        ).fetchone()
        if not row:
            return None
        record = self._row_to_record(row)
        if record.is_expired:
            self._delete_by_id(record.entry_id)
            return None
        return record

    def list_session(
        self,
        session_id: str,
        lifecycle: Lifecycle | None = None,
        include_expired: bool = False,
        tag: str | None = None,
    ) -> list[ScratchRecord]:
        """List all entries for a session, optionally filtered."""
        q = "SELECT * FROM scratchpad_entries WHERE session_id=?"
        params: list[Any] = [session_id]
        if lifecycle:
            q += " AND lifecycle=?"
            params.append(lifecycle.value)
        if not include_expired:
            now_str = _utc_now_str()
            q += " AND (expires_at IS NULL OR expires_at > ?)"
            params.append(now_str)
        q += " ORDER BY updated_at DESC"
        rows = self._conn.execute(q, params).fetchall()
        records = [self._row_to_record(r) for r in rows]
        if tag:
            records = [r for r in records if tag in r.tags]
        return records

    def get_promoted(self, session_id: str) -> list[ScratchRecord]:
        """Return entries that have been promoted (promoted_to is set)."""
        rows = self._conn.execute(
            """
            SELECT * FROM scratchpad_entries
            WHERE session_id=? AND promoted_to IS NOT NULL
            ORDER BY updated_at DESC
            """,
            (session_id,),
        ).fetchall()
        return [self._row_to_record(r) for r in rows]

    # ------------------------------------------------------------------
    # Delete / clear
    # ------------------------------------------------------------------

    def delete(self, session_id: str, key: str) -> bool:
        """Delete a single entry by session+key."""
        entry_id = _make_entry_id(session_id, key)
        return self._delete_by_id(entry_id)

    def clear_session(
        self,
        session_id: str,
        lifecycle: Lifecycle | None = None,
    ) -> int:
        """Clear all (or lifecycle-scoped) entries for a session."""
        q = "DELETE FROM scratchpad_entries WHERE session_id=?"
        params: list[Any] = [session_id]
        if lifecycle:
            q += " AND lifecycle=?"
            params.append(lifecycle.value)
        cur = self._conn.execute(q, params)
        self._conn.commit()
        return cur.rowcount

    # ------------------------------------------------------------------
    # Lifecycle sweep
    # ------------------------------------------------------------------

    def sweep_session(self, session_id: str) -> SessionSweepResult:
        """Apply lifecycle rules for a session:
        - expired → delete
        - discard → delete
        - promote → mark promoted_to='promoted', flip lifecycle to keep
        """
        all_entries = self.list_session(session_id, include_expired=True)
        expired_discarded = 0
        promoted: list[str] = []
        discarded: list[str] = []
        kept = 0
        now = _utc_now_str()

        for entry in all_entries:
            if entry.is_expired:
                self._delete_by_id(entry.entry_id)
                expired_discarded += 1
                discarded.append(entry.key)
            elif entry.lifecycle == Lifecycle.DISCARD.value:
                self._delete_by_id(entry.entry_id)
                discarded.append(entry.key)
            elif entry.lifecycle == Lifecycle.PROMOTE.value:
                self._conn.execute(
                    """
                    UPDATE scratchpad_entries
                    SET promoted_to='promoted', lifecycle='keep', updated_at=?
                    WHERE entry_id=?
                    """,
                    (now, entry.entry_id),
                )
                promoted.append(entry.key)
                kept += 1
            else:
                kept += 1

        self._conn.commit()
        log.info(
            "scratchpad_sweep",
            session_id=session_id,
            total=len(all_entries),
            discarded=len(discarded),
            promoted=len(promoted),
        )
        return SessionSweepResult(
            session_id=session_id,
            total_entries=len(all_entries),
            expired_discarded=expired_discarded,
            promoted=len(promoted),
            kept=kept,
            promoted_keys=promoted,
            discarded_keys=discarded,
        )

    def purge_expired(self) -> int:
        """Remove all globally expired entries across all sessions."""
        now = _utc_now_str()
        cur = self._conn.execute(
            "DELETE FROM scratchpad_entries WHERE expires_at IS NOT NULL AND expires_at <= ?",
            (now,),
        )
        self._conn.commit()
        count = cur.rowcount
        if count:
            log.info("scratchpad_purged_expired", count=count)
        return count

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _delete_by_id(self, entry_id: str) -> bool:
        cur = self._conn.execute(
            "DELETE FROM scratchpad_entries WHERE entry_id=?", (entry_id,)
        )
        self._conn.commit()
        return cur.rowcount > 0

    def _row_to_record(self, row: sqlite3.Row) -> ScratchRecord:
        return ScratchRecord(
            entry_id=row["entry_id"],
            session_id=row["session_id"],
            tenant_id=row["tenant_id"],
            key=row["key"],
            value=json.loads(row["value_json"]),
            content_type=row["content_type"],
            lifecycle=row["lifecycle"],
            ttl_seconds=row["ttl_seconds"],
            expires_at=row["expires_at"],
            promoted_to=row["promoted_to"],
            tags=json.loads(row["tags"]),
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_manager: ScratchpadManager | None = None


def get_scratchpad_manager(
    db_path: str | Path | None = None,
) -> ScratchpadManager:
    global _manager
    if _manager is None:
        _manager = ScratchpadManager(db_path=db_path)
    return _manager


__all__ = [
    "Lifecycle",
    "ScratchEntry",
    "ScratchRecord",
    "SessionSweepResult",
    "ScratchpadManager",
    "get_scratchpad_manager",
]
