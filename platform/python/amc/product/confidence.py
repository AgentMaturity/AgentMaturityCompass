"""AMC Uncertainty / Confidence Estimator — Wave 2 Feature #6.

Scores the confidence of agent decision points based on:
  - Number of supporting evidence items
  - Source diversity and credibility
  - Ambiguity signals in the input (hedging words, missing fields, low overlap)
  - Historical accuracy for similar decisions (if recorded)

All estimates and feedback are stored in SQLite so the model can be improved
over time by recording outcomes.

API mount point: /api/v1/product/confidence
"""
from __future__ import annotations

import json
import math
import re
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

# ── Schema ───────────────────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS confidence_estimates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    estimate_id     TEXT NOT NULL UNIQUE,
    session_id      TEXT NOT NULL DEFAULT '',
    tenant_id       TEXT NOT NULL DEFAULT '',
    decision_type   TEXT NOT NULL DEFAULT 'generic',
    raw_score       REAL NOT NULL DEFAULT 0.5,
    adjusted_score  REAL NOT NULL DEFAULT 0.5,
    band            TEXT NOT NULL DEFAULT 'medium',
    evidence_count  INTEGER NOT NULL DEFAULT 0,
    ambiguity_flags TEXT NOT NULL DEFAULT '[]',
    reasoning       TEXT NOT NULL DEFAULT '',
    inputs_json     TEXT NOT NULL DEFAULT '{}',
    outcome         TEXT,
    outcome_correct INTEGER,
    feedback_at     TEXT,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ce_session ON confidence_estimates(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ce_tenant ON confidence_estimates(tenant_id, decision_type);
"""

# ── Hedging words that lower confidence ─────────────────────────────────────

_HEDGING_PATTERNS = re.compile(
    r"\b(maybe|perhaps|possibly|might|could be|unclear|unsure|uncertain|"
    r"approximately|roughly|around|about|estimate|guess|assume|unclear|"
    r"not sure|hard to say|difficult to determine|seems like|appears to)\b",
    re.IGNORECASE,
)

_AMBIGUITY_SIGNALS = re.compile(
    r"\b(multiple options|conflicting|contradicts|disagrees|inconsistent|"
    r"no data|missing|unknown|n/a|null|none|empty)\b",
    re.IGNORECASE,
)


# ── Enums ─────────────────────────────────────────────────────────────────────


class ConfidenceBand(str, Enum):
    VERY_HIGH = "very_high"   # >= 0.90
    HIGH = "high"             # >= 0.75
    MEDIUM = "medium"         # >= 0.55
    LOW = "low"               # >= 0.35
    VERY_LOW = "very_low"     # < 0.35


def _band(score: float) -> ConfidenceBand:
    if score >= 0.90:
        return ConfidenceBand.VERY_HIGH
    if score >= 0.75:
        return ConfidenceBand.HIGH
    if score >= 0.55:
        return ConfidenceBand.MEDIUM
    if score >= 0.35:
        return ConfidenceBand.LOW
    return ConfidenceBand.VERY_LOW


# ── Domain models ────────────────────────────────────────────────────────────


@dataclass
class EvidenceItem:
    """A single piece of supporting evidence."""
    content: str
    source: str = "unknown"
    credibility: float = 0.8  # 0–1


@dataclass
class ConfidenceInput:
    decision_type: str
    description: str  # what is being decided
    evidence: list[EvidenceItem] = field(default_factory=list)
    required_fields: list[str] = field(default_factory=list)
    available_fields: list[str] = field(default_factory=list)
    prior_accuracy: float | None = None  # 0–1, if historically available
    session_id: str = ""
    tenant_id: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ConfidenceEstimate:
    estimate_id: str
    session_id: str
    tenant_id: str
    decision_type: str
    raw_score: float
    adjusted_score: float
    band: ConfidenceBand
    evidence_count: int
    ambiguity_flags: list[str]
    reasoning: str
    inputs: dict[str, Any]
    outcome: str | None
    outcome_correct: bool | None
    feedback_at: str | None
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "estimate_id": self.estimate_id,
            "session_id": self.session_id,
            "tenant_id": self.tenant_id,
            "decision_type": self.decision_type,
            "raw_score": self.raw_score,
            "adjusted_score": self.adjusted_score,
            "band": self.band.value,
            "evidence_count": self.evidence_count,
            "ambiguity_flags": self.ambiguity_flags,
            "reasoning": self.reasoning,
            "outcome": self.outcome,
            "outcome_correct": self.outcome_correct,
            "feedback_at": self.feedback_at,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


# ── Scoring algorithm ────────────────────────────────────────────────────────


def _score_evidence(evidence: list[EvidenceItem]) -> float:
    """Logistic evidence accumulation.  Each item contributes diminishingly."""
    if not evidence:
        return 0.3  # no evidence → low base
    total_credibility = sum(e.credibility for e in evidence)
    # Sigmoid-ish: saturates around 5 high-credibility items
    return round(min(0.95, 0.3 + 0.65 * (1 - math.exp(-total_credibility / 3))), 4)


def _penalty_ambiguity(description: str, evidence_texts: list[str]) -> tuple[float, list[str]]:
    """Return (penalty 0–0.4, list of flags)."""
    flags: list[str] = []
    penalty = 0.0
    combined = " ".join([description] + evidence_texts)

    hedging_hits = _HEDGING_PATTERNS.findall(combined)
    if hedging_hits:
        flags.append(f"hedging_language: {', '.join(set(h.lower() for h in hedging_hits[:3]))}")
        penalty += min(0.20, 0.05 * len(set(hedging_hits)))

    ambiguity_hits = _AMBIGUITY_SIGNALS.findall(combined)
    if ambiguity_hits:
        flags.append(f"ambiguity_signals: {', '.join(set(h.lower() for h in ambiguity_hits[:3]))}")
        penalty += min(0.20, 0.07 * len(set(ambiguity_hits)))

    return round(min(0.40, penalty), 4), flags


def _penalty_missing_fields(required: list[str], available: list[str]) -> tuple[float, list[str]]:
    flags: list[str] = []
    penalty = 0.0
    if not required:
        return 0.0, flags
    missing = [f for f in required if f not in available]
    if missing:
        fraction_missing = len(missing) / len(required)
        penalty = round(fraction_missing * 0.30, 4)
        flags.append(f"missing_fields: {', '.join(missing[:5])}")
    return penalty, flags


class ConfidenceEstimator:
    """Estimates decision confidence using evidence, ambiguity, and priors."""

    def __init__(self, db_path: Path | None = None) -> None:
        self._db = str(db_path or product_db_path("confidence.db"))
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_db(self) -> None:
        with self._conn() as conn:
            conn.executescript(_SCHEMA)

    # ── Estimation ───────────────────────────────────────────────────────────

    def estimate(self, inp: ConfidenceInput) -> ConfidenceEstimate:
        evidence_texts = [e.content for e in inp.evidence]

        # 1. Evidence base score
        raw = _score_evidence(inp.evidence)

        # 2. Penalties
        amb_penalty, amb_flags = _penalty_ambiguity(inp.description, evidence_texts)
        field_penalty, field_flags = _penalty_missing_fields(
            inp.required_fields, inp.available_fields
        )
        all_flags = amb_flags + field_flags
        total_penalty = min(0.55, amb_penalty + field_penalty)

        adjusted = round(max(0.05, raw - total_penalty), 4)

        # 3. Bayesian blend with prior accuracy if available
        if inp.prior_accuracy is not None:
            adjusted = round((adjusted * 0.6 + inp.prior_accuracy * 0.4), 4)

        band = _band(adjusted)

        # 4. Human-readable reasoning
        reasons = [f"Evidence base score: {raw:.3f} from {len(inp.evidence)} item(s)."]
        if amb_penalty:
            reasons.append(f"Ambiguity penalty: -{amb_penalty:.3f}.")
        if field_penalty:
            reasons.append(f"Missing fields penalty: -{field_penalty:.3f}.")
        if inp.prior_accuracy is not None:
            reasons.append(f"Blended with prior accuracy {inp.prior_accuracy:.3f}.")
        reasons.append(f"Final adjusted score: {adjusted:.3f} ({band.value}).")
        reasoning = " ".join(reasons)

        # 5. Persist
        est_id = str(uuid.uuid4())
        now = _utc_now()
        inputs_dict = {
            "description": inp.description,
            "evidence_count": len(inp.evidence),
            "required_fields": inp.required_fields,
            "available_fields": inp.available_fields,
            "prior_accuracy": inp.prior_accuracy,
        }
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO confidence_estimates
                   (estimate_id, session_id, tenant_id, decision_type,
                    raw_score, adjusted_score, band, evidence_count,
                    ambiguity_flags, reasoning, inputs_json, metadata_json, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    est_id,
                    inp.session_id,
                    inp.tenant_id,
                    inp.decision_type,
                    raw,
                    adjusted,
                    band.value,
                    len(inp.evidence),
                    json.dumps(all_flags),
                    reasoning,
                    json.dumps(inputs_dict),
                    json.dumps(inp.metadata),
                    now,
                ),
            )
        log.info(
            "confidence_estimated",
            estimate_id=est_id,
            adjusted=adjusted,
            band=band.value,
        )
        return ConfidenceEstimate(
            estimate_id=est_id,
            session_id=inp.session_id,
            tenant_id=inp.tenant_id,
            decision_type=inp.decision_type,
            raw_score=raw,
            adjusted_score=adjusted,
            band=band,
            evidence_count=len(inp.evidence),
            ambiguity_flags=all_flags,
            reasoning=reasoning,
            inputs=inputs_dict,
            outcome=None,
            outcome_correct=None,
            feedback_at=None,
            metadata=inp.metadata,
            created_at=now,
        )

    # ── Feedback (calibration loop) ─────────────────────────────────────────

    def record_outcome(
        self,
        estimate_id: str,
        outcome: str,
        correct: bool,
    ) -> bool:
        """Record whether the decision was correct to improve future calibration."""
        now = _utc_now()
        with self._conn() as conn:
            cur = conn.execute(
                """UPDATE confidence_estimates
                   SET outcome=?, outcome_correct=?, feedback_at=?
                   WHERE estimate_id=?""",
                (outcome, int(correct), now, estimate_id),
            )
        return cur.rowcount > 0

    # ── Query ────────────────────────────────────────────────────────────────

    def get_estimate(self, estimate_id: str) -> ConfidenceEstimate | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM confidence_estimates WHERE estimate_id=?",
                (estimate_id,),
            ).fetchone()
        return self._row_to_estimate(row) if row else None

    def list_estimates(
        self,
        tenant_id: str | None = None,
        session_id: str | None = None,
        decision_type: str | None = None,
        band: ConfidenceBand | None = None,
        limit: int = 100,
    ) -> list[ConfidenceEstimate]:
        q = "SELECT * FROM confidence_estimates WHERE 1=1"
        params: list[Any] = []
        if tenant_id:
            q += " AND tenant_id=?"
            params.append(tenant_id)
        if session_id:
            q += " AND session_id=?"
            params.append(session_id)
        if decision_type:
            q += " AND decision_type=?"
            params.append(decision_type)
        if band:
            q += " AND band=?"
            params.append(band.value)
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as conn:
            rows = conn.execute(q, params).fetchall()
        return [self._row_to_estimate(r) for r in rows]

    def accuracy_summary(
        self, tenant_id: str, decision_type: str | None = None
    ) -> dict[str, Any]:
        """Return historical accuracy stats for calibration analysis."""
        q = """SELECT band, COUNT(*) as total,
                      SUM(CASE WHEN outcome_correct=1 THEN 1 ELSE 0 END) as correct
               FROM confidence_estimates
               WHERE tenant_id=? AND outcome_correct IS NOT NULL"""
        params: list[Any] = [tenant_id]
        if decision_type:
            q += " AND decision_type=?"
            params.append(decision_type)
        q += " GROUP BY band"
        with self._conn() as conn:
            rows = conn.execute(q, params).fetchall()
        return {
            r["band"]: {
                "total": r["total"],
                "correct": r["correct"],
                "accuracy": round(r["correct"] / r["total"], 4) if r["total"] else 0,
            }
            for r in rows
        }

    # ── Helper ───────────────────────────────────────────────────────────────

    @staticmethod
    def _row_to_estimate(row: sqlite3.Row) -> ConfidenceEstimate:
        return ConfidenceEstimate(
            estimate_id=row["estimate_id"],
            session_id=row["session_id"],
            tenant_id=row["tenant_id"],
            decision_type=row["decision_type"],
            raw_score=row["raw_score"],
            adjusted_score=row["adjusted_score"],
            band=ConfidenceBand(row["band"]),
            evidence_count=row["evidence_count"],
            ambiguity_flags=json.loads(row["ambiguity_flags"]),
            reasoning=row["reasoning"],
            inputs=json.loads(row["inputs_json"]),
            outcome=row["outcome"],
            outcome_correct=bool(row["outcome_correct"]) if row["outcome_correct"] is not None else None,
            feedback_at=row["feedback_at"],
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"],
        )


# ── Singleton factory ────────────────────────────────────────────────────────

_estimator: ConfidenceEstimator | None = None


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_confidence_estimator() -> ConfidenceEstimator:
    global _estimator
    if _estimator is None:
        _estimator = ConfidenceEstimator()
    return _estimator


def reset_estimator(db_path: Path | None = None) -> ConfidenceEstimator:
    global _estimator
    _estimator = ConfidenceEstimator(db_path=db_path)
    return _estimator
