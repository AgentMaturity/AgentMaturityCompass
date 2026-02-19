"""
AMC Enforce — E12: Reverse Proxy and Header-Spoofing Guard
==========================================================

This module protects services that expect all external traffic to arrive through a
trusted reverse proxy. It is intentionally conservative: if a request looks like
it bypassed the proxy path, it is marked as high risk.

Usage
-----

.. code-block:: python

    from amc.enforce.e12_reverse_proxy_guard import ProxyConfig, ReverseProxyGuard

    cfg = ProxyConfig(
        trusted_proxy_ips=["203.0.113.20"],
        direct_port=8080,
        proxy_port=443,
        blocked_headers=["X-Forwarded-Host", "X-Original-Host"],
    )
    guard = ReverseProxyGuard(cfg)

    result = guard.validate_request(
        headers={"X-Forwarded-For": "198.51.100.10, 203.0.113.20"},
        source_ip="198.51.100.10",
        target_port=443,
    )
"""

from __future__ import annotations

import json
import re
import sqlite3
import socket
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.core.models import RiskLevel

logger = structlog.get_logger(__name__)


class ProxyConfig(BaseModel):
    """Runtime proxy policy for a protected service endpoint."""

    trusted_proxy_ips: list[str] = Field(default_factory=list)
    direct_port: int = 8080
    proxy_port: int = 443
    blocked_headers: list[str] = Field(default_factory=list)


class ProxyValidation(BaseModel):
    """Result of a single request validation through proxy controls."""

    valid: bool
    issues: list[str] = Field(default_factory=list)
    risk_level: RiskLevel = RiskLevel.SAFE
    spoofing_detected: bool = False


_NORMALIZED = "x-forwarded-for"


def _normalize_headers(headers: dict[str, Any]) -> dict[str, str]:
    return {str(k).strip().lower(): str(v).strip() for k, v in headers.items()}


class ReverseProxyGuard:
    """Validate whether request metadata conforms to trusted proxy flow.

    The class tracks configuration snapshots in SQLite so operators can audit
    configuration drift over time.
    """

    def __init__(
        self,
        config: ProxyConfig | None = None,
        db_path: str = "reverse_proxy_guard.db",
    ) -> None:
        if config is None:
            config = ProxyConfig()
        self.config = config
        self._db_path = Path(db_path)
        self._init_db()
        logger.info("proxy_guard.init", direct_port=config.direct_port, proxy_port=config.proxy_port)

    # ---------------------------- storage ----------------------------------

    def _init_db(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS proxy_config_baseline (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    trusted_proxy_ips TEXT NOT NULL,
                    direct_port INTEGER NOT NULL,
                    proxy_port INTEGER NOT NULL,
                    blocked_headers TEXT NOT NULL
                )
                """
            )

    def store_baseline(self, config: ProxyConfig | None = None) -> int:
        """Persist a proxy configuration snapshot and return row id."""
        cfg = config or self.config
        with sqlite3.connect(str(self._db_path)) as conn:
            cur = conn.execute(
                "INSERT INTO proxy_config_baseline \
                 (created_at, trusted_proxy_ips, direct_port, proxy_port, blocked_headers)\
                 VALUES (?, ?, ?, ?, ?)",
                (
                    datetime.now(timezone.utc).isoformat(),
                    json.dumps(cfg.trusted_proxy_ips),
                    cfg.direct_port,
                    cfg.proxy_port,
                    json.dumps(cfg.blocked_headers),
                ),
            )
            return int(cur.lastrowid)

    def get_latest_baseline(self) -> ProxyConfig | None:
        """Load most recent proxy configuration baseline."""
        with sqlite3.connect(str(self._db_path)) as conn:
            row = conn.execute(
                "SELECT trusted_proxy_ips, direct_port, proxy_port, blocked_headers "
                "FROM proxy_config_baseline ORDER BY id DESC LIMIT 1"
            ).fetchone()
        if row is None:
            return None
        return ProxyConfig(
            trusted_proxy_ips=json.loads(row[0]),
            direct_port=int(row[1]),
            proxy_port=int(row[2]),
            blocked_headers=json.loads(row[3]),
        )

    # ---------------------------- detection --------------------------------

    @staticmethod
    def probe_direct_access(host: str, port: int, timeout: int = 2) -> bool:
        """Try TCP connect to verify whether target port is reachable directly."""
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except Exception:
            return False
    
    def validate_request(
        self,
        headers: dict[str, str],
        source_ip: str,
        target_port: int,
    ) -> ProxyValidation:
        """Validate one inbound request metadata tuple.

        Parameters
        ----------
        headers:
            Raw HTTP request headers.
        source_ip:
            Source socket IP of the connection as observed by the application.
        target_port:
            Destination port as observed by the application.
        """
        normalized = _normalize_headers(headers)
        issues: list[str] = []
        risk = RiskLevel.SAFE
        spoofed = False

        # 1) Blocked headers are not removed (informational but policy decision can
        # be hardened by callers).
        blocked = [h for h in self.config.blocked_headers if h.lower() in normalized]
        for bad in blocked:
            issues.append(f"blocked_header_present:{bad}")

        xff = normalized.get("x-forwarded-for")
        xri = normalized.get("x-real-ip")

        trusted_chain = [ip.strip() for ip in xff.split(",")] if xff else []

        if trusted_chain and source_ip not in self.config.trusted_proxy_ips:
            # If source is not a trusted proxy and sends XFF, it likely spoofed it.
            issues.append("x-forwarded-for_set_by_untrusted_ip")
            risk = RiskLevel.HIGH if risk is not RiskLevel.CRITICAL else risk
            spoofed = True

        # direct gateway port must never be reachable from public path
        if target_port == self.config.direct_port:
            if self.probe_direct_access("127.0.0.1", target_port):
                issues.append("direct_gateway_port_accessible")
                risk = RiskLevel.HIGH

        def _raise_risk(current: RiskLevel, candidate: RiskLevel) -> RiskLevel:
            ordering = {
                RiskLevel.SAFE: 0,
                RiskLevel.LOW: 1,
                RiskLevel.MEDIUM: 2,
                RiskLevel.HIGH: 3,
                RiskLevel.CRITICAL: 4,
            }
            if ordering[candidate] > ordering[current]:
                return candidate
            return current

        if source_ip in self.config.trusted_proxy_ips and target_port == self.config.proxy_port:
            # Request enters through a trusted proxy.
            if xff and xri:
                xff_last = trusted_chain[-1] if trusted_chain else ""
                if xri != xff_last:
                    issues.append("x-real-ip_mismatch_with_trusted_chain")
                    risk = _raise_risk(risk, RiskLevel.MEDIUM)
        elif target_port == self.config.proxy_port:
            issues.append("source_ip_not_in_trusted_proxy_list")
            risk = _raise_risk(risk, RiskLevel.MEDIUM)

        # XFF must represent a chain with direct remote client + proxies. We
        # enforce a minimal chain consistency check: the final hop should be the
        # source_ip that connected directly to the service.
        if xff and trusted_chain:
            if trusted_chain[-1] != source_ip:
                issues.append("x-forwarded-for_chain_inconsistent")
                risk = _raise_risk(risk, RiskLevel.MEDIUM)

        valid = len(issues) == 0
        logger.info(
            "proxy_guard.validate",
            source_ip=source_ip,
            target_port=target_port,
            issues=len(issues),
            risk=risk.value,
            spoofed=spoofed,
        )
        return ProxyValidation(valid=valid, issues=issues, risk_level=risk, spoofing_detected=spoofed)

    # ---------------------------- config outputs ----------------------------

    def generate_nginx_config(self, proxy_config: ProxyConfig | None = None) -> str:
        """Generate an NGINX config snippet for trusted-proxy hardening."""
        cfg = proxy_config or self.config
        trusted = ", ".join([f"{ip}" for ip in cfg.trusted_proxy_ips]) or "127.0.0.1"
        blocked = "\n".join([f"    if ($http_{h.lower().replace('-', '_')} ) {{ return 403; }}" for h in cfg.blocked_headers])
        return f"""# Auto-generated for ReverseProxyGuard\nserver {{
    listen {cfg.proxy_port} ssl;
    {blocked}\n    set_real_ip_from {trusted};
    real_ip_header X-Forwarded-For;
    real_ip_recursive on;
\n    location / {{
        # direct-port traffic is rejected at network layer
        if ($server_port = {cfg.direct_port}) {{ return 403; }}
        proxy_pass http://backend;
        proxy_set_header X-Real-IP $realip_remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}
}}
"""

    def generate_caddy_config(self, proxy_config: ProxyConfig | None = None) -> str:
        """Generate a Caddyfile snippet for trusted-proxy hardening."""
        cfg = proxy_config or self.config
        trusted = ".*" if not cfg.trusted_proxy_ips else "|".join(cfg.trusted_proxy_ips)
        blocked = "\n".join(
            [f"    @bad_{h.replace('-', '_')} {{\n        header {h} *\n    }}\n    respond @bad_{h.replace('-', '_')} 403" for h in cfg.blocked_headers]
        )
        return f"""# Auto-generated for ReverseProxyGuard
{{
    reverse_proxy / 127.0.0.1:{cfg.proxy_port}
    trusted_proxies {trusted}
    header_downstream -Server
{blocked}
}}

:443/{{
    redir / https://{{host}}{{uri}} 301
}}
"""

    # ---------------------------- drift --------------------------------------

    def compare_to_baseline(self, current: ProxyConfig) -> list[str]:
        """Compare provided config against latest baseline and report deltas."""
        baseline = self.get_latest_baseline()
        if baseline is None:
            return ["no_baseline"]

        changes: list[str] = []
        if set(baseline.trusted_proxy_ips) != set(current.trusted_proxy_ips):
            changes.append("trusted_proxy_ips_changed")
        if baseline.direct_port != current.direct_port:
            changes.append("direct_port_changed")
        if baseline.proxy_port != current.proxy_port:
            changes.append("proxy_port_changed")
        if {h.lower() for h in baseline.blocked_headers} != {h.lower() for h in current.blocked_headers}:
            changes.append("blocked_headers_changed")

        if not changes:
            changes.append("no_drift")
        return changes
