"""Tool Fallback Manager — Wave-2 Tool Intelligence.

Defines ordered fallback sequences for tool failures so agents can retry
with semantically equivalent alternatives without hard-coding per-workflow logic.

Features:
  - Priority-ordered fallback chains per primary tool
  - Condition-based activation (error type, failure count, latency threshold)
  - Attempt logging + escalation rules
  - Semantic equivalence groups

SQLite-backed for persistence.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS fallback_chains (
    chain_id        TEXT PRIMARY KEY,
    primary_tool    TEXT NOT NULL,
    fallbacks_json  TEXT NOT NULL DEFAULT '[]',
    error_triggers  TEXT NOT NULL DEFAULT '[]',
    max_attempts    INTEGER NOT NULL DEFAULT 3,
    escalate_after  INTEGER NOT NULL DEFAULT 3,
    active          INTEGER NOT NULL DEFAULT 1,
    tenant_id       TEXT NOT NULL DEFAULT '',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fallback_primary ON fallback_chains(primary_tool);
CREATE INDEX IF NOT EXISTS idx_fallback_tenant ON fallback_chains(tenant_id);

CREATE TABLE IF NOT EXISTS fallback_attempts (
    attempt_id      TEXT PRIMARY KEY,
    chain_id        TEXT NOT NULL,
    primary_tool    TEXT NOT NULL,
    attempted_tool  TEXT NOT NULL,
    position        INTEGER NOT NULL DEFAULT 0,
    error_type      TEXT NOT NULL DEFAULT '',
    error_message   TEXT NOT NULL DEFAULT '',
    succeeded       INTEGER NOT NULL DEFAULT 0,
    latency_ms      INTEGER NOT NULL DEFAULT 0,
    session_id      TEXT NOT NULL DEFAULT '',
    tenant_id       TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fallback_attempts_chain ON fallback_attempts(chain_id);

CREATE TABLE IF NOT EXISTS equivalence_groups (
    group_id        TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    tool_names_json TEXT NOT NULL DEFAULT '[]',
    description     TEXT NOT NULL DEFAULT '',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
"""

# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class FallbackEntry:
    tool_name: str
    priority: int              # lower = try first
    condition: str = ""        # "" = always; "timeout" | "rate_limit" | "error" | ...
    notes: str = ""

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "tool_name": self.tool_name,
            "priority": self.priority,
            "condition": self.condition,
            "notes": self.notes,
        }


@dataclass
class FallbackChain:
    chain_id: str
    primary_tool: str
    fallbacks: list[FallbackEntry]
    error_triggers: list[str]    # error types that activate this chain
    max_attempts: int
    escalate_after: int          # escalate if all fallbacks tried this many times
    active: bool
    tenant_id: str
    metadata: dict[str, Any]
    created_at: str
    updated_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "chain_id": self.chain_id,
            "primary_tool": self.primary_tool,
            "fallbacks": [f.dict for f in self.fallbacks],
            "error_triggers": self.error_triggers,
            "max_attempts": self.max_attempts,
            "escalate_after": self.escalate_after,
            "active": self.active,
            "tenant_id": self.tenant_id,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class FallbackAttempt:
    attempt_id: str
    chain_id: str
    primary_tool: str
    attempted_tool: str
    position: int              # 0 = primary, 1 = first fallback, etc.
    error_type: str
    error_message: str
    succeeded: bool
    latency_ms: int
    session_id: str
    tenant_id: str
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "attempt_id": self.attempt_id,
            "chain_id": self.chain_id,
            "primary_tool": self.primary_tool,
            "attempted_tool": self.attempted_tool,
            "position": self.position,
            "error_type": self.error_type,
            "error_message": self.error_message,
            "succeeded": self.succeeded,
            "latency_ms": self.latency_ms,
            "session_id": self.session_id,
            "tenant_id": self.tenant_id,
            "created_at": self.created_at,
        }


@dataclass
class FallbackDecision:
    """Result of asking 'what should I try next for this failure?'"""
    primary_tool: str
    failed_tool: str
    next_tool: str | None      # None = escalate
    position: int
    should_escalate: bool
    reason: str
    chain_id: str | None

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "primary_tool": self.primary_tool,
            "failed_tool": self.failed_tool,
            "next_tool": self.next_tool,
            "position": self.position,
            "should_escalate": self.should_escalate,
            "reason": self.reason,
            "chain_id": self.chain_id,
        }


@dataclass
class EquivalenceGroup:
    group_id: str
    name: str
    tool_names: list[str]
    description: str
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "group_id": self.group_id,
            "name": self.name,
            "tool_names": self.tool_names,
            "description": self.description,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


# ---------------------------------------------------------------------------
# Core manager
# ---------------------------------------------------------------------------


class ToolFallbackManager:
    """Manage tool fallback chains. SQLite-backed."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(product_db_path(db_path))
        self._conn = self._init_db()

    def _init_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.executescript(_SCHEMA_SQL)
        conn.commit()
        return conn

    # ── Chain CRUD ────────────────────────────────────────────────────────

    def register_chain(
        self,
        primary_tool: str,
        fallbacks: list[dict[str, Any]],
        error_triggers: list[str] | None = None,
        max_attempts: int = 3,
        escalate_after: int = 3,
        tenant_id: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> FallbackChain:
        """Register or update a fallback chain for a primary tool."""
        now = datetime.now(timezone.utc).isoformat()
        chain_id = str(uuid.uuid4())

        # Check for existing chain for this primary_tool + tenant
        existing = self._conn.execute(
            "SELECT chain_id FROM fallback_chains WHERE primary_tool=? AND tenant_id=?",
            (primary_tool, tenant_id),
        ).fetchone()
        if existing:
            chain_id = existing["chain_id"]
            self._conn.execute(
                """UPDATE fallback_chains
                   SET fallbacks_json=?, error_triggers=?, max_attempts=?,
                       escalate_after=?, active=1, metadata_json=?, updated_at=?
                   WHERE chain_id=?""",
                (
                    json.dumps(fallbacks), json.dumps(error_triggers or []),
                    max_attempts, escalate_after, json.dumps(metadata or {}),
                    now, chain_id,
                ),
            )
        else:
            self._conn.execute(
                """INSERT INTO fallback_chains
                   (chain_id,primary_tool,fallbacks_json,error_triggers,max_attempts,
                    escalate_after,active,tenant_id,metadata_json,created_at,updated_at)
                   VALUES (?,?,?,?,?,?,1,?,?,?,?)""",
                (
                    chain_id, primary_tool, json.dumps(fallbacks),
                    json.dumps(error_triggers or []), max_attempts, escalate_after,
                    tenant_id, json.dumps(metadata or {}), now, now,
                ),
            )
        self._conn.commit()

        fb_entries = [
            FallbackEntry(
                tool_name=f["tool_name"],
                priority=f.get("priority", i),
                condition=f.get("condition", ""),
                notes=f.get("notes", ""),
            )
            for i, f in enumerate(fallbacks)
        ]

        return FallbackChain(
            chain_id=chain_id, primary_tool=primary_tool,
            fallbacks=fb_entries, error_triggers=error_triggers or [],
            max_attempts=max_attempts, escalate_after=escalate_after,
            active=True, tenant_id=tenant_id, metadata=metadata or {},
            created_at=now, updated_at=now,
        )

    def get_chain(self, primary_tool: str, tenant_id: str = "") -> FallbackChain | None:
        row = self._conn.execute(
            "SELECT * FROM fallback_chains WHERE primary_tool=? AND tenant_id=? AND active=1",
            (primary_tool, tenant_id),
        ).fetchone()
        return self._row_to_chain(row) if row else None

    def get_chain_by_id(self, chain_id: str) -> FallbackChain | None:
        row = self._conn.execute(
            "SELECT * FROM fallback_chains WHERE chain_id=?", (chain_id,)
        ).fetchone()
        return self._row_to_chain(row) if row else None

    def list_chains(
        self, tenant_id: str | None = None, active_only: bool = True, limit: int = 100
    ) -> list[FallbackChain]:
        q = "SELECT * FROM fallback_chains WHERE 1=1"
        params: list[Any] = []
        if tenant_id is not None:
            q += " AND tenant_id=?"; params.append(tenant_id)
        if active_only:
            q += " AND active=1"
        q += " ORDER BY primary_tool LIMIT ?"; params.append(limit)
        return [self._row_to_chain(r) for r in self._conn.execute(q, params).fetchall()]

    def deactivate_chain(self, chain_id: str) -> bool:
        now = datetime.now(timezone.utc).isoformat()
        cur = self._conn.execute(
            "UPDATE fallback_chains SET active=0, updated_at=? WHERE chain_id=?",
            (now, chain_id),
        )
        self._conn.commit()
        return cur.rowcount > 0

    # ── Decision engine ───────────────────────────────────────────────────

    def decide_next(
        self,
        primary_tool: str,
        failed_tool: str,
        error_type: str = "",
        attempt_number: int = 0,
        session_id: str = "",
        tenant_id: str = "",
    ) -> FallbackDecision:
        """Return the next tool to try, or recommend escalation."""
        chain = self.get_chain(primary_tool, tenant_id)
        if not chain:
            return FallbackDecision(
                primary_tool=primary_tool, failed_tool=failed_tool,
                next_tool=None, position=attempt_number,
                should_escalate=True,
                reason=f"No fallback chain registered for '{primary_tool}'",
                chain_id=None,
            )

        # Filter by error trigger if configured
        if chain.error_triggers and error_type not in chain.error_triggers:
            return FallbackDecision(
                primary_tool=primary_tool, failed_tool=failed_tool,
                next_tool=None, position=attempt_number,
                should_escalate=True,
                reason=(
                    f"Error type '{error_type}' not in triggers "
                    f"{chain.error_triggers} for '{primary_tool}'"
                ),
                chain_id=chain.chain_id,
            )

        if attempt_number >= chain.escalate_after:
            return FallbackDecision(
                primary_tool=primary_tool, failed_tool=failed_tool,
                next_tool=None, position=attempt_number,
                should_escalate=True,
                reason=f"All {attempt_number} attempts exhausted. Escalating.",
                chain_id=chain.chain_id,
            )

        # Sort by priority; find the next one not yet attempted
        ordered = sorted(chain.fallbacks, key=lambda f: f.priority)
        # Filter by condition match
        eligible = [
            f for f in ordered
            if not f.condition or error_type.lower() in f.condition.lower()
        ]

        if attempt_number < len(eligible):
            next_fb = eligible[attempt_number]
            return FallbackDecision(
                primary_tool=primary_tool, failed_tool=failed_tool,
                next_tool=next_fb.tool_name,
                position=attempt_number,
                should_escalate=False,
                reason=f"Fallback #{attempt_number + 1}: {next_fb.notes or next_fb.tool_name}",
                chain_id=chain.chain_id,
            )

        return FallbackDecision(
            primary_tool=primary_tool, failed_tool=failed_tool,
            next_tool=None, position=attempt_number,
            should_escalate=True,
            reason="No more eligible fallbacks; escalating",
            chain_id=chain.chain_id,
        )

    # ── Attempt logging ───────────────────────────────────────────────────

    def log_attempt(
        self,
        chain_id: str,
        primary_tool: str,
        attempted_tool: str,
        position: int = 0,
        error_type: str = "",
        error_message: str = "",
        succeeded: bool = False,
        latency_ms: int = 0,
        session_id: str = "",
        tenant_id: str = "",
    ) -> FallbackAttempt:
        attempt_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """INSERT INTO fallback_attempts
               (attempt_id,chain_id,primary_tool,attempted_tool,position,
                error_type,error_message,succeeded,latency_ms,
                session_id,tenant_id,created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                attempt_id, chain_id, primary_tool, attempted_tool, position,
                error_type, error_message, 1 if succeeded else 0,
                latency_ms, session_id, tenant_id, now,
            ),
        )
        self._conn.commit()
        return FallbackAttempt(
            attempt_id=attempt_id, chain_id=chain_id,
            primary_tool=primary_tool, attempted_tool=attempted_tool,
            position=position, error_type=error_type, error_message=error_message,
            succeeded=succeeded, latency_ms=latency_ms,
            session_id=session_id, tenant_id=tenant_id, created_at=now,
        )

    def list_attempts(
        self,
        chain_id: str | None = None,
        session_id: str | None = None,
        tenant_id: str | None = None,
        limit: int = 100,
    ) -> list[FallbackAttempt]:
        q = "SELECT * FROM fallback_attempts WHERE 1=1"
        params: list[Any] = []
        if chain_id:
            q += " AND chain_id=?"; params.append(chain_id)
        if session_id:
            q += " AND session_id=?"; params.append(session_id)
        if tenant_id:
            q += " AND tenant_id=?"; params.append(tenant_id)
        q += " ORDER BY created_at DESC LIMIT ?"; params.append(limit)
        return [
            FallbackAttempt(
                attempt_id=r["attempt_id"], chain_id=r["chain_id"],
                primary_tool=r["primary_tool"], attempted_tool=r["attempted_tool"],
                position=r["position"], error_type=r["error_type"],
                error_message=r["error_message"], succeeded=bool(r["succeeded"]),
                latency_ms=r["latency_ms"], session_id=r["session_id"],
                tenant_id=r["tenant_id"], created_at=r["created_at"],
            )
            for r in self._conn.execute(q, params).fetchall()
        ]

    # ── Equivalence groups ────────────────────────────────────────────────

    def register_equivalence_group(
        self,
        name: str,
        tool_names: list[str],
        description: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> EquivalenceGroup:
        group_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """INSERT OR REPLACE INTO equivalence_groups
               (group_id,name,tool_names_json,description,metadata_json,created_at)
               VALUES (?,?,?,?,?,?)""",
            (group_id, name, json.dumps(tool_names), description, json.dumps(metadata or {}), now),
        )
        self._conn.commit()
        return EquivalenceGroup(
            group_id=group_id, name=name, tool_names=tool_names,
            description=description, metadata=metadata or {}, created_at=now,
        )

    def list_equivalence_groups(self) -> list[EquivalenceGroup]:
        rows = self._conn.execute("SELECT * FROM equivalence_groups ORDER BY name").fetchall()
        return [
            EquivalenceGroup(
                group_id=r["group_id"], name=r["name"],
                tool_names=json.loads(r["tool_names_json"]),
                description=r["description"], metadata=json.loads(r["metadata_json"]),
                created_at=r["created_at"],
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Private
    # ------------------------------------------------------------------

    @staticmethod
    def _row_to_chain(row: sqlite3.Row) -> FallbackChain:
        fallbacks_raw = json.loads(row["fallbacks_json"])
        fallbacks = [
            FallbackEntry(
                tool_name=f["tool_name"],
                priority=f.get("priority", i),
                condition=f.get("condition", ""),
                notes=f.get("notes", ""),
            )
            for i, f in enumerate(fallbacks_raw)
        ]
        return FallbackChain(
            chain_id=row["chain_id"], primary_tool=row["primary_tool"],
            fallbacks=fallbacks, error_triggers=json.loads(row["error_triggers"]),
            max_attempts=row["max_attempts"], escalate_after=row["escalate_after"],
            active=bool(row["active"]), tenant_id=row["tenant_id"],
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"], updated_at=row["updated_at"],
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_manager: ToolFallbackManager | None = None


def get_tool_fallback_manager(db_path: str | Path | None = None) -> ToolFallbackManager:
    global _manager
    if _manager is None:
        _manager = ToolFallbackManager(db_path=db_path)
    return _manager


__all__ = [
    "FallbackEntry",
    "FallbackChain",
    "FallbackAttempt",
    "FallbackDecision",
    "EquivalenceGroup",
    "ToolFallbackManager",
    "get_tool_fallback_manager",
]
