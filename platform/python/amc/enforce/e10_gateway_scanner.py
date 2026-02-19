"""
AMC Enforce — E10: Gateway Exposure Scanner & Auto-Hardener

Scans an OpenClaw gateway for security misconfigurations (bind mode,
TLS, auth tokens, insecure flags) and generates a hardening plan.

Pricing tier: $29–$299/mo per gateway.

Usage:
    scanner = GatewayScanner()
    result = scanner.scan("0.0.0.0", 8443, "/etc/openclaw/config.yaml")
    if result.risk_score > 40:
        plan = AutoHardener().harden(result)
        for step in plan.steps:
            print(step.description, step.shell_command)

    # Continuous monitoring
    async for change in scanner.watch("0.0.0.0", 8443, "/etc/openclaw/config.yaml", interval_seconds=60):
        notify(change)
"""
from __future__ import annotations

import asyncio
import json
import socket
import ssl
import time
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, AsyncIterator

import structlog
from pydantic import BaseModel, Field

from amc.core.models import RiskLevel, score_to_risk

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Enums & Models
# ---------------------------------------------------------------------------

class BindMode(str, Enum):
    LOOPBACK = "loopback"      # 127.0.0.1 / ::1
    LAN = "lan"                # private RFC-1918
    PUBLIC = "public"          # 0.0.0.0 / public IP


class ScanFindingSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class ScanFinding(BaseModel):
    """Individual issue found during gateway scan."""
    id: str
    title: str
    description: str
    severity: ScanFindingSeverity
    score_contribution: int = Field(ge=0, le=30)
    remediation: str = ""


class GatewayScanResult(BaseModel):
    """Aggregate result of a gateway security scan."""
    scan_id: str = Field(default_factory=lambda: f"gscan-{int(time.time() * 1000)}")
    host: str
    port: int
    config_path: str
    exposed_publicly: bool = False
    bind_mode: str = BindMode.LOOPBACK.value
    tls_enabled: bool = False
    auth_token_set: bool = False
    insecure_flags: list[str] = Field(default_factory=list)
    issues: list[ScanFinding] = Field(default_factory=list)
    risk_score: int = Field(ge=0, le=100, default=0)
    risk_level: RiskLevel = RiskLevel.SAFE
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def model_post_init(self, __context: Any) -> None:
        self.risk_level = score_to_risk(self.risk_score)


class HardeningStep(BaseModel):
    """A single remediation step with a shell command."""
    description: str
    shell_command: str
    reversible: bool = True


class HardeningPlan(BaseModel):
    """Plan of remediation steps generated from scan findings."""
    scan_id: str
    steps: list[HardeningStep] = Field(default_factory=list)
    estimated_risk_reduction: int = 0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_PRIVATE_PREFIXES = ("10.", "172.16.", "172.17.", "172.18.", "172.19.",
                     "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
                     "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
                     "172.30.", "172.31.", "192.168.")


def _classify_bind(host: str) -> BindMode:
    if host in ("127.0.0.1", "::1", "localhost"):
        return BindMode.LOOPBACK
    if host.startswith(_PRIVATE_PREFIXES):
        return BindMode.LAN
    if host in ("0.0.0.0", "::", ""):
        return BindMode.PUBLIC
    # Try to resolve
    try:
        addr = socket.gethostbyname(host)
        if addr.startswith("127."):
            return BindMode.LOOPBACK
        if addr.startswith(_PRIVATE_PREFIXES):
            return BindMode.LAN
    except socket.gaierror:
        pass
    return BindMode.PUBLIC


def _check_tls(host: str, port: int, timeout: float = 3.0) -> bool:
    """Attempt a TLS handshake to determine if TLS is active."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        with socket.create_connection((host if host != "0.0.0.0" else "127.0.0.1", port), timeout=timeout) as sock:
            with ctx.wrap_socket(sock) as ssock:
                _ = ssock.version()
                return True
    except Exception:
        return False


def _check_port_open(host: str, port: int, timeout: float = 2.0) -> bool:
    target = host if host not in ("0.0.0.0", "::") else "127.0.0.1"
    try:
        with socket.create_connection((target, port), timeout=timeout):
            return True
    except Exception:
        return False


def _parse_config(config_path: str) -> dict[str, Any]:
    """Parse gateway config (YAML or JSON). Returns empty dict on failure."""
    p = Path(config_path)
    if not p.exists():
        return {}
    text = p.read_text(encoding="utf-8")
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        pass
    # Minimal YAML-like key:value parse for common fields
    result: dict[str, Any] = {}
    for line in text.splitlines():
        line = line.strip()
        if ":" in line and not line.startswith("#"):
            key, _, val = line.partition(":")
            result[key.strip()] = val.strip().strip('"').strip("'")
    return result


_INSECURE_FLAGS = (
    "insecure", "no-auth", "skip-tls", "disable-tls",
    "allow-all", "debug-mode", "no-verify", "skip-auth",
)


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------

class GatewayScanner:
    """Scans an OpenClaw gateway endpoint for security issues."""

    def scan(self, host: str, port: int, config_path: str = "") -> GatewayScanResult:
        """
        Run a full security scan against a gateway.

        Args:
            host: Bind address of the gateway.
            port: Port number.
            config_path: Path to gateway config file (optional).

        Returns:
            GatewayScanResult with findings and risk score.
        """
        issues: list[ScanFinding] = []
        score = 0

        # 1. Bind mode
        bind_mode = _classify_bind(host)
        exposed = bind_mode == BindMode.PUBLIC

        if exposed:
            finding = ScanFinding(
                id="GW-BIND-001",
                title="Gateway bound to public interface",
                description=f"Gateway is listening on {host} which exposes it to the internet.",
                severity=ScanFindingSeverity.CRITICAL,
                score_contribution=30,
                remediation="Bind to 127.0.0.1 or a private IP.",
            )
            issues.append(finding)
            score += finding.score_contribution
        elif bind_mode == BindMode.LAN:
            finding = ScanFinding(
                id="GW-BIND-002",
                title="Gateway bound to LAN interface",
                description=f"Gateway is on LAN address {host}. Accessible to local network.",
                severity=ScanFindingSeverity.WARNING,
                score_contribution=10,
                remediation="Consider binding to loopback unless LAN access is required.",
            )
            issues.append(finding)
            score += finding.score_contribution

        # 2. TLS check
        tls_enabled = _check_tls(host, port) if _check_port_open(host, port) else False
        if not tls_enabled:
            finding = ScanFinding(
                id="GW-TLS-001",
                title="TLS not enabled on gateway",
                description="Gateway does not present a TLS certificate. Traffic is unencrypted.",
                severity=ScanFindingSeverity.CRITICAL,
                score_contribution=25,
                remediation="Enable TLS with a valid certificate.",
            )
            issues.append(finding)
            score += finding.score_contribution

        # 3. Config analysis
        config = _parse_config(config_path) if config_path else {}

        auth_token_set = bool(config.get("auth_token") or config.get("token") or config.get("gateway_token"))
        if not auth_token_set:
            finding = ScanFinding(
                id="GW-AUTH-001",
                title="No authentication token configured",
                description="Gateway has no auth token, allowing unauthenticated access.",
                severity=ScanFindingSeverity.CRITICAL,
                score_contribution=25,
                remediation="Set a strong auth_token in gateway config.",
            )
            issues.append(finding)
            score += finding.score_contribution

        # 4. Insecure flags
        insecure_flags: list[str] = []
        for key, val in config.items():
            key_l = key.lower().replace("_", "-")
            if key_l in _INSECURE_FLAGS:
                if str(val).lower() in ("true", "1", "yes", "on"):
                    insecure_flags.append(key)
        if insecure_flags:
            finding = ScanFinding(
                id="GW-FLAG-001",
                title="Insecure configuration flags detected",
                description=f"Insecure flags enabled: {', '.join(insecure_flags)}",
                severity=ScanFindingSeverity.WARNING,
                score_contribution=15,
                remediation="Disable insecure flags in production.",
            )
            issues.append(finding)
            score += finding.score_contribution

        score = min(score, 100)

        result = GatewayScanResult(
            host=host,
            port=port,
            config_path=config_path,
            exposed_publicly=exposed,
            bind_mode=bind_mode.value,
            tls_enabled=tls_enabled,
            auth_token_set=auth_token_set,
            insecure_flags=insecure_flags,
            issues=issues,
            risk_score=score,
        )
        log.info("gateway.scan.complete", host=host, port=port, risk_score=score,
                 issues=len(issues), bind_mode=bind_mode.value)
        return result

    async def watch(
        self, host: str, port: int, config_path: str = "",
        interval_seconds: int = 60,
    ) -> AsyncIterator[GatewayScanResult]:
        """
        Continuously scan and yield results when changes are detected.

        Args:
            host: Bind address.
            port: Port number.
            config_path: Config file path.
            interval_seconds: Seconds between scans.

        Yields:
            GatewayScanResult when risk_score or issues change.
        """
        last_score: int | None = None
        last_issue_ids: set[str] = set()

        while True:
            result = self.scan(host, port, config_path)
            current_ids = {f.id for f in result.issues}
            if result.risk_score != last_score or current_ids != last_issue_ids:
                last_score = result.risk_score
                last_issue_ids = current_ids
                yield result
            await asyncio.sleep(interval_seconds)


# ---------------------------------------------------------------------------
# Auto-Hardener
# ---------------------------------------------------------------------------

class AutoHardener:
    """Generates remediation plans from scan results. Does NOT execute commands."""

    def harden(self, result: GatewayScanResult) -> HardeningPlan:
        """
        Generate a hardening plan from scan findings.

        Args:
            result: A completed GatewayScanResult.

        Returns:
            HardeningPlan with shell commands for each remediation.
        """
        steps: list[HardeningStep] = []
        reduction = 0

        for issue in result.issues:
            if issue.id == "GW-BIND-001":
                steps.append(HardeningStep(
                    description="Force gateway to bind to loopback only",
                    shell_command=(
                        f"sed -i '' 's/bind_address:.*/bind_address: 127.0.0.1/' "
                        f"{result.config_path} && openclaw gateway restart"
                    ),
                    reversible=True,
                ))
                reduction += issue.score_contribution

            elif issue.id == "GW-AUTH-001":
                steps.append(HardeningStep(
                    description="Generate and set a strong auth token",
                    shell_command=(
                        f"TOKEN=$(openssl rand -hex 32) && "
                        f"echo \"auth_token: $TOKEN\" >> {result.config_path} && "
                        f"echo \"New token: $TOKEN\" && openclaw gateway restart"
                    ),
                    reversible=True,
                ))
                reduction += issue.score_contribution

            elif issue.id == "GW-TLS-001":
                steps.append(HardeningStep(
                    description="Enable TLS with a self-signed certificate (replace with real cert)",
                    shell_command=(
                        "openssl req -x509 -newkey rsa:4096 -keyout /tmp/gw-key.pem "
                        "-out /tmp/gw-cert.pem -days 365 -nodes -subj '/CN=localhost' && "
                        f"echo 'tls_cert: /tmp/gw-cert.pem' >> {result.config_path} && "
                        f"echo 'tls_key: /tmp/gw-key.pem' >> {result.config_path} && "
                        "openclaw gateway restart"
                    ),
                    reversible=True,
                ))
                reduction += issue.score_contribution

            elif issue.id == "GW-FLAG-001":
                for flag in result.insecure_flags:
                    steps.append(HardeningStep(
                        description=f"Disable insecure flag: {flag}",
                        shell_command=(
                            f"sed -i '' 's/{flag}:.*/{flag}: false/' {result.config_path}"
                        ),
                        reversible=True,
                    ))
                reduction += issue.score_contribution

            elif issue.id == "GW-BIND-002":
                steps.append(HardeningStep(
                    description="Add firewall rule to restrict gateway port to localhost",
                    shell_command=(
                        f"sudo pfctl -e 2>/dev/null; "
                        f"echo 'block in on ! lo0 proto tcp to any port {result.port}' "
                        f"| sudo pfctl -f -"
                    ),
                    reversible=True,
                ))
                reduction += issue.score_contribution

        plan = HardeningPlan(
            scan_id=result.scan_id,
            steps=steps,
            estimated_risk_reduction=min(reduction, result.risk_score),
        )
        log.info("gateway.harden.plan", scan_id=result.scan_id,
                 steps=len(steps), reduction=plan.estimated_risk_reduction)
        return plan
