"""AMC Product — Approval Workflow.

Draft → approve → send pipeline with rejection/revision handling.

States:  draft → pending_approval → approved → sent
                              ↓ rejected → revision → pending_approval

Revenue path: human-in-the-loop guardrails increase enterprise trust → larger ACV.
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
CREATE TABLE IF NOT EXISTS approval_drafts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_id        TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    author_id       TEXT NOT NULL,
    title           TEXT NOT NULL,
    content         TEXT NOT NULL DEFAULT '',
    draft_type      TEXT NOT NULL DEFAULT 'email',
    status          TEXT NOT NULL DEFAULT 'draft',
    version         INTEGER NOT NULL DEFAULT 1,
    parent_draft_id TEXT,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_draft_tenant ON approval_drafts(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_draft_status ON approval_drafts(status);

CREATE TABLE IF NOT EXISTS approval_requests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id      TEXT NOT NULL UNIQUE,
    draft_id        TEXT NOT NULL,
    approver_id     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    due_at          TEXT,
    decided_at      TEXT,
    decision_note   TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL,
    FOREIGN KEY (draft_id) REFERENCES approval_drafts(draft_id)
);
CREATE INDEX IF NOT EXISTS idx_approver ON approval_requests(approver_id, status);
CREATE INDEX IF NOT EXISTS idx_req_draft ON approval_requests(draft_id);

CREATE TABLE IF NOT EXISTS approval_revisions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    revision_id     TEXT NOT NULL UNIQUE,
    draft_id        TEXT NOT NULL,
    request_id      TEXT NOT NULL,
    revision_note   TEXT NOT NULL DEFAULT '',
    new_content     TEXT NOT NULL,
    revised_by      TEXT NOT NULL,
    revised_at      TEXT NOT NULL,
    FOREIGN KEY (draft_id) REFERENCES approval_drafts(draft_id)
);

CREATE TABLE IF NOT EXISTS approval_send_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    send_id         TEXT NOT NULL UNIQUE,
    draft_id        TEXT NOT NULL,
    sent_by         TEXT NOT NULL,
    channel         TEXT NOT NULL DEFAULT 'email',
    recipients_json TEXT NOT NULL DEFAULT '[]',
    send_status     TEXT NOT NULL DEFAULT 'sent',
    send_ref        TEXT NOT NULL DEFAULT '',
    sent_at         TEXT NOT NULL,
    FOREIGN KEY (draft_id) REFERENCES approval_drafts(draft_id)
);
"""

# ---------------------------------------------------------------------------
# Enums & Models
# ---------------------------------------------------------------------------

class DraftStatus(str, Enum):
    DRAFT            = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED         = "approved"
    REJECTED         = "rejected"
    IN_REVISION      = "in_revision"
    SENT             = "sent"
    CANCELLED        = "cancelled"


class ApprovalDecision(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"


class DraftCreateInput(BaseModel):
    tenant_id: str
    author_id: str
    title: str
    content: str
    draft_type: str = "email"
    metadata: dict[str, Any] = Field(default_factory=dict)


class DraftUpdateInput(BaseModel):
    draft_id: str
    content: str
    title: str | None = None
    metadata: dict[str, Any] | None = None


class SubmitForApprovalInput(BaseModel):
    draft_id: str
    approver_ids: list[str]
    due_at: str | None = None
    note: str = ""


class ApprovalDecisionInput(BaseModel):
    request_id: str
    approver_id: str
    decision: ApprovalDecision
    note: str = ""


class RevisionInput(BaseModel):
    draft_id: str
    request_id: str
    revised_by: str
    revision_note: str
    new_content: str


class SendInput(BaseModel):
    draft_id: str
    sent_by: str
    channel: str = "email"
    recipients: list[str] = Field(default_factory=list)
    send_ref: str = ""


class DraftRecord(BaseModel):
    draft_id: str
    tenant_id: str
    author_id: str
    title: str
    content: str
    draft_type: str
    status: str
    version: int
    parent_draft_id: str | None
    metadata: dict[str, Any]
    created_at: str
    updated_at: str


class ApprovalRequestRecord(BaseModel):
    request_id: str
    draft_id: str
    approver_id: str
    status: str
    due_at: str | None
    decided_at: str | None
    decision_note: str
    created_at: str


class RevisionRecord(BaseModel):
    revision_id: str
    draft_id: str
    request_id: str
    revision_note: str
    new_content: str
    revised_by: str
    revised_at: str


class SendEventRecord(BaseModel):
    send_id: str
    draft_id: str
    sent_by: str
    channel: str
    recipients: list[str]
    send_status: str
    send_ref: str
    sent_at: str


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------

def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ApprovalWorkflowManager:
    """Manages draft→approve→send lifecycle."""

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
    # Drafts
    # ------------------------------------------------------------------

    def create_draft(self, inp: DraftCreateInput) -> DraftRecord:
        draft_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO approval_drafts
                   (draft_id, tenant_id, author_id, title, content,
                    draft_type, status, version, metadata_json, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (draft_id, inp.tenant_id, inp.author_id, inp.title,
                 inp.content, inp.draft_type, DraftStatus.DRAFT.value,
                 1, json.dumps(inp.metadata), now, now),
            )
        log.info("approval.draft_created", draft_id=draft_id, tenant=inp.tenant_id)
        return self.get_draft(draft_id)  # type: ignore[return-value]

    def get_draft(self, draft_id: str) -> DraftRecord | None:
        with self._conn() as c:
            row = c.execute("SELECT * FROM approval_drafts WHERE draft_id=?", (draft_id,)).fetchone()
        if row is None:
            return None
        return self._row_to_draft(row)

    def _row_to_draft(self, row: sqlite3.Row) -> DraftRecord:
        return DraftRecord(
            draft_id=row["draft_id"], tenant_id=row["tenant_id"],
            author_id=row["author_id"], title=row["title"],
            content=row["content"], draft_type=row["draft_type"],
            status=row["status"], version=row["version"],
            parent_draft_id=row["parent_draft_id"],
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"], updated_at=row["updated_at"],
        )

    def update_draft(self, inp: DraftUpdateInput) -> DraftRecord:
        draft = self.get_draft(inp.draft_id)
        if draft is None:
            raise ValueError(f"Draft {inp.draft_id!r} not found")
        if draft.status not in (DraftStatus.DRAFT.value, DraftStatus.IN_REVISION.value):
            raise ValueError(f"Draft in status {draft.status!r} cannot be edited")
        now = _utc_now()
        title = inp.title if inp.title is not None else draft.title
        meta = inp.metadata if inp.metadata is not None else draft.metadata
        with self._lock, self._conn() as c:
            c.execute(
                """UPDATE approval_drafts
                   SET content=?, title=?, metadata_json=?, version=version+1, updated_at=?
                   WHERE draft_id=?""",
                (inp.content, title, json.dumps(meta), now, inp.draft_id),
            )
        return self.get_draft(inp.draft_id)  # type: ignore[return-value]

    def list_drafts(
        self,
        tenant_id: str | None = None,
        author_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[DraftRecord]:
        q = "SELECT * FROM approval_drafts WHERE 1=1"
        params: list[Any] = []
        if tenant_id:
            q += " AND tenant_id=?"; params.append(tenant_id)
        if author_id:
            q += " AND author_id=?"; params.append(author_id)
        if status:
            q += " AND status=?"; params.append(status)
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [self._row_to_draft(r) for r in rows]

    # ------------------------------------------------------------------
    # Approval routing
    # ------------------------------------------------------------------

    def submit_for_approval(self, inp: SubmitForApprovalInput) -> list[ApprovalRequestRecord]:
        draft = self.get_draft(inp.draft_id)
        if draft is None:
            raise ValueError(f"Draft {inp.draft_id!r} not found")
        if draft.status not in (DraftStatus.DRAFT.value, DraftStatus.IN_REVISION.value):
            raise ValueError(f"Draft in status {draft.status!r} cannot be submitted")
        if not inp.approver_ids:
            raise ValueError("At least one approver required")

        now = _utc_now()
        records: list[ApprovalRequestRecord] = []
        with self._lock, self._conn() as c:
            c.execute(
                "UPDATE approval_drafts SET status=?, updated_at=? WHERE draft_id=?",
                (DraftStatus.PENDING_APPROVAL.value, now, inp.draft_id),
            )
            for approver_id in inp.approver_ids:
                req_id = str(uuid.uuid4())
                c.execute(
                    """INSERT INTO approval_requests
                       (request_id, draft_id, approver_id, status, due_at, created_at)
                       VALUES (?,?,?,?,?,?)""",
                    (req_id, inp.draft_id, approver_id,
                     "pending", inp.due_at, now),
                )
                records.append(ApprovalRequestRecord(
                    request_id=req_id, draft_id=inp.draft_id,
                    approver_id=approver_id, status="pending",
                    due_at=inp.due_at, decided_at=None,
                    decision_note="", created_at=now,
                ))
        log.info("approval.submitted", draft_id=inp.draft_id, approvers=inp.approver_ids)
        return records

    def decide(self, inp: ApprovalDecisionInput) -> ApprovalRequestRecord:
        now = _utc_now()
        with self._lock, self._conn() as c:
            row = c.execute(
                "SELECT * FROM approval_requests WHERE request_id=?", (inp.request_id,)
            ).fetchone()
            if row is None:
                raise ValueError(f"Request {inp.request_id!r} not found")
            if row["approver_id"] != inp.approver_id:
                raise ValueError("Approver mismatch")
            if row["status"] != "pending":
                raise ValueError(f"Request already decided: {row['status']}")

            c.execute(
                """UPDATE approval_requests
                   SET status=?, decided_at=?, decision_note=? WHERE request_id=?""",
                (inp.decision.value, now, inp.note, inp.request_id),
            )
            draft_id = row["draft_id"]

            # Determine new draft status based on all requests for this draft
            all_reqs = c.execute(
                "SELECT status FROM approval_requests WHERE draft_id=?", (draft_id,)
            ).fetchall()
            statuses = [r["status"] for r in all_reqs]
            # Update the current one in the list
            statuses = [
                inp.decision.value if r["request_id"] == inp.request_id else r["status"]
                for r in c.execute(
                    "SELECT request_id, status FROM approval_requests WHERE draft_id=?", (draft_id,)
                ).fetchall()
            ]

            if inp.decision == ApprovalDecision.REJECTED:
                new_draft_status = DraftStatus.REJECTED.value
            elif all(s == "approved" for s in statuses):
                new_draft_status = DraftStatus.APPROVED.value
            else:
                new_draft_status = DraftStatus.PENDING_APPROVAL.value

            c.execute(
                "UPDATE approval_drafts SET status=?, updated_at=? WHERE draft_id=?",
                (new_draft_status, now, draft_id),
            )

        log.info("approval.decided", request_id=inp.request_id, decision=inp.decision.value)
        with self._conn() as c:
            row2 = c.execute(
                "SELECT * FROM approval_requests WHERE request_id=?", (inp.request_id,)
            ).fetchone()
        return ApprovalRequestRecord(
            request_id=row2["request_id"], draft_id=row2["draft_id"],
            approver_id=row2["approver_id"], status=row2["status"],
            due_at=row2["due_at"], decided_at=row2["decided_at"],
            decision_note=row2["decision_note"], created_at=row2["created_at"],
        )

    def list_requests(
        self,
        draft_id: str | None = None,
        approver_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[ApprovalRequestRecord]:
        q = "SELECT * FROM approval_requests WHERE 1=1"
        params: list[Any] = []
        if draft_id:
            q += " AND draft_id=?"; params.append(draft_id)
        if approver_id:
            q += " AND approver_id=?"; params.append(approver_id)
        if status:
            q += " AND status=?"; params.append(status)
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [
            ApprovalRequestRecord(
                request_id=r["request_id"], draft_id=r["draft_id"],
                approver_id=r["approver_id"], status=r["status"],
                due_at=r["due_at"], decided_at=r["decided_at"],
                decision_note=r["decision_note"], created_at=r["created_at"],
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Revision
    # ------------------------------------------------------------------

    def submit_revision(self, inp: RevisionInput) -> RevisionRecord:
        draft = self.get_draft(inp.draft_id)
        if draft is None:
            raise ValueError(f"Draft {inp.draft_id!r} not found")
        if draft.status != DraftStatus.REJECTED.value:
            raise ValueError(f"Draft must be rejected to submit revision, got {draft.status!r}")

        rev_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO approval_revisions
                   (revision_id, draft_id, request_id, revision_note, new_content, revised_by, revised_at)
                   VALUES (?,?,?,?,?,?,?)""",
                (rev_id, inp.draft_id, inp.request_id,
                 inp.revision_note, inp.new_content, inp.revised_by, now),
            )
            c.execute(
                """UPDATE approval_drafts
                   SET content=?, status=?, version=version+1, updated_at=?
                   WHERE draft_id=?""",
                (inp.new_content, DraftStatus.IN_REVISION.value, now, inp.draft_id),
            )
            # reset related approval requests to pending
            c.execute(
                "UPDATE approval_requests SET status='pending', decided_at=NULL WHERE draft_id=?",
                (inp.draft_id,),
            )
        log.info("approval.revision_submitted", draft_id=inp.draft_id, revised_by=inp.revised_by)
        return RevisionRecord(
            revision_id=rev_id, draft_id=inp.draft_id,
            request_id=inp.request_id, revision_note=inp.revision_note,
            new_content=inp.new_content, revised_by=inp.revised_by, revised_at=now,
        )

    # ------------------------------------------------------------------
    # Send
    # ------------------------------------------------------------------

    def send_draft(self, inp: SendInput) -> SendEventRecord:
        draft = self.get_draft(inp.draft_id)
        if draft is None:
            raise ValueError(f"Draft {inp.draft_id!r} not found")
        if draft.status != DraftStatus.APPROVED.value:
            raise ValueError(f"Draft must be approved before sending, got {draft.status!r}")

        send_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO approval_send_events
                   (send_id, draft_id, sent_by, channel, recipients_json, send_status, send_ref, sent_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (send_id, inp.draft_id, inp.sent_by, inp.channel,
                 json.dumps(inp.recipients), "sent", inp.send_ref, now),
            )
            c.execute(
                "UPDATE approval_drafts SET status=?, updated_at=? WHERE draft_id=?",
                (DraftStatus.SENT.value, now, inp.draft_id),
            )
        log.info("approval.sent", draft_id=inp.draft_id, channel=inp.channel)
        return SendEventRecord(
            send_id=send_id, draft_id=inp.draft_id, sent_by=inp.sent_by,
            channel=inp.channel, recipients=inp.recipients,
            send_status="sent", send_ref=inp.send_ref, sent_at=now,
        )

    def get_send_events(self, draft_id: str) -> list[SendEventRecord]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM approval_send_events WHERE draft_id=? ORDER BY sent_at",
                (draft_id,),
            ).fetchall()
        return [
            SendEventRecord(
                send_id=r["send_id"], draft_id=r["draft_id"],
                sent_by=r["sent_by"], channel=r["channel"],
                recipients=json.loads(r["recipients_json"]),
                send_status=r["send_status"], send_ref=r["send_ref"],
                sent_at=r["sent_at"],
            )
            for r in rows
        ]


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_manager: ApprovalWorkflowManager | None = None
_manager_lock = Lock()


def get_approval_manager(db_path: str | Path | None = None) -> ApprovalWorkflowManager:
    global _manager
    with _manager_lock:
        if _manager is None:
            _manager = ApprovalWorkflowManager(db_path=db_path)
    return _manager


__all__ = [
    "DraftStatus",
    "ApprovalDecision",
    "DraftCreateInput",
    "DraftUpdateInput",
    "SubmitForApprovalInput",
    "ApprovalDecisionInput",
    "RevisionInput",
    "SendInput",
    "DraftRecord",
    "ApprovalRequestRecord",
    "RevisionRecord",
    "SendEventRecord",
    "ApprovalWorkflowManager",
    "get_approval_manager",
]
