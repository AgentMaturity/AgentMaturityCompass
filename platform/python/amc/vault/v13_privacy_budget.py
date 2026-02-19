"""
AMC Vault — V13: Privacy Budget Manager
========================================

Enforces per-session limits on sensitive data (PII) disclosure and
automatically redacts content beyond the configured policy.

Usage
-----

.. code-block:: python

    from amc.vault.v13_privacy_budget import PrivacyBudgetManager

    mgr = PrivacyBudgetManager()

    result = mgr.check_and_apply(
        "Contact john@example.com or call 555-123-4567", "session-abc"
    )
    print(result.redacted_content)
    print(result.budget_after.pii_fields_disclosed)
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# PII detection patterns
# ---------------------------------------------------------------------------

_PII_PATTERNS: dict[str, re.Pattern[str]] = {
    "email": re.compile(
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"
    ),
    "phone": re.compile(
        r"\b[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}\b"
    ),
    "card": re.compile(
        r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"
    ),
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "address": re.compile(
        r"\b\d{1,5}\s+[A-Za-z\s]{2,30}\s+"
        r"(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Blvd)\b",
        re.IGNORECASE,
    ),
}

_DEFAULT_DB = Path("/tmp/amc_v13_privacy_budget.db")

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class PrivacyBudgetConfig(BaseModel):
    """Configuration for the privacy budget manager."""

    max_pii_fields_per_request: int = 5
    max_pii_fields_per_session: int = 20
    pii_categories: list[str] = Field(
        default_factory=lambda: ["email", "phone", "address", "name", "ssn", "card"]
    )
    auto_redact_over_budget: bool = True


class PIIDetection(BaseModel):
    """A single detected PII item."""

    category: str
    value: str
    position: int  # character offset in original content
    confidence: float


class BudgetState(BaseModel):
    """Current privacy budget state for a session."""

    session_id: str
    request_count: int
    pii_fields_disclosed: int
    pii_by_category: dict[str, int]
    budget_remaining: int
    at_limit: bool


class BudgetCheckResult(BaseModel):
    """Result of a budget check-and-apply operation."""

    session_id: str
    content_hash: str
    pii_detections: list[PIIDetection]
    allowed_disclosures: list[PIIDetection]
    redacted_count: int
    redacted_content: str
    budget_after: BudgetState
    checked_at: datetime


# ---------------------------------------------------------------------------
# SQLite helpers
# ---------------------------------------------------------------------------


def _init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS budget_states (
            session_id           TEXT PRIMARY KEY,
            request_count        INTEGER NOT NULL DEFAULT 0,
            pii_fields_disclosed INTEGER NOT NULL DEFAULT 0,
            pii_by_category      TEXT    NOT NULL DEFAULT '{}',
            updated_at           TEXT    NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS budget_checks (
            check_id        TEXT PRIMARY KEY,
            session_id      TEXT NOT NULL,
            content_hash    TEXT NOT NULL,
            detections_json TEXT NOT NULL,
            allowed_json    TEXT NOT NULL,
            redacted_count  INTEGER NOT NULL,
            checked_at      TEXT NOT NULL
        )
        """
    )
    conn.commit()


def _load_state(
    conn: sqlite3.Connection, session_id: str, max_session: int
) -> BudgetState:
    row = conn.execute(
        "SELECT * FROM budget_states WHERE session_id = ?", (session_id,)
    ).fetchone()
    if row is None:
        return BudgetState(
            session_id=session_id,
            request_count=0,
            pii_fields_disclosed=0,
            pii_by_category={},
            budget_remaining=max_session,
            at_limit=False,
        )
    disclosed = row[2]
    by_cat: dict[str, int] = json.loads(row[3])
    remaining = max(0, max_session - disclosed)
    return BudgetState(
        session_id=row[0],
        request_count=row[1],
        pii_fields_disclosed=disclosed,
        pii_by_category=by_cat,
        budget_remaining=remaining,
        at_limit=remaining == 0,
    )


def _save_state(conn: sqlite3.Connection, state: BudgetState) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO budget_states
            (session_id, request_count, pii_fields_disclosed,
             pii_by_category, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            state.session_id,
            state.request_count,
            state.pii_fields_disclosed,
            json.dumps(state.pii_by_category),
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    conn.commit()


def _save_check(
    conn: sqlite3.Connection, check_id: str, result: BudgetCheckResult
) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO budget_checks
            (check_id, session_id, content_hash, detections_json,
             allowed_json, redacted_count, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            check_id,
            result.session_id,
            result.content_hash,
            json.dumps([d.model_dump() for d in result.pii_detections]),
            json.dumps([d.model_dump() for d in result.allowed_disclosures]),
            result.redacted_count,
            result.checked_at.isoformat(),
        ),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------


class PrivacyBudgetManager:
    """Enforce per-session PII disclosure limits and redact beyond the budget.

    Parameters
    ----------
    config:
        Budget configuration (limits, categories).
    db_path:
        Path to the SQLite database used for persistence.
    """

    def __init__(
        self,
        config: PrivacyBudgetConfig | None = None,
        db_path: Path = _DEFAULT_DB,
    ) -> None:
        self.config = config or PrivacyBudgetConfig()
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        _init_db(self._conn)
        log.info("PrivacyBudgetManager initialised", db_path=str(db_path))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect_pii(self, content: str) -> list[PIIDetection]:
        """Find all PII in *content* using configured regex patterns.

        Parameters
        ----------
        content:
            The text to scan.

        Returns
        -------
        list[PIIDetection]
            All detections, ordered by position.
        """
        detections: list[PIIDetection] = []
        for category, pattern in _PII_PATTERNS.items():
            if category not in self.config.pii_categories:
                continue
            for match in pattern.finditer(content):
                detections.append(
                    PIIDetection(
                        category=category,
                        value=match.group(),
                        position=match.start(),
                        confidence=0.90,
                    )
                )
        # Sort by position for deterministic ordering
        detections.sort(key=lambda d: d.position)
        return detections

    def check_and_apply(
        self, content: str, session_id: str
    ) -> BudgetCheckResult:
        """Detect PII, apply budget, and redact content exceeding the limit.

        Per-request budget is enforced first; then the session total.

        Parameters
        ----------
        content:
            Text to check and (possibly) redact.
        session_id:
            The session identifier.

        Returns
        -------
        BudgetCheckResult
        """
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        detections = self.detect_pii(content)
        state = _load_state(
            self._conn, session_id, self.config.max_pii_fields_per_session
        )

        # Determine how many new disclosures are allowed
        request_budget = self.config.max_pii_fields_per_request
        session_budget = max(
            0, self.config.max_pii_fields_per_session - state.pii_fields_disclosed
        )
        allowed_count = min(request_budget, session_budget, len(detections))

        allowed: list[PIIDetection] = detections[:allowed_count]
        to_redact: list[PIIDetection] = detections[allowed_count:]

        # Build redacted content by replacing from end → start to preserve offsets
        redacted_content = content
        if self.config.auto_redact_over_budget and to_redact:
            # Replace in reverse position order so offsets remain valid
            for det in sorted(to_redact, key=lambda d: d.position, reverse=True):
                tag = f"[REDACTED:{det.category}]"
                redacted_content = (
                    redacted_content[: det.position]
                    + tag
                    + redacted_content[det.position + len(det.value):]
                )

        # Update state
        new_disclosed = state.pii_fields_disclosed + len(allowed)
        new_by_cat: dict[str, int] = dict(state.pii_by_category)
        for det in allowed:
            new_by_cat[det.category] = new_by_cat.get(det.category, 0) + 1

        new_remaining = max(
            0, self.config.max_pii_fields_per_session - new_disclosed
        )
        new_state = BudgetState(
            session_id=session_id,
            request_count=state.request_count + 1,
            pii_fields_disclosed=new_disclosed,
            pii_by_category=new_by_cat,
            budget_remaining=new_remaining,
            at_limit=new_remaining == 0,
        )
        _save_state(self._conn, new_state)

        result = BudgetCheckResult(
            session_id=session_id,
            content_hash=content_hash,
            pii_detections=detections,
            allowed_disclosures=allowed,
            redacted_count=len(to_redact),
            redacted_content=redacted_content,
            budget_after=new_state,
            checked_at=datetime.now(timezone.utc),
        )
        check_id = str(uuid.uuid4())
        _save_check(self._conn, check_id, result)

        log.info(
            "check_and_apply",
            session_id=session_id,
            detected=len(detections),
            allowed=len(allowed),
            redacted=len(to_redact),
        )
        return result

    def get_budget_state(self, session_id: str) -> BudgetState:
        """Return the current budget state for *session_id*.

        Parameters
        ----------
        session_id:
            The session identifier.

        Returns
        -------
        BudgetState
        """
        return _load_state(
            self._conn, session_id, self.config.max_pii_fields_per_session
        )

    def reset_budget(self, session_id: str) -> BudgetState:
        """Reset per-request counters for *session_id*.

        Call this at the start of each new request to reset the
        per-request counter (session-total is preserved).

        Parameters
        ----------
        session_id:
            The session identifier.

        Returns
        -------
        BudgetState
            The state after reset.
        """
        state = _load_state(
            self._conn, session_id, self.config.max_pii_fields_per_session
        )
        # Increment request_count but leave pii_fields_disclosed unchanged.
        # In practice "resetting" the per-request window means the next call
        # to check_and_apply gets a fresh request_budget window.
        new_state = BudgetState(
            session_id=session_id,
            request_count=state.request_count + 1,
            pii_fields_disclosed=state.pii_fields_disclosed,
            pii_by_category=state.pii_by_category,
            budget_remaining=state.budget_remaining,
            at_limit=state.at_limit,
        )
        _save_state(self._conn, new_state)
        log.info("reset_budget", session_id=session_id)
        return new_state
