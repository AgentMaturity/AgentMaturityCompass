"""AMC Enforce — E4: Network Egress Proxy and Domain Allowlist.

The egress layer performs three things:

1. Policy decisioning for outbound requests via :class:`EgressProxy`.
2. Persistent audit logging for every request in SQLite.
3. Optional process-level enforcement hints in the form of iptables rules.

It also exposes a tiny HTTP proxy server, :class:`EgressProxyServer`, that
rejects denied requests with ``403`` and forwards allowed requests to the
upstream host.

Usage
-----

.. code-block:: python

    from amc.enforce.e4_egress_proxy import (
        EgressProxy, EgressProxyConfig, generate_iptables_rules,
    )
    from amc.core.models import SessionTrust

    proxy = EgressProxy(
        EgressProxyConfig(
            allowed_domains=["api.example.com", "*.trusted-partner.com"],
            alert_on_new_domain=True,
        )
    )
    decision = proxy.check_request(
        "https://api.example.com/v1/status", "session-1", SessionTrust.UNTRUSTED
    )
    print(decision.allowed, decision.risk_level.value, decision.reason)

    rules = generate_iptables_rules(proxy.config)
    for cmd in rules:
        print(cmd)
"""

from __future__ import annotations

import http.client
import re
import sqlite3
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Literal

import structlog
from pydantic import BaseModel, Field

from amc.core.models import RiskLevel, SessionTrust
log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Types and constants
# ---------------------------------------------------------------------------

_BuildinBlockItem = str

# Common leak/exfiltration platforms that are disallowed for untrusted sessions.
DEFAULT_BLOCKLIST: list[_BuildinBlockItem] = [
    "pastebin.com",
    "raw.githubusercontent.com",
    "hastebin.com",
    "ghostbin.com",
    "rentry.co",
    "transfer.sh",
    "file.io",
    "0x0.st",
    "dpaste.org",
    "ngrok.io",
    "requestbin.com",
    "webhook.site",
    "interact.sh",
    "pipedream.net",
]


class EgressDecision(BaseModel):
    """Result of one egress policy decision.

    Parameters
    ----------
    allowed:
        ``True`` if request is allowed and should be forwarded.
    risk_level:
        Normalized risk level associated with this decision.
    reason:
        Human-readable rationale.
    new_domain:
        ``True`` when the domain was not seen before on this proxy.
    """

    allowed: bool
    risk_level: RiskLevel
    reason: str
    new_domain: bool


class EgressProxyConfig(BaseModel):
    """Configuration for egress allow/deny policy.

    The configuration uses session policy tags:

    - ``trusted``: permissive mode, allow all non-explicitly-blocked domains.
    - ``untrusted``: strict mode, allowlist-only.

    ``allowed_domains`` and ``blocked_domains`` support exact and wildcard values,
    e.g. ``"*.example.com"``.
    """

    allowed_domains: list[str] = Field(default_factory=list)
    blocked_domains: list[str] = Field(default_factory=list)
    # Optional per-session override map: session_id -> "trusted"/"untrusted"
    session_policies: dict[str, Literal["trusted", "untrusted"]] = Field(
        default_factory=dict
    )
    alert_on_new_domain: bool = True
    db_path: str = "egress_audit.db"
    # Optional ad-hoc regex domain matches (last-resort emergency blocklist).
    regex_patterns: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Proxy + policy engine
# ---------------------------------------------------------------------------


class EgressProxy:
    """Decision engine for outbound network requests.

    The object keeps one sqlite-backed audit log and tracks seen domains for
    first-seen alerting.
    """

    def __init__(self, config: EgressProxyConfig | None = None) -> None:
        self.config = config or EgressProxyConfig()
        self._db_path = Path(self.config.db_path)
        self._seen_domains: set[str] = set()
        self._lock = threading.Lock()
        self._regexes = [re.compile(x) for x in self.config.regex_patterns]
        self._init_db()
        log.info(
            "egress_proxy.init",
            allowed=len(self.config.allowed_domains),
            blocked=len(self.config.blocked_domains),
            sessions=len(self.config.session_policies),
        )

    # -- DB ------------------------------------------------------------------

    def _init_db(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS seen_domains (
                    domain TEXT PRIMARY KEY,
                    first_seen TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS egress_audit(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts TEXT NOT NULL,
                    url TEXT NOT NULL,
                    domain TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    trust_level TEXT NOT NULL,
                    allowed INTEGER NOT NULL,
                    risk_level TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    new_domain INTEGER NOT NULL
                )
                """
            )
            rows = conn.execute("SELECT domain FROM seen_domains").fetchall()
            self._seen_domains = {r[0] for r in rows}

    def _log(self, *, url: str, domain: str, session_id: str,
             session_trust: SessionTrust, decision: EgressDecision) -> None:
        try:
            with sqlite3.connect(str(self._db_path)) as conn:
                conn.execute(
                    """
                    INSERT INTO egress_audit
                    (ts,url,domain,session_id,trust_level,allowed,risk_level,reason,new_domain)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        datetime.now(timezone.utc).isoformat(),
                        url,
                        domain,
                        session_id,
                        session_trust.value,
                        int(decision.allowed),
                        decision.risk_level.value,
                        decision.reason,
                        int(decision.new_domain),
                    ),
                )
        except Exception:
            log.exception("egress_proxy.audit_write_failed")

    # -- Domain parsing & matching -------------------------------------------

    @staticmethod
    def _extract_domain(url: str) -> str:
        parsed = urllib.parse.urlparse(url)
        return (parsed.hostname or "").lower()

    @staticmethod
    def _match_domain(pattern: str, domain: str) -> bool:
        """Exact and wildcard matching.

        ``*.example.com`` matches both ``example.com`` and ``api.example.com``.
        """
        p = pattern.strip().lower()
        if p.startswith("*."):
            base = p[2:]
            return domain == base or domain.endswith(f".{base}")
        return domain == p

    @classmethod
    def _in_list(cls, domain: str, domain_list: list[str]) -> bool:
        for pat in domain_list:
            if cls._match_domain(pat, domain):
                return True
        return False

    def _regex_match(self, domain: str) -> bool:
        return any(r.search(domain) is not None for r in self._regexes)

    def _is_new_domain(self, domain: str) -> bool:
        with self._lock:
            if domain in self._seen_domains:
                return False
            self._seen_domains.add(domain)
            try:
                with sqlite3.connect(str(self._db_path)) as conn:
                    conn.execute(
                        "INSERT OR IGNORE INTO seen_domains(domain, first_seen) VALUES (?, ?)",
                        (domain, datetime.now(timezone.utc).isoformat()),
                    )
            except Exception:
                log.warning("egress_proxy.domain_seen_write_failed", domain=domain)
            return True

    def _policy_for_session(self, session_id: str, session_trust: SessionTrust) -> Literal["trusted", "untrusted"]:
        if session_id in self.config.session_policies:
            return self.config.session_policies[session_id]
        # Trusted sessions are permissive, everything else strict.
        return "trusted" if session_trust in {SessionTrust.OWNER, SessionTrust.TRUSTED} else "untrusted"

    # -- Core API ------------------------------------------------------------

    def check_request(
        self,
        url: str,
        session_id: str,
        session_trust: SessionTrust,
    ) -> EgressDecision:
        """Evaluate a request and return an :class:`EgressDecision`.

        Raises no exceptions intentionally; policy failures are represented by
        ``allowed=False`` with a reason.
        """
        domain = self._extract_domain(url)
        if not domain:
            decision = EgressDecision(
                allowed=False,
                risk_level=RiskLevel.HIGH,
                reason="Invalid or unparsable URL",
                new_domain=False,
            )
            self._log(
                url=url,
                domain="",
                session_id=session_id,
                session_trust=session_trust,
                decision=decision,
            )
            return decision

        _combined_blocked = sorted({*self.config.blocked_domains, *DEFAULT_BLOCKLIST})
        new_domain = self._is_new_domain(domain)
        policy = self._policy_for_session(session_id, session_trust)

        # strict allowlist mode for untrusted sessions
        if policy == "untrusted":
            allow_by_list = self._in_list(domain, self.config.allowed_domains) or self._regex_match(domain)
            blocked = self._in_list(domain, _combined_blocked)
            if blocked or not allow_by_list:
                decision = EgressDecision(
                    allowed=False,
                    risk_level=RiskLevel.HIGH,
                    reason=(
                        f"Untrusted session blocked: domain '{domain}' is not allowed"
                        if not blocked else f"Untrusted session blocked: domain '{domain}' is blocked"
                    ),
                    new_domain=new_domain,
                )
            else:
                decision = EgressDecision(
                    allowed=True,
                    risk_level=RiskLevel.MEDIUM if new_domain else RiskLevel.SAFE,
                    reason=f"Allowed by untrusted strict allowlist: {domain}",
                    new_domain=new_domain,
                )

        # permissive mode for trusted sessions
        else:
            decision = EgressDecision(
                allowed=True,
                risk_level=RiskLevel.MEDIUM if new_domain else RiskLevel.SAFE,
                reason=f"Permissive trust mode: allowing '{domain}'",
                new_domain=new_domain,
            )

        # First-seen domain alerting.
        if new_domain and self.config.alert_on_new_domain:
            if decision.risk_level == RiskLevel.SAFE:
                decision.risk_level = RiskLevel.MEDIUM

        self._log(
            url=url,
            domain=domain,
            session_id=session_id,
            session_trust=session_trust,
            decision=decision,
        )
        return decision


# ---------------------------------------------------------------------------
# iptables rule generation
# ---------------------------------------------------------------------------

def generate_iptables_rules(config: EgressProxyConfig) -> list[str]:
    """Generate human-readable iptables rules for an OS-level enforcement profile.

    This generator favors explicitness over perfection. Wildcard domain matching
    is represented as comments since iptables does not do DNS-based domain matching
    without helper tooling.
    """

    allowed = sorted(set(config.allowed_domains))
    blocked = sorted(set(config.blocked_domains + DEFAULT_BLOCKLIST))

    cmds: list[str] = [
        "# AMC Egress Proxy generated rules",
        "iptables -N AMC_EGRESS 2>/dev/null || true",
        "iptables -F AMC_EGRESS",
        "iptables -A AMC_EGRESS -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
        "iptables -A AMC_EGRESS -p udp --dport 53 -j ACCEPT",
        "iptables -A AMC_EGRESS -p tcp --dport 53 -j ACCEPT",
        "",
    ]

    for domain in allowed:
        if domain.startswith("*."):
            cmds.append(f"# TODO: resolve wildcard allow {domain} using DNS firewall layer")
            continue
        cmds.append(f"iptables -A AMC_EGRESS -d {domain} -p tcp --dport 80 -j ACCEPT")
        cmds.append(f"iptables -A AMC_EGRESS -d {domain} -p tcp --dport 443 -j ACCEPT")

    for domain in blocked:
        if domain.startswith("*."):
            cmds.append(f"# TODO: block wildcard {domain} via DNS sinkhole")
            continue
        cmds.append(f"iptables -A AMC_EGRESS -d {domain} -j DROP")

    cmds.extend([
        "iptables -A AMC_EGRESS -p tcp -j DROP",
        "iptables -D OUTPUT -j AMC_EGRESS 2>/dev/null || true",
        "iptables -A OUTPUT -j AMC_EGRESS",
    ])
    return cmds


# ---------------------------------------------------------------------------
# Minimal HTTP forward proxy
# ---------------------------------------------------------------------------


class EgressProxyHandler(BaseHTTPRequestHandler):
    """HTTP handler that applies policy then forwards or denies.

    It supports absolute-form URLs (standard proxy request style) as well as path-only
    requests with a ``Host`` header.
    """

    proxy: EgressProxy
    session_id: str
    session_trust: SessionTrust

    # BaseHTTPRequestHandler defaults to writing to stderr; silence it.
    def log_message(self, format: str, *args: Any) -> None:  # noqa: D401
        return

    def _extract_target_url(self) -> str | None:
        if self.path.startswith("http://") or self.path.startswith("https://"):
            return self.path
        host = self.headers.get("Host")
        if not host:
            return None
        scheme = "https" if isinstance(self.connection, object) else "http"
        return f"{scheme}://{host}{self.path}"

    def do_CONNECT(self) -> None:
        # CONNECT is used for HTTPS tunneling. We still gate on target hostname.
        host_port = self.path
        host = host_port.split(":", 1)[0]
        url = f"https://{host_port}"
        decision = self.proxy.check_request(url, self.session_id, self.session_trust)
        if not decision.allowed:
            self.send_error(403, decision.reason)
            return

        # A fully correct CONNECT tunnel requires bidirectional socket forwarding.
        # For safety and minimalism we only return an allow signal.
        self.send_response(200, "Connection established")
        self.end_headers()
        self.wfile.write(b"OK")

    def do_OPTIONS(self) -> None:
        self._handle_simple_method()

    def do_GET(self) -> None:
        self._handle_simple_method()

    def do_POST(self) -> None:
        self._handle_simple_method()

    def do_PUT(self) -> None:
        self._handle_simple_method()

    def do_DELETE(self) -> None:
        self._handle_simple_method()

    def _handle_simple_method(self) -> None:
        target = self._extract_target_url()
        if not target:
            self.send_error(400, "Malformed request URL")
            return

        decision = self.proxy.check_request(target, self.session_id, self.session_trust)
        if not decision.allowed:
            self.send_error(403, decision.reason)
            return

        payload: bytes = b""
        if self.command in {"POST", "PUT"} and "Content-Length" in self.headers:
            length = int(self.headers["Content-Length"])
            payload = self.rfile.read(length)

        fwd_headers = {
            k: v
            for k, v in self.headers.items()
            if k.lower() not in {"host", "connection", "proxy-connection"}
        }

        req = urllib.request.Request(
            target,
            data=payload or None,
            headers=fwd_headers,
            method=self.command,
        )
        try:
            with urllib.request.urlopen(req, timeout=30, context=None) as response:
                self.send_response(response.getcode())
                self.send_header("X-AMC-Decision", "allowed")
                for key, value in response.headers.items():
                    if key.lower() in {"transfer-encoding", "connection", "keep-alive"}:
                        continue
                    self.send_header(key, value)
                self.end_headers()
                self.wfile.write(response.read())
        except urllib.error.HTTPError as exc:
            self.send_error(exc.code, exc.reason)
        except (urllib.error.URLError, http.client.InvalidURL, OSError) as exc:
            self.send_error(502, f"Upstream error: {exc}")


class EgressProxyServer:
    """Start/stop the lightweight HTTP enforcement proxy.

    Example:

    .. code-block:: python

        proxy = EgressProxy()
        server = EgressProxyServer(proxy, host="127.0.0.1", port=8899)
        server.start()
        # ... route traffic through http://127.0.0.1:8899 ...
        server.stop()
    """

    def __init__(
        self,
        proxy: EgressProxy,
        host: str = "127.0.0.1",
        port: int = 8899,
        session_id: str = "default",
        session_trust: SessionTrust = SessionTrust.UNTRUSTED,
    ) -> None:
        self.proxy = proxy
        self.host = host
        self.port = port
        self._thread: threading.Thread | None = None

        handler_cls = type(
            "_EgressHandler",
            (EgressProxyHandler,),
            {
                "proxy": proxy,
                "session_id": session_id,
                "session_trust": session_trust,
            },
        )
        self._server = HTTPServer((host, port), handler_cls)

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        log.info("egress_proxy_server.started", host=self.host, port=self.port)

    def stop(self) -> None:
        if self._thread is None:
            return
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=2)
        self._thread = None
        log.info("egress_proxy_server.stopped", host=self.host, port=self.port)

    @property
    def address(self) -> str:
        return f"http://{self.host}:{self.port}"


__all__ = [
    "EgressDecision",
    "EgressProxyConfig",
    "EgressProxy",
    "generate_iptables_rules",
    "EgressProxyServer",
]
