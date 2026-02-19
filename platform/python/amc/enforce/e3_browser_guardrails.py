"""
Browser Automation Guardrails and Anti-Phishing Mode (E3)

Provides URL navigation checks, action gating, redirect tracking,
screenshot analysis, DOM change detection, and domain reputation scoring.

Usage:
    from amc.enforce.e3_browser_guardrails import BrowserGuardrails
    from amc.core.models import SessionTrust

    g = BrowserGuardrails()
    decision = g.check_navigation("https://google.com", SessionTrust.TRUSTED)
    assert decision.allowed

    action = g.check_action("download", {"filename": "setup.exe"})
    assert not action.allowed

    rep = g.check_domain_reputation("g00gle.com")
    assert rep.lookalike_of == "google.com"
"""

from __future__ import annotations

import math
import re
from typing import Literal
from urllib.parse import urlparse

import structlog
from pydantic import BaseModel, Field

from amc.core.models import PolicyDecision, RiskLevel, SessionTrust

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SUSPICIOUS_TLDS = frozenset({
    ".tk", ".ml", ".ga", ".cf", ".gq", ".xyz", ".top",
    ".buzz", ".club", ".work", ".rest",
})

DANGEROUS_EXTENSIONS = frozenset({
    ".exe", ".bat", ".cmd", ".ps1", ".sh", ".msi", ".dll", ".scr", ".com",
    ".vbs", ".js", ".jar", ".app", ".dmg", ".pkg", ".deb", ".rpm", ".appimage",
})

PHISHING_KEYWORDS = frozenset({
    "signin", "sign-in", "login", "log-in", "verify", "secure", "account",
    "update", "confirm", "banking", "paypal", "wallet", "suspend", "alert",
    "unusual", "credential", "authenticate", "unlock", "restore", "recover",
    "password", "ssn", "billing",
})

DANGEROUS_CLICK_PATTERNS = re.compile(
    r"\b(install|run|execute|download|delete|remove)\b", re.IGNORECASE,
)

SENSITIVE_FIELD_PATTERNS = re.compile(
    r"(password|passwd|secret|token|api.?key|private.?key|credential)", re.IGNORECASE,
)

CREDENTIAL_PAGE_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"sign\s*in", r"log\s*in", r"password", r"verify\s+your\s+identity",
        r"enter\s+your\s+credentials", r"forgot\s+password", r"reset\s+password",
        r"two.?factor", r"2fa", r"one.?time\s+code", r"authentication",
    ]
]

DEFAULT_TRUSTED_DOMAINS = frozenset({
    "google.com", "github.com", "microsoft.com", "apple.com", "amazon.com",
    "stripe.com", "slack.com", "notion.so", "linkedin.com", "gitlab.com",
    "stackoverflow.com", "npmjs.com", "pypi.org", "docker.com", "aws.amazon.com",
    "cloud.google.com", "azure.microsoft.com", "vercel.com", "netlify.com",
    "anthropic.com",
})

DEFAULT_BLOCKLIST_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in [
        r"paypa[l1].*\.(?!com$)", r"app[l1]e-id", r"micr0soft", r"g00gle",
        r"amaz0n", r"faceb00k", r"netfl[i1]x", r"str[i1]pe-verify",
        r"secure-bank", r"account-verify", r"login-update", r"verify-identity",
        r"confirm-account", r"update-billing", r"unlock-account", r"restore-access",
        r"recover-password", r"credential-check", r"auth-secure", r"wallet-connect-",
        r"crypto-airdrop", r"free-bitcoin",
    ]
]

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class NavigationDecision(BaseModel):
    """Result of a URL navigation check."""
    allowed: bool
    risk_level: RiskLevel
    reasons: list[str] = Field(default_factory=list)
    requires_approval: bool = False
    url: str


class ActionDecision(BaseModel):
    """Result of a browser action check."""
    allowed: bool
    decision: PolicyDecision
    risk_level: RiskLevel
    reasons: list[str] = Field(default_factory=list)


class DomainReputation(BaseModel):
    """Reputation assessment for a domain."""
    domain: str
    risk_level: RiskLevel
    is_known_trusted: bool = False
    is_blocklisted: bool = False
    entropy_score: float = 0.0
    lookalike_of: str | None = None
    reasons: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _levenshtein(s1: str, s2: str) -> int:
    """Compute the Levenshtein edit-distance between two strings."""
    if len(s1) < len(s2):
        return _levenshtein(s2, s1)
    if not s2:
        return len(s1)
    prev = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        curr = [i + 1]
        for j, c2 in enumerate(s2):
            curr.append(min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (c1 != c2)))
        prev = curr
    return prev[-1]


def _shannon_entropy(s: str) -> float:
    """Compute Shannon entropy of a string."""
    if not s:
        return 0.0
    freq: dict[str, int] = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    length = len(s)
    return -sum((n / length) * math.log2(n / length) for n in freq.values())


def _extract_domain(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    return host.lower().strip(".")


def _root_domain(domain: str) -> str:
    """Return last two labels (or three for co.uk etc.)."""
    parts = domain.split(".")
    if len(parts) <= 2:
        return domain
    return ".".join(parts[-2:])


def _is_ip(host: str) -> bool:
    return bool(re.match(r"^\d{1,3}(\.\d{1,3}){3}$", host)) or host.startswith("[")


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------


class BrowserGuardrails:
    """Browser automation guardrails with anti-phishing protection."""

    def __init__(self) -> None:
        self._trusted_domains: dict[str, str] = {d: "trusted" for d in DEFAULT_TRUSTED_DOMAINS}
        self._redirect_chains: dict[str, list[str]] = {}
        self._log = logger.bind(component="browser_guardrails")

    # -- public API ---------------------------------------------------------

    def register_allowed_domain(self, domain: str, trust_level: str = "trusted") -> None:
        """Add a domain to the trusted allowlist."""
        domain = domain.lower().strip(".")
        self._trusted_domains[domain] = trust_level
        self._log.info("domain_registered", domain=domain, trust_level=trust_level)

    def check_navigation(self, url: str, session_trust: SessionTrust) -> NavigationDecision:
        """Evaluate whether navigation to *url* should be allowed."""
        reasons: list[str] = []
        risk = RiskLevel.SAFE
        requires_approval = False

        domain = _extract_domain(url)
        root = _root_domain(domain)

        # HOSTILE → always deny
        if session_trust == SessionTrust.HOSTILE:
            return NavigationDecision(
                allowed=False, risk_level=RiskLevel.CRITICAL,
                reasons=["HOSTILE session — all navigation denied"], requires_approval=False, url=url,
            )

        # IP-based
        if _is_ip(domain):
            risk = RiskLevel.HIGH
            reasons.append("IP-based URL")

        # Blocklist
        for pat in DEFAULT_BLOCKLIST_PATTERNS:
            if pat.search(domain):
                risk = RiskLevel.CRITICAL
                reasons.append(f"Matches blocklist pattern: {pat.pattern}")

        # Trusted check
        is_trusted = any(domain == td or domain.endswith("." + td) for td in self._trusted_domains)

        if is_trusted:
            reasons.append(f"Domain {domain} is trusted")
        else:
            # Suspicious TLD
            for tld in SUSPICIOUS_TLDS:
                if domain.endswith(tld):
                    risk = max(risk, RiskLevel.MEDIUM, key=lambda r: r.value if hasattr(r, 'value') else 0)
                    risk = self._max_risk(risk, RiskLevel.MEDIUM)
                    reasons.append(f"Suspicious TLD: {tld}")

            # Lookalike
            for td in self._trusted_domains:
                base = td.split(".")[0]
                dom_base = domain.split(".")[0]
                if base != dom_base and _levenshtein(base, dom_base) <= 2:
                    risk = self._max_risk(risk, RiskLevel.HIGH)
                    reasons.append(f"Lookalike of trusted domain {td} (edit distance ≤2)")

            # Long subdomain chains
            if domain.count(".") >= 4:
                risk = self._max_risk(risk, RiskLevel.MEDIUM)
                reasons.append("Long subdomain chain")

            # Phishing keywords in domain
            for kw in PHISHING_KEYWORDS:
                if kw in domain:
                    risk = self._max_risk(risk, RiskLevel.MEDIUM)
                    reasons.append(f"Phishing keyword in domain: {kw}")
                    break

        # UNTRUSTED session → require approval for non-trusted
        if session_trust == SessionTrust.UNTRUSTED and not is_trusted:
            requires_approval = True
            reasons.append("UNTRUSTED session requires approval for non-allowlisted domains")

        allowed = risk.value < RiskLevel.CRITICAL.value if hasattr(risk, 'value') else risk != RiskLevel.CRITICAL
        if requires_approval:
            allowed = False

        self._log.info("navigation_check", url=url, domain=domain, allowed=allowed, risk=risk.name)
        return NavigationDecision(
            allowed=allowed, risk_level=risk, reasons=reasons,
            requires_approval=requires_approval, url=url,
        )

    def check_action(
        self,
        action_type: Literal["click", "type", "fill", "download"],
        element_context: dict,
    ) -> ActionDecision:
        """Gate a browser action based on type and element context."""
        reasons: list[str] = []
        risk = RiskLevel.SAFE
        decision = PolicyDecision.ALLOW

        text = str(element_context.get("text", "") or "")
        field_name = str(element_context.get("name", "") or element_context.get("field", "") or "")
        field_type = str(element_context.get("type", "") or "")
        filename = str(element_context.get("filename", "") or element_context.get("href", "") or "")

        # Typing into sensitive fields
        if action_type in ("type", "fill"):
            if SENSITIVE_FIELD_PATTERNS.search(field_name) or field_type == "password":
                decision = PolicyDecision.STEPUP
                risk = RiskLevel.HIGH
                reasons.append("Typing into sensitive field requires step-up auth")

        # Dangerous clicks
        if action_type == "click" and DANGEROUS_CLICK_PATTERNS.search(text):
            decision = PolicyDecision.DENY
            risk = RiskLevel.HIGH
            reasons.append(f"Click on dangerous element text: {text!r}")

        # Dangerous downloads
        if action_type == "download":
            lower = filename.lower()
            for ext in DANGEROUS_EXTENSIONS:
                if lower.endswith(ext):
                    decision = PolicyDecision.DENY
                    risk = RiskLevel.HIGH
                    reasons.append(f"Dangerous file extension: {ext}")
                    break

        allowed = decision in (PolicyDecision.ALLOW, PolicyDecision.STEPUP)
        if decision == PolicyDecision.DENY:
            allowed = False

        self._log.info("action_check", action=action_type, decision=decision.name, risk=risk.name)
        return ActionDecision(allowed=allowed, decision=decision, risk_level=risk, reasons=reasons)

    def track_redirect(self, session_id: str, url: str) -> NavigationDecision:
        """Track redirect chains per session, flag excessive hops or domain changes."""
        chain = self._redirect_chains.setdefault(session_id, [])
        chain.append(url)
        reasons: list[str] = []
        risk = RiskLevel.SAFE

        if len(chain) > 3:
            risk = RiskLevel.HIGH
            reasons.append(f"Redirect chain length {len(chain)} exceeds threshold of 3")

        if len(chain) >= 2:
            prev_domain = _extract_domain(chain[-2])
            curr_domain = _extract_domain(url)
            if _root_domain(prev_domain) != _root_domain(curr_domain):
                risk = self._max_risk(risk, RiskLevel.MEDIUM)
                reasons.append(f"Cross-domain redirect: {prev_domain} → {curr_domain}")

        allowed = risk.value < RiskLevel.HIGH.value if hasattr(risk, 'value') else risk not in (RiskLevel.HIGH, RiskLevel.CRITICAL)
        self._log.info("redirect_track", session_id=session_id, hop=len(chain), risk=risk.name)
        return NavigationDecision(allowed=allowed, risk_level=risk, reasons=reasons, requires_approval=not allowed, url=url)

    def analyze_screenshot(self, image_path: str) -> list[str]:
        """Detect credential-page patterns in screenshot text content.

        In production this would use OCR; here we read the file as text
        (useful for HTML snapshots saved as text) and match patterns.
        """
        warnings: list[str] = []
        try:
            with open(image_path, "r", errors="ignore") as fh:
                content = fh.read(256_000)
        except Exception as exc:
            self._log.warning("screenshot_read_error", path=image_path, error=str(exc))
            return [f"Could not read screenshot: {exc}"]

        for pat in CREDENTIAL_PAGE_PATTERNS:
            if pat.search(content):
                warnings.append(f"Credential page indicator detected: {pat.pattern}")

        if warnings:
            self._log.warning("credential_page_detected", path=image_path, count=len(warnings))
        return warnings

    def check_dom_change(self, before_html: str, after_html: str) -> list[str]:
        """Detect suspicious DOM injections between two snapshots."""
        warnings: list[str] = []

        for tag in ("form", "input", "iframe"):
            before_count = before_html.lower().count(f"<{tag}")
            after_count = after_html.lower().count(f"<{tag}")
            if after_count > before_count:
                diff = after_count - before_count
                warnings.append(f"New <{tag}> element(s) injected: +{diff}")

        # Hidden iframes
        hidden_iframe = re.compile(r'<iframe[^>]*(display\s*:\s*none|visibility\s*:\s*hidden|width\s*=\s*["\']?0|height\s*=\s*["\']?0)', re.IGNORECASE)
        before_hidden = len(hidden_iframe.findall(before_html))
        after_hidden = len(hidden_iframe.findall(after_html))
        if after_hidden > before_hidden:
            warnings.append(f"Hidden iframe(s) injected: +{after_hidden - before_hidden}")

        if warnings:
            self._log.warning("dom_injection_detected", warnings=warnings)
        return warnings

    def check_domain_reputation(self, domain: str) -> DomainReputation:
        """Comprehensive domain reputation check."""
        domain = domain.lower().strip(".")
        reasons: list[str] = []
        risk = RiskLevel.SAFE
        is_trusted = any(domain == td or domain.endswith("." + td) for td in self._trusted_domains)
        is_blocklisted = False
        lookalike_of: str | None = None

        # Blocklist
        for pat in DEFAULT_BLOCKLIST_PATTERNS:
            if pat.search(domain):
                is_blocklisted = True
                risk = RiskLevel.CRITICAL
                reasons.append(f"Blocklist match: {pat.pattern}")
                break

        # Entropy
        label = domain.split(".")[0]
        entropy = round(_shannon_entropy(label), 3)
        if entropy > 3.5:
            risk = self._max_risk(risk, RiskLevel.MEDIUM)
            reasons.append(f"High entropy domain label ({entropy})")

        # Lookalike
        for td in self._trusted_domains:
            base = td.split(".")[0]
            dom_base = domain.split(".")[0]
            if base != dom_base and _levenshtein(base, dom_base) <= 2:
                risk = self._max_risk(risk, RiskLevel.HIGH)
                lookalike_of = td
                reasons.append(f"Lookalike of {td}")
                break

        if is_trusted:
            risk = RiskLevel.SAFE
            reasons.append("Known trusted domain")

        self._log.info("domain_reputation", domain=domain, risk=risk.name, trusted=is_trusted)
        return DomainReputation(
            domain=domain, risk_level=risk, is_known_trusted=is_trusted,
            is_blocklisted=is_blocklisted, entropy_score=entropy,
            lookalike_of=lookalike_of, reasons=reasons,
        )

    # -- internal helpers ---------------------------------------------------

    @staticmethod
    def _max_risk(a: RiskLevel, b: RiskLevel) -> RiskLevel:
        order = [RiskLevel.SAFE, RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL]
        return order[max(order.index(a), order.index(b))]
