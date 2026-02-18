"""W8 Host Hardening Suite

A lightweight hardening checks that audit critical runtime host settings and
produce prioritized risk findings.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from amc.core.models import Finding, RiskLevel, ScanResult


class HardeningFindingSeverity(str, Enum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass
class HardeningCheck:
    check_id: str
    title: str
    description: str
    severity: HardeningFindingSeverity
    remediation: str


class HostHardeningSuite:
    """Evaluate host and process posture against a hardened baseline."""

    CHECKS: list[HardeningCheck] = [
        HardeningCheck(
            check_id="HH-001",
            title="Gateway bind scope",
            description="Production gateway should not be publicly exposed by default.",
            severity=HardeningFindingSeverity.HIGH,
            remediation="Set gateway.bind to 127.0.0.1 unless explicitly remote-tunneled.",
        ),
        HardeningCheck(
            check_id="HH-002",
            title="Gateway auth rate limit",
            description="Auth endpoints without a rate limit allow brute-force and abuse.",
            severity=HardeningFindingSeverity.MEDIUM,
            remediation="Configure gateway.auth.rateLimit with conservative thresholds.",
        ),
        HardeningCheck(
            check_id="HH-003",
            title="Credentials permissions",
            description="Credential directory must be user-private (700).",
            severity=HardeningFindingSeverity.HIGH,
            remediation="chmod 700 ~/.openclaw/credentials and rotate impacted secrets.",
        ),
        HardeningCheck(
            check_id="HH-004",
            title="Control-plane command denylist",
            description="High-risk control-plane commands should be blocked for untrusted sessions.",
            severity=HardeningFindingSeverity.HIGH,
            remediation="Configure enforce policy denylist for control-plane tools in untrusted contexts.",
        ),
        HardeningCheck(
            check_id="HH-005",
            title="Log retention policy",
            description="Audit logs should have finite retention and integrity options.",
            severity=HardeningFindingSeverity.LOW,
            remediation="Enable log rotation and tamper-evident storage policy in watch settings.",
        ),
    ]

    def run(self, config: dict[str, Any] | None = None) -> ScanResult:
        """Run host hardening checks and return a scan result."""
        config = config or {}
        findings: list[Finding] = []
        score = 0

        def read_bool(path: str, default: bool) -> bool:
            keys = path.split(".")
            cur: Any = config
            for key in keys:
                if isinstance(cur, dict):
                    cur = cur.get(key)
                else:
                    return default
            return bool(cur) if cur is not None else default

        def read_int(path: str, default: int) -> int:
            keys = path.split(".")
            cur: Any = config
            for key in keys:
                if isinstance(cur, dict):
                    cur = cur.get(key)
                else:
                    return default
            return int(cur) if cur is not None else default

        # HH-001
        bind = config.get("gateway", {}).get("bind", "127.0.0.1")
        if str(bind) != "127.0.0.1":
            findings.append(Finding(
                id="",
                module="watch.w8_host_hardening",
                rule_id="HH-001",
                title="Gateway bind scope",
                description="Gateway is not bound to loopback."
                if bind
                else "Gateway bind missing; default may be broad.",
                risk_level=RiskLevel.HIGH,
                evidence=f"gateway.bind={bind}",
                remediation="Bind to 127.0.0.1 or enforce strict remote tunnel controls.",
            ))
            score += 30

        # HH-002
        has_rate_limit = read_bool("gateway.auth.rateLimit.enabled", False)
        if not has_rate_limit:
            findings.append(Finding(
                id="",
                module="watch.w8_host_hardening",
                rule_id="HH-002",
                title="No auth rate limiting",
                description="No auth rate limit configured on gateway.",
                risk_level=RiskLevel.MEDIUM,
                evidence="gateway.auth.rateLimit.enabled is false/missing",
                remediation="Enable auth rate limiting for all exposed endpoints.",
            ))
            score += 20

        # HH-003
        credentials_mode = config.get("file_mode", {}).get("credentials", 700)
        if int(credentials_mode) > 700:
            findings.append(Finding(
                id="",
                module="watch.w8_host_hardening",
                rule_id="HH-003",
                title="Credentials folder too open",
                description="Credentials path permission above secure threshold.",
                risk_level=RiskLevel.HIGH,
                evidence=f"file_mode.credentials={credentials_mode}",
                remediation="Set permissions to 700 for credential store.",
            ))
            score += 35

        # HH-004
        allowlist = config.get("tools", {}).get("allowlist", [])
        risky_tools = {"gateway", "openclaw", "cron", "gateway.apply", "gateway.restart"}
        risky_in_allowlist = risky_tools.intersection(set(allowlist))
        if read_bool("tools.untrusted_restrictions.strict", False) and risky_in_allowlist:
            pass
        elif risky_in_allowlist:
            findings.append(Finding(
                id="",
                module="watch.w8_host_hardening",
                rule_id="HH-004",
                title="Control-plane access in allowlist",
                description="High-risk control-plane commands are allowlisted.",
                risk_level=RiskLevel.HIGH,
                evidence=f"riskToolsPresent={sorted(risky_in_allowlist)}",
                remediation="Move control-plane tools out of generic allowlists for untrusted sessions.",
            ))
            score += 30

        # HH-005
        retention_days = read_int("audit.retention_days", 0)
        if retention_days < 30:
            findings.append(Finding(
                id="",
                module="watch.w8_host_hardening",
                rule_id="HH-005",
                title="Short log retention",
                description="Audit retention too short for meaningful investigation.",
                risk_level=RiskLevel.LOW,
                evidence=f"audit.retention_days={retention_days}",
                remediation="Set retention policy to at least 30 days.",
            ))
            score += 5

        passed = len(findings) == 0
        risk_level = RiskLevel.SAFE
        if score >= 60:
            risk_level = RiskLevel.HIGH
        elif score >= 30:
            risk_level = RiskLevel.MEDIUM
        elif score > 0:
            risk_level = RiskLevel.LOW

        return ScanResult(
            module="watch.w8_host_hardening",
            target="host",
            risk_score=min(score, 100),
            risk_level=risk_level,
            findings=findings,
            passed=passed,
            metadata={
                "findings": len(findings),
                "checks_run": len(self.CHECKS),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
