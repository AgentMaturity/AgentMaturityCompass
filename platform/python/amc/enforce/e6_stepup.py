"""
AMC Enforce — E6: Step-Up Authorization (Human-in-the-loop)

Implements approval-required actions with multiple channels and durable storage.

Channels:
- webhook: call a webhook URL with JSON payload
- file: write pending request to LOGS/PENDING_APPROVALS.md and poll responses
- memory: lightweight in-memory store for tests

Usage:
    stepup = StepUpAuth(db_path="amc_stepup.db")
    req = stepup.create_request(
        action_description="Run operator command", 
        risk_level="high",
        requester="agent-core",
        timeout_seconds=120,
        session_context={"session_id": "s1"},
    )

    # from an approver process:
    stepup.approve(req.request_id, approver="sec-ops")

    status = stepup.status(req.request_id)
    print(status.approved, status.denied)
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

import structlog
from pydantic import BaseModel, Field, field_validator
from pydantic import ValidationError

from amc.core.models import RiskLevel

log = structlog.get_logger(__name__)


def _coerce_risk_level(value: "RiskLevel | str") -> "RiskLevel":
    """Coerce string → RiskLevel, handling Python 3.12+ 'ClassName.MEMBER' format and case variants."""
    if isinstance(value, RiskLevel):
        return value
    s = str(value)
    if "." in s:
        s = s.split(".")[-1]
    return RiskLevel(s.lower())


class ApprovalRequest(BaseModel):
    """Request raised for a step-up action."""

    request_id: str = Field(default_factory=lambda: str(uuid4()))
    action_description: str
    risk_level: RiskLevel
    requester: str
    timeout_seconds: int = Field(gt=0, default=300)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime | None = None
    session_context: dict[str, Any] = Field(default_factory=dict)
    channel: str = "in_memory"

    @field_validator("risk_level", mode="before")
    @classmethod
    def _coerce_risk(cls, value: RiskLevel | str) -> RiskLevel:
        return _coerce_risk_level(value)


class ApprovalAuditRecord(BaseModel):
    request_id: str
    approver: str
    action: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    session_context: dict[str, Any] = Field(default_factory=dict)


class ApprovalResult(BaseModel):
    request_id: str
    approved: bool = False
    denied: bool = False
    reason: str | None = None
    approver: str | None = None
    decided_at: datetime | None = None


@dataclass
class StepUpConfig:
    db_path: str | Path = "amc_stepup.db"
    logs_dir: str | Path = "AMC_OS/LOGS"
    webhook_url: str | None = None
    file_poll_interval_seconds: int = 5
    autopurge_hours: int = 24
    # Which channel(s) to use for new requests
    channels: set[str] = None  # type: ignore

    def __post_init__(self) -> None:
        if self.channels is None:
            self.channels = {"in_memory"}


SCHEMA = """
CREATE TABLE IF NOT EXISTS pending_approvals (
    request_id TEXT PRIMARY KEY,
    action_description TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    requester TEXT NOT NULL,
    timeout_seconds INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    session_context TEXT NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    approver TEXT,
    decided_at TEXT,
    reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_approvals(status, created_at);

CREATE TABLE IF NOT EXISTS approval_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    approver TEXT NOT NULL,
    decision TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    session_context TEXT NOT NULL,
    reason TEXT NOT NULL
);
"""


class StepUpAuth:
    """Durable step-up approvals with webhook, file, and in-memory channels."""

    def __init__(
        self,
        config: StepUpConfig | None = None,
        on_approved: Callable[[ApprovalResult, ApprovalAuditRecord], None] | None = None,
        on_denied: Callable[[ApprovalResult, ApprovalAuditRecord], None] | None = None,
    ) -> None:
        self.config = config or StepUpConfig()
        self.db_path = Path(self.config.db_path)
        self.logs_dir = Path(self.config.logs_dir)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.on_approved = on_approved
        self.on_denied = on_denied
        self._mem_store: dict[str, ApprovalRequest] = {}
        self._db = sqlite3.connect(self.db_path)
        self._db.row_factory = sqlite3.Row
        self._db.executescript(SCHEMA)
        self._db.commit()

    def _expire(self) -> None:
        now_iso = datetime.now(timezone.utc).isoformat()
        self._db.execute("DELETE FROM pending_approvals WHERE expires_at < ?", (now_iso,))
        self._db.commit()

    def _append_file_pending(self, req: ApprovalRequest) -> None:
        path = self.logs_dir / "PENDING_APPROVALS.md"
        line = (
            f"- request_id={req.request_id} risk={req.risk_level.value} "
            f"requester={req.requester} action={req.action_description!r} "
            f"expires={req.expires_at.isoformat()}\n"
        )
        path.write_text(path.read_text() + line if path.exists() else line)

    def create_request(
        self,
        *,
        action_description: str,
        risk_level: RiskLevel | str,
        requester: str,
        timeout_seconds: int = 300,
        session_context: dict[str, Any] | None = None,
        channel: str = "in_memory",
    ) -> ApprovalRequest:
        """Create and persist an approval request."""
        req = ApprovalRequest(
            action_description=action_description,
            risk_level=_coerce_risk_level(risk_level),
            requester=requester,
            timeout_seconds=timeout_seconds,
            session_context=session_context or {},
            channel=channel,
        )
        req.expires_at = req.created_at + timedelta(seconds=req.timeout_seconds)

        self._db.execute(
            """INSERT INTO pending_approvals
             (request_id, action_description, risk_level, requester, timeout_seconds,
              created_at, expires_at, session_context, channel, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')""",
            (
                req.request_id,
                req.action_description,
                req.risk_level.value,
                req.requester,
                req.timeout_seconds,
                req.created_at.isoformat(),
                req.expires_at.isoformat(),
                json.dumps(req.session_context),
                req.channel,
            ),
        )
        self._db.commit()

        if channel in ("in_memory", "memory"):
            self._mem_store[req.request_id] = req

        if channel == "file":
            self._append_file_pending(req)

        if channel == "webhook":
            self._send_webhook(req)

        log.info("stepup.request_created", request_id=req.request_id, risk=req.risk_level.value)
        return req

    def _send_webhook(self, req: ApprovalRequest) -> None:
        if not self.config.webhook_url:
            return
        try:
            payload = req.model_dump()
            payload["risk_level"] = req.risk_level.value
            import httpx
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(self.config.webhook_url, json=payload)
                log.info("stepup.webhook", request_id=req.request_id, status=resp.status_code)
        except Exception:
            log.exception("stepup.webhook_failed", request_id=req.request_id)

    def _mark_decision(
        self,
        request_id: str,
        approved: bool,
        approver: str,
        reason: str | None = None,
    ) -> ApprovalResult:
        now = datetime.now(timezone.utc)
        row = self._db.execute(
            "SELECT * FROM pending_approvals WHERE request_id = ?",
            (request_id,),
        ).fetchone()
        if row is None:
            raise ValueError(f"Unknown request_id {request_id!r}")

        status = "approved" if approved else "denied"
        self._db.execute(
            """UPDATE pending_approvals
             SET status = ?, approver = ?, decided_at = ?, reason = ?
             WHERE request_id = ?""",
            (status, approver, now.isoformat(), reason or "", request_id),
        )

        self._db.execute(
            """INSERT INTO approval_audit (request_id, approver, decision, timestamp, session_context, reason)
             VALUES (?, ?, ?, ?, ?, ?)""",
            (
                request_id,
                approver,
                status,
                now.isoformat(),
                json.dumps(json.loads(row["session_context"])),
                reason or "",
            ),
        )
        self._db.commit()

        if request_id in self._mem_store:
            self._mem_store.pop(request_id, None)

        result = ApprovalResult(
            request_id=request_id,
            approved=approved,
            denied=not approved,
            reason=reason,
            approver=approver,
            decided_at=now,
        )
        approval = self.get_request(request_id)
        if approval is None:
            return result

        audit = ApprovalAuditRecord(
            request_id=request_id,
            approver=approver,
            action=approval.action_description,
            timestamp=now,
            session_context=approval.session_context,
        )
        if approved:
            if self.on_approved:
                try:
                    self.on_approved(result, audit)
                except Exception:
                    log.exception("stepup.on_approved_error", request_id=request_id)
        else:
            if self.on_denied:
                try:
                    self.on_denied(result, audit)
                except Exception:
                    log.exception("stepup.on_denied_error", request_id=request_id)

        log.info("stepup.decision", request_id=request_id, approved=approved, approver=approver)
        return result

    def get_request(self, request_id: str) -> ApprovalRequest | None:
        row = self._db.execute(
            "SELECT * FROM pending_approvals WHERE request_id = ?",
            (request_id,),
        ).fetchone()
        if row is None:
            return None
        return ApprovalRequest(
            request_id=row["request_id"],
            action_description=row["action_description"],
            risk_level=row["risk_level"],
            requester=row["requester"],
            timeout_seconds=row["timeout_seconds"],
            created_at=datetime.fromisoformat(row["created_at"]),
            expires_at=datetime.fromisoformat(row["expires_at"]),
            session_context=json.loads(row["session_context"]),
            channel=row["channel"],
        )

    def status(self, request_id: str) -> ApprovalResult | None:
        """Return decision state for a request."""
        row = self._db.execute(
            "SELECT status, approver, decided_at, reason FROM pending_approvals WHERE request_id = ?",
            (request_id,),
        ).fetchone()
        if row is None:
            return None

        return ApprovalResult(
            request_id=request_id,
            approved=row["status"] == "approved",
            denied=row["status"] == "denied",
            approver=row["approver"],
            reason=row["reason"],
            decided_at=datetime.fromisoformat(row["decided_at"]) if row["decided_at"] else None,
        )

    def approve(self, request_id: str, approver: str, reason: str | None = None) -> ApprovalResult:
        """Approve a pending request."""
        return self._mark_decision(request_id=request_id, approved=True, approver=approver, reason=reason)

    def deny(self, request_id: str, approver: str, reason: str | None = None) -> ApprovalResult:
        """Deny a pending request."""
        return self._mark_decision(request_id=request_id, approved=False, approver=approver, reason=reason)

    def auto_expire(self) -> list[str]:
        """Automatically deny all expired requests and return request ids."""
        now = datetime.now(timezone.utc)
        rows = self._db.execute(
            """SELECT request_id, requester, action_description, session_context FROM pending_approvals
             WHERE status='pending' AND expires_at < ?""",
            (now.isoformat(),),
        ).fetchall()

        timed_out: list[str] = []
        for row in rows:
            req_id = row[0]
            self._mark_decision(req_id, approved=False, approver="system-auto", reason="auto-deny timeout")
            timed_out.append(req_id)

        return timed_out

    def poll_file_responses(self, approver: str = "file-operator") -> list[str]:
        """Poll file-based responses and process lines in PENDING_APPROVALS.md.

        Expected response lines:
          - approve <request_id>
          - deny <request_id>

        Returns list of processed request IDs.
        """
        path = self.logs_dir / "PENDING_APPROVALS.md"
        if not path.exists():
            return []
        lines = path.read_text().splitlines()
        pending = [ln for ln in lines if ln.strip()]
        processed: list[str] = []

        for ln in pending:
            parts = ln.strip().split()
            if len(parts) < 2:
                continue
            action, request_id = parts[0].lower(), parts[1]
            if action == "approve":
                try:
                    self.approve(request_id, approver=approver)
                    processed.append(request_id)
                except Exception:
                    pass
            elif action == "deny":
                try:
                    self.deny(request_id, approver=approver)
                    processed.append(request_id)
                except Exception:
                    pass

        return processed

    def close(self) -> None:
        self._expire()
        self._db.close()
