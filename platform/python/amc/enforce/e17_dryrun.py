"""
AMC Enforce E17 — Tool Dry-Run and "Digital Twin" Simulation Layer
==================================================================

Preview the side-effects of *any* tool call before it executes.

Usage::

    from amc.enforce.e17_dryrun import DryRunEngine

    engine = DryRunEngine()
    plan = engine.plan("file_write", {"path": "/tmp/hello.txt", "content": "hi"})
    print(plan.risk_level, plan.proposed_changes)

    if acceptable(plan):
        token = engine.apply(plan)
        # token is the audit receipt — proceed with real execution
"""
from __future__ import annotations

import difflib
import hashlib
import os
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.core.models import RiskLevel

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ChangeType(str, Enum):
    FILE_WRITE = "file_write"
    FILE_DELETE = "file_delete"
    HTTP_REQUEST = "http_request"
    MESSAGE_SEND = "message_send"
    SHELL_EXEC = "shell_exec"


class ProposedChange(BaseModel):
    """A single atomic side-effect of a tool call."""
    type: ChangeType
    description: str
    diff_preview: str | None = None


class ActionPlan(BaseModel):
    """Complete dry-run plan for one tool invocation."""
    plan_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tool_name: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    proposed_changes: list[ProposedChange] = Field(default_factory=list)
    risk_level: RiskLevel = RiskLevel.LOW
    reversible: bool = True
    estimated_side_effects: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    confirmed: bool = False


class ApplyToken(BaseModel):
    """Audit receipt proving a plan was confirmed before execution."""
    token_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    tool_name: str
    confirmed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    plan_hash: str = ""


# ---------------------------------------------------------------------------
# Tool analysers (one per ChangeType)
# ---------------------------------------------------------------------------

_SENSITIVE_HEADER_KEYS = {"authorization", "cookie", "x-api-key", "token"}


def _redact_headers(headers: dict[str, str]) -> dict[str, str]:
    return {
        k: ("***REDACTED***" if k.lower() in _SENSITIVE_HEADER_KEYS else v)
        for k, v in headers.items()
    }


def _analyse_file_write(params: dict[str, Any]) -> tuple[list[ProposedChange], RiskLevel, bool, list[str]]:
    path = params.get("path", params.get("file_path", ""))
    content = params.get("content", "")
    changes: list[ProposedChange] = []
    side_effects: list[str] = []
    risk = RiskLevel.LOW

    existing_content = ""
    exists = False
    try:
        if path and os.path.isfile(path):
            with open(path, "r", errors="replace") as f:
                existing_content = f.read()
            exists = True
    except OSError:
        pass

    if exists:
        diff = difflib.unified_diff(
            existing_content.splitlines(keepends=True),
            str(content).splitlines(keepends=True),
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
        )
        diff_text = "".join(diff) or "(no change)"
    else:
        diff_text = f"+++ new file {path}\n" + "\n".join(
            f"+{line}" for line in str(content).splitlines()[:50]
        )
        if str(content).count("\n") > 50:
            diff_text += f"\n... (+{str(content).count(chr(10)) - 50} more lines)"

    changes.append(ProposedChange(
        type=ChangeType.FILE_WRITE,
        description=f"{'Overwrite' if exists else 'Create'} {path}",
        diff_preview=diff_text,
    ))

    # Risk heuristics
    p = Path(path)
    if any(part.startswith(".") for part in p.parts if part != "."):
        risk = RiskLevel.MEDIUM
        side_effects.append("Writing to a dotfile/hidden path")
    if p.suffix in (".env", ".pem", ".key"):
        risk = RiskLevel.HIGH
        side_effects.append(f"Writing to sensitive file type ({p.suffix})")

    return changes, risk, True, side_effects


def _analyse_file_delete(params: dict[str, Any]) -> tuple[list[ProposedChange], RiskLevel, bool, list[str]]:
    path = params.get("path", params.get("file_path", ""))
    changes = [ProposedChange(
        type=ChangeType.FILE_DELETE,
        description=f"Delete {path}",
        diff_preview=f"--- a/{path}\n(file will be removed)",
    )]
    return changes, RiskLevel.MEDIUM, False, ["File deletion is irreversible without backup"]


def _analyse_http_request(params: dict[str, Any]) -> tuple[list[ProposedChange], RiskLevel, bool, list[str]]:
    method = params.get("method", "GET").upper()
    url = params.get("url", "")
    headers = _redact_headers(params.get("headers", {}))
    body = params.get("body", params.get("data", ""))
    body_preview = str(body)[:500] + ("..." if len(str(body)) > 500 else "")

    preview = f"{method} {url}\nHeaders: {headers}\nBody: {body_preview}"
    risk = RiskLevel.LOW if method == "GET" else RiskLevel.MEDIUM
    side_effects: list[str] = []
    if method in ("POST", "PUT", "PATCH", "DELETE"):
        side_effects.append(f"Mutating HTTP {method} to {url}")
        risk = RiskLevel.MEDIUM

    changes = [ProposedChange(
        type=ChangeType.HTTP_REQUEST,
        description=f"{method} {url}",
        diff_preview=preview,
    )]
    return changes, risk, (method == "GET"), side_effects


def _analyse_message_send(params: dict[str, Any]) -> tuple[list[ProposedChange], RiskLevel, bool, list[str]]:
    text = params.get("message", params.get("text", ""))
    recipients = params.get("recipients", params.get("target", params.get("targets", [])))
    if isinstance(recipients, str):
        recipients = [recipients]

    preview = f"To: {', '.join(str(r) for r in recipients)}\n---\n{text}"
    changes = [ProposedChange(
        type=ChangeType.MESSAGE_SEND,
        description=f"Send message to {len(recipients)} recipient(s)",
        diff_preview=preview,
    )]
    return changes, RiskLevel.MEDIUM, False, ["Message cannot be unsent"]


def _analyse_shell_exec(params: dict[str, Any]) -> tuple[list[ProposedChange], RiskLevel, bool, list[str]]:
    command = params.get("command", "")
    workdir = params.get("workdir", os.getcwd())

    preview = f"$ {command}\ncwd: {workdir}"
    side_effects: list[str] = []
    risk = RiskLevel.MEDIUM

    dangerous = ["rm ", "rm\t", "sudo ", "mkfs", "dd ", "> /dev/", "chmod 777"]
    if any(d in command for d in dangerous):
        risk = RiskLevel.HIGH
        side_effects.append("Potentially destructive shell command detected")

    changes = [ProposedChange(
        type=ChangeType.SHELL_EXEC,
        description=f"Execute: {command[:120]}",
        diff_preview=preview,
    )]
    return changes, risk, False, side_effects


# ---------------------------------------------------------------------------
# Tool → analyser mapping
# ---------------------------------------------------------------------------

_TOOL_ANALYSERS: dict[str, Any] = {
    "file_write": _analyse_file_write,
    "write": _analyse_file_write,
    "file_delete": _analyse_file_delete,
    "delete": _analyse_file_delete,
    "http_request": _analyse_http_request,
    "web_fetch": _analyse_http_request,
    "fetch": _analyse_http_request,
    "message_send": _analyse_message_send,
    "message": _analyse_message_send,
    "send": _analyse_message_send,
    "shell_exec": _analyse_shell_exec,
    "exec": _analyse_shell_exec,
    "shell": _analyse_shell_exec,
}


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class DryRunEngine:
    """Dry-run simulation engine for tool calls.

    Every tool call goes through ``plan()`` first. Only after the caller
    inspects the ``ActionPlan`` and decides to proceed should ``apply()``
    be called — which returns an ``ApplyToken`` for audit purposes.
    """

    def __init__(self) -> None:
        self._applied: dict[str, ApplyToken] = {}

    # ------------------------------------------------------------------
    def plan(self, tool_name: str, parameters: dict[str, Any]) -> ActionPlan:
        """Simulate *tool_name* with *parameters* and return an ``ActionPlan``."""
        analyser = _TOOL_ANALYSERS.get(tool_name)

        if analyser is None:
            logger.warning("dryrun.unknown_tool", tool=tool_name)
            return ActionPlan(
                tool_name=tool_name,
                parameters=parameters,
                proposed_changes=[],
                risk_level=RiskLevel.MEDIUM,
                reversible=False,
                estimated_side_effects=[f"Unknown tool '{tool_name}' — cannot simulate"],
            )

        changes, risk, reversible, side_effects = analyser(parameters)
        plan = ActionPlan(
            tool_name=tool_name,
            parameters=parameters,
            proposed_changes=changes,
            risk_level=risk,
            reversible=reversible,
            estimated_side_effects=side_effects,
        )
        logger.info(
            "dryrun.planned",
            plan_id=plan.plan_id,
            tool=tool_name,
            risk=risk.value,
            changes=len(changes),
        )
        return plan

    # ------------------------------------------------------------------
    def apply(self, plan: ActionPlan) -> ApplyToken:
        """Record that *plan* was reviewed and confirmed.

        Returns an ``ApplyToken`` serving as an audit receipt.
        Raises ``ValueError`` if the plan was already applied.
        """
        if plan.confirmed:
            raise ValueError(f"Plan {plan.plan_id} already confirmed")

        plan.confirmed = True
        plan_hash = hashlib.sha256(plan.model_dump_json().encode()).hexdigest()
        token = ApplyToken(plan_id=plan.plan_id, tool_name=plan.tool_name, plan_hash=plan_hash)
        self._applied[plan.plan_id] = token

        logger.info("dryrun.applied", plan_id=plan.plan_id, token_id=token.token_id)
        return token

    # ------------------------------------------------------------------
    def get_token(self, plan_id: str) -> ApplyToken | None:
        """Retrieve an apply token by plan ID (for audit)."""
        return self._applied.get(plan_id)

    def is_confirmed(self, plan_id: str) -> bool:
        """Check whether a plan was confirmed."""
        return plan_id in self._applied
