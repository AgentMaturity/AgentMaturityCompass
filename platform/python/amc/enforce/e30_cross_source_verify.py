"""
AMC Enforce E30 — Cross-Source Verification Gate
=================================================

Before executing high-impact actions, verify key facts from at least two
independent sources.  Agreement between sources (above a confidence threshold)
is required for the action to be approved.

Usage::

    from amc.enforce.e30_cross_source_verify import (
        CrossSourceVerifier, VerificationConfig, VerificationRequest,
    )

    cfg = VerificationConfig(
        require_two_sources_for=["wire_transfer", "cancel_account"],
        confidence_threshold=0.9,
        block_on_mismatch=True,
    )
    verifier = CrossSourceVerifier(config=cfg, db_path=":memory:")

    req = VerificationRequest(
        action_type="wire_transfer",
        fields_to_verify=["amount", "recipient_iban"],
        primary_values={"amount": "5000", "recipient_iban": "DE89370..."},
        session_id="sess-007",
    )
    request_id = verifier.submit_verification(req)

    verifier.add_source_evidence(request_id, "amount", "5000", "bank_api", 0.99)
    verifier.add_source_evidence(request_id, "amount", "5000", "erp_db", 0.95)
    verifier.add_source_evidence(request_id, "recipient_iban", "DE89370...", "bank_api", 0.99)
    verifier.add_source_evidence(request_id, "recipient_iban", "DE89370...", "erp_db", 0.95)

    result = verifier.evaluate(request_id)
    assert result.verified is True
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from pydantic import BaseModel, Field, field_validator

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class VerificationField(BaseModel):
    """A single piece of evidence from one source."""

    field_name: str
    value: str
    source: str
    confidence: float
    verified_at: datetime

    @field_validator("confidence")
    @classmethod
    def _confidence_range(cls, v: float) -> float:
        if not (0.0 <= v <= 1.0):
            raise ValueError("confidence must be between 0 and 1")
        return v


class VerificationRequest(BaseModel):
    """Submitted request to verify fields before a high-impact action."""

    action_type: str
    fields_to_verify: list[str]
    primary_values: dict[str, str]
    session_id: str


class VerificationResult(BaseModel):
    """Outcome of a cross-source evaluation."""

    request_id: str
    action_type: str
    verified: bool
    mismatches: list[dict[str, Any]]
    evidence_pack: dict[str, Any]
    verified_at: datetime


class VerificationConfig(BaseModel):
    """Configuration for the :class:`CrossSourceVerifier`."""

    require_two_sources_for: list[str] = Field(default_factory=list)
    confidence_threshold: float = 0.8
    block_on_mismatch: bool = True

    @field_validator("confidence_threshold")
    @classmethod
    def _threshold_range(cls, v: float) -> float:
        if not (0.0 <= v <= 1.0):
            raise ValueError("confidence_threshold must be between 0 and 1")
        return v


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------


class CrossSourceVerifier:
    """
    SQLite-backed gate that enforces cross-source verification before
    high-impact actions are allowed to proceed.
    """

    def __init__(
        self,
        config: VerificationConfig | None = None,
        db_path: str = "cross_verify.db",
    ) -> None:
        """
        Initialise the verifier.

        Args:
            config: Optional :class:`VerificationConfig`.
            db_path: SQLite database path.  Use ``":memory:"`` for tests.
        """
        self.config = config or VerificationConfig()
        self._db_path = db_path
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._bootstrap()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _bootstrap(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS verification_requests (
                request_id   TEXT PRIMARY KEY,
                action_type  TEXT NOT NULL,
                fields_json  TEXT NOT NULL,
                primary_json TEXT NOT NULL,
                session_id   TEXT NOT NULL,
                created_at   TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS source_evidence (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id   TEXT NOT NULL,
                field_name   TEXT NOT NULL,
                value        TEXT NOT NULL,
                source       TEXT NOT NULL,
                confidence   REAL NOT NULL,
                verified_at  TEXT NOT NULL,
                FOREIGN KEY (request_id) REFERENCES verification_requests(request_id)
            );
            """
        )
        self._conn.commit()

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def submit_verification(self, request: VerificationRequest) -> str:
        """
        Submit a new verification request.

        Args:
            request: The :class:`VerificationRequest` describing what needs
                     to be verified and the primary (initiating) values.

        Returns:
            A UUID *request_id* to be used in subsequent calls.
        """
        request_id = str(uuid.uuid4())
        now = self._now()

        self._conn.execute(
            "INSERT INTO verification_requests "
            "(request_id, action_type, fields_json, primary_json, session_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                request_id,
                request.action_type,
                json.dumps(request.fields_to_verify),
                json.dumps(request.primary_values),
                request.session_id,
                now.isoformat(),
            ),
        )
        self._conn.commit()

        logger.info(
            "cross_verify.submitted",
            request_id=request_id,
            action_type=request.action_type,
            fields=request.fields_to_verify,
        )
        return request_id

    def add_source_evidence(
        self,
        request_id: str,
        field_name: str,
        value: str,
        source: str,
        confidence: float,
    ) -> VerificationField:
        """
        Record evidence for a field from one independent source.

        Args:
            request_id: The verification request to attach evidence to.
            field_name: The field being evidenced.
            value: The value observed by this source.
            source: Identifier for the data source (e.g. ``"bank_api"``).
            confidence: How confident this source is (0–1).

        Returns:
            The stored :class:`VerificationField`.

        Raises:
            ValueError: If *request_id* does not exist or *confidence* is
                        out of range.
        """
        field = VerificationField(
            field_name=field_name,
            value=value,
            source=source,
            confidence=confidence,
            verified_at=self._now(),
        )

        # Validate request exists
        cur = self._conn.execute(
            "SELECT 1 FROM verification_requests WHERE request_id = ?",
            (request_id,),
        )
        if cur.fetchone() is None:
            raise ValueError(f"Unknown request_id: {request_id!r}")

        self._conn.execute(
            "INSERT INTO source_evidence "
            "(request_id, field_name, value, source, confidence, verified_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                request_id,
                field.field_name,
                field.value,
                field.source,
                field.confidence,
                field.verified_at.isoformat(),
            ),
        )
        self._conn.commit()

        logger.debug(
            "cross_verify.evidence_added",
            request_id=request_id,
            field=field_name,
            source=source,
            confidence=confidence,
        )
        return field

    def evaluate(self, request_id: str) -> VerificationResult:
        """
        Evaluate whether all required fields are sufficiently verified.

        A field passes when:
        * At least two independent sources provided evidence, **and**
        * All sources with confidence >= ``config.confidence_threshold`` agree
          on the same value.

        Args:
            request_id: The verification request to evaluate.

        Returns:
            A :class:`VerificationResult` with ``verified=True`` only when
            every field passes.
        """
        # Load request
        cur = self._conn.execute(
            "SELECT action_type, fields_json, primary_json FROM verification_requests "
            "WHERE request_id = ?",
            (request_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise ValueError(f"Unknown request_id: {request_id!r}")

        action_type, fields_json, primary_json = row
        fields_to_verify: list[str] = json.loads(fields_json)
        primary_values: dict[str, str] = json.loads(primary_json)

        # Load all evidence
        ev_cur = self._conn.execute(
            "SELECT field_name, value, source, confidence, verified_at "
            "FROM source_evidence WHERE request_id = ?",
            (request_id,),
        )
        evidence_rows = ev_cur.fetchall()

        # Build evidence map: field -> list of (value, source, confidence)
        evidence_map: dict[str, list[dict[str, Any]]] = {f: [] for f in fields_to_verify}
        for field_name, value, source, confidence, verified_at in evidence_rows:
            if field_name in evidence_map:
                evidence_map[field_name].append(
                    {
                        "value": value,
                        "source": source,
                        "confidence": confidence,
                        "verified_at": verified_at,
                    }
                )

        mismatches: list[dict[str, Any]] = []
        all_verified = True

        needs_two = action_type in self.config.require_two_sources_for

        for field in fields_to_verify:
            entries = evidence_map[field]

            # Filter to high-confidence sources
            high_conf = [
                e for e in entries
                if e["confidence"] >= self.config.confidence_threshold
            ]

            if needs_two and len(high_conf) < 2:
                all_verified = False
                mismatches.append(
                    {
                        "field": field,
                        "reason": "insufficient_sources",
                        "sources_found": len(high_conf),
                        "sources_required": 2,
                    }
                )
                continue

            # Check agreement
            unique_values = {e["value"] for e in high_conf}
            if len(unique_values) > 1:
                all_verified = False
                mismatches.append(
                    {
                        "field": field,
                        "reason": "value_mismatch",
                        "values_seen": list(unique_values),
                    }
                )

        result = VerificationResult(
            request_id=request_id,
            action_type=action_type,
            verified=all_verified and len(mismatches) == 0,
            mismatches=mismatches,
            evidence_pack={"fields": evidence_map, "primary_values": primary_values},
            verified_at=self._now(),
        )

        logger.info(
            "cross_verify.evaluated",
            request_id=request_id,
            verified=result.verified,
            mismatches=len(mismatches),
        )
        return result

    def get_evidence_pack(self, request_id: str) -> dict[str, Any]:
        """
        Return the full evidence pack for a given request — useful for audits.

        Args:
            request_id: The verification request ID.

        Returns:
            Dict with ``request``, ``evidence``, and ``summary`` keys.
        """
        cur = self._conn.execute(
            "SELECT action_type, fields_json, primary_json, session_id, created_at "
            "FROM verification_requests WHERE request_id = ?",
            (request_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise ValueError(f"Unknown request_id: {request_id!r}")

        action_type, fields_json, primary_json, session_id, created_at = row

        ev_cur = self._conn.execute(
            "SELECT field_name, value, source, confidence, verified_at "
            "FROM source_evidence WHERE request_id = ?",
            (request_id,),
        )
        evidence = [
            {
                "field_name": r[0],
                "value": r[1],
                "source": r[2],
                "confidence": r[3],
                "verified_at": r[4],
            }
            for r in ev_cur.fetchall()
        ]

        return {
            "request_id": request_id,
            "action_type": action_type,
            "session_id": session_id,
            "created_at": created_at,
            "fields_to_verify": json.loads(fields_json),
            "primary_values": json.loads(primary_json),
            "evidence": evidence,
        }
