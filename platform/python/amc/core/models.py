"""
AMC Platform — Shared Core Data Models
All modules import from here. Keep this stable.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class RiskLevel(str, Enum):
    SAFE = "safe"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class PolicyDecision(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    STEPUP = "stepup"       # requires human approval
    SANITIZE = "sanitize"   # allow but strip/redact first
    QUARANTINE = "quarantine"


class SessionTrust(str, Enum):
    OWNER = "owner"         # authenticated owner (e.g. Sid)
    TRUSTED = "trusted"     # verified team member
    UNTRUSTED = "untrusted" # external / unverified
    HOSTILE = "hostile"     # confirmed adversarial


class ToolCategory(str, Enum):
    CONTROL_PLANE = "control_plane"   # config, cron, gateway restart
    EXEC = "exec"                      # shell commands
    BROWSER = "browser"               # browser control
    NETWORK = "network"               # outbound HTTP/fetch
    MESSAGING = "messaging"           # send messages
    FILESYSTEM = "filesystem"         # read/write files
    MEMORY = "memory"                 # agent memory / RAG
    READ_ONLY = "read_only"           # no side effects


# ---------------------------------------------------------------------------
# Shared Request/Response Models
# ---------------------------------------------------------------------------

class AMCRequest(BaseModel):
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    sender_id: str
    trust_level: SessionTrust = SessionTrust.UNTRUSTED
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = Field(default_factory=dict)


class AMCResponse(BaseModel):
    request_id: str
    decision: PolicyDecision
    risk_level: RiskLevel
    reasons: list[str] = Field(default_factory=list)
    remediation: list[str] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    module: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class Finding(BaseModel):
    """A single security finding from any AMC module."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    module: str
    rule_id: str
    title: str
    description: str
    risk_level: RiskLevel
    evidence: str = ""
    line_number: int | None = None
    file_path: str | None = None
    remediation: str = ""
    false_positive_likelihood: float = 0.0  # 0.0 = definitely real, 1.0 = likely FP


class ScanResult(BaseModel):
    """Aggregate result from any AMC scanner."""
    scan_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    module: str
    target: str
    risk_score: int = Field(ge=0, le=100)
    risk_level: RiskLevel
    findings: list[Finding] = Field(default_factory=list)
    passed: bool = True
    duration_ms: int = 0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("risk_level", mode="before")
    @classmethod
    def derive_risk_level(cls, v: Any, info: Any) -> Any:
        """Allow risk_level to be set explicitly; fallback to score-based."""
        return v


def score_to_risk(score: int) -> RiskLevel:
    if score >= 80:
        return RiskLevel.CRITICAL
    elif score >= 60:
        return RiskLevel.HIGH
    elif score >= 40:
        return RiskLevel.MEDIUM
    elif score >= 20:
        return RiskLevel.LOW
    else:
        return RiskLevel.SAFE


# ---------------------------------------------------------------------------
# Action Receipt (W1)
# ---------------------------------------------------------------------------

class ActionReceipt(BaseModel):
    """Tamper-evident record of a single agent action."""
    receipt_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    sender_id: str
    trust_level: SessionTrust
    tool_name: str
    tool_category: ToolCategory
    parameters_redacted: dict[str, Any]   # DLP-cleaned parameters
    outcome_summary: str                   # one-line outcome (not raw output)
    policy_decision: PolicyDecision
    policy_reasons: list[str] = Field(default_factory=list)
    approved_by: str | None = None         # human approver if step-up
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    prev_hash: str = ""                    # hash of previous receipt (chain)
    receipt_hash: str = ""                 # SHA-256 of this receipt's content

    def compute_hash(self) -> str:
        content = (
            f"{self.receipt_id}|{self.session_id}|{self.sender_id}|"
            f"{self.tool_name}|{self.policy_decision.value}|"
            f"{self.outcome_summary}|"
            f"{self.timestamp.isoformat()}|{self.prev_hash}"
        )
        return hashlib.sha256(content.encode()).hexdigest()

    def seal(self, prev_hash: str = "") -> "ActionReceipt":
        """Finalize the receipt with hash chain."""
        self.prev_hash = prev_hash
        self.receipt_hash = self.compute_hash()
        return self
