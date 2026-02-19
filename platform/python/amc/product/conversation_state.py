"""AMC Conversation State Snapshotter — Wave 2 Feature #27.

Periodically captures a structured JSON snapshot of a conversation's current
state: intent, extracted entities, decisions made, pending actions, and agent
context.  Snapshots are versioned and stored in SQLite for durable resumability
across context resets.

API mount point: /api/v1/product/state
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

# ── Schema ───────────────────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS conversation_snapshots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id     TEXT NOT NULL UNIQUE,
    conversation_id TEXT NOT NULL,
    tenant_id       TEXT NOT NULL,
    session_id      TEXT NOT NULL DEFAULT '',
    version         INTEGER NOT NULL DEFAULT 1,
    intent          TEXT NOT NULL DEFAULT '',
    entities_json   TEXT NOT NULL DEFAULT '{}',
    decisions_json  TEXT NOT NULL DEFAULT '[]',
    pending_json    TEXT NOT NULL DEFAULT '[]',
    context_json    TEXT NOT NULL DEFAULT '{}',
    summary         TEXT NOT NULL DEFAULT '',
    turn_count      INTEGER NOT NULL DEFAULT 0,
    is_latest       INTEGER NOT NULL DEFAULT 1,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cs_conv ON conversation_snapshots(conversation_id, version);
CREATE INDEX IF NOT EXISTS idx_cs_tenant ON conversation_snapshots(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cs_session ON conversation_snapshots(session_id, is_latest);

CREATE TABLE IF NOT EXISTS conversation_restorations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    restoration_id  TEXT NOT NULL UNIQUE,
    conversation_id TEXT NOT NULL,
    snapshot_id     TEXT NOT NULL,
    restored_by     TEXT NOT NULL DEFAULT 'system',
    reason          TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cr_conv ON conversation_restorations(conversation_id, created_at);
"""


# ── Enums ─────────────────────────────────────────────────────────────────────


class DecisionOutcome(str, Enum):
    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    PENDING = "pending"
    SUPERSEDED = "superseded"


class PendingActionStatus(str, Enum):
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    FAILED = "failed"
    CANCELLED = "cancelled"


# ── Domain models ────────────────────────────────────────────────────────────


@dataclass
class DecisionRecord:
    """A structured decision made during the conversation."""
    key: str                  # e.g. "use_template"
    value: Any                # e.g. "onboarding_v2"
    outcome: DecisionOutcome = DecisionOutcome.CONFIRMED
    rationale: str = ""
    turn: int = 0


@dataclass
class PendingAction:
    """An action yet to be executed."""
    action_id: str
    action_type: str
    description: str
    status: PendingActionStatus = PendingActionStatus.QUEUED
    priority: int = 5
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class SnapshotInput:
    conversation_id: str
    tenant_id: str
    intent: str
    entities: dict[str, Any] = field(default_factory=dict)
    decisions: list[DecisionRecord] = field(default_factory=list)
    pending_actions: list[PendingAction] = field(default_factory=list)
    context: dict[str, Any] = field(default_factory=dict)
    summary: str = ""
    session_id: str = ""
    turn_count: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ConversationSnapshot:
    snapshot_id: str
    conversation_id: str
    tenant_id: str
    session_id: str
    version: int
    intent: str
    entities: dict[str, Any]
    decisions: list[dict[str, Any]]
    pending_actions: list[dict[str, Any]]
    context: dict[str, Any]
    summary: str
    turn_count: int
    is_latest: bool
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "snapshot_id": self.snapshot_id,
            "conversation_id": self.conversation_id,
            "tenant_id": self.tenant_id,
            "session_id": self.session_id,
            "version": self.version,
            "intent": self.intent,
            "entities": self.entities,
            "decisions": self.decisions,
            "pending_actions": self.pending_actions,
            "context": self.context,
            "summary": self.summary,
            "turn_count": self.turn_count,
            "is_latest": self.is_latest,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


@dataclass
class RestorationRecord:
    restoration_id: str
    conversation_id: str
    snapshot_id: str
    restored_by: str
    reason: str
    snapshot: ConversationSnapshot
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "restoration_id": self.restoration_id,
            "conversation_id": self.conversation_id,
            "snapshot_id": self.snapshot_id,
            "restored_by": self.restored_by,
            "reason": self.reason,
            "snapshot": self.snapshot.dict,
            "created_at": self.created_at,
        }


# ── Core engine ──────────────────────────────────────────────────────────────


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _decision_to_dict(d: DecisionRecord) -> dict[str, Any]:
    return {
        "key": d.key,
        "value": d.value,
        "outcome": d.outcome.value,
        "rationale": d.rationale,
        "turn": d.turn,
    }


def _pending_to_dict(p: PendingAction) -> dict[str, Any]:
    return {
        "action_id": p.action_id,
        "action_type": p.action_type,
        "description": p.description,
        "status": p.status.value,
        "priority": p.priority,
        "metadata": p.metadata,
    }


class ConversationStateManager:
    """Snapshots and restores conversation state for durable long-running sessions."""

    def __init__(self, db_path: Path | None = None) -> None:
        self._db = str(db_path or product_db_path("conversation_state.db"))
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_db(self) -> None:
        with self._conn() as conn:
            conn.executescript(_SCHEMA)

    # ── Snapshot ─────────────────────────────────────────────────────────────

    def snapshot(self, inp: SnapshotInput) -> ConversationSnapshot:
        """Create a new versioned snapshot; mark previous as non-latest."""
        snap_id = str(uuid.uuid4())
        now = _utc_now()

        decisions_dicts = [_decision_to_dict(d) for d in inp.decisions]
        pending_dicts = [_pending_to_dict(p) for p in inp.pending_actions]

        with self._conn() as conn:
            # Demote previous latest
            prev = conn.execute(
                """SELECT MAX(version) as v FROM conversation_snapshots
                   WHERE conversation_id=?""",
                (inp.conversation_id,),
            ).fetchone()
            prev_version = prev["v"] or 0

            conn.execute(
                """UPDATE conversation_snapshots SET is_latest=0
                   WHERE conversation_id=? AND is_latest=1""",
                (inp.conversation_id,),
            )
            new_version = prev_version + 1
            conn.execute(
                """INSERT INTO conversation_snapshots
                   (snapshot_id, conversation_id, tenant_id, session_id, version,
                    intent, entities_json, decisions_json, pending_json,
                    context_json, summary, turn_count, is_latest, metadata_json, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)""",
                (
                    snap_id,
                    inp.conversation_id,
                    inp.tenant_id,
                    inp.session_id,
                    new_version,
                    inp.intent,
                    json.dumps(inp.entities),
                    json.dumps(decisions_dicts),
                    json.dumps(pending_dicts),
                    json.dumps(inp.context),
                    inp.summary,
                    inp.turn_count,
                    json.dumps(inp.metadata),
                    now,
                ),
            )

        log.info(
            "conversation_snapshot",
            snap_id=snap_id,
            conversation_id=inp.conversation_id,
            version=new_version,
        )
        return self.get_snapshot(snap_id)  # type: ignore[return-value]

    # ── Retrieval ────────────────────────────────────────────────────────────

    def get_snapshot(self, snapshot_id: str) -> ConversationSnapshot | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM conversation_snapshots WHERE snapshot_id=?",
                (snapshot_id,),
            ).fetchone()
        return self._row_to_snapshot(row) if row else None

    def get_latest(self, conversation_id: str) -> ConversationSnapshot | None:
        with self._conn() as conn:
            row = conn.execute(
                """SELECT * FROM conversation_snapshots
                   WHERE conversation_id=? AND is_latest=1""",
                (conversation_id,),
            ).fetchone()
        return self._row_to_snapshot(row) if row else None

    def list_snapshots(
        self,
        conversation_id: str,
        limit: int = 20,
    ) -> list[ConversationSnapshot]:
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT * FROM conversation_snapshots
                   WHERE conversation_id=?
                   ORDER BY version DESC LIMIT ?""",
                (conversation_id, limit),
            ).fetchall()
        return [self._row_to_snapshot(r) for r in rows]

    def list_for_tenant(
        self,
        tenant_id: str,
        session_id: str | None = None,
        latest_only: bool = True,
        limit: int = 50,
    ) -> list[ConversationSnapshot]:
        q = "SELECT * FROM conversation_snapshots WHERE tenant_id=?"
        params: list[Any] = [tenant_id]
        if session_id:
            q += " AND session_id=?"
            params.append(session_id)
        if latest_only:
            q += " AND is_latest=1"
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as conn:
            rows = conn.execute(q, params).fetchall()
        return [self._row_to_snapshot(r) for r in rows]

    # ── Restore ──────────────────────────────────────────────────────────────

    def restore(
        self,
        conversation_id: str,
        target_version: int,
        restored_by: str = "system",
        reason: str = "",
    ) -> RestorationRecord:
        """Restore a conversation to a historical snapshot version."""
        with self._conn() as conn:
            row = conn.execute(
                """SELECT * FROM conversation_snapshots
                   WHERE conversation_id=? AND version=?""",
                (conversation_id, target_version),
            ).fetchone()
        if row is None:
            raise ValueError(
                f"Snapshot version {target_version} not found for conversation {conversation_id}"
            )
        snapshot = self._row_to_snapshot(row)

        # Re-snapshot at current head as a new version with restored content
        inp = SnapshotInput(
            conversation_id=conversation_id,
            tenant_id=snapshot.tenant_id,
            intent=snapshot.intent,
            entities=snapshot.entities,
            decisions=[
                DecisionRecord(
                    key=d["key"],
                    value=d["value"],
                    outcome=DecisionOutcome(d.get("outcome", "confirmed")),
                    rationale=d.get("rationale", ""),
                    turn=d.get("turn", 0),
                )
                for d in snapshot.decisions
            ],
            pending_actions=[
                PendingAction(
                    action_id=p["action_id"],
                    action_type=p["action_type"],
                    description=p["description"],
                    status=PendingActionStatus(p.get("status", "queued")),
                    priority=p.get("priority", 5),
                    metadata=p.get("metadata", {}),
                )
                for p in snapshot.pending_actions
            ],
            context=snapshot.context,
            summary=f"[RESTORED from v{target_version}] {snapshot.summary}",
            session_id=snapshot.session_id,
            turn_count=snapshot.turn_count,
            metadata={**snapshot.metadata, "restored_from_version": target_version},
        )
        restored_snap = self.snapshot(inp)

        rest_id = str(uuid.uuid4())
        now = _utc_now()
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO conversation_restorations
                   (restoration_id, conversation_id, snapshot_id, restored_by, reason, created_at)
                   VALUES (?,?,?,?,?,?)""",
                (rest_id, conversation_id, restored_snap.snapshot_id, restored_by, reason, now),
            )
        log.info(
            "conversation_restored",
            restoration_id=rest_id,
            conversation_id=conversation_id,
            target_version=target_version,
        )
        return RestorationRecord(
            restoration_id=rest_id,
            conversation_id=conversation_id,
            snapshot_id=restored_snap.snapshot_id,
            restored_by=restored_by,
            reason=reason,
            snapshot=restored_snap,
            created_at=now,
        )

    # ── Patch helpers (update entities/pending in-place) ────────────────────

    def update_latest_entities(
        self, conversation_id: str, updates: dict[str, Any]
    ) -> ConversationSnapshot | None:
        """Merge entity updates into the latest snapshot without bumping version."""
        snap = self.get_latest(conversation_id)
        if snap is None:
            return None
        merged = {**snap.entities, **updates}
        with self._conn() as conn:
            conn.execute(
                "UPDATE conversation_snapshots SET entities_json=? WHERE snapshot_id=?",
                (json.dumps(merged), snap.snapshot_id),
            )
        return self.get_snapshot(snap.snapshot_id)

    def delete_snapshots(self, conversation_id: str) -> int:
        """Remove all snapshots for a conversation (GDPR / cleanup)."""
        with self._conn() as conn:
            cur = conn.execute(
                "DELETE FROM conversation_snapshots WHERE conversation_id=?",
                (conversation_id,),
            )
        return cur.rowcount

    # ── Helpers ─────────────────────────────────────────────────────────────

    @staticmethod
    def _row_to_snapshot(row: sqlite3.Row) -> ConversationSnapshot:
        return ConversationSnapshot(
            snapshot_id=row["snapshot_id"],
            conversation_id=row["conversation_id"],
            tenant_id=row["tenant_id"],
            session_id=row["session_id"],
            version=row["version"],
            intent=row["intent"],
            entities=json.loads(row["entities_json"]),
            decisions=json.loads(row["decisions_json"]),
            pending_actions=json.loads(row["pending_json"]),
            context=json.loads(row["context_json"]),
            summary=row["summary"],
            turn_count=row["turn_count"],
            is_latest=bool(row["is_latest"]),
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"],
        )


# ── Singleton factory ────────────────────────────────────────────────────────

_manager: ConversationStateManager | None = None


def get_state_manager() -> ConversationStateManager:
    global _manager
    if _manager is None:
        _manager = ConversationStateManager()
    return _manager


def reset_state_manager(db_path: Path | None = None) -> ConversationStateManager:
    global _manager
    _manager = ConversationStateManager(db_path=db_path)
    return _manager
