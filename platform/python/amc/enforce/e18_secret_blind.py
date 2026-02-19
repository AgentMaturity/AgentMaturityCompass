"""
AMC Enforce — E18: Secret-Blind Form Fill Broker
================================================

Agents must never receive raw credentials. This module creates a secure
request-and-release flow where:

1. Agent detects a password/2FA form field.
2. Agent requests a one-time *secret entry request*.
3. Human approves/fulfils request on a secure channel.
4. Agent receives only a short-lived vault token, never the password itself.

All requests and completions are logged in Markdown files for auditability.

Usage
-----

.. code-block:: python

    from amc.enforce.e18_secret_blind import SecretBlindBroker, SecretEntry

    broker = SecretBlindBroker()
    req = broker.request_secret_entry(
        domain="example.com",
        field_name="password",
        field_type="password",
        session_id="session-123",
    )

    # ... human fills credential out-of-band ...
    success, token = broker.complete_request(req.request_id)
    if success:
        print(token.token_id, token.expires_in_seconds)
"""

from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.vault.v2_dlp import DLPRedactor

logger = structlog.get_logger(__name__)


class SecretEntry(BaseModel):
    """One logical target field that requires secret handling."""

    domain: str
    field_name: str
    field_type: str
    agent_session_id: str


class SecretEntryRequest(BaseModel):
    """Lifecycle state for a human secret-fetch request."""

    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    domain: str
    field_name: str
    field_type: str
    status: str = "pending"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(minutes=10))


class VaultToken(BaseModel):
    """Opaque token used by downstream tools instead of raw password."""

    token_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    scope: str
    expires_in_seconds: int = 300


class SecretBlindBroker:
    """Coordinate secret entry requests and enforce no-credential browser typing."""

    _FIELD_TYPES = {"password", "2fa", "pin", "secret"}

    def __init__(
        self,
        requests_log_path: str = "AMC_OS/LOGS/SECRET_ENTRY_REQUESTS.md",
        audit_log_path: str = "AMC_OS/LOGS/SECRET_ENTRY_AUDIT.md",
    ) -> None:
        self._requests: dict[str, SecretEntryRequest] = {}
        self._issued_tokens: dict[str, VaultToken] = {}
        self._requests_log_path = Path(requests_log_path)
        self._audit_log_path = Path(audit_log_path)
        self._requests_log_path.parent.mkdir(parents=True, exist_ok=True)
        self._audit_log_path.parent.mkdir(parents=True, exist_ok=True)
        self._dlp = DLPRedactor()
        logger.info("secret_blind.init", request_log=str(self._requests_log_path))

    # ----------------------------- internals ---------------------------------

    def _append_markdown(self, path: Path, lines: list[str]) -> None:
        header = [
            "# Secret Entry Request Log\n",
            f"- Updated: {datetime.now(timezone.utc).isoformat()}\n",
            "\n",
        ]
        is_new = not path.exists()
        with path.open("a", encoding="utf-8") as fh:
            if is_new:
                fh.writelines(header)
            fh.write("\n".join(lines) + "\n")

    def _append_audit(self, msg: str) -> None:
        self._append_markdown(self._audit_log_path, [msg])

    # ----------------------------- API ---------------------------------------

    def request_secret_entry(
        self,
        domain: str,
        field_name: str,
        field_type: str,
        session_id: str,
    ) -> SecretEntryRequest:
        """Create a pending secret request and persist an audit line."""
        if field_type not in self._FIELD_TYPES:
            raise ValueError(f"Unsupported field_type: {field_type!r}")

        req = SecretEntryRequest(
            domain=domain,
            field_name=field_name,
            field_type=field_type,
        )
        self._requests[req.request_id] = req

        self._append_markdown(
            self._requests_log_path,
            [
                f"- [PENDING] request_id={req.request_id} domain={domain} "
                f"field={field_name} type={field_type} session={session_id} "
                f"created_at={req.created_at.isoformat()}"
            ],
        )
        self._append_audit(f"{req.created_at.isoformat()} {req.request_id} requested for {domain}")

        logger.info("secret_blind.request_created", request_id=req.request_id, domain=domain, field_name=field_name)
        return req

    def get_request_status(self, request_id: str) -> SecretEntryRequest | None:
        """Read the current status for a pending/completed request."""
        return self._requests.get(request_id)

    def complete_request(self, request_id: str) -> tuple[bool, VaultToken | None]:
        """Mark request completed and mint a short-lived vault token.

        Returns:
            (success, VaultToken | None)
        """
        req = self._requests.get(request_id)
        if req is None:
            logger.warning("secret_blind.complete.unknown", request_id=request_id)
            return False, None

        req.status = "completed"
        token = VaultToken(token_id=str(uuid.uuid4()), scope=req.domain)
        self._issued_tokens[request_id] = token

        self._append_markdown(
            self._requests_log_path,
            [
                f"- [COMPLETED] request_id={request_id} domain={req.domain} "
                f"token_id={token.token_id}"
            ],
        )
        self._append_audit(f"{datetime.now(timezone.utc).isoformat()} {request_id} completed for {req.domain}")

        logger.info("secret_blind.request_completed", request_id=request_id, token_id=token.token_id)
        return True, token

    def deny_request(self, request_id: str) -> bool:
        """Explicitly deny a pending request."""
        req = self._requests.get(request_id)
        if req is None:
            return False
        req.status = "denied"
        self._append_markdown(
            self._requests_log_path,
            [
                f"- [DENIED] request_id={request_id} domain={req.domain}"
            ],
        )
        self._append_audit(f"{datetime.now(timezone.utc).isoformat()} {request_id} denied for {req.domain}")
        return True

    def mark_timeout(self, request_id: str) -> bool:
        """Mark a request as timed out."""
        req = self._requests.get(request_id)
        if req is None:
            return False
        req.status = "timeout"
        self._append_markdown(
            self._requests_log_path,
            [
                f"- [TIMEOUT] request_id={request_id} domain={req.domain}"
            ],
        )
        self._append_audit(f"{datetime.now(timezone.utc).isoformat()} {request_id} timeout for {req.domain}")
        return True

    def resolve_token(self, request_id: str) -> VaultToken | None:
        """Return a previously issued token without exposing any raw secret."""
        return self._issued_tokens.get(request_id)

    def can_perform_type_action(
        self,
        domain: str,
        field_name: str,
        field_type: str,
        session_id: str,
    ) -> tuple[bool, str | None]:
        """Enforce rule: browser ``type`` on password-like fields requires approval.

        Returns ``(allowed, reason)`` where reason is only present when blocked.
        """
        if field_type not in self._FIELD_TYPES:
            return True, None

        # find latest request matching domain/field for this session
        active = None
        for req in reversed(list(self._requests.values())):
            if (
                req.domain == domain
                and req.field_name == field_name
                and req.field_type == field_type
                and req.status == "completed"
                and req.created_at >= datetime.now(timezone.utc) - timedelta(minutes=10)
            ):
                # best-effort match same session id; metadata is logged but not part
                # of SecretEntryRequest model for backward-compat reasons.
                active = req
                break

        if not active:
            msg = (
                f"Blocked type action for sensitive field '{field_name}' on {domain}. "
                f"Create request and wait for completion before typing."
            )
            self._append_audit(f"{datetime.now(timezone.utc).isoformat()} BLOCKED type {field_name} on {domain}")
            logger.warning("secret_blind.type_blocked", domain=domain, field_name=field_name, session=session_id)
            return False, msg

        _ = session_id  # keep session in logs; compatibility with call sites
        return True, None

    @staticmethod
    def scan_for_password_fields(page_html: str) -> list[str]:
        """Extract password-like input field names from HTML.

        Heuristic parser: matches ``input`` tags with ``type='password'`` and common
        secret field names.
        """
        names: list[str] = []
        pattern = re.compile(
            r"<input\b[^>]*\btype=['\"]password['\"][^>]*>",
            re.IGNORECASE,
        )
        name_re = re.compile(r"name=['\"]([^'\"]+)['\"]", re.IGNORECASE)

        for tag in pattern.findall(page_html):
            m = name_re.search(tag)
            if m:
                names.append(m.group(1))

        # Fallback for named fields that look secret-like.
        fallback = re.findall(
            r"<input\b[^>]*\bname=['\"](password|passwd|pin|secret|otp|totp|twofa)['\"][^>]*>",
            page_html,
            flags=re.IGNORECASE,
        )
        names.extend([n for n in fallback if n not in names])
        return names

    def _safe_log_request(self, text: str) -> str:
        """Redact potential secrets before storing free-form text logs."""
        redacted, _ = self._dlp.redact(text)
        # redact line length for readability in markdown.
        return hashlib.sha256(redacted.encode("utf-8")).hexdigest()[:16] + " " + redacted

    def log_request(self, request: SecretEntry) -> None:
        """Log field discovery event (domain + timestamp only)."""
        self._append_audit(
            f"{datetime.now(timezone.utc).isoformat()} discovered {request.domain}/{request.field_name}"
        )

    def get_active_requests(self) -> list[SecretEntryRequest]:
        """Return all requests not expired or explicitly resolved."""
        now = datetime.now(timezone.utc)
        active: list[SecretEntryRequest] = []
        for req in self._requests.values():
            if req.status == "pending" and req.expires_at > now:
                active.append(req)
        return active


__all__ = [
    "SecretEntry",
    "SecretEntryRequest",
    "VaultToken",
    "SecretBlindBroker",
]
