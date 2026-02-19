"""
AMC Enforce — E15: Contextual ABAC (Attribute-Based Access Control) for Agent Tools

Extends E1 policy firewall with runtime attribute evaluation: sender trust,
content risk score, time windows, session types, and task categories.

Usage:
    engine = ABACEngine()
    engine.load_template("finance-safe")

    request = ABACRequest(
        session_id="main", sender_id="+91xxx",
        trust_level=SessionTrust.UNTRUSTED,
        tool_name="exec", tool_category=ToolCategory.EXEC,
        content_risk_score=75, task_category="finance",
        time_of_day=14, session_type="dm",
    )
    decision = engine.evaluate(request)
    # decision.allowed == False

    # Simulation (no audit log, no enforcement)
    sim = engine.simulate(engine.policies[0], request)
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable

import structlog
from pydantic import BaseModel, Field

from amc.core.models import (
    PolicyDecision,
    RiskLevel,
    SessionTrust,
    ToolCategory,
)

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Enums & Models
# ---------------------------------------------------------------------------

class SessionType(str, Enum):
    DM = "dm"
    GROUP = "group"
    CRON = "cron"
    API = "api"


class TaskCategory(str, Enum):
    FINANCE = "finance"
    BROWSING = "browsing"
    FILE_OPS = "file_ops"
    ADMIN = "admin"
    GENERAL = "general"


@dataclass
class ABACRequest:
    """Extended policy request with ABAC attributes."""
    # E1 fields
    session_id: str = ""
    sender_id: str = ""
    trust_level: SessionTrust = SessionTrust.UNTRUSTED
    tool_name: str = ""
    tool_category: ToolCategory = ToolCategory.READ_ONLY
    parameters: dict[str, Any] = field(default_factory=dict)
    context: dict[str, Any] = field(default_factory=dict)
    # ABAC-specific
    content_risk_score: int = 0          # 0-100, from S10 content scanner
    task_category: str = TaskCategory.GENERAL.value
    time_of_day: int = 12                # 0-23
    session_type: str = SessionType.DM.value


class ABACDecision(BaseModel):
    """Result of ABAC evaluation."""
    allowed: bool
    decision: PolicyDecision
    risk_level: RiskLevel = RiskLevel.SAFE
    matched_rules: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    request_summary: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# ABAC Rule & Policy
# ---------------------------------------------------------------------------

@dataclass
class ABACRule:
    """A single ABAC rule with attribute conditions."""
    id: str
    description: str
    decision: PolicyDecision = PolicyDecision.DENY

    # Conditions (None = don't check)
    allowed_trusts: set[SessionTrust] | None = None
    denied_trusts: set[SessionTrust] | None = None
    max_content_risk_score: int | None = None       # deny if score > this
    allowed_session_types: set[str] | None = None
    denied_session_types: set[str] | None = None
    allowed_task_categories: set[str] | None = None
    denied_task_categories: set[str] | None = None
    allowed_tool_categories: set[ToolCategory] | None = None
    denied_tool_categories: set[ToolCategory] | None = None
    allowed_tools: set[str] | None = None
    denied_tools: set[str] | None = None
    time_window: tuple[int, int] | None = None      # (start_hour, end_hour) inclusive

    # Custom evaluator (optional)
    evaluator: Callable[[ABACRequest], str | None] | None = None

    def matches(self, req: ABACRequest) -> str | None:
        """Check if rule conditions match. Returns reason string or None."""
        if self.denied_trusts and req.trust_level in self.denied_trusts:
            return f"Trust level {req.trust_level.value} is denied"
        if self.allowed_trusts and req.trust_level not in self.allowed_trusts:
            return f"Trust level {req.trust_level.value} not in allowed set"

        if self.max_content_risk_score is not None and req.content_risk_score > self.max_content_risk_score:
            return f"Content risk {req.content_risk_score} exceeds max {self.max_content_risk_score}"

        if self.denied_session_types and req.session_type in self.denied_session_types:
            return f"Session type {req.session_type} is denied"
        if self.allowed_session_types and req.session_type not in self.allowed_session_types:
            return f"Session type {req.session_type} not allowed"

        if self.denied_task_categories and req.task_category in self.denied_task_categories:
            return f"Task category {req.task_category} is denied"
        if self.allowed_task_categories and req.task_category not in self.allowed_task_categories:
            return f"Task category {req.task_category} not allowed"

        if self.denied_tool_categories and req.tool_category in self.denied_tool_categories:
            return f"Tool category {req.tool_category.value} is denied"
        if self.allowed_tool_categories and req.tool_category not in self.allowed_tool_categories:
            return f"Tool category {req.tool_category.value} not allowed"

        if self.denied_tools and req.tool_name in self.denied_tools:
            return f"Tool {req.tool_name} is denied"
        if self.allowed_tools and req.tool_name not in self.allowed_tools:
            return f"Tool {req.tool_name} not allowed"

        if self.time_window:
            start, end = self.time_window
            if start <= end:
                if not (start <= req.time_of_day <= end):
                    return f"Outside time window {start}:00-{end}:00 (current: {req.time_of_day}:00)"
            else:  # wraps midnight
                if end < req.time_of_day < start:
                    return f"Outside time window {start}:00-{end}:00 (current: {req.time_of_day}:00)"

        if self.evaluator:
            return self.evaluator(req)

        return None


@dataclass
class ABACPolicy:
    """A named collection of ABAC rules."""
    name: str
    description: str = ""
    rules: list[ABACRule] = field(default_factory=list)
    default_decision: PolicyDecision = PolicyDecision.ALLOW


# ---------------------------------------------------------------------------
# Built-in Policy Templates
# ---------------------------------------------------------------------------

POLICY_TEMPLATES: dict[str, ABACPolicy] = {
    "finance-safe": ABACPolicy(
        name="finance-safe",
        description="No exec or browser for untrusted sessions in finance tasks",
        rules=[
            ABACRule(
                id="FIN-001",
                description="Block exec for untrusted in finance context",
                decision=PolicyDecision.DENY,
                denied_trusts={SessionTrust.UNTRUSTED, SessionTrust.HOSTILE},
                denied_tool_categories={ToolCategory.EXEC, ToolCategory.BROWSER},
                allowed_task_categories={"finance"},
            ),
            ABACRule(
                id="FIN-002",
                description="Block all tools if content risk is high",
                decision=PolicyDecision.DENY,
                max_content_risk_score=70,
                allowed_task_categories={"finance"},
            ),
        ],
        default_decision=PolicyDecision.ALLOW,
    ),
    "browsing-safe": ABACPolicy(
        name="browsing-safe",
        description="No credential access or downloads during browsing",
        rules=[
            ABACRule(
                id="BRW-001",
                description="Block filesystem writes during browsing tasks",
                decision=PolicyDecision.DENY,
                denied_tool_categories={ToolCategory.FILESYSTEM},
                allowed_task_categories={"browsing"},
            ),
            ABACRule(
                id="BRW-002",
                description="Block control plane during browsing",
                decision=PolicyDecision.DENY,
                denied_tool_categories={ToolCategory.CONTROL_PLANE},
                allowed_task_categories={"browsing"},
            ),
        ],
        default_decision=PolicyDecision.ALLOW,
    ),
    "admin-only": ABACPolicy(
        name="admin-only",
        description="Owner trust + business hours only",
        rules=[
            ABACRule(
                id="ADM-001",
                description="Only owner trust allowed for admin",
                decision=PolicyDecision.DENY,
                allowed_trusts={SessionTrust.OWNER},
            ),
            ABACRule(
                id="ADM-002",
                description="Admin only during business hours (9-18)",
                decision=PolicyDecision.DENY,
                time_window=(9, 18),
            ),
        ],
        default_decision=PolicyDecision.ALLOW,
    ),
}


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------

class AuditEntry(BaseModel):
    """Record of an ABAC decision."""
    decision: ABACDecision
    request: dict[str, Any]
    policy_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# ABAC Engine
# ---------------------------------------------------------------------------

class ABACEngine:
    """
    Evaluates ABAC policies against requests with full attribute context.

    Supports multiple loaded policies (all evaluated, most restrictive wins),
    simulation mode, and audit logging.
    """

    def __init__(self) -> None:
        self.policies: list[ABACPolicy] = []
        self.audit_log: list[AuditEntry] = []
        self._max_audit = 10000

    def load_template(self, template_name: str) -> ABACPolicy:
        """Load a built-in policy template by name."""
        template = POLICY_TEMPLATES.get(template_name)
        if not template:
            raise ValueError(
                f"Unknown template: {template_name!r}. "
                f"Available: {list(POLICY_TEMPLATES.keys())}"
            )
        self.policies.append(template)
        log.info("abac.template.loaded", name=template_name, rules=len(template.rules))
        return template

    def add_policy(self, policy: ABACPolicy) -> None:
        """Add a custom ABAC policy."""
        self.policies.append(policy)

    def evaluate(self, request: ABACRequest) -> ABACDecision:
        """
        Evaluate request against all loaded policies.
        Most restrictive decision wins (DENY > STEPUP > ALLOW).

        Args:
            request: ABACRequest with full attribute context.

        Returns:
            ABACDecision with allow/deny and matched rules.
        """
        overall = ABACDecision(
            allowed=True,
            decision=PolicyDecision.ALLOW,
            request_summary=self._summarize_request(request),
        )

        deny = False
        stepup = False

        for policy in self.policies:
            for rule in policy.rules:
                reason = rule.matches(request)
                if reason is not None:
                    overall.matched_rules.append(rule.id)
                    overall.reasons.append(f"[{rule.id}] {reason}")
                    if rule.decision == PolicyDecision.DENY:
                        deny = True
                    elif rule.decision == PolicyDecision.STEPUP:
                        stepup = True

        if deny:
            overall.allowed = False
            overall.decision = PolicyDecision.DENY
            overall.risk_level = RiskLevel.HIGH
        elif stepup:
            overall.allowed = False
            overall.decision = PolicyDecision.STEPUP
            overall.risk_level = RiskLevel.MEDIUM

        # Audit
        for policy in self.policies:
            entry = AuditEntry(
                decision=overall,
                request=self._summarize_request(request),
                policy_name=policy.name,
            )
            self.audit_log.append(entry)
            if len(self.audit_log) > self._max_audit:
                self.audit_log = self.audit_log[-self._max_audit:]

        log.info("abac.evaluated", decision=overall.decision.value,
                 rules_fired=overall.matched_rules,
                 tool=request.tool_name, trust=request.trust_level.value)
        return overall

    def simulate(self, policy: ABACPolicy, request: ABACRequest) -> ABACDecision:
        """
        Simulate a single policy against a request without logging or enforcement.

        Args:
            policy: The policy to test.
            request: The request to evaluate.

        Returns:
            ABACDecision showing what would happen.
        """
        decision = ABACDecision(
            allowed=True,
            decision=policy.default_decision,
            request_summary=self._summarize_request(request),
        )

        for rule in policy.rules:
            reason = rule.matches(request)
            if reason is not None:
                decision.matched_rules.append(rule.id)
                decision.reasons.append(f"[{rule.id}] (simulated) {reason}")
                if rule.decision == PolicyDecision.DENY:
                    decision.allowed = False
                    decision.decision = PolicyDecision.DENY
                    decision.risk_level = RiskLevel.HIGH
                elif rule.decision == PolicyDecision.STEPUP and decision.decision != PolicyDecision.DENY:
                    decision.allowed = False
                    decision.decision = PolicyDecision.STEPUP
                    decision.risk_level = RiskLevel.MEDIUM

        return decision

    @staticmethod
    def _summarize_request(req: ABACRequest) -> dict[str, Any]:
        return {
            "session_id": req.session_id,
            "sender_id": req.sender_id,
            "trust_level": req.trust_level.value,
            "tool_name": req.tool_name,
            "tool_category": req.tool_category.value,
            "content_risk_score": req.content_risk_score,
            "task_category": req.task_category,
            "time_of_day": req.time_of_day,
            "session_type": req.session_type,
        }
