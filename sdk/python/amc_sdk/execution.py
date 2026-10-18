"""The one execution contract (P2-13), as the Python wrapper reads it.

Eight verbs with one meaning on the CLI, the TypeScript SDK, this wrapper and Studio, and four phases that never imply
each other: a finished turn whose evidence nobody verified reads ``model-completion: succeeded`` and
``evidence-verification: pending``. The phases are computed by the AMC runtime; this module only parses them and runs
the same installed CLI for the verbs ACP has no message for (cold verification and the signed approval engine).
See docs/sdk/EXECUTION_API.md.
"""
from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from typing import Any, Optional

EXECUTION_API_VERSION = 1
EXECUTION_VERBS = ("start", "stream", "approve", "cancel", "resume", "fork", "dispose", "verify")
EXECUTION_PHASES = ("admission", "model-completion", "side-effect-completion", "evidence-verification")
PHASE_STATES = ("pending", "succeeded", "failed", "refused", "unknown")
_RECEIPT_STATE = re.compile(r"[a-z_]{1,64}")
_APPROVAL_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}")
_ROLE = re.compile(r"[A-Z_]{1,32}")


@dataclass(frozen=True)
class ExecutionStatus:
    """The four phases of one session, and the verified head state of each of its journaled actions."""
    session_id: str
    phases: dict[str, str]
    receipt_states: tuple[str, ...]


@dataclass(frozen=True)
class PendingApproval:
    approval_request_id: str
    request_digest_sha256: str
    action_class: str
    risk_tier: str


@dataclass(frozen=True)
class VerificationReceipt:
    """A passing cold verification. ``scope`` says whether it was anchored to a monitor pin held outside the workspace."""
    session_id: str
    scope: str
    report: dict[str, Any]
    execution: ExecutionStatus


def parse_execution_status(value: Any) -> Optional[ExecutionStatus]:
    """Exactly the wire shape, or None. Never repaired or defaulted."""
    if not isinstance(value, dict) or set(value) != {"sessionId", "phases", "receiptStates"}:
        return None
    session_id, phases, states = value["sessionId"], value["phases"], value["receiptStates"]
    if (not isinstance(session_id, str) or len(session_id) > 200 or not isinstance(phases, dict)
            or set(phases) != set(EXECUTION_PHASES) or any(phases[phase] not in PHASE_STATES for phase in EXECUTION_PHASES)
            or not isinstance(states, list) or len(states) > 4096
            or any(not isinstance(state, str) or _RECEIPT_STATE.fullmatch(state) is None for state in states)):
        return None
    return ExecutionStatus(session_id, {phase: phases[phase] for phase in EXECUTION_PHASES}, tuple(states))


def run_cli(command: list[str], args: list[str], *, cwd: str, env: dict[str, str], timeout: float) -> subprocess.CompletedProcess[str]:
    """The same executable the agent was launched with, without a shell."""
    from .client import AmcProtocolError  # deferred: client imports this module
    try:
        return subprocess.run([*command, *args], cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise AmcProtocolError("could not run the selected AMC executable") from error


def approval_args(approval_request_id: str, agent_id: str, *, reason: str, username: str, roles: list[str],
                  user_id: Optional[str], mode: str, session_token_file: Optional[str], expect_request_digest: Optional[str]) -> list[str]:
    """`amc approvals approve` arguments, with every value bound as --flag=value so none can be read as a flag."""
    def text(value: Any) -> bool:
        return isinstance(value, str) and bool(value.strip()) and "\0" not in value
    if (not isinstance(approval_request_id, str) or _APPROVAL_ID.fullmatch(approval_request_id) is None
            or not text(reason) or not text(username) or not isinstance(roles, list) or not roles
            or any(not isinstance(role, str) or _ROLE.fullmatch(role) is None for role in roles)
            or any(value is not None and not text(value) for value in (user_id, session_token_file, expect_request_digest))
            or mode not in ("execute", "simulate")):
        raise ValueError("an approval needs a request ID, a reason, the reviewer's username and roles, and execute or simulate")
    args = ["approvals", "approve", approval_request_id, f"--agent={agent_id}", f"--mode={mode}", f"--reason={reason}",
            f"--username={username}", f"--roles={','.join(roles)}"]
    for flag, value in (("--user-id", user_id), ("--session-token-file", session_token_file), ("--expect-request-digest", expect_request_digest)):
        if value is not None:
            args.append(f"{flag}={value}")
    return args


def parse_pending(completed: subprocess.CompletedProcess[str]) -> list[PendingApproval]:
    from .client import AmcRefusedError
    try:
        listed = json.loads(completed.stdout)
    except ValueError:
        listed = None
    if completed.returncode != 0 or not isinstance(listed, dict) or not isinstance(listed.get("requests"), list):
        raise AmcRefusedError(completed.returncode, "the approval inbox is unavailable or failed its integrity check")
    return [PendingApproval(str(r.get("approvalRequestId")), str(r.get("requestDigestSha256")), str(r.get("actionClass")), str(r.get("riskTier")))
            for r in listed["requests"] if isinstance(r, dict)]


def admit_verification(completed: subprocess.CompletedProcess[str], session_id: str) -> VerificationReceipt:
    """Only a self-consistent passing report is admitted; a failure raises with the phases the verifier reported."""
    from .client import AmcProtocolError, AmcRefusedError
    try:
        report = json.loads(completed.stdout)
    except ValueError:
        report = None
    execution = parse_execution_status(report.get("execution")) if isinstance(report, dict) else None
    if completed.returncode != 0:
        raise AmcRefusedError(completed.returncode, "native evidence verification failed",
                              {"execution": execution} if execution is not None and execution.session_id == session_id else None)
    requests = report.get("requests") if isinstance(report, dict) else None
    trust = report.get("trustRoot") if isinstance(report, dict) else None
    if (not isinstance(report, dict) or report.get("sessionId") != session_id or report.get("ok") is not True
            or report.get("ledgerOk") is not True or any(report.get(key) != [] for key in ("ledgerErrors", "sessionChainErrors", "unsignedRowIds"))
            or not isinstance(requests, list) or any(not isinstance(r, dict) or r.get("status") != "reconstructed" for r in requests)
            or not isinstance(trust, dict) or not isinstance(trust.get("anchored"), bool)
            or execution is None or execution.session_id != session_id or execution.phases["evidence-verification"] != "succeeded"):
        raise AmcProtocolError("native verifier returned an inconsistent receipt")
    if trust["anchored"] and (not trust.get("expectedFingerprint") or trust.get("expectedFingerprint") != trust.get("monitorFingerprint")):
        raise AmcProtocolError("native verifier returned an inconsistent trust anchor")
    return VerificationReceipt(session_id, "externally-anchored" if trust["anchored"] else "workspace-key-consistency", report, execution)
