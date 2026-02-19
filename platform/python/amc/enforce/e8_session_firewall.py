"""
e8_session_firewall — Cross-Session Data Firewall
===================================================

Enforces data isolation between sessions of different trust levels.
Prevents unauthorized data flows, detects secrets in transit, and
supports one-way data diodes for controlled information release.

Usage::

    from amc.enforce.e8_session_firewall import SessionFirewall, SessionClassification, DataTransferRequest

    fw = SessionFirewall()
    fw.register_session("owner-1", SessionClassification.OWNER_SESSION, ["/data/owner"])
    fw.register_session("sandbox-a", SessionClassification.SANDBOX_SESSION, ["/tmp/sandbox-a"])

    req = DataTransferRequest(
        from_session="sandbox-a",
        to_session="owner-1",
        data_type="message",
        content_hash="abc123",
        size_bytes=256,
    )
    decision = fw.check_transfer(req)
    # decision.requires_sanitization == True

    access = fw.check_file_access("owner-1", "/data/owner/report.txt")
    # access.allowed == True

    diode = fw.create_data_diode("owner-1", "sandbox-a")
    assert fw.check_diode("owner-1", "sandbox-a") is True
    assert fw.check_diode("sandbox-a", "owner-1") is False
"""

from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Literal

import structlog
from pydantic import BaseModel, Field

from amc.core.models import PolicyDecision, RiskLevel, SessionTrust

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Enums / Constants
# ---------------------------------------------------------------------------


class SessionClassification(str, Enum):
    """Trust classification for a registered session."""

    OWNER_SESSION = "OWNER_SESSION"
    TRUSTED_SESSION = "TRUSTED_SESSION"
    UNTRUSTED_SESSION = "UNTRUSTED_SESSION"
    SANDBOX_SESSION = "SANDBOX_SESSION"


# Patterns that hint at secrets in metadata or content hashes
_SECRET_INDICATORS = re.compile(
    r"(api[_-]?key|secret|token|password|credential|private[_-]?key|auth)",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class DataTransferRequest(BaseModel):
    """A request to move data between two sessions."""

    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_session: str
    to_session: str
    data_type: Literal["memory", "file", "message", "tool_output"]
    content_hash: str
    size_bytes: int
    metadata: dict = Field(default_factory=dict)


class TransferDecision(BaseModel):
    """Result of evaluating a DataTransferRequest."""

    allowed: bool
    decision: PolicyDecision
    reasons: list[str]
    requires_sanitization: bool = False
    requires_approval: bool = False
    audit_logged: bool = True


class AccessDecision(BaseModel):
    """Result of evaluating a file-access request."""

    allowed: bool
    decision: PolicyDecision
    path: str
    reasons: list[str]


class DataDiode(BaseModel):
    """A one-way data channel between sessions."""

    diode_id: str
    from_session: str
    to_session: str
    created_at: datetime
    active: bool = True


# ---------------------------------------------------------------------------
# Firewall
# ---------------------------------------------------------------------------


class SessionFirewall:
    """Cross-session data firewall enforcing isolation policies."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionClassification] = {}
        self._namespace_mounts: dict[str, list[str]] = {}
        self._diodes: dict[str, DataDiode] = {}  # keyed by diode_id
        self._transfer_log: list[dict] = []

    # -- registration -------------------------------------------------------

    def register_session(
        self,
        session_id: str,
        classification: SessionClassification,
        namespace_paths: list[str] | None = None,
    ) -> None:
        """Register a session with its trust classification and allowed paths."""
        namespace_paths = namespace_paths or []
        resolved = [os.path.realpath(p) for p in namespace_paths]
        self._sessions[session_id] = classification
        self._namespace_mounts[session_id] = resolved
        logger.info(
            "session_registered",
            session_id=session_id,
            classification=classification.value,
            namespace_paths=resolved,
        )

    # -- transfer checks ----------------------------------------------------

    def check_transfer(self, request: DataTransferRequest) -> TransferDecision:
        """Evaluate whether a cross-session data transfer is permitted."""
        src = self._sessions.get(request.from_session)
        dst = self._sessions.get(request.to_session)

        # Unknown sessions → DENY
        if src is None or dst is None:
            decision = TransferDecision(
                allowed=False,
                decision=PolicyDecision.DENY,
                reasons=["One or both sessions are not registered"],
            )
            self._log_transfer(request, decision)
            return decision

        reasons: list[str] = []
        has_secrets = self._detect_secrets(request.content_hash, request.metadata)

        # Secret override — always requires human approval
        if has_secrets:
            decision = TransferDecision(
                allowed=False,
                decision=PolicyDecision.STEPUP,
                reasons=["Secrets detected in transfer payload — manual approval required"],
                requires_approval=True,
            )
            self._log_transfer(request, decision)
            return decision

        SC = SessionClassification

        # UNTRUSTED/SANDBOX → OWNER: sanitize
        if src in (SC.UNTRUSTED_SESSION, SC.SANDBOX_SESSION) and dst == SC.OWNER_SESSION:
            reasons.append(f"{src.value} → OWNER requires sanitized summary")
            decision = TransferDecision(
                allowed=True,
                decision=PolicyDecision.SANITIZE,
                reasons=reasons,
                requires_sanitization=True,
            )
            self._log_transfer(request, decision)
            return decision

        # OWNER → UNTRUSTED: allow with warning
        if src == SC.OWNER_SESSION and dst == SC.UNTRUSTED_SESSION:
            reasons.append("OWNER → UNTRUSTED allowed but logged as potential data leak")
            logger.warning(
                "data_leak_warning",
                from_session=request.from_session,
                to_session=request.to_session,
                data_type=request.data_type,
                size_bytes=request.size_bytes,
            )
            decision = TransferDecision(
                allowed=True,
                decision=PolicyDecision.ALLOW,
                reasons=reasons,
            )
            self._log_transfer(request, decision)
            return decision

        # TRUSTED → OWNER: allow with audit
        if src == SC.TRUSTED_SESSION and dst == SC.OWNER_SESSION:
            reasons.append("TRUSTED → OWNER allowed with audit trail")
            decision = TransferDecision(
                allowed=True,
                decision=PolicyDecision.ALLOW,
                reasons=reasons,
            )
            self._log_transfer(request, decision)
            return decision

        # SANDBOX → SANDBOX: allow (isolated)
        if src == SC.SANDBOX_SESSION and dst == SC.SANDBOX_SESSION:
            reasons.append("SANDBOX ↔ SANDBOX transfer allowed (isolated)")
            decision = TransferDecision(
                allowed=True,
                decision=PolicyDecision.ALLOW,
                reasons=reasons,
            )
            self._log_transfer(request, decision)
            return decision

        # Same classification (OWNER↔OWNER, TRUSTED↔TRUSTED): allow
        if src == dst:
            reasons.append(f"Same classification ({src.value}) transfer allowed")
            decision = TransferDecision(
                allowed=True,
                decision=PolicyDecision.ALLOW,
                reasons=reasons,
            )
            self._log_transfer(request, decision)
            return decision

        # Default: deny
        reasons.append(f"Transfer {src.value} → {dst.value} not in allowed policy matrix")
        decision = TransferDecision(
            allowed=False,
            decision=PolicyDecision.DENY,
            reasons=reasons,
        )
        self._log_transfer(request, decision)
        return decision

    # -- file access --------------------------------------------------------

    def check_file_access(self, session_id: str, file_path: str) -> AccessDecision:
        """Check whether *session_id* may access *file_path*."""
        if session_id not in self._sessions:
            return AccessDecision(
                allowed=False,
                decision=PolicyDecision.DENY,
                path=file_path,
                reasons=["Session not registered"],
            )

        allowed_paths = self._namespace_mounts.get(session_id, [])
        if not allowed_paths:
            return AccessDecision(
                allowed=False,
                decision=PolicyDecision.DENY,
                path=file_path,
                reasons=["Session has no namespace mounts"],
            )

        # Resolve to real path to defeat symlink / .. traversal
        resolved = os.path.realpath(file_path)

        if ".." in os.path.normpath(file_path).split(os.sep):
            logger.warning("path_traversal_attempt", session_id=session_id, path=file_path)
            return AccessDecision(
                allowed=False,
                decision=PolicyDecision.DENY,
                path=file_path,
                reasons=["Path traversal component (..) detected"],
            )

        for mount in allowed_paths:
            try:
                common = os.path.commonpath([mount, resolved])
                if common == mount:
                    logger.info("file_access_allowed", session_id=session_id, path=resolved)
                    return AccessDecision(
                        allowed=True,
                        decision=PolicyDecision.ALLOW,
                        path=resolved,
                        reasons=[f"Path within namespace mount {mount}"],
                    )
            except ValueError:
                # Different drives on Windows — not a match
                continue

        return AccessDecision(
            allowed=False,
            decision=PolicyDecision.DENY,
            path=file_path,
            reasons=["Path outside all namespace mounts for this session"],
        )

    # -- sanitisation -------------------------------------------------------

    def create_sanitized_summary(self, content: str, from_session: str) -> str:
        """Create a sanitized summary of *content* originating from *from_session*.

        Attempts to use ``s9_sanitizer.ContentSanitizer`` when available,
        otherwise falls back to basic truncation and pattern stripping.
        """
        try:
            from amc.enforce.s9_sanitizer import ContentSanitizer  # type: ignore[import-untyped]

            sanitizer = ContentSanitizer()
            result = sanitizer.sanitize(content)
            logger.info("sanitized_via_s9", session=from_session, original_len=len(content))
            return result
        except (ImportError, AttributeError):
            pass

        # Fallback: strip potential secrets and truncate
        sanitized = _SECRET_INDICATORS.sub("[REDACTED]", content)
        max_len = 2048
        if len(sanitized) > max_len:
            sanitized = sanitized[:max_len] + "… [truncated]"
        logger.info(
            "sanitized_fallback",
            session=from_session,
            original_len=len(content),
            sanitized_len=len(sanitized),
        )
        return sanitized

    # -- data diodes --------------------------------------------------------

    def create_data_diode(self, from_session: str, to_session: str) -> DataDiode:
        """Create a one-way data diode allowing flow from *from_session* → *to_session*."""
        diode = DataDiode(
            diode_id=str(uuid.uuid4()),
            from_session=from_session,
            to_session=to_session,
            created_at=datetime.now(timezone.utc),
        )
        self._diodes[diode.diode_id] = diode
        logger.info(
            "data_diode_created",
            diode_id=diode.diode_id,
            from_session=from_session,
            to_session=to_session,
        )
        return diode

    def check_diode(self, from_session: str, to_session: str) -> bool:
        """Return True if an active diode exists for the given direction."""
        return any(
            d.from_session == from_session and d.to_session == to_session and d.active
            for d in self._diodes.values()
        )

    # -- internal helpers ---------------------------------------------------

    def _detect_secrets(self, content_hash: str, metadata: dict) -> bool:
        """Heuristically detect whether the payload may contain secrets."""
        # Check content hash string itself
        if _SECRET_INDICATORS.search(content_hash):
            logger.warning("secret_indicator_in_hash", content_hash=content_hash)
            return True

        # Check metadata keys and string values
        for key, value in metadata.items():
            if _SECRET_INDICATORS.search(key):
                logger.warning("secret_indicator_in_metadata_key", key=key)
                return True
            if isinstance(value, str) and _SECRET_INDICATORS.search(value):
                logger.warning("secret_indicator_in_metadata_value", key=key)
                return True

        return False

    def _log_transfer(self, request: DataTransferRequest, decision: TransferDecision) -> None:
        """Append transfer to the audit log."""
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "request_id": request.request_id,
            "from_session": request.from_session,
            "to_session": request.to_session,
            "data_type": request.data_type,
            "size_bytes": request.size_bytes,
            "decision": decision.decision.value if hasattr(decision.decision, "value") else str(decision.decision),
            "allowed": decision.allowed,
        }
        self._transfer_log.append(entry)
        logger.info("transfer_evaluated", **entry)
