"""
AMC Enforce E19 — Two-Person Integrity Workflow Engine
======================================================

Ensures critical actions require approval from multiple distinct persons
before execution, with full SQLite-backed audit trail.

Usage::

    from amc.enforce.e19_two_person import TwoPersonIntegrity, ActionRole

    tpi = TwoPersonIntegrity(db_path=":memory:")
    tpi.register_action_type(
        "deploy_production",
        required_roles=[ActionRole.APPROVER_1, ActionRole.APPROVER_2],
        min_approvers=2,
    )

    req = tpi.submit("deploy_production", initiator_id="alice",
                      description="Deploy v2.3", payload={"tag": "v2.3"})

    result1 = tpi.approve(req.request_id, approver_id="bob",
                           role=ActionRole.APPROVER_1)
    result2 = tpi.approve(req.request_id, approver_id="carol",
                           role=ActionRole.APPROVER_2)

    outcome = tpi.execute(req.request_id)
    assert outcome.executed is True
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.core.models import RiskLevel

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Enums & Models
# ---------------------------------------------------------------------------

class ActionRole(str, Enum):
    INITIATOR = "initiator"
    APPROVER_1 = "approver_1"
    APPROVER_2 = "approver_2"
    AUDITOR = "auditor"


class RequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    EXPIRED = "expired"
    EXECUTED = "executed"


class Approval(BaseModel):
    approval_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    request_id: str
    approver_id: str
    role: ActionRole
    decision: str = "approve"  # "approve" or "deny"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    comment: str = ""


class TwoPersonRequest(BaseModel):
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    action_type: str
    initiator_id: str
    description: str
    payload: dict[str, Any] = Field(default_factory=dict)
    status: RequestStatus = RequestStatus.PENDING
    approvals: list[Approval] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(hours=24))


class ApprovalResult(BaseModel):
    success: bool
    message: str
    request_status: RequestStatus
    approvals_count: int = 0
    required_count: int = 0


class ExecutionResult(BaseModel):
    executed: bool
    request_id: str
    message: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ActionTypeConfig(BaseModel):
    name: str
    required_roles: list[ActionRole]
    min_approvers: int = 2
    conflict_check: bool = True
    expiry_hours: float = 24.0


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS requests (
    request_id TEXT PRIMARY KEY,
    action_type TEXT NOT NULL,
    initiator_id TEXT NOT NULL,
    description TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
    approval_id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    approver_id TEXT NOT NULL,
    role TEXT NOT NULL,
    decision TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (request_id) REFERENCES requests(request_id)
);
CREATE TABLE IF NOT EXISTS action_types (
    name TEXT PRIMARY KEY,
    config TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT NOT NULL,
    request_id TEXT,
    actor_id TEXT,
    detail TEXT,
    timestamp TEXT NOT NULL
);
"""


class TwoPersonIntegrity:
    """Two-person integrity workflow engine with SQLite persistence."""

    def __init__(self, db_path: str = ":memory:") -> None:
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._action_types: dict[str, ActionTypeConfig] = {}
        # Load persisted action types
        for row in self._conn.execute("SELECT name, config FROM action_types"):
            cfg = ActionTypeConfig.model_validate_json(row["config"])
            self._action_types[cfg.name] = cfg

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------
    def register_action_type(
        self,
        name: str,
        required_roles: list[ActionRole],
        min_approvers: int = 2,
        conflict_check: bool = True,
        expiry_hours: float = 24.0,
    ) -> ActionTypeConfig:
        cfg = ActionTypeConfig(
            name=name,
            required_roles=required_roles,
            min_approvers=min_approvers,
            conflict_check=conflict_check,
            expiry_hours=expiry_hours,
        )
        self._action_types[name] = cfg
        self._conn.execute(
            "INSERT OR REPLACE INTO action_types (name, config) VALUES (?, ?)",
            (name, cfg.model_dump_json()),
        )
        self._conn.commit()
        logger.info("two_person.registered", action_type=name, min_approvers=min_approvers)
        return cfg

    # ------------------------------------------------------------------
    # Submit
    # ------------------------------------------------------------------
    def submit(
        self,
        action_type: str,
        initiator_id: str,
        description: str,
        payload: dict[str, Any] | None = None,
    ) -> TwoPersonRequest:
        cfg = self._action_types.get(action_type)
        if cfg is None:
            raise ValueError(f"Unknown action type: {action_type}")

        now = datetime.now(timezone.utc)
        req = TwoPersonRequest(
            action_type=action_type,
            initiator_id=initiator_id,
            description=description,
            payload=payload or {},
            created_at=now,
            expires_at=now + timedelta(hours=cfg.expiry_hours),
        )
        self._conn.execute(
            "INSERT INTO requests (request_id, action_type, initiator_id, description, payload, status, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?)",
            (req.request_id, req.action_type, req.initiator_id, req.description,
             json.dumps(req.payload), req.status.value,
             req.created_at.isoformat(), req.expires_at.isoformat()),
        )
        self._audit("submit", req.request_id, initiator_id, description)
        self._conn.commit()
        logger.info("two_person.submitted", request_id=req.request_id, action=action_type)
        return req

    # ------------------------------------------------------------------
    # Approve / Deny
    # ------------------------------------------------------------------
    def approve(
        self,
        request_id: str,
        approver_id: str,
        role: ActionRole,
        decision: str = "approve",
        comment: str = "",
    ) -> ApprovalResult:
        req = self._load_request(request_id)
        cfg = self._action_types[req.action_type]

        # Expiry check
        if datetime.now(timezone.utc) > req.expires_at:
            self._set_status(request_id, RequestStatus.EXPIRED)
            return ApprovalResult(success=False, message="Request has expired",
                                  request_status=RequestStatus.EXPIRED,
                                  required_count=cfg.min_approvers)

        if req.status != RequestStatus.PENDING:
            return ApprovalResult(success=False, message=f"Request is {req.status.value}, not pending",
                                  request_status=req.status, required_count=cfg.min_approvers)

        # Conflict checks
        if cfg.conflict_check:
            if approver_id == req.initiator_id:
                return ApprovalResult(success=False, message="Approver cannot be the initiator",
                                      request_status=req.status, required_count=cfg.min_approvers)
            existing_approver_ids = {a.approver_id for a in req.approvals if a.decision == "approve"}
            if approver_id in existing_approver_ids:
                return ApprovalResult(success=False, message="This approver has already approved",
                                      request_status=req.status, required_count=cfg.min_approvers)

        # Role check
        if role not in cfg.required_roles and role != ActionRole.AUDITOR:
            return ApprovalResult(success=False, message=f"Role {role.value} not required for this action type",
                                  request_status=req.status, required_count=cfg.min_approvers)

        approval = Approval(
            request_id=request_id, approver_id=approver_id,
            role=role, decision=decision, comment=comment,
        )
        self._conn.execute(
            "INSERT INTO approvals (approval_id, request_id, approver_id, role, decision, timestamp, comment) VALUES (?,?,?,?,?,?,?)",
            (approval.approval_id, request_id, approver_id, role.value,
             decision, approval.timestamp.isoformat(), comment),
        )
        self._audit(f"approval_{decision}", request_id, approver_id, comment)

        if decision == "deny":
            self._set_status(request_id, RequestStatus.DENIED)
            self._conn.commit()
            return ApprovalResult(success=True, message="Request denied",
                                  request_status=RequestStatus.DENIED,
                                  required_count=cfg.min_approvers)

        # Check if we have enough approvals
        req = self._load_request(request_id)
        approve_count = sum(1 for a in req.approvals if a.decision == "approve")
        if approve_count >= cfg.min_approvers:
            self._set_status(request_id, RequestStatus.APPROVED)
            self._conn.commit()
            return ApprovalResult(success=True, message="Request approved",
                                  request_status=RequestStatus.APPROVED,
                                  approvals_count=approve_count,
                                  required_count=cfg.min_approvers)

        self._conn.commit()
        return ApprovalResult(
            success=True, message=f"Approval recorded ({approve_count}/{cfg.min_approvers})",
            request_status=RequestStatus.PENDING,
            approvals_count=approve_count, required_count=cfg.min_approvers,
        )

    # ------------------------------------------------------------------
    # Execute
    # ------------------------------------------------------------------
    def execute(self, request_id: str) -> ExecutionResult:
        req = self._load_request(request_id)

        # Re-check expiry
        if datetime.now(timezone.utc) > req.expires_at:
            self._set_status(request_id, RequestStatus.EXPIRED)
            self._conn.commit()
            return ExecutionResult(executed=False, request_id=request_id, message="Request expired")

        if req.status != RequestStatus.APPROVED:
            return ExecutionResult(executed=False, request_id=request_id,
                                   message=f"Cannot execute: status is {req.status.value}")

        cfg = self._action_types[req.action_type]
        approve_count = sum(1 for a in req.approvals if a.decision == "approve")
        if approve_count < cfg.min_approvers:
            return ExecutionResult(executed=False, request_id=request_id,
                                   message=f"Insufficient approvals: {approve_count}/{cfg.min_approvers}")

        self._set_status(request_id, RequestStatus.EXECUTED)
        self._audit("execute", request_id, "system", "Executed after approval")
        self._conn.commit()
        logger.info("two_person.executed", request_id=request_id)
        return ExecutionResult(executed=True, request_id=request_id, message="Executed successfully")

    # ------------------------------------------------------------------
    # Query
    # ------------------------------------------------------------------
    def get_request(self, request_id: str) -> TwoPersonRequest:
        return self._load_request(request_id)

    def get_audit_trail(self, request_id: str) -> list[dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT * FROM audit_log WHERE request_id = ? ORDER BY timestamp", (request_id,)
        ).fetchall()
        return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------
    def _load_request(self, request_id: str) -> TwoPersonRequest:
        row = self._conn.execute("SELECT * FROM requests WHERE request_id = ?", (request_id,)).fetchone()
        if row is None:
            raise ValueError(f"Request {request_id} not found")
        approvals_rows = self._conn.execute(
            "SELECT * FROM approvals WHERE request_id = ?", (request_id,)
        ).fetchall()
        approvals = [
            Approval(
                approval_id=a["approval_id"], request_id=a["request_id"],
                approver_id=a["approver_id"], role=ActionRole(a["role"]),
                decision=a["decision"],
                timestamp=datetime.fromisoformat(a["timestamp"]),
                comment=a["comment"],
            )
            for a in approvals_rows
        ]
        return TwoPersonRequest(
            request_id=row["request_id"], action_type=row["action_type"],
            initiator_id=row["initiator_id"], description=row["description"],
            payload=json.loads(row["payload"]),
            status=RequestStatus(row["status"]),
            approvals=approvals,
            created_at=datetime.fromisoformat(row["created_at"]),
            expires_at=datetime.fromisoformat(row["expires_at"]),
        )

    def _set_status(self, request_id: str, status: RequestStatus) -> None:
        self._conn.execute("UPDATE requests SET status = ? WHERE request_id = ?",
                           (status.value, request_id))

    def _audit(self, event: str, request_id: str, actor_id: str, detail: str) -> None:
        self._conn.execute(
            "INSERT INTO audit_log (event, request_id, actor_id, detail, timestamp) VALUES (?,?,?,?,?)",
            (event, request_id, actor_id, detail, datetime.now(timezone.utc).isoformat()),
        )
