"""
AMC Enforce E31 — Clipboard / Pasteboard Guard
===============================================

Prevents agent-driven clipboard operations from leaking secrets.
Content containing sensitive patterns (AWS keys, API keys, private key
headers, password/token assignments) is either redacted or fully blocked
before copy or paste events complete.

Usage::

    from amc.enforce.e31_clipboard_guard import ClipboardGuard, ClipboardPolicy

    policy = ClipboardPolicy(
        blocked_domains=["internal.secrets.corp"],
        allow_paste_to_domains=["safe-app.example.com"],
    )
    guard = ClipboardGuard(policy=policy, db_path=":memory:")

    decision = guard.check_copy("Hello world", source_domain="docs.example.com")
    assert decision.allowed is True

    decision = guard.check_copy(
        "AKIA1234567890ABCDEF",
        source_domain="vault.internal.secrets.corp",
    )
    assert decision.was_blocked or decision.redacted
"""
from __future__ import annotations

import hashlib
import re
import sqlite3
from datetime import datetime, timezone
from typing import Literal

import structlog
from pydantic import BaseModel, Field

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Default secret patterns
# ---------------------------------------------------------------------------

_DEFAULT_SECRET_PATTERNS: list[str] = [
    # AWS access key IDs
    r"AKIA[0-9A-Z]{16}",
    # AWS secret access keys (40 char base-64-ish strings following known marker)
    r"(?i)aws_secret_access_key\s*[=:]\s*[A-Za-z0-9/+]{40}",
    # Generic API key patterns: api_key=..., apikey=..., x-api-key: ...
    r"(?i)(?:api[_-]?key|apikey|x-api-key)\s*[=:]\s*[A-Za-z0-9\-_]{16,}",
    # PEM private key headers
    r"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----",
    # Password assignments
    r"(?i)password\s*[=:]\s*\S+",
    # Token assignments
    r"(?i)token\s*[=:]\s*[A-Za-z0-9\-_.]{8,}",
    # Bearer tokens
    r"(?i)bearer\s+[A-Za-z0-9\-_.]{8,}",
]

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class ClipboardPolicy(BaseModel):
    """Defines copy/paste rules for the :class:`ClipboardGuard`."""

    blocked_domains: list[str] = Field(default_factory=list)
    """Source or target domains from which copy is never allowed."""

    secret_patterns: list[str] = Field(default_factory=lambda: list(_DEFAULT_SECRET_PATTERNS))
    """Regex patterns whose presence triggers a block or redaction."""

    allow_paste_to_domains: list[str] = Field(default_factory=list)
    """Domains to which paste is explicitly permitted (allowlist)."""

    redact_on_copy: bool = True
    """If True, redact secrets in content instead of outright blocking copy."""


class ClipboardEvent(BaseModel):
    """Audit record for a single clipboard operation."""

    event_type: Literal["copy", "paste"]
    source_domain: str | None
    target_domain: str | None
    content_hash: str
    was_blocked: bool
    was_redacted: bool
    timestamp: datetime


class ClipboardDecision(BaseModel):
    """The outcome of a copy or paste check."""

    allowed: bool
    redacted: bool
    reason: str
    safe_content: str | None
    """Redacted content (when ``redacted=True``); ``None`` if blocked entirely."""


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------


class ClipboardGuard:
    """
    Evaluates clipboard operations against policy and maintains an audit log.
    """

    def __init__(
        self,
        policy: ClipboardPolicy | None = None,
        db_path: str = "clipboard_guard.db",
    ) -> None:
        """
        Initialise the guard.

        Args:
            policy: Optional :class:`ClipboardPolicy`.  Defaults are used when
                    *None*.
            db_path: SQLite database path.  Use ``":memory:"`` for tests.
        """
        self.policy = policy or ClipboardPolicy()
        self._compiled = [re.compile(p) for p in self.policy.secret_patterns]
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._bootstrap()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _bootstrap(self) -> None:
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS clipboard_events (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type     TEXT NOT NULL,
                source_domain  TEXT,
                target_domain  TEXT,
                content_hash   TEXT NOT NULL,
                was_blocked    INTEGER NOT NULL,
                was_redacted   INTEGER NOT NULL,
                timestamp      TEXT NOT NULL
            )
            """
        )
        self._conn.commit()

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _hash(content: str) -> str:
        return hashlib.sha256(content.encode()).hexdigest()

    def _is_domain_blocked(self, domain: str | None) -> bool:
        if domain is None:
            return False
        return any(
            domain == blocked or domain.endswith("." + blocked)
            for blocked in self.policy.blocked_domains
        )

    def _is_paste_allowed_to_domain(self, domain: str | None) -> bool:
        """Return True if paste to *domain* is explicitly permitted."""
        if not self.policy.allow_paste_to_domains:
            # Empty allowlist → no domain restriction on paste
            return True
        if domain is None:
            return False
        return any(
            domain == allowed or domain.endswith("." + allowed)
            for allowed in self.policy.allow_paste_to_domains
        )

    def _log_event(
        self,
        event_type: Literal["copy", "paste"],
        source_domain: str | None,
        target_domain: str | None,
        content: str,
        was_blocked: bool,
        was_redacted: bool,
    ) -> None:
        now = self._now()
        self._conn.execute(
            "INSERT INTO clipboard_events "
            "(event_type, source_domain, target_domain, content_hash, "
            " was_blocked, was_redacted, timestamp) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                event_type,
                source_domain,
                target_domain,
                self._hash(content),
                int(was_blocked),
                int(was_redacted),
                now.isoformat(),
            ),
        )
        self._conn.commit()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def contains_secret(self, content: str) -> bool:
        """
        Return ``True`` if *content* matches any secret pattern.

        Args:
            content: The text to inspect.
        """
        return any(p.search(content) for p in self._compiled)

    def redact_secrets(self, content: str) -> str:
        """
        Replace all secret pattern matches in *content* with ``[REDACTED]``.

        Args:
            content: The text to sanitise.

        Returns:
            Content with secrets replaced.
        """
        result = content
        for pattern in self._compiled:
            result = pattern.sub("[REDACTED]", result)
        return result

    def check_copy(
        self,
        content: str,
        source_domain: str | None = None,
    ) -> ClipboardDecision:
        """
        Evaluate a copy operation.

        Rules applied in order:
        1. Block if *source_domain* is in ``blocked_domains``.
        2. If content contains secrets and ``redact_on_copy`` is True → redact.
        3. If content contains secrets and ``redact_on_copy`` is False → block.

        Args:
            content: The text being copied.
            source_domain: The domain or context the copy originates from.

        Returns:
            A :class:`ClipboardDecision`.
        """
        if self._is_domain_blocked(source_domain):
            self._log_event("copy", source_domain, None, content, True, False)
            logger.warning(
                "clipboard.copy_blocked_domain",
                source_domain=source_domain,
            )
            return ClipboardDecision(
                allowed=False,
                redacted=False,
                reason=f"source_domain '{source_domain}' is blocked",
                safe_content=None,
            )

        has_secret = self.contains_secret(content)

        if has_secret:
            if self.policy.redact_on_copy:
                safe = self.redact_secrets(content)
                self._log_event("copy", source_domain, None, content, False, True)
                logger.info("clipboard.copy_redacted", source_domain=source_domain)
                return ClipboardDecision(
                    allowed=True,
                    redacted=True,
                    reason="content contained secrets; secrets redacted",
                    safe_content=safe,
                )
            else:
                self._log_event("copy", source_domain, None, content, True, False)
                logger.warning("clipboard.copy_blocked_secret", source_domain=source_domain)
                return ClipboardDecision(
                    allowed=False,
                    redacted=False,
                    reason="content contains secrets and redact_on_copy is disabled",
                    safe_content=None,
                )

        self._log_event("copy", source_domain, None, content, False, False)
        return ClipboardDecision(
            allowed=True,
            redacted=False,
            reason="content is clean",
            safe_content=content,
        )

    def check_paste(
        self,
        content: str,
        target_domain: str | None = None,
    ) -> ClipboardDecision:
        """
        Evaluate a paste operation.

        Rules applied in order:
        1. Block if *target_domain* is not in the ``allow_paste_to_domains``
           allowlist (when the list is non-empty).
        2. Block if content contains secrets (never paste raw secrets).

        Args:
            content: The text being pasted.
            target_domain: The domain or context the paste is directed at.

        Returns:
            A :class:`ClipboardDecision`.
        """
        if not self._is_paste_allowed_to_domain(target_domain):
            self._log_event("paste", None, target_domain, content, True, False)
            logger.warning(
                "clipboard.paste_blocked_domain",
                target_domain=target_domain,
            )
            return ClipboardDecision(
                allowed=False,
                redacted=False,
                reason=f"target_domain '{target_domain}' is not in the paste allowlist",
                safe_content=None,
            )

        if self.contains_secret(content):
            self._log_event("paste", None, target_domain, content, True, False)
            logger.warning("clipboard.paste_blocked_secret", target_domain=target_domain)
            return ClipboardDecision(
                allowed=False,
                redacted=False,
                reason="content contains secrets; paste refused",
                safe_content=None,
            )

        self._log_event("paste", None, target_domain, content, False, False)
        return ClipboardDecision(
            allowed=True,
            redacted=False,
            reason="paste allowed",
            safe_content=content,
        )

    def get_audit_log(self, limit: int = 100) -> list[ClipboardEvent]:
        """
        Retrieve recent clipboard events from the audit log.

        Args:
            limit: Maximum number of events to return (most-recent first).

        Returns:
            List of :class:`ClipboardEvent` objects.
        """
        cur = self._conn.execute(
            "SELECT event_type, source_domain, target_domain, content_hash, "
            "       was_blocked, was_redacted, timestamp "
            "FROM clipboard_events ORDER BY id DESC LIMIT ?",
            (limit,),
        )
        events: list[ClipboardEvent] = []
        for row in cur.fetchall():
            event_type, source_domain, target_domain, content_hash, was_blocked, was_redacted, ts = row
            events.append(
                ClipboardEvent(
                    event_type=event_type,
                    source_domain=source_domain,
                    target_domain=target_domain,
                    content_hash=content_hash,
                    was_blocked=bool(was_blocked),
                    was_redacted=bool(was_redacted),
                    timestamp=datetime.fromisoformat(ts),
                )
            )
        return events
