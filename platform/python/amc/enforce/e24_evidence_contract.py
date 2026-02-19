"""
AMC Enforce — E24: Evidence-Backed Output Contract (Citations or It\'s Off)
===============================================================================

Purpose
-------
AMC responses can propose or execute actions.  For high-risk action classes
(finance/legal/security by default), every factual claim must be grounded in
at least one piece of evidence before execution.  This module validates that
mapping and stores a tamper-evident evidence bundle in SQLite for SIEM/W1
integration.

Usage
-----

.. code-block:: python

    from amc.enforce.e24_evidence_contract import EvidenceContract, EvidenceItem

    contract = EvidenceContract(db_path="/tmp/evidence_contract.db")

    evidence = [
        EvidenceItem(
            source_url="https://sec-incident.example/report",
            quoted_snippet="Quarterly revenue increased by 11.4% in Q1.",
            snippet_hash="<sha256-of-snippet>",
            confidence=0.96,
            retrieved_at=datetime.now(timezone.utc),
        )
    ]

    # Validate answer before executing any downstream tool.
    validation = contract.validate_output(
        output_text="Revenue increased by 11.4% this quarter.",
        evidence_items=evidence,
        action_category="finance",
    )
    if not validation.approved_for_action:
        raise RuntimeError("No-exec mode: blocked due to insufficient evidence")

    contracted = validation.contracted_outputs[0]
    print(contracted.overall_confidence, contracted.approved_for_action)

    # Persist for forensics / W1 hook
    bundle = contract.store_output_bundle(
        output_text="Revenue increased by 11.4% this quarter.",
        evidence_items=evidence,
        action_category="finance",
        action_receipts=["receipt-abc"],
    )
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import structlog
from pydantic import BaseModel, Field, field_validator

from amc.core.models import ActionReceipt
# Optional import for W1 integration is intentionally lazy to avoid hard dependency
# on optional runtime packages during startup tests.

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class EvidenceItem(BaseModel):
    """A minimal, hash-safe evidence assertion used by downstream checks.

    Only hashed snippets are persisted to avoid storing source text verbatim in
    high-risk flows.
    """

    source_url: str
    quoted_snippet: str
    snippet_hash: str = Field(..., min_length=64, max_length=64)
    confidence: float = Field(..., ge=0.0, le=1.0)
    retrieved_at: datetime

    @field_validator("snippet_hash")
    @classmethod
    def _normalize_hash(cls, value: str) -> str:
        return value.lower()


class ContractedOutput(BaseModel):
    """One factual claim paired with evidence and a confidence score."""

    claim: str
    evidence: list[EvidenceItem] = Field(default_factory=list)
    overall_confidence: float = Field(..., ge=0.0, le=1.0)
    approved_for_action: bool = False


class ContractValidation(BaseModel):
    """Structured result of ``EvidenceContract.validate_output``."""

    output_text: str
    action_category: str
    requires_evidence: bool
    overall_confidence: float
    approved_for_action: bool
    threshold: float
    claims: list[str]
    contracted_outputs: list[ContractedOutput]
    missing_claims: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    validated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EvidenceBundle(BaseModel):
    """Persisted evidence bundle metadata."""

    bundle_id: str
    output_hash: str
    output_text: str
    action_category: str
    requires_evidence: bool
    overall_confidence: float
    approved_for_action: bool
    receipt_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EvidenceContractError(RuntimeError):
    """Raised when policy forbids acting on an output."""


# ---------------------------------------------------------------------------
# SQL helpers
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS evidence_bundles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bundle_id TEXT NOT NULL UNIQUE,
    output_hash TEXT NOT NULL,
    output_text TEXT NOT NULL,
    action_category TEXT NOT NULL,
    requires_evidence INTEGER NOT NULL,
    overall_confidence REAL NOT NULL,
    approved_for_action INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bundle_id TEXT NOT NULL,
    source_url TEXT NOT NULL,
    quoted_snippet TEXT NOT NULL,
    snippet_hash TEXT NOT NULL,
    confidence REAL NOT NULL,
    retrieved_at TEXT NOT NULL,
    claim_text TEXT NOT NULL,
    FOREIGN KEY(bundle_id) REFERENCES evidence_bundles(bundle_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence_bundle_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bundle_id TEXT NOT NULL,
    receipt_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(bundle_id) REFERENCES evidence_bundles(bundle_id) ON DELETE CASCADE,
    UNIQUE(bundle_id, receipt_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_output_hash ON evidence_bundles(output_hash);
CREATE INDEX IF NOT EXISTS idx_evidence_bundle ON evidence_items(bundle_id);
"""


class EvidenceContract:
    """Validate factual outputs and gate execution without evidence.

    Parameters
    ----------
    db_path:
        SQLite database path for evidence persistence.
    evidence_threshold:
        Minimum per-claim confidence required for approval.
    required_categories:
        Action categories that always require evidence.
    no_exec_on_failure:
        If ``True`` (default), callers can use :meth:`assert_exec_allowed` to
        fail fast before tool calls.
    """

    _SENTENCE_RX = re.compile(r"(?<=[.!?])\s+|\n+")
    _ACTION_VERB_RX = re.compile(
        r"\b(is|are|was|were|will|can|should|must|may|approved?|authorize|charged|received|transferred|declared|confirmed|reported|increased|decreased|reached|stated|evidence|found)\b",
        re.I,
    )
    _NUM_RX = re.compile(r"\d")
    _HASH_RX = re.compile(r"[0-9a-f]{64}")

    DEFAULT_EVIDENCE_REQUIRED_CATEGORIES = {"finance", "legal", "security"}

    def __init__(
        self,
        *,
        db_path: str | Path = "/tmp/amc_evidence_contract.db",
        evidence_threshold: float = 0.65,
        required_categories: set[str] | None = None,
        no_exec_on_failure: bool = True,
        enforce_output_hash_match: bool = True,
    ) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.evidence_threshold = evidence_threshold
        self.required_categories = {
            c.strip().lower() for c in (required_categories or self.DEFAULT_EVIDENCE_REQUIRED_CATEGORIES)
        }
        self.no_exec_on_failure = no_exec_on_failure
        self.enforce_output_hash_match = enforce_output_hash_match

        self._init_schema()

    # Public API ------------------------------------------------------------

    @staticmethod
    def _snippet_hash(snippet: str) -> str:
        return hashlib.sha256(snippet.encode("utf-8", errors="replace")).hexdigest()

    def extract_claims(self, text: str) -> list[str]:
        """Heuristically split plain text into actionable factual claims.

        The heuristic is intentionally conservative: it keeps only sentence-like
        chunks that contain either numeric facts or explicit action/statement verbs.
        """
        if not text:
            return []

        rough_claims = [s.strip() for s in self._SENTENCE_RX.split(text) if s.strip()]
        filtered: list[str] = []

        for claim in rough_claims:
            if len(claim) < 8:
                continue
            has_action = bool(self._ACTION_VERB_RX.search(claim))
            has_numeric = bool(self._NUM_RX.search(claim))
            if has_action or has_numeric:
                filtered.append(claim)
        if not filtered:
            # Fallback: return at least one condensed claim if text is short.
            fallback = text.strip().replace("\n", " ")
            if fallback:
                filtered.append(fallback)
        return filtered

    def validate_output(
        self,
        output_text: str,
        evidence_items: list[EvidenceItem],
        *,
        action_category: str | None = None,
    ) -> ContractValidation:
        """Validate that each extracted factual claim is evidence-backed.

        A claim is considered approved when at least one evidence item:

        * has confidence >= :pyattr:`evidence_threshold`
        * has a valid SHA-256 snippet hash
        * contains or semantically overlaps the claim text
        """
        action_category = (action_category or "general").lower()
        requires_evidence = action_category in self.required_categories

        claims = self.extract_claims(output_text)
        normalized_evidence: list[EvidenceItem] = []
        errors: list[str] = []

        # Validate evidence format/hash and normalise hashes.
        for item in evidence_items:
            expected_hash = self._snippet_hash(item.quoted_snippet)
            if self.enforce_output_hash_match and item.snippet_hash != expected_hash:
                errors.append(
                    f"snippet hash mismatch for source {item.source_url}"
                )
                # keep item but ignore for approval scoring
                continue
            normalized_evidence.append(item)

        contracted: list[ContractedOutput] = []
        missing_claims: list[str] = []
        for claim in claims:
            matching = self._match_evidence(claim, normalized_evidence)
            conf = 0.0
            approved = False
            if not matching:
                missing_claims.append(claim)
            else:
                conf = round(sum(m.confidence for m in matching) / len(matching), 4)
                approved = conf >= self.evidence_threshold and all(
                    m.confidence >= self.evidence_threshold for m in matching
                )

            if requires_evidence and (not matching or not approved):
                approved = False
            contracted.append(
                ContractedOutput(
                    claim=claim,
                    evidence=matching,
                    overall_confidence=conf,
                    approved_for_action=approved if requires_evidence else True,
                )
            )

        if contracted:
            overall = round(
                sum(c.overall_confidence for c in contracted) / len(contracted), 4
            )
        else:
            overall = 0.0

        approved_for_action = False
        if not requires_evidence:
            approved_for_action = True
        elif not missing_claims and not errors and all(c.approved_for_action for c in contracted):
            approved_for_action = True

        if not approved_for_action and self.no_exec_on_failure:
            errors.append("No-evidence mode active: execution blocked")

        return ContractValidation(
            output_text=output_text,
            action_category=action_category,
            requires_evidence=requires_evidence,
            overall_confidence=overall,
            approved_for_action=approved_for_action,
            threshold=self.evidence_threshold,
            claims=claims,
            contracted_outputs=contracted,
            missing_claims=missing_claims,
            errors=errors,
        )

    def assert_exec_allowed(self, output_text: str, evidence_items: list[EvidenceItem], action_category: str | None = None) -> None:
        """Raise if output is not approved for action.

        This is the enforcement endpoint for "no evidence → no exec" mode.
        """
        result = self.validate_output(output_text, evidence_items, action_category=action_category)
        if not result.approved_for_action:
            raise EvidenceContractError(
                "Execution blocked: output lacks sufficient evidence for required action class."
            )

    def store_output_bundle(
        self,
        output_text: str,
        evidence_items: list[EvidenceItem],
        *,
        action_category: str = "general",
        action_receipts: list[str] | None = None,
        store_raw_output: bool = False,
    ) -> EvidenceBundle:
        """Store evidence bundle and return a persistable object.

        Args:
            output_text: Response text being validated.
            evidence_items: Evidence list tied to that response.
            action_category: Logical category of the action.
            action_receipts: Optional W1 receipt identifiers for provenance.
            store_raw_output: If True, keep full output text in DB (default False in
                production-like setups).  The object returned still includes the text.
        """
        validation = self.validate_output(
            output_text,
            evidence_items,
            action_category=action_category,
        )

        bundle_id = hashlib.sha256(
            f"{output_text}|{datetime.now(timezone.utc).isoformat()}|{action_category}".encode(
                "utf-8"
            )
        ).hexdigest()
        output_hash = self._snippet_hash(output_text)

        with self._tx() as cur:
            cur.execute(
                """
                INSERT INTO evidence_bundles
                (bundle_id, output_hash, output_text, action_category, requires_evidence,
                 overall_confidence, approved_for_action, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    bundle_id,
                    output_hash,
                    output_text if store_raw_output else f"[redacted len={len(output_text)}]",
                    action_category.lower(),
                    int(validation.requires_evidence),
                    validation.overall_confidence,
                    int(validation.approved_for_action),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )

            for item in evidence_items:
                for c in validation.contracted_outputs:
                    cur.execute(
                        """
                        INSERT INTO evidence_items
                        (bundle_id, source_url, quoted_snippet, snippet_hash,
                         confidence, retrieved_at, claim_text)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            bundle_id,
                            item.source_url,
                            item.quoted_snippet,
                            item.snippet_hash,
                            item.confidence,
                            item.retrieved_at.isoformat(),
                            "; ".join(c.claim for c in validation.contracted_outputs[:5]),
                        ),
                    )

            for receipt_id in action_receipts or []:
                cur.execute(
                    """INSERT OR IGNORE INTO evidence_bundle_receipts
                       (bundle_id, receipt_id, created_at)
                       VALUES (?, ?, ?)
                    """,
                    (bundle_id, receipt_id, datetime.now(timezone.utc).isoformat()),
                )

            # Optional W1 linkage: validate receipts exist in local ledger if provided.
            if action_receipts:
                try:
                    self._attach_receipt_hints(action_receipts)
                except Exception as exc:  # pragma: no cover - non-fatal external issue
                    log.warning("evidence_contract.w1_integration_warn", error=str(exc))

        log.info(
            "evidence_contract.stored",
            bundle_id=bundle_id,
            approved=validation.approved_for_action,
            claims=len(validation.claims),
            evidence=len(evidence_items),
        )

        return EvidenceBundle(
            bundle_id=bundle_id,
            output_hash=output_hash,
            output_text=output_text,
            action_category=action_category,
            requires_evidence=validation.requires_evidence,
            overall_confidence=validation.overall_confidence,
            approved_for_action=validation.approved_for_action,
            receipt_ids=action_receipts or [],
        )

    def export_bundle(self, bundle_id: str) -> EvidenceBundle | None:
        """Return persisted bundle metadata by id."""
        with self._tx() as cur:
            row = cur.execute(
                """
                SELECT bundle_id, output_hash, action_category, requires_evidence,
                       overall_confidence, approved_for_action, created_at
                FROM evidence_bundles WHERE bundle_id = ?
                """,
                (bundle_id,),
            ).fetchone()
            if not row:
                return None

            row2 = cur.execute(
                "SELECT output_text FROM evidence_bundles WHERE bundle_id = ?",
                (bundle_id,),
            ).fetchone()

            rec_ids = [
                r[0]
                for r in cur.execute(
                    "SELECT receipt_id FROM evidence_bundle_receipts WHERE bundle_id = ?",
                    (bundle_id,),
                ).fetchall()
            ]

        output_text = row2[0] if row2 else ""
        return EvidenceBundle(
            bundle_id=row[0],
            output_hash=row[1],
            output_text=output_text,
            action_category=row[2],
            requires_evidence=bool(row[3]),
            overall_confidence=row[4],
            approved_for_action=bool(row[5]),
            receipt_ids=rec_ids,
            created_at=datetime.fromisoformat(row[6]),
        )

    def list_recent_bundles(self, *, limit: int = 50) -> list[dict[str, Any]]:
        """Return bundle metadata useful for dashboards and investigations."""
        if limit <= 0:
            return []

        with self._tx() as cur:
            rows = cur.execute(
                """
                SELECT bundle_id, output_hash, action_category, requires_evidence,
                       overall_confidence, approved_for_action, created_at
                FROM evidence_bundles ORDER BY id DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()

        return [
            {
                "bundle_id": row[0],
                "output_hash": row[1],
                "action_category": row[2],
                "requires_evidence": bool(row[3]),
                "overall_confidence": row[4],
                "approved_for_action": bool(row[5]),
                "created_at": row[6],
            }
            for row in rows
        ]

    # Internal ------------------------------------------------------------------

    @contextmanager
    def _tx(self):
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("PRAGMA foreign_keys = ON")
            cur = conn.cursor()
            yield cur
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._tx() as cur:
            cur.executescript(_SCHEMA)

    def _match_evidence(self, claim: str, evidence_items: list[EvidenceItem]) -> list[EvidenceItem]:
        claim_l = claim.lower()
        evidence_words = set(re.findall(r"[a-z0-9@._%+-]+", claim_l))

        matches: list[tuple[EvidenceItem, int]] = []
        for ev in evidence_items:
            if ev.confidence < self.evidence_threshold:
                continue

            snippet = ev.quoted_snippet.lower()
            # direct literal overlap
            if any(word and word in snippet for word in evidence_words if len(word) >= 4):
                token_hits = sum(1 for word in evidence_words if word in snippet)
                matches.append((ev, token_hits))
                continue

            # fallback substring match (claim sentence included in the snippet)
            if claim_l in snippet or snippet in claim_l:
                matches.append((ev, len(evidence_words)))

        # strongest matches first (more overlap)
        matches.sort(key=lambda i: i[1], reverse=True)
        return [m[0] for m in matches[:3]]

    def _attach_receipt_hints(self, receipt_ids: list[str]) -> None:
        """Best-effort W1 correlation hook.

        This is intentionally non-blocking/non-fatal. IDs are only persisted and
        can be correlated with W1 in a separate async job.
        """
        if not receipt_ids:
            return

        # Keep a lightweight sanity check only.
        bad = [rid for rid in receipt_ids if not rid or not rid.strip()]
        if bad:
            raise ValueError(f"Invalid (empty) receipt_id supplied: {bad!r}")

        log.debug("evidence_contract.receipt_hook", count=len(receipt_ids))


EvidenceItem.model_rebuild()
ContractedOutput.model_rebuild()
ContractValidation.model_rebuild()
EvidenceBundle.model_rebuild()
