"""
AMC Enforce — E9: Outbound Communication Safety Layer

Provides allow/deny/quarantine decisions for outgoing messages and notifications.
Controls include:
- recipient allow-list
- per-recipient and rolling rate limits
- DLP pre-send checks
- template-variable validation (no free-form when enforced)
- quarantine queue persisted to LOGS/OUTBOUND_QUARANTINE.md

Usage:
    dlp = OutboundSafety(
        recipient_allowlist={"+1234567890": "client"},
        template_registry={"WELCOME": ["name", "plan"]},
        no_cold_outreach=True,
    )

    decision = dlp.decide(
        sender="agent",
        recipient="+1234567890",
        template_id="WELCOME",
        message="Hi {name}, your plan {plan} is ready.",
    )
"""

from __future__ import annotations

import json
import sqlite3
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import structlog
from pydantic import BaseModel, Field

from amc.vault.v2_dlp import DLPRedactor

log = structlog.get_logger(__name__)


class OutboundDecision(BaseModel):
    """Outbound decision result."""

    allowed: bool
    reason: str
    quarantined: bool = False
    sanitized_message: str | None = None
    reason_code: str | None = None


class OutboundConfig(BaseModel):
    recipient_allowlist: set[str] = Field(default_factory=set)
    recipient_aliases: dict[str, str] = Field(default_factory=dict)
    no_cold_outreach: bool = True
    per_recipient_per_hour: int = 20
    per_recipient_per_day: int = 100
    per_hour: int = 200
    per_day: int = 1000
    enforce_templates_only: bool = True
    template_registry: dict[str, list[str]] = Field(default_factory=dict)
    template_pattern: str = r"\{([A-Za-z0-9_]+)\}"
    db_path: str = "amc_outbound_safety.db"
    logs_dir: str = "AMC_OS/LOGS"


SCHEMA = """
CREATE TABLE IF NOT EXISTS outbound_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    sender TEXT,
    recipient TEXT,
    template_id TEXT,
    timestamp TEXT NOT NULL,
    direction TEXT NOT NULL,
    message_hash TEXT,
    allowed INTEGER NOT NULL,
    reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_by_recipient_time
    ON outbound_events(recipient, timestamp);
CREATE INDEX IF NOT EXISTS idx_by_time ON outbound_events(timestamp);
"""


autologger = structlog.get_logger(__name__)


class OutboundSafety:
    """Decision engine for outbound messaging."""

    def __init__(self, config: OutboundConfig | None = None, dlp: DLPRedactor | None = None) -> None:
        self.config = config or OutboundConfig()
        self.dlp = dlp or DLPRedactor()
        self.db_path = Path(self.config.db_path)
        self.logs_dir = Path(self.config.logs_dir)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(self.db_path)
        self._db.row_factory = sqlite3.Row
        self._db.executescript(SCHEMA)

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _extract_template_vars(template_text: str) -> set[str]:
        import re

        return set(re.findall(r"\{([A-Za-z0-9_]+)\}", template_text))

    def _count_window(self, recipient: str | None, window_seconds: int) -> int:
        since = (self._now().timestamp() - window_seconds)
        where = "1=1"
        params: list[Any] = [since]
        if recipient:
            where = "recipient = ? AND strftime('%s', timestamp) >= ?"
            params = [recipient, since]
        else:
            where = "strftime('%s', timestamp) >= ?"
        row = self._db.execute(
            f"SELECT COUNT(*) FROM outbound_events WHERE {where}",
            params,
        ).fetchone()
        return int(row[0]) if row else 0

    def _count_recipient(self, recipient: str, window_seconds: int) -> int:
        return self._count_window(recipient=recipient, window_seconds=window_seconds)

    def _is_rate_limited(
        self,
        recipient: str,
        per_hour_limit: int,
        per_day_limit: int,
        global_hour_limit: int,
        global_day_limit: int,
    ) -> tuple[bool, str]:
        if self._count_recipient(recipient, 3600) >= per_hour_limit:
            return True, "recipient hourly limit exceeded"
        if self._count_recipient(recipient, 3600 * 24) >= per_day_limit:
            return True, "recipient daily limit exceeded"
        if self._count_window(None, 3600) >= global_hour_limit:
            return True, "global hourly limit exceeded"
        if self._count_window(None, 3600 * 24) >= global_day_limit:
            return True, "global daily limit exceeded"
        return False, ""

    def _is_approved_recipient(self, recipient: str) -> bool:
        if recipient in self.config.recipient_allowlist:
            return True
        # alias support
        return recipient in self.config.recipient_aliases

    def _template_vars_ok(
        self,
        template_id: str | None,
        message: str,
        declared: list[str] | None,
    ) -> tuple[bool, str]:
        if not self.config.enforce_templates_only:
            return True, "template enforcement disabled"

        if not template_id:
            return False, "template_id required when enforcement enabled"

        if not declared:
            return False, f"template {template_id!r} not declared"

        used = self._extract_template_vars(message)
        missing = set(declared) - used
        extra = used - set(declared)
        if missing:
            return False, f"missing template vars: {sorted(missing)}"
        if extra:
            return False, f"undeclared template vars: {sorted(extra)}"
        return True, "template vars validated"

    def _log_event(
        self,
        *,
        sender: str,
        recipient: str,
        template_id: str | None,
        allowed: bool,
        reason: str,
        session_id: str | None,
        message: str,
    ) -> None:
        message_hash = hashlib_sha256_short(message)
        self._db.execute(
            """INSERT INTO outbound_events
             (session_id, sender, recipient, template_id, timestamp, direction, message_hash, allowed, reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                session_id,
                sender,
                recipient,
                template_id,
                self._now().isoformat(),
                "outbound",
                message_hash,
                int(allowed),
                reason,
            ),
        )
        self._db.commit()

    def _quarantine(self, recipient: str, sender: str, message: str, reason: str, template_id: str | None = None) -> None:
        path = self.logs_dir / "OUTBOUND_QUARANTINE.md"
        entry = (
            f"- ts={self._now().isoformat()} sender={sender} recipient={recipient} "
            f"template={template_id} reason={reason!r}\n"
            f"  message={message!r}\n"
        )
        path.write_text(path.read_text() + entry if path.exists() else entry)

    def decide(
        self,
        *,
        sender: str,
        recipient: str,
        message: str,
        template_id: str | None = None,
        session_id: str | None = None,
        allow_cold_outreach: bool = False,
        message_context: dict[str, Any] | None = None,
    ) -> OutboundDecision:
        """Return outbound decision and optional sanitized message."""
        message_context = message_context or {}

        # No cold outreach -> deny unknown recipients
        if self.config.no_cold_outreach and not allow_cold_outreach:
            if not self._is_approved_recipient(recipient):
                decision = OutboundDecision(
                    allowed=False,
                    reason="recipient not in allowlist (cold outreach disabled)",
                    reason_code="recipient_not_allowed",
                )
                self._log_event(sender=sender, recipient=recipient, template_id=template_id,
                               allowed=False, reason=decision.reason, session_id=session_id, message=message)
                self._quarantine(recipient, sender, message, decision.reason, template_id)
                return decision

        # DLP check before rate limiting (pre-send)
        redacted, receipts = self.dlp.redact(message)
        if receipts:
            decision = OutboundDecision(
                allowed=False,
                reason="DLP redaction needed before outbound",
                quarantined=True,
                reason_code="dlp_detected",
                sanitized_message=redacted,
            )
            self._log_event(sender=sender, recipient=recipient, template_id=template_id,
                           allowed=False, reason=decision.reason, session_id=session_id, message=redacted)
            self._quarantine(recipient, sender, message, decision.reason, template_id)
            return decision

        # Template safety
        declared = self.config.template_registry.get(template_id) if template_id else None
        ok, why = self._template_vars_ok(template_id, message, declared)
        if not ok:
            decision = OutboundDecision(
                allowed=False,
                reason=why,
                reason_code="template_validation_failed",
            )
            self._log_event(sender=sender, recipient=recipient, template_id=template_id,
                           allowed=False, reason=decision.reason, session_id=session_id, message=message)
            self._quarantine(recipient, sender, message, decision.reason, template_id)
            return decision

        rate_limited, reason = self._is_rate_limited(
            recipient=recipient,
            per_hour_limit=self.config.per_recipient_per_hour,
            per_day_limit=self.config.per_recipient_per_day,
            global_hour_limit=self.config.per_hour,
            global_day_limit=self.config.per_day,
        )
        if rate_limited:
            decision = OutboundDecision(
                allowed=False,
                reason=reason,
                reason_code="rate_limit",
                quarantined=True,
            )
            self._log_event(sender=sender, recipient=recipient, template_id=template_id,
                           allowed=False, reason=decision.reason, session_id=session_id, message=message)
            self._quarantine(recipient, sender, message, reason, template_id)
            return decision

        self._log_event(sender=sender, recipient=recipient, template_id=template_id,
                        allowed=True, reason="ok", session_id=session_id, message=message)
        return OutboundDecision(
            allowed=True,
            reason="outbound approved",
            reason_code="approved",
        )


def hashlib_sha256_short(text: str) -> str:
    import hashlib

    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


# convenience preset

def default_outbound_safety() -> OutboundSafety:
    """Return a strict default policy instance."""
    cfg = OutboundConfig(
        no_cold_outreach=True,
        per_recipient_per_hour=10,
        per_recipient_per_day=40,
        per_hour=120,
        per_day=800,
    )
    return OutboundSafety(config=cfg)

