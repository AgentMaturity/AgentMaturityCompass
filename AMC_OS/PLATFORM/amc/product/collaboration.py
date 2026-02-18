"""AMC Product — Team Collaboration Mode.

Task assignment, ownership tracking, human↔agent handoffs, and notification stubs.
SQLite-backed with full CRUD.

Revenue path: multi-seat team plans → per-seat expansion ARR → Lever C.
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
CREATE TABLE IF NOT EXISTS collab_tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    task_type       TEXT NOT NULL DEFAULT 'general',
    owner_id        TEXT NOT NULL,
    owner_type      TEXT NOT NULL DEFAULT 'human',
    assignee_id     TEXT,
    assignee_type   TEXT,
    status          TEXT NOT NULL DEFAULT 'open',
    priority        INTEGER NOT NULL DEFAULT 5,
    due_at          TEXT,
    tags_json       TEXT NOT NULL DEFAULT '[]',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    closed_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_collab_tenant  ON collab_tasks(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collab_owner   ON collab_tasks(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_collab_assignee ON collab_tasks(assignee_id, status);

CREATE TABLE IF NOT EXISTS collab_handoffs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    handoff_id      TEXT NOT NULL UNIQUE,
    task_id         TEXT NOT NULL,
    from_actor_id   TEXT NOT NULL,
    from_actor_type TEXT NOT NULL DEFAULT 'human',
    to_actor_id     TEXT NOT NULL,
    to_actor_type   TEXT NOT NULL DEFAULT 'agent',
    reason          TEXT NOT NULL DEFAULT '',
    context_json    TEXT NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'pending',
    acknowledged_at TEXT,
    created_at      TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES collab_tasks(task_id)
);
CREATE INDEX IF NOT EXISTS idx_handoff_task ON collab_handoffs(task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS collab_comments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id      TEXT NOT NULL UNIQUE,
    task_id         TEXT NOT NULL,
    author_id       TEXT NOT NULL,
    author_type     TEXT NOT NULL DEFAULT 'human',
    body            TEXT NOT NULL,
    parent_comment_id TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES collab_tasks(task_id)
);
CREATE INDEX IF NOT EXISTS idx_comment_task ON collab_comments(task_id, created_at);

CREATE TABLE IF NOT EXISTS collab_notifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    notif_id        TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    recipient_id    TEXT NOT NULL,
    notif_type      TEXT NOT NULL,
    subject         TEXT NOT NULL DEFAULT '',
    body            TEXT NOT NULL DEFAULT '',
    ref_id          TEXT,
    ref_type        TEXT,
    delivered       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_recipient ON collab_notifications(recipient_id, delivered, created_at DESC);
"""

# ---------------------------------------------------------------------------
# Enums & Models
# ---------------------------------------------------------------------------

class ActorType(str, Enum):
    HUMAN = "human"
    AGENT = "agent"


class TaskStatus(str, Enum):
    OPEN        = "open"
    IN_PROGRESS = "in_progress"
    REVIEW      = "review"
    DONE        = "done"
    CANCELLED   = "cancelled"


class HandoffStatus(str, Enum):
    PENDING      = "pending"
    ACKNOWLEDGED = "acknowledged"
    COMPLETED    = "completed"
    REJECTED     = "rejected"


class TaskCreateInput(BaseModel):
    tenant_id: str
    title: str
    description: str = ""
    task_type: str = "general"
    owner_id: str
    owner_type: ActorType = ActorType.HUMAN
    assignee_id: str | None = None
    assignee_type: ActorType | None = None
    priority: int = Field(default=5, ge=1, le=10)
    due_at: str | None = None
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class TaskUpdateInput(BaseModel):
    task_id: str
    title: str | None = None
    description: str | None = None
    status: TaskStatus | None = None
    priority: int | None = None
    due_at: str | None = None
    tags: list[str] | None = None


class AssignInput(BaseModel):
    task_id: str
    assignee_id: str
    assignee_type: ActorType = ActorType.HUMAN


class HandoffInput(BaseModel):
    task_id: str
    from_actor_id: str
    from_actor_type: ActorType = ActorType.HUMAN
    to_actor_id: str
    to_actor_type: ActorType = ActorType.AGENT
    reason: str = ""
    context: dict[str, Any] = Field(default_factory=dict)


class HandoffAckInput(BaseModel):
    handoff_id: str
    actor_id: str


class CommentInput(BaseModel):
    task_id: str
    author_id: str
    author_type: ActorType = ActorType.HUMAN
    body: str
    parent_comment_id: str | None = None


class TaskRecord(BaseModel):
    task_id: str
    tenant_id: str
    title: str
    description: str
    task_type: str
    owner_id: str
    owner_type: str
    assignee_id: str | None
    assignee_type: str | None
    status: str
    priority: int
    due_at: str | None
    tags: list[str]
    metadata: dict[str, Any]
    created_at: str
    updated_at: str
    closed_at: str | None


class HandoffRecord(BaseModel):
    handoff_id: str
    task_id: str
    from_actor_id: str
    from_actor_type: str
    to_actor_id: str
    to_actor_type: str
    reason: str
    context: dict[str, Any]
    status: str
    acknowledged_at: str | None
    created_at: str


class CommentRecord(BaseModel):
    comment_id: str
    task_id: str
    author_id: str
    author_type: str
    body: str
    parent_comment_id: str | None
    created_at: str
    updated_at: str


class NotificationRecord(BaseModel):
    notif_id: str
    tenant_id: str
    recipient_id: str
    notif_type: str
    subject: str
    body: str
    ref_id: str | None
    ref_type: str | None
    delivered: bool
    created_at: str


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------

def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class CollaborationManager:
    """Team collaboration: tasks, handoffs, comments, notifications."""

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
    # Tasks
    # ------------------------------------------------------------------

    def create_task(self, inp: TaskCreateInput) -> TaskRecord:
        task_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO collab_tasks
                   (task_id, tenant_id, title, description, task_type,
                    owner_id, owner_type, assignee_id, assignee_type,
                    status, priority, due_at, tags_json, metadata_json,
                    created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (task_id, inp.tenant_id, inp.title, inp.description, inp.task_type,
                 inp.owner_id, inp.owner_type.value,
                 inp.assignee_id, inp.assignee_type.value if inp.assignee_type else None,
                 TaskStatus.OPEN.value, inp.priority, inp.due_at,
                 json.dumps(inp.tags), json.dumps(inp.metadata), now, now),
            )
        log.info("collab.task_created", task_id=task_id, tenant=inp.tenant_id)
        return self.get_task(task_id)  # type: ignore[return-value]

    def get_task(self, task_id: str) -> TaskRecord | None:
        with self._conn() as c:
            row = c.execute("SELECT * FROM collab_tasks WHERE task_id=?", (task_id,)).fetchone()
        if row is None:
            return None
        return self._row_to_task(row)

    def _row_to_task(self, row: sqlite3.Row) -> TaskRecord:
        return TaskRecord(
            task_id=row["task_id"], tenant_id=row["tenant_id"],
            title=row["title"], description=row["description"],
            task_type=row["task_type"], owner_id=row["owner_id"],
            owner_type=row["owner_type"], assignee_id=row["assignee_id"],
            assignee_type=row["assignee_type"], status=row["status"],
            priority=row["priority"], due_at=row["due_at"],
            tags=json.loads(row["tags_json"]),
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"], updated_at=row["updated_at"],
            closed_at=row["closed_at"],
        )

    def update_task(self, inp: TaskUpdateInput) -> TaskRecord:
        task = self.get_task(inp.task_id)
        if task is None:
            raise ValueError(f"Task {inp.task_id!r} not found")
        now = _utc_now()
        fields: dict[str, Any] = {"updated_at": now}
        if inp.title is not None:
            fields["title"] = inp.title
        if inp.description is not None:
            fields["description"] = inp.description
        if inp.status is not None:
            fields["status"] = inp.status.value
            if inp.status in (TaskStatus.DONE, TaskStatus.CANCELLED):
                fields["closed_at"] = now
        if inp.priority is not None:
            fields["priority"] = inp.priority
        if inp.due_at is not None:
            fields["due_at"] = inp.due_at
        if inp.tags is not None:
            fields["tags_json"] = json.dumps(inp.tags)

        set_clause = ", ".join(f"{k}=?" for k in fields)
        vals = list(fields.values()) + [inp.task_id]
        with self._lock, self._conn() as c:
            c.execute(f"UPDATE collab_tasks SET {set_clause} WHERE task_id=?", vals)
        return self.get_task(inp.task_id)  # type: ignore[return-value]

    def assign_task(self, inp: AssignInput) -> TaskRecord:
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """UPDATE collab_tasks
                   SET assignee_id=?, assignee_type=?, status=?, updated_at=?
                   WHERE task_id=?""",
                (inp.assignee_id, inp.assignee_type.value,
                 TaskStatus.IN_PROGRESS.value, now, inp.task_id),
            )
        self._notify(
            tenant_id=self._get_tenant(inp.task_id),
            recipient_id=inp.assignee_id,
            notif_type="task_assigned",
            subject=f"Task assigned to you",
            body=f"Task {inp.task_id} has been assigned to you.",
            ref_id=inp.task_id, ref_type="task",
        )
        return self.get_task(inp.task_id)  # type: ignore[return-value]

    def _get_tenant(self, task_id: str) -> str:
        with self._conn() as c:
            row = c.execute("SELECT tenant_id FROM collab_tasks WHERE task_id=?", (task_id,)).fetchone()
        return row["tenant_id"] if row else ""

    def list_tasks(
        self,
        tenant_id: str | None = None,
        owner_id: str | None = None,
        assignee_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[TaskRecord]:
        q = "SELECT * FROM collab_tasks WHERE 1=1"
        params: list[Any] = []
        if tenant_id:
            q += " AND tenant_id=?"; params.append(tenant_id)
        if owner_id:
            q += " AND owner_id=?"; params.append(owner_id)
        if assignee_id:
            q += " AND assignee_id=?"; params.append(assignee_id)
        if status:
            q += " AND status=?"; params.append(status)
        q += " ORDER BY priority DESC, created_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [self._row_to_task(r) for r in rows]

    # ------------------------------------------------------------------
    # Handoffs
    # ------------------------------------------------------------------

    def create_handoff(self, inp: HandoffInput) -> HandoffRecord:
        handoff_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO collab_handoffs
                   (handoff_id, task_id, from_actor_id, from_actor_type,
                    to_actor_id, to_actor_type, reason, context_json, status, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (handoff_id, inp.task_id, inp.from_actor_id, inp.from_actor_type.value,
                 inp.to_actor_id, inp.to_actor_type.value,
                 inp.reason, json.dumps(inp.context),
                 HandoffStatus.PENDING.value, now),
            )
        self._notify(
            tenant_id=self._get_tenant(inp.task_id),
            recipient_id=inp.to_actor_id,
            notif_type="handoff_request",
            subject="You have a new handoff request",
            body=f"Task {inp.task_id} handoff from {inp.from_actor_id}. Reason: {inp.reason}",
            ref_id=handoff_id, ref_type="handoff",
        )
        log.info("collab.handoff_created", handoff_id=handoff_id, task=inp.task_id)
        return self._get_handoff(handoff_id)  # type: ignore[return-value]

    def _get_handoff(self, handoff_id: str) -> HandoffRecord | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM collab_handoffs WHERE handoff_id=?", (handoff_id,)
            ).fetchone()
        if row is None:
            return None
        return HandoffRecord(
            handoff_id=row["handoff_id"], task_id=row["task_id"],
            from_actor_id=row["from_actor_id"], from_actor_type=row["from_actor_type"],
            to_actor_id=row["to_actor_id"], to_actor_type=row["to_actor_type"],
            reason=row["reason"], context=json.loads(row["context_json"]),
            status=row["status"], acknowledged_at=row["acknowledged_at"],
            created_at=row["created_at"],
        )

    def acknowledge_handoff(self, inp: HandoffAckInput) -> HandoffRecord:
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                "UPDATE collab_handoffs SET status=?, acknowledged_at=? WHERE handoff_id=?",
                (HandoffStatus.ACKNOWLEDGED.value, now, inp.handoff_id),
            )
        return self._get_handoff(inp.handoff_id)  # type: ignore[return-value]

    def list_handoffs(self, task_id: str) -> list[HandoffRecord]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM collab_handoffs WHERE task_id=? ORDER BY created_at",
                (task_id,),
            ).fetchall()
        return [
            HandoffRecord(
                handoff_id=r["handoff_id"], task_id=r["task_id"],
                from_actor_id=r["from_actor_id"], from_actor_type=r["from_actor_type"],
                to_actor_id=r["to_actor_id"], to_actor_type=r["to_actor_type"],
                reason=r["reason"], context=json.loads(r["context_json"]),
                status=r["status"], acknowledged_at=r["acknowledged_at"],
                created_at=r["created_at"],
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Comments
    # ------------------------------------------------------------------

    def add_comment(self, inp: CommentInput) -> CommentRecord:
        comment_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO collab_comments
                   (comment_id, task_id, author_id, author_type,
                    body, parent_comment_id, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (comment_id, inp.task_id, inp.author_id, inp.author_type.value,
                 inp.body, inp.parent_comment_id, now, now),
            )
        return CommentRecord(
            comment_id=comment_id, task_id=inp.task_id,
            author_id=inp.author_id, author_type=inp.author_type.value,
            body=inp.body, parent_comment_id=inp.parent_comment_id,
            created_at=now, updated_at=now,
        )

    def list_comments(self, task_id: str) -> list[CommentRecord]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM collab_comments WHERE task_id=? ORDER BY created_at",
                (task_id,),
            ).fetchall()
        return [
            CommentRecord(
                comment_id=r["comment_id"], task_id=r["task_id"],
                author_id=r["author_id"], author_type=r["author_type"],
                body=r["body"], parent_comment_id=r["parent_comment_id"],
                created_at=r["created_at"], updated_at=r["updated_at"],
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Notifications (stub — logs only, real delivery handled externally)
    # ------------------------------------------------------------------

    def _notify(
        self,
        tenant_id: str,
        recipient_id: str,
        notif_type: str,
        subject: str,
        body: str,
        ref_id: str | None = None,
        ref_type: str | None = None,
    ) -> NotificationRecord:
        notif_id = str(uuid.uuid4())
        now = _utc_now()
        with self._conn() as c:
            c.execute(
                """INSERT INTO collab_notifications
                   (notif_id, tenant_id, recipient_id, notif_type,
                    subject, body, ref_id, ref_type, delivered, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (notif_id, tenant_id, recipient_id, notif_type,
                 subject, body, ref_id, ref_type, 0, now),
            )
        log.info("collab.notification_queued",
                 notif_id=notif_id, recipient=recipient_id, type=notif_type)
        return NotificationRecord(
            notif_id=notif_id, tenant_id=tenant_id,
            recipient_id=recipient_id, notif_type=notif_type,
            subject=subject, body=body, ref_id=ref_id, ref_type=ref_type,
            delivered=False, created_at=now,
        )

    def get_notifications(
        self,
        recipient_id: str,
        unread_only: bool = False,
        limit: int = 50,
    ) -> list[NotificationRecord]:
        q = "SELECT * FROM collab_notifications WHERE recipient_id=?"
        params: list[Any] = [recipient_id]
        if unread_only:
            q += " AND delivered=0"
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [
            NotificationRecord(
                notif_id=r["notif_id"], tenant_id=r["tenant_id"],
                recipient_id=r["recipient_id"], notif_type=r["notif_type"],
                subject=r["subject"], body=r["body"],
                ref_id=r["ref_id"], ref_type=r["ref_type"],
                delivered=bool(r["delivered"]), created_at=r["created_at"],
            )
            for r in rows
        ]

    def mark_notification_delivered(self, notif_id: str) -> None:
        with self._lock, self._conn() as c:
            c.execute(
                "UPDATE collab_notifications SET delivered=1 WHERE notif_id=?", (notif_id,)
            )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_collab: CollaborationManager | None = None
_collab_lock = Lock()


def get_collaboration_manager(db_path: str | Path | None = None) -> CollaborationManager:
    global _collab
    with _collab_lock:
        if _collab is None:
            _collab = CollaborationManager(db_path=db_path)
    return _collab


__all__ = [
    "ActorType",
    "TaskStatus",
    "HandoffStatus",
    "TaskCreateInput",
    "TaskUpdateInput",
    "AssignInput",
    "HandoffInput",
    "HandoffAckInput",
    "CommentInput",
    "TaskRecord",
    "HandoffRecord",
    "CommentRecord",
    "NotificationRecord",
    "CollaborationManager",
    "get_collaboration_manager",
]
