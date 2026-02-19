"""
AMC Enforce — E1: Tool Policy Firewall
Policy-as-code engine between model reasoning and tool execution.

Enforces: allow/deny/step-up/sanitize decisions for every tool call
based on context (session trust, sender, time, workspace, tool category).

Usage:
    firewall = ToolPolicyFirewall.from_preset("enterprise-secure")

    request = PolicyRequest(
        session_id="main",
        sender_id="+1555000DEMO",
        trust_level=SessionTrust.OWNER,
        tool_name="exec",
        tool_category=ToolCategory.EXEC,
        parameters={"command": "rm -rf /"},
        context={"workspace": "/Users/sid/.openclaw/workspace"},
    )

    result = firewall.evaluate(request)
    # result.decision == PolicyDecision.DENY
    # result.reasons == ["Destructive command pattern detected: rm -rf"]
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable

import structlog

from amc.core.models import (
    PolicyDecision,
    RiskLevel,
    SessionTrust,
    ToolCategory,
)

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Policy Rule
# ---------------------------------------------------------------------------

@dataclass
class PolicyRule:
    """A single evaluatable policy rule."""
    id: str
    description: str
    risk_level: RiskLevel
    # Conditions — all must match for rule to fire
    applies_to_categories: set[ToolCategory] | None = None  # None = all
    applies_to_trusts: set[SessionTrust] | None = None       # None = all
    applies_to_tools: set[str] | None = None                 # None = all
    # Evaluator: takes (tool_name, parameters, context) → match reason or None
    evaluator: Callable[[str, dict[str, Any], dict[str, Any]], str | None] = field(
        default=lambda t, p, c: None
    )
    decision: PolicyDecision = PolicyDecision.DENY
    remediation: str = ""


@dataclass
class PolicyRequest:
    session_id: str
    sender_id: str
    trust_level: SessionTrust
    tool_name: str
    tool_category: ToolCategory
    parameters: dict[str, Any] = field(default_factory=dict)
    context: dict[str, Any] = field(default_factory=dict)


@dataclass
class PolicyResult:
    decision: PolicyDecision
    risk_level: RiskLevel
    reasons: list[str] = field(default_factory=list)
    remediation: list[str] = field(default_factory=list)
    matched_rules: list[str] = field(default_factory=list)
    step_up_required: bool = False


# ---------------------------------------------------------------------------
# Built-in Rules
# ---------------------------------------------------------------------------

def _cmd_contains(pattern: str, flags: int = re.IGNORECASE):
    """Rule evaluator: command matches regex pattern."""
    compiled = re.compile(pattern, flags)
    def _eval(tool: str, params: dict, ctx: dict) -> str | None:
        cmd = str(params.get("command", ""))
        m = compiled.search(cmd)
        if m:
            return f"Dangerous command pattern matched: '{m.group(0)}'"
        return None
    return _eval


def _param_outside_scope(allowed_prefixes: list[str]):
    """Rule evaluator: file path parameter is outside allowed scope."""
    def _eval(tool: str, params: dict, ctx: dict) -> str | None:
        for key in ("path", "file_path", "workdir", "cwd"):
            val = str(params.get(key, ""))
            if val and not any(val.startswith(p) for p in allowed_prefixes):
                return f"Path '{val}' is outside allowed scope {allowed_prefixes}"
        return None
    return _eval


def _url_not_allowlisted(allowlist: list[str]):
    """Rule evaluator: URL not in allowlist."""
    def _eval(tool: str, params: dict, ctx: dict) -> str | None:
        for key in ("url", "targetUrl", "target"):
            val = str(params.get(key, ""))
            if val and not any(val.startswith(a) for a in allowlist):
                return f"URL '{val[:80]}' not in allowlist"
        return None
    return _eval


BUILTIN_RULES: list[PolicyRule] = [
    # --- EXEC rules ---
    PolicyRule(
        id="EXEC-001",
        description="Block rm -rf style recursive deletion",
        risk_level=RiskLevel.CRITICAL,
        applies_to_categories={ToolCategory.EXEC},
        evaluator=_cmd_contains(r"rm\s+(-[rfR]+\s*|--recursive\s*|--force\s*)+"),
        decision=PolicyDecision.DENY,
        remediation="Move files to trash instead; never use rm -rf",
    ),
    PolicyRule(
        id="EXEC-002",
        description="Block commands that pipe downloads to shell (curl|bash style)",
        risk_level=RiskLevel.CRITICAL,
        applies_to_categories={ToolCategory.EXEC},
        evaluator=_cmd_contains(r"(curl|wget|fetch).+\|.*(bash|sh|zsh|python|node)"),
        decision=PolicyDecision.DENY,
        remediation="Download first, inspect, then execute explicitly",
    ),
    PolicyRule(
        id="EXEC-003",
        description="Step-up for sudo / privilege escalation",
        risk_level=RiskLevel.HIGH,
        applies_to_categories={ToolCategory.EXEC},
        evaluator=_cmd_contains(r"\bsudo\b|\bsu\b|\bdoas\b"),
        decision=PolicyDecision.STEPUP,
        remediation="Privilege escalation requires explicit human approval",
    ),
    PolicyRule(
        id="EXEC-004",
        description="Block execution outside declared workspace scope",
        risk_level=RiskLevel.HIGH,
        applies_to_categories={ToolCategory.EXEC},
        applies_to_trusts={SessionTrust.UNTRUSTED, SessionTrust.HOSTILE},
        evaluator=_param_outside_scope([
            "/Users/sid/.openclaw/workspace",
            "/Users/sid/crypto-bot",
            "/tmp/amc-",
        ]),
        decision=PolicyDecision.DENY,
        remediation="Restrict all file operations to declared workspace",
    ),
    PolicyRule(
        id="EXEC-005",
        description="Block all exec for hostile sessions",
        risk_level=RiskLevel.CRITICAL,
        applies_to_categories={ToolCategory.EXEC},
        applies_to_trusts={SessionTrust.HOSTILE},
        evaluator=lambda t, p, c: "Exec blocked: hostile session trust level",
        decision=PolicyDecision.DENY,
        remediation="Session is flagged as hostile; no exec permitted",
    ),
    PolicyRule(
        id="EXEC-006",
        description="Block all exec for untrusted sessions (enterprise-secure default)",
        risk_level=RiskLevel.HIGH,
        applies_to_categories={ToolCategory.EXEC},
        applies_to_trusts={SessionTrust.UNTRUSTED},
        evaluator=lambda t, p, c: "Exec blocked: untrusted sessions may not run arbitrary commands",
        decision=PolicyDecision.DENY,
        remediation="Elevate session trust level or use a read-only alternative",
    ),
    PolicyRule(
        id="NET-003",
        description="Block network/messaging tools for untrusted sessions",
        risk_level=RiskLevel.HIGH,
        applies_to_categories={ToolCategory.NETWORK, ToolCategory.MESSAGING},
        applies_to_trusts={SessionTrust.UNTRUSTED, SessionTrust.HOSTILE},
        evaluator=lambda t, p, c: "Network access blocked: untrusted/hostile session",
        decision=PolicyDecision.DENY,
        remediation="Network tools require at least SEMI_TRUSTED session level",
    ),

    # --- CONTROL PLANE rules ---
    PolicyRule(
        id="CP-001",
        description="Deny gateway config changes from untrusted sessions",
        risk_level=RiskLevel.CRITICAL,
        applies_to_categories={ToolCategory.CONTROL_PLANE},
        applies_to_trusts={SessionTrust.UNTRUSTED, SessionTrust.HOSTILE},
        evaluator=lambda t, p, c: (
            "Control plane tool denied for untrusted session"
            if t in ("gateway", "cron") else None
        ),
        decision=PolicyDecision.DENY,
        remediation="Control plane changes require owner trust level",
    ),
    PolicyRule(
        id="CP-002",
        description="Step-up for any gateway config apply or restart",
        risk_level=RiskLevel.HIGH,
        applies_to_categories={ToolCategory.CONTROL_PLANE},
        evaluator=lambda t, p, c: (
            "Gateway config change requires step-up approval"
            if t == "gateway" and p.get("action") in ("config.apply", "restart", "update.run")
            else None
        ),
        decision=PolicyDecision.STEPUP,
        remediation="Gateway changes are irreversible; require human sign-off",
    ),

    # --- NETWORK / BROWSER rules ---
    PolicyRule(
        id="NET-001",
        description="Block browser credential entry on untrusted domains",
        risk_level=RiskLevel.HIGH,
        applies_to_categories={ToolCategory.BROWSER},
        evaluator=lambda t, p, c: (
            "Credential entry action blocked; requires explicit approval"
            if p.get("action") in ("fill", "type") and p.get("inputRef", "").lower() in
               ("password", "passwd", "secret", "token", "key", "credential")
            else None
        ),
        decision=PolicyDecision.STEPUP,
        remediation="Never enter credentials in browser without explicit human instruction",
    ),
    PolicyRule(
        id="NET-002",
        description="Block browser 'install extension' or 'run file' actions",
        risk_level=RiskLevel.CRITICAL,
        applies_to_categories={ToolCategory.BROWSER},
        evaluator=lambda t, p, c: (
            "Browser install/run action blocked"
            if any(kw in str(p.get("promptText", "")).lower() for kw in
                   ["install", "run", "execute", "download"])
            else None
        ),
        decision=PolicyDecision.DENY,
        remediation="No automatic installs or downloads from browser automation",
    ),

    # --- MESSAGING rules ---
    PolicyRule(
        id="MSG-001",
        description="Step-up for any external message send",
        risk_level=RiskLevel.HIGH,
        applies_to_categories={ToolCategory.MESSAGING},
        evaluator=lambda t, p, c: (
            "External message send requires step-up approval"
            if p.get("action") == "send"
            else None
        ),
        decision=PolicyDecision.STEPUP,
        remediation="All outbound messages require human approval before send",
    ),

    # --- MEMORY rules ---
    PolicyRule(
        id="MEM-001",
        description="Block memory writes from untrusted session content",
        risk_level=RiskLevel.HIGH,
        applies_to_categories={ToolCategory.MEMORY},
        applies_to_trusts={SessionTrust.UNTRUSTED, SessionTrust.HOSTILE},
        evaluator=lambda t, p, c: (
            "Memory writes blocked from untrusted session"
            if "write" in str(p.get("action", "")).lower()
            else None
        ),
        decision=PolicyDecision.DENY,
        remediation="Memory can only be written by owner-trust sessions",
    ),
]


# ---------------------------------------------------------------------------
# Policy Presets
# ---------------------------------------------------------------------------

POLICY_PRESETS: dict[str, dict] = {
    "enterprise-secure": {
        "description": "Full enforcement. All Tier C/D actions step-up. Hostile = block all.",
        "rules": BUILTIN_RULES,
        "default_decision": PolicyDecision.ALLOW,
        "deny_on_error": True,
    },
    "messaging-only": {
        "description": "Agent can only send/read messages. No exec, no browser, no control-plane.",
        "extra_deny_categories": {
            ToolCategory.EXEC, ToolCategory.BROWSER, ToolCategory.CONTROL_PLANE
        },
        "rules": BUILTIN_RULES,
        "default_decision": PolicyDecision.DENY,
        "deny_on_error": True,
    },
    "read-only": {
        "description": "Agent can only read. No writes, no sends, no exec.",
        "extra_deny_categories": {
            ToolCategory.EXEC, ToolCategory.BROWSER, ToolCategory.CONTROL_PLANE,
            ToolCategory.MESSAGING, ToolCategory.FILESYSTEM,
        },
        "rules": BUILTIN_RULES,
        "default_decision": PolicyDecision.DENY,
        "deny_on_error": True,
    },
    "trusted-operator": {
        "description": "Full access with logging. Owner-trust sessions only.",
        "rules": BUILTIN_RULES,
        "default_decision": PolicyDecision.ALLOW,
        "deny_on_error": False,
    },
    "permissive-dev": {
        "description": "Development mode — log but don't block. NEVER use in prod.",
        "rules": [],
        "default_decision": PolicyDecision.ALLOW,
        "deny_on_error": False,
    },
}


# ---------------------------------------------------------------------------
# Firewall Engine
# ---------------------------------------------------------------------------

class ToolPolicyFirewall:
    """
    Evaluates tool calls against a rule set and returns a PolicyResult.
    Thread-safe and stateless (rules are immutable after init).
    """

    def __init__(
        self,
        rules: list[PolicyRule],
        default_decision: PolicyDecision = PolicyDecision.ALLOW,
        deny_on_error: bool = True,
        extra_deny_categories: set[ToolCategory] | None = None,
    ) -> None:
        self.rules = rules
        self.default_decision = default_decision
        self.deny_on_error = deny_on_error
        self.extra_deny_categories = extra_deny_categories or set()

    @classmethod
    def from_preset(cls, preset_name: str) -> "ToolPolicyFirewall":
        config = POLICY_PRESETS.get(preset_name)
        if not config:
            raise ValueError(f"Unknown policy preset: {preset_name!r}")
        return cls(
            rules=config.get("rules", []),
            default_decision=config.get("default_decision", PolicyDecision.ALLOW),
            deny_on_error=config.get("deny_on_error", True),
            extra_deny_categories=config.get("extra_deny_categories", set()),
        )

    def evaluate(self, request: PolicyRequest) -> PolicyResult:
        """Evaluate a tool call request and return a policy decision."""
        try:
            return self._evaluate_internal(request)
        except Exception as exc:
            log.error("policy.firewall.error", error=str(exc), tool=request.tool_name)
            if self.deny_on_error:
                return PolicyResult(
                    decision=PolicyDecision.DENY,
                    risk_level=RiskLevel.CRITICAL,
                    reasons=[f"Policy evaluation error (fail-closed): {exc}"],
                )
            return PolicyResult(
                decision=PolicyDecision.ALLOW,
                risk_level=RiskLevel.LOW,
                reasons=[f"Policy evaluation error (fail-open): {exc}"],
            )

    def _evaluate_internal(self, req: PolicyRequest) -> PolicyResult:
        result = PolicyResult(
            decision=self.default_decision,
            risk_level=RiskLevel.SAFE,
        )

        # Category-level deny (preset overrides)
        if req.tool_category in self.extra_deny_categories:
            result.decision = PolicyDecision.DENY
            result.risk_level = RiskLevel.HIGH
            result.reasons.append(
                f"Category '{req.tool_category.value}' is denied by policy preset"
            )
            return result

        highest_risk = RiskLevel.SAFE
        deny_triggered = False
        stepup_triggered = False

        for rule in self.rules:
            # Filter by category
            if rule.applies_to_categories and req.tool_category not in rule.applies_to_categories:
                continue
            # Filter by trust level
            if rule.applies_to_trusts and req.trust_level not in rule.applies_to_trusts:
                continue
            # Filter by specific tool names
            if rule.applies_to_tools and req.tool_name not in rule.applies_to_tools:
                continue

            # Run evaluator
            reason = rule.evaluator(req.tool_name, req.parameters, req.context)
            if reason is None:
                continue  # rule didn't match

            result.matched_rules.append(rule.id)
            result.reasons.append(f"[{rule.id}] {reason}")
            if rule.remediation:
                result.remediation.append(rule.remediation)

            # Track highest risk
            risk_order = [RiskLevel.SAFE, RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL]
            if risk_order.index(rule.risk_level) > risk_order.index(highest_risk):
                highest_risk = rule.risk_level

            if rule.decision == PolicyDecision.DENY:
                deny_triggered = True
            elif rule.decision == PolicyDecision.STEPUP:
                stepup_triggered = True

        result.risk_level = highest_risk

        # Decision priority: DENY > STEPUP > default
        if deny_triggered:
            result.decision = PolicyDecision.DENY
        elif stepup_triggered:
            result.decision = PolicyDecision.STEPUP
            result.step_up_required = True

        log.info(
            "policy.evaluated",
            tool=req.tool_name,
            category=req.tool_category,
            trust=req.trust_level,
            decision=result.decision,
            rules_fired=result.matched_rules,
        )
        return result
