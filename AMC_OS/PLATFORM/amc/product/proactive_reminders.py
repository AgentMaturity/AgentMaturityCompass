"""AMC Product — Proactive Reminders & Follow-ups.

Opt-in reminder scheduling, missing-info chasing, and renewal nudges.
SQLite-backed scheduler with due-time lookup.

Revenue path: timely follow-ups → fewer dropped deals, higher renewal rates.
"""
from __future__ import annotations

import json
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
CREATE TABLE IF NOT EXISTS reminder_subscriptions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_id          TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    owner_id        TEXT NOT NULL,
    reminder_type   TEXT NOT NULL,
    label           TEXT NOT NULL DEFAULT '',
    opt_in          INTEGER NOT NULL DEFAULT 1,
    channels_json   TEXT NOT NULL DEFAULT '["email"]',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_owner_type
    ON reminder_subscriptions(tenant_id, owner_id, reminder_type);
CREATE INDEX IF NOT EXISTS idx_sub_tenant ON reminder_subscriptions(tenant_id);

CREATE TABLE IF NOT EXISTS reminders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    reminder_id     TEXT NOT NULL UNIQUE,
    sub_id          TEXT NOT NULL,
    tenant_id       TEXT NOT NULL,
    owner_id        TEXT NOT NULL,
    reminder_type   TEXT NOT NULL,
    subject         TEXT NOT NULL DEFAULT '',
    body            TEXT NOT NULL DEFAULT '',
    due_at          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'scheduled',
    sent_at         TEXT,
    snoozed_until   TEXT,
    ref_id          TEXT,
    ref_type        TEXT,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    FOREIGN KEY (sub_id) REFERENCES reminder_subscriptions(sub_id)
);
CREATE INDEX IF NOT EXISTS idx_reminder_due    ON reminders(due_at, status);
CREATE INDEX IF NOT EXISTS idx_reminder_owner  ON reminders(owner_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_reminder_tenant ON reminders(tenant_id, due_at DESC);

CREATE TABLE IF NOT EXISTS reminder_snooze_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    log_id          TEXT NOT NULL UNIQUE,
    reminder_id     TEXT NOT NULL,
    snoozed_by      TEXT NOT NULL,
    snooze_until    TEXT NOT NULL,
    reason          TEXT NOT NULL DEFAULT '',
    snoozed_at      TEXT NOT NULL,
    FOREIGN KEY (reminder_id) REFERENCES reminders(reminder_id)
);
"""

# ---------------------------------------------------------------------------
# Enums & Models
# ---------------------------------------------------------------------------

class ReminderType(str, Enum):
    MISSING_INFO   = "missing_info"
    FOLLOW_UP      = "follow_up"
    RENEWAL_NUDGE  = "renewal_nudge"
    MEETING        = "meeting"
    TASK_DUE       = "task_due"
    PAYMENT        = "payment"
    CUSTOM         = "custom"


class ReminderStatus(str, Enum):
    SCHEDULED  = "scheduled"
    SENT       = "sent"
    SNOOZED    = "snoozed"
    CANCELLED  = "cancelled"
    FAILED     = "failed"


class SubscriptionInput(BaseModel):
    tenant_id: str
    owner_id: str
    reminder_type: ReminderType
    label: str = ""
    opt_in: bool = True
    channels: list[str] = Field(default_factory=lambda: ["email"])
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReminderCreateInput(BaseModel):
    tenant_id: str
    owner_id: str
    reminder_type: ReminderType
    subject: str
    body: str = ""
    due_at: str                          # ISO 8601 UTC
    ref_id: str | None = None
    ref_type: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SnoozeInput(BaseModel):
    reminder_id: str
    snoozed_by: str
    snooze_until: str                    # ISO 8601 UTC
    reason: str = ""


class SubscriptionRecord(BaseModel):
    sub_id: str
    tenant_id: str
    owner_id: str
    reminder_type: str
    label: str
    opt_in: bool
    channels: list[str]
    metadata: dict[str, Any]
    created_at: str
    updated_at: str


class ReminderRecord(BaseModel):
    reminder_id: str
    sub_id: str
    tenant_id: str
    owner_id: str
    reminder_type: str
    subject: str
    body: str
    due_at: str
    status: str
    sent_at: str | None
    snoozed_until: str | None
    ref_id: str | None
    ref_type: str | None
    metadata: dict[str, Any]
    created_at: str


class SnoozeLogRecord(BaseModel):
    log_id: str
    reminder_id: str
    snoozed_by: str
    snooze_until: str
    reason: str
    snoozed_at: str


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------

def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ProactiveReminderManager:
    """Manages opt-in reminder subscriptions and scheduled reminder dispatch."""

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

    # ------------------------------------------------------------------
    # Subscriptions
    # ------------------------------------------------------------------

    def subscribe(self, inp: SubscriptionInput) -> SubscriptionRecord:
        now = _utc_now()
        with self._lock, self._conn() as c:
            existing = c.execute(
                """SELECT sub_id FROM reminder_subscriptions
                   WHERE tenant_id=? AND owner_id=? AND reminder_type=?""",
                (inp.tenant_id, inp.owner_id, inp.reminder_type.value),
            ).fetchone()
            if existing:
                # upsert
                c.execute(
                    """UPDATE reminder_subscriptions
                       SET opt_in=?, channels_json=?, label=?, metadata_json=?, updated_at=?
                       WHERE sub_id=?""",
                    (int(inp.opt_in), json.dumps(inp.channels), inp.label,
                     json.dumps(inp.metadata), now, existing["sub_id"]),
                )
                sub_id = existing["sub_id"]
            else:
                sub_id = str(uuid.uuid4())
                c.execute(
                    """INSERT INTO reminder_subscriptions
                       (sub_id, tenant_id, owner_id, reminder_type, label,
                        opt_in, channels_json, metadata_json, created_at, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (sub_id, inp.tenant_id, inp.owner_id, inp.reminder_type.value,
                     inp.label, int(inp.opt_in), json.dumps(inp.channels),
                     json.dumps(inp.metadata), now, now),
                )
        return self._get_subscription(sub_id)  # type: ignore[return-value]

    def unsubscribe(self, tenant_id: str, owner_id: str, reminder_type: str) -> bool:
        now = _utc_now()
        with self._lock, self._conn() as c:
            n = c.execute(
                """UPDATE reminder_subscriptions SET opt_in=0, updated_at=?
                   WHERE tenant_id=? AND owner_id=? AND reminder_type=?""",
                (now, tenant_id, owner_id, reminder_type),
            ).rowcount
        return n > 0

    def _get_subscription(self, sub_id: str) -> SubscriptionRecord | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM reminder_subscriptions WHERE sub_id=?", (sub_id,)
            ).fetchone()
        if row is None:
            return None
        return SubscriptionRecord(
            sub_id=row["sub_id"], tenant_id=row["tenant_id"],
            owner_id=row["owner_id"], reminder_type=row["reminder_type"],
            label=row["label"], opt_in=bool(row["opt_in"]),
            channels=json.loads(row["channels_json"]),
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"], updated_at=row["updated_at"],
        )

    def list_subscriptions(
        self, tenant_id: str, owner_id: str | None = None, opt_in_only: bool = True
    ) -> list[SubscriptionRecord]:
        q = "SELECT * FROM reminder_subscriptions WHERE tenant_id=?"
        params: list[Any] = [tenant_id]
        if owner_id:
            q += " AND owner_id=?"; params.append(owner_id)
        if opt_in_only:
            q += " AND opt_in=1"
        q += " ORDER BY created_at DESC"
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [
            SubscriptionRecord(
                sub_id=r["sub_id"], tenant_id=r["tenant_id"],
                owner_id=r["owner_id"], reminder_type=r["reminder_type"],
                label=r["label"], opt_in=bool(r["opt_in"]),
                channels=json.loads(r["channels_json"]),
                metadata=json.loads(r["metadata_json"]),
                created_at=r["created_at"], updated_at=r["updated_at"],
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Reminders
    # ------------------------------------------------------------------

    def _resolve_sub_id(self, tenant_id: str, owner_id: str, reminder_type: str) -> str:
        """Get or auto-create subscription."""
        with self._conn() as c:
            row = c.execute(
                """SELECT sub_id FROM reminder_subscriptions
                   WHERE tenant_id=? AND owner_id=? AND reminder_type=?""",
                (tenant_id, owner_id, reminder_type),
            ).fetchone()
        if row:
            return row["sub_id"]
        # Auto-subscribe
        rec = self.subscribe(SubscriptionInput(
            tenant_id=tenant_id, owner_id=owner_id,
            reminder_type=ReminderType(reminder_type),
        ))
        return rec.sub_id

    def create_reminder(self, inp: ReminderCreateInput) -> ReminderRecord:
        sub_id = self._resolve_sub_id(inp.tenant_id, inp.owner_id, inp.reminder_type.value)
        reminder_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO reminders
                   (reminder_id, sub_id, tenant_id, owner_id, reminder_type,
                    subject, body, due_at, status, ref_id, ref_type,
                    metadata_json, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (reminder_id, sub_id, inp.tenant_id, inp.owner_id,
                 inp.reminder_type.value, inp.subject, inp.body, inp.due_at,
                 ReminderStatus.SCHEDULED.value, inp.ref_id, inp.ref_type,
                 json.dumps(inp.metadata), now),
            )
        log.info("reminders.scheduled",
                 reminder_id=reminder_id, owner=inp.owner_id, due_at=inp.due_at)
        return self._get_reminder(reminder_id)  # type: ignore[return-value]

    def _get_reminder(self, reminder_id: str) -> ReminderRecord | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM reminders WHERE reminder_id=?", (reminder_id,)
            ).fetchone()
        return self._row_to_reminder(row) if row else None

    def _row_to_reminder(self, row: sqlite3.Row) -> ReminderRecord:
        return ReminderRecord(
            reminder_id=row["reminder_id"], sub_id=row["sub_id"],
            tenant_id=row["tenant_id"], owner_id=row["owner_id"],
            reminder_type=row["reminder_type"], subject=row["subject"],
            body=row["body"], due_at=row["due_at"], status=row["status"],
            sent_at=row["sent_at"], snoozed_until=row["snoozed_until"],
            ref_id=row["ref_id"], ref_type=row["ref_type"],
            metadata=json.loads(row["metadata_json"]), created_at=row["created_at"],
        )

    def get_due_reminders(self, as_of: str | None = None) -> list[ReminderRecord]:
        """Return all scheduled reminders that are due by as_of (default: now)."""
        cutoff = as_of or _utc_now()
        with self._conn() as c:
            rows = c.execute(
                """SELECT * FROM reminders
                   WHERE status='scheduled' AND due_at <= ?
                   ORDER BY due_at ASC""",
                (cutoff,),
            ).fetchall()
        return [self._row_to_reminder(r) for r in rows]

    def mark_sent(self, reminder_id: str) -> ReminderRecord:
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                "UPDATE reminders SET status=?, sent_at=? WHERE reminder_id=?",
                (ReminderStatus.SENT.value, now, reminder_id),
            )
        return self._get_reminder(reminder_id)  # type: ignore[return-value]

    def cancel_reminder(self, reminder_id: str) -> ReminderRecord:
        with self._lock, self._conn() as c:
            c.execute(
                "UPDATE reminders SET status=? WHERE reminder_id=?",
                (ReminderStatus.CANCELLED.value, reminder_id),
            )
        return self._get_reminder(reminder_id)  # type: ignore[return-value]

    def snooze_reminder(self, inp: SnoozeInput) -> ReminderRecord:
        now = _utc_now()
        log_id = str(uuid.uuid4())
        with self._lock, self._conn() as c:
            c.execute(
                """UPDATE reminders
                   SET status=?, snoozed_until=?, due_at=?
                   WHERE reminder_id=?""",
                (ReminderStatus.SNOOZED.value, inp.snooze_until,
                 inp.snooze_until, inp.reminder_id),
            )
            c.execute(
                """INSERT INTO reminder_snooze_log
                   (log_id, reminder_id, snoozed_by, snooze_until, reason, snoozed_at)
                   VALUES (?,?,?,?,?,?)""",
                (log_id, inp.reminder_id, inp.snoozed_by,
                 inp.snooze_until, inp.reason, now),
            )
        # Re-activate as scheduled
        with self._lock, self._conn() as c:
            c.execute(
                "UPDATE reminders SET status=? WHERE reminder_id=?",
                (ReminderStatus.SCHEDULED.value, inp.reminder_id),
            )
        return self._get_reminder(inp.reminder_id)  # type: ignore[return-value]

    def list_reminders(
        self,
        tenant_id: str,
        owner_id: str | None = None,
        status: str | None = None,
        reminder_type: str | None = None,
        limit: int = 100,
    ) -> list[ReminderRecord]:
        q = "SELECT * FROM reminders WHERE tenant_id=?"
        params: list[Any] = [tenant_id]
        if owner_id:
            q += " AND owner_id=?"; params.append(owner_id)
        if status:
            q += " AND status=?"; params.append(status)
        if reminder_type:
            q += " AND reminder_type=?"; params.append(reminder_type)
        q += " ORDER BY due_at ASC LIMIT ?"
        params.append(limit)
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [self._row_to_reminder(r) for r in rows]


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_reminder_mgr: ProactiveReminderManager | None = None
_reminder_lock = Lock()


def get_reminder_manager(db_path: str | Path | None = None) -> ProactiveReminderManager:
    global _reminder_mgr
    with _reminder_lock:
        if _reminder_mgr is None:
            _reminder_mgr = ProactiveReminderManager(db_path=db_path)
    return _reminder_mgr


__all__ = [
    "ReminderType",
    "ReminderStatus",
    "SubscriptionInput",
    "ReminderCreateInput",
    "SnoozeInput",
    "SubscriptionRecord",
    "ReminderRecord",
    "SnoozeLogRecord",
    "ProactiveReminderManager",
    "get_reminder_manager",
]
