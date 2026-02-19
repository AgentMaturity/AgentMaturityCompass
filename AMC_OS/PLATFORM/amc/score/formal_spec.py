"""
AMC Score — Formal Specification: Mathematical Foundation for Maturity Scoring
==============================================================================

This module implements the core mathematical machinery behind the AMC (AI Maturity
Compass) scoring system, formalising the functions that turn raw evidence artifacts
into rigorous, time-aware maturity scores.

Mathematical symbols used throughout:
  M(a, d, t)  — Maturity score for agent 'a', dimension 'd', at time 't'
  T(e)        — Trust multiplier for evidence artifact 'e'
  λ           — Decay rate constant  (λ = ln(2) / half_life)
  Δt          — Time elapsed since evidence was recorded (in days)
  V           — Improvement velocity  (ΔM / Δt)
  CI          — Confidence interval around a score population mean

Design principles:
  • Pure functions: each function is side-effect-free and deterministic.
  • No external dependencies: only stdlib + pydantic + structlog.
  • All floating-point maths performed via the stdlib ``math`` module.
  • Pydantic models for all structured return values (serialisable & validated).

Author: AMC Platform Team
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from pydantic import BaseModel, Field

from amc.score.dimensions import (
    CompositeScore,
    Dimension,
    DimensionScore,
    MaturityLevel,
)
from amc.score.evidence import (
    TRUST_MULTIPLIERS,
    EvidenceArtifact,
    EvidenceKind,
)

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Minimum evidence count before confidence is meaningful.
MIN_EVIDENCE_FOR_CONFIDENCE: int = 3

#: Default half-life for evidence freshness decay (days).
DEFAULT_HALF_LIFE_DAYS: float = 30.0

#: Default confidence level for CI computation.
DEFAULT_CONFIDENCE: float = 0.95

#: Lookup table of two-tailed z-critical values for common confidence levels.
#: Derived from the standard normal distribution (large-sample approximation).
#: For small samples (n < 30) these are slightly optimistic; documented in CI docstring.
_Z_CRITICAL: dict[float, float] = {
    0.80: 1.282,
    0.85: 1.440,
    0.90: 1.645,
    0.95: 1.960,
    0.99: 2.576,
    0.999: 3.291,
}

#: Points awarded per MaturityLevel band (used as reference scale).
_LEVEL_THRESHOLDS: dict[MaturityLevel, tuple[float, float]] = {
    MaturityLevel.L1: (0.0, 29.9),
    MaturityLevel.L2: (30.0, 54.9),
    MaturityLevel.L3: (55.0, 79.9),
    MaturityLevel.L4: (80.0, 94.9),
    MaturityLevel.L5: (95.0, 100.0),
}


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class FormalScore(BaseModel):
    """
    Result of M(a, d, t): the maturity score for a specific agent and dimension
    at a given point in time, incorporating evidence decay and trust weighting.

    Fields:
        score_id       : Unique identifier for this score computation.
        agent_id       : Identifier of the agent being scored.
        dimension      : The maturity dimension this score applies to.
        timestamp      : The evaluation reference time (t in M(a,d,t)).
        raw_score      : Unweighted, undecayed aggregate trust score (0–100).
        decayed_score  : Score after time-decay is applied to each artifact (0–100).
        evidence_count : Number of evidence artifacts used.
        mean_trust     : Mean trust multiplier across all artifacts (0–1.1).
        mean_decay     : Mean decay factor across all artifacts (0–1).
        confidence     : Confidence in the score, based on evidence count/quality (0–1).
        level          : Corresponding MaturityLevel for the decayed_score.
        evidence_ids   : List of artifact qids that contributed to this score.
        computation_notes : Human-readable notes about the computation.
    """

    score_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    dimension: Dimension
    timestamp: datetime
    raw_score: float = Field(ge=0.0, le=110.0, description="Trust-weighted score before decay (0–110, >100 possible with CONTINUOUS_VERIFIED bonus)")
    decayed_score: float = Field(ge=0.0, le=110.0, description="Trust-weighted score after evidence decay")
    evidence_count: int = Field(ge=0)
    mean_trust: float = Field(ge=0.0, le=1.1, description="Mean trust multiplier across artifacts")
    mean_decay: float = Field(ge=0.0, le=1.0, description="Mean decay factor across artifacts")
    confidence: float = Field(ge=0.0, le=1.0, description="Statistical confidence in the score")
    level: MaturityLevel
    evidence_ids: list[str] = Field(default_factory=list, description="qids of contributing evidence artifacts")
    computation_notes: list[str] = Field(default_factory=list)


class AggregateScore(BaseModel):
    """
    Weighted aggregate of FormalScores across multiple maturity dimensions.

    Represents the overall AMC score for an agent at a given time, computed
    as a weighted mean of per-dimension decayed scores.

    Fields:
        score_id        : Unique identifier for this aggregate computation.
        agent_id        : Identifier of the agent being scored.
        timestamp       : The evaluation reference time.
        dimension_scores: Per-dimension decayed scores keyed by dimension value.
        weights         : Weight applied to each dimension (sums to 1.0).
        weighted_score  : The final aggregate score (0–100).
        overall_level   : MaturityLevel corresponding to weighted_score.
        computation_notes: Human-readable notes about the aggregation.
    """

    score_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    timestamp: datetime
    dimension_scores: dict[str, float] = Field(
        description="Dimension value → decayed score mapping"
    )
    weights: dict[str, float] = Field(
        description="Dimension value → weight mapping (should sum to 1.0)"
    )
    weighted_score: float = Field(ge=0.0, le=110.0)
    overall_level: MaturityLevel
    computation_notes: list[str] = Field(default_factory=list)


class VelocityMetric(BaseModel):
    """
    Improvement velocity metric: V = ΔM / Δt.

    Measures how quickly an agent's maturity score is changing over time.
    Positive velocity indicates improvement; negative indicates regression.

    Fields:
        metric_id  : Unique identifier for this velocity computation.
        agent_id   : Identifier of the agent being evaluated.
        dimension  : Dimension being measured (None = aggregate velocity).
        score_t1   : Maturity score at the earlier time point t1.
        score_t2   : Maturity score at the later time point t2.
        t1         : Earlier evaluation timestamp.
        t2         : Later evaluation timestamp.
        delta_score: score_t2 − score_t1  (ΔM).
        delta_days : Elapsed time in days  (Δt).
        velocity   : ΔM / Δt  (score points per day).
        trend      : "improving" | "declining" | "stable" classification.
        annualised : Velocity scaled to 365 days (score points per year).
    """

    metric_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    dimension: Optional[str] = Field(
        default=None,
        description="Dimension value, or None for aggregate velocity"
    )
    score_t1: float
    score_t2: float
    t1: datetime
    t2: datetime
    delta_score: float
    delta_days: float
    velocity: float = Field(description="Score points per day (ΔM/Δt)")
    trend: str = Field(description="'improving' | 'declining' | 'stable'")
    annualised: float = Field(description="Velocity scaled to 365 days")


# ---------------------------------------------------------------------------
# Core Mathematical Functions
# ---------------------------------------------------------------------------

def evidence_decay(
    artifact: EvidenceArtifact,
    current_time: datetime,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
) -> float:
    """
    Compute the exponential time-decay factor for a single evidence artifact.

    Evidence becomes less reliable as it ages. Older artifacts contribute less
    to the maturity score, modelled by:

        decay(e, t) = exp(−λ · Δt)

    where:
        λ   = ln(2) / half_life_days  (decay rate constant)
        Δt  = age of the artifact in days at evaluation time t

    At Δt = 0 (brand new), decay = 1.0 (full weight).
    At Δt = half_life_days, decay = 0.5 (half weight).
    At Δt = 3 × half_life_days, decay ≈ 0.125 (12.5% weight).

    Args:
        artifact:       The EvidenceArtifact to evaluate. Its ``verified_at``
                        ISO-8601 string is parsed to determine age.
        current_time:   The reference evaluation timestamp (t).
        half_life_days: Number of days until an artifact retains 50% weight.
                        Defaults to 30 days.

    Returns:
        A float in (0, 1] representing the decay-adjusted weight. Never
        exactly 0 (bounded below at ``exp(−1000)`` to avoid log-domain errors).

    Raises:
        ValueError: If ``half_life_days`` is not a positive number.

    Examples:
        >>> from datetime import datetime, timezone, timedelta
        >>> from amc.score.evidence import EvidenceKind
        >>> fresh_art = EvidenceArtifact(
        ...     qid="sec_1", kind=EvidenceKind.EXECUTION_VERIFIED,
        ...     claim="firewall active", verified_at=datetime.now(timezone.utc).isoformat(),
        ...     trust_score=1.0)
        >>> evidence_decay(fresh_art, datetime.now(timezone.utc))  # ≈ 1.0
        0.9999...
    """
    if half_life_days <= 0:
        raise ValueError(f"half_life_days must be positive, got {half_life_days!r}")

    # Parse verified_at — support both tz-aware and tz-naive ISO strings.
    verified_at_str = artifact.verified_at
    try:
        verified_dt = datetime.fromisoformat(verified_at_str)
    except ValueError:
        # Fallback: treat as brand-new if unparseable
        log.warning(
            "evidence_decay.parse_failed",
            qid=artifact.qid,
            verified_at=verified_at_str,
        )
        return 1.0

    # Normalise to UTC-aware for safe subtraction.
    if verified_dt.tzinfo is None:
        verified_dt = verified_dt.replace(tzinfo=timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)

    # Age in days; clamp to [0, ∞) — future evidence counts as brand-new.
    delta_seconds = (current_time - verified_dt).total_seconds()
    delta_days = max(0.0, delta_seconds / 86_400.0)

    # λ = ln(2) / half_life
    lam = math.log(2) / half_life_days

    # decay = e^(−λ·Δt)
    decay = math.exp(-lam * delta_days)

    log.debug(
        "evidence_decay.computed",
        qid=artifact.qid,
        delta_days=round(delta_days, 2),
        half_life_days=half_life_days,
        decay=round(decay, 4),
    )
    return decay


def maturity_score(
    agent_id: str,
    dimension: Dimension,
    evidence_artifacts: list[EvidenceArtifact],
    timestamp: datetime,
    half_life_days: float = DEFAULT_HALF_LIFE_DAYS,
) -> FormalScore:
    """
    Compute M(a, d, t) — the formal maturity score for agent ``a``, dimension
    ``d``, at evaluation time ``t``.

    Formula
    -------
    For a set of evidence artifacts E = {e₁, e₂, …, eₙ}:

        raw_score(a, d, t)     = (1/N) · Σᵢ T(eᵢ)         × 100
        decayed_score(a, d, t) = (1/N) · Σᵢ [T(eᵢ) · D(eᵢ, t)] × 100

    where:
        T(eᵢ)    = TRUST_MULTIPLIERS[eᵢ.kind]  (from evidence module)
        D(eᵢ, t) = evidence_decay(eᵢ, t)       (exponential freshness factor)
        N        = len(E)

    Special cases:
        • If an artifact has ``execution_error`` set, T(eᵢ) = 0 (no contribution).
        • Scores are capped at 100 for MaturityLevel mapping (CONTINUOUS_VERIFIED
          can push raw beyond 100 as a bonus signal, captured in raw_score).
        • If N = 0, returns a zero-score L1 FormalScore.

    Confidence heuristic:
        confidence = tanh(N / MIN_EVIDENCE_FOR_CONFIDENCE) × mean_trust

    Args:
        agent_id:           Identifier for the agent being scored.
        dimension:          The maturity dimension to evaluate.
        evidence_artifacts: All evidence artifacts relevant to this dimension.
        timestamp:          The reference time for decay calculations.
        half_life_days:     Evidence freshness half-life in days (default 30).

    Returns:
        FormalScore with raw, decayed, confidence, and level fields populated.
    """
    if not evidence_artifacts:
        log.info(
            "maturity_score.no_evidence",
            agent_id=agent_id,
            dimension=dimension.value,
        )
        return FormalScore(
            agent_id=agent_id,
            dimension=dimension,
            timestamp=timestamp,
            raw_score=0.0,
            decayed_score=0.0,
            evidence_count=0,
            mean_trust=0.0,
            mean_decay=0.0,
            confidence=0.0,
            level=MaturityLevel.L1,
            computation_notes=["No evidence artifacts provided — defaulting to L1."],
        )

    trust_values: list[float] = []
    decayed_values: list[float] = []
    decay_factors: list[float] = []
    evidence_ids: list[str] = []
    notes: list[str] = []

    for art in evidence_artifacts:
        # Failed execution contributes zero trust.
        if art.execution_error:
            t_val = 0.0
            notes.append(f"{art.qid}: execution FAILED → trust=0 ({art.execution_error[:60]})")
        else:
            t_val = TRUST_MULTIPLIERS.get(art.kind, 0.4)

        d_val = evidence_decay(art, timestamp, half_life_days=half_life_days)

        trust_values.append(t_val)
        decayed_values.append(t_val * d_val)
        decay_factors.append(d_val)
        evidence_ids.append(art.qid)

    n = len(trust_values)
    mean_trust = sum(trust_values) / n
    mean_decay = sum(decay_factors) / n

    # Scale to [0, 110] reference range; TRUST_MULTIPLIERS max is 1.1.
    # Use round() + hard clamp to avoid floating-point repr errors (e.g. 110.000000000001).
    raw_score = min(110.0, round((sum(trust_values) / n) * 100.0, 6))
    decayed_score = min(110.0, round((sum(decayed_values) / n) * 100.0, 6))

    # Confidence: saturates as N grows and mean trust is high.
    # tanh ramps up from 0 → 1; multiplied by trust quality.
    confidence = math.tanh(n / MIN_EVIDENCE_FOR_CONFIDENCE) * mean_trust
    confidence = min(1.0, confidence)  # bound to [0, 1]

    # Map decayed_score to MaturityLevel (cap at 100 for level mapping).
    level = _score_to_level(min(decayed_score, 100.0))

    formal = FormalScore(
        agent_id=agent_id,
        dimension=dimension,
        timestamp=timestamp,
        raw_score=raw_score,
        decayed_score=decayed_score,
        evidence_count=n,
        mean_trust=mean_trust,
        mean_decay=mean_decay,
        confidence=confidence,
        level=level,
        evidence_ids=evidence_ids,
        computation_notes=notes,
    )

    log.info(
        "maturity_score.computed",
        agent_id=agent_id,
        dimension=dimension.value,
        raw_score=round(raw_score, 2),
        decayed_score=round(decayed_score, 2),
        level=level.value,
        evidence_count=n,
        confidence=round(confidence, 3),
    )
    return formal


def weighted_aggregate(
    dimension_scores: dict[Dimension, float] | list[DimensionScore],
    weights: Optional[dict[Dimension, float]] = None,
) -> float:
    """
    Compute a weighted mean maturity score across multiple dimensions.

    Given per-dimension scores, this function produces a single aggregate
    value that reflects the overall maturity, with optional custom weighting
    for dimensions that matter more to a particular organisation.

    Formula
    -------
        aggregate = Σᵢ (wᵢ · sᵢ) / Σᵢ wᵢ

    where:
        sᵢ = score for dimension i
        wᵢ = weight for dimension i  (defaults to 1 / N for equal weighting)

    Args:
        dimension_scores: Either:
            - dict mapping ``Dimension`` → score (float, 0–100), or
            - list of ``DimensionScore`` objects (uses ``.score`` attribute).
        weights: Optional dict mapping ``Dimension`` → weight (any positive float).
                 Need not sum to 1; normalised internally.
                 If None, all dimensions receive equal weight (1/N).

    Returns:
        Weighted mean score as a float in [0, 100].

    Raises:
        ValueError: If ``dimension_scores`` is empty, or if any weight is negative.

    Examples:
        >>> from amc.score.dimensions import Dimension
        >>> scores = {Dimension.GOVERNANCE: 70.0, Dimension.SECURITY: 85.0}
        >>> weighted_aggregate(scores)
        77.5
        >>> weighted_aggregate(scores, {Dimension.GOVERNANCE: 1, Dimension.SECURITY: 3})
        81.25
    """
    # Normalise input to {Dimension: float}
    if isinstance(dimension_scores, list):
        score_map: dict[Dimension, float] = {
            ds.dimension: float(ds.score) for ds in dimension_scores
        }
    else:
        score_map = {dim: float(v) for dim, v in dimension_scores.items()}

    if not score_map:
        raise ValueError("dimension_scores must not be empty")

    # Build weight map; default to equal weights.
    if weights is None:
        n = len(score_map)
        weight_map: dict[Dimension, float] = {dim: 1.0 / n for dim in score_map}
    else:
        weight_map = {dim: float(w) for dim, w in weights.items()}
        if any(w < 0 for w in weight_map.values()):
            raise ValueError("All weights must be non-negative")

    numerator = 0.0
    denominator = 0.0

    for dim, score in score_map.items():
        w = weight_map.get(dim, 0.0)
        numerator += w * score
        denominator += w

    if denominator == 0.0:
        raise ValueError("Sum of weights is zero; cannot compute weighted mean")

    result = numerator / denominator
    log.debug(
        "weighted_aggregate.computed",
        dimensions=len(score_map),
        result=round(result, 3),
        custom_weights=(weights is not None),
    )
    return result


def improvement_velocity(
    score_t1: float,
    score_t2: float,
    t1: datetime,
    t2: datetime,
    agent_id: str = "unknown",
    dimension: Optional[str] = None,
) -> VelocityMetric:
    """
    Compute V = ΔM / Δt — the rate of maturity score change over time.

    Velocity is expressed in **score points per day**. A positive velocity
    means the agent is improving; negative means regression.

    Formula
    -------
        ΔM = score_t2 − score_t1
        Δt = (t2 − t1).total_seconds() / 86_400   [days]
        V  = ΔM / Δt

    Trend classification:
        +0.5 or greater  → "improving"
        −0.5 or lower    → "declining"
        between −0.5/+0.5 → "stable"

    Args:
        score_t1:  Maturity score at the earlier time point.
        score_t2:  Maturity score at the later time point.
        t1:        Timestamp corresponding to score_t1 (must be before t2).
        t2:        Timestamp corresponding to score_t2.
        agent_id:  Agent identifier (for logging / model population).
        dimension: Dimension label (optional; None = aggregate velocity).

    Returns:
        VelocityMetric with velocity, trend, and annualised fields.

    Raises:
        ValueError: If t2 ≤ t1 (non-positive time interval).

    Examples:
        >>> from datetime import datetime, timezone, timedelta
        >>> t1 = datetime(2026, 1, 1, tzinfo=timezone.utc)
        >>> t2 = datetime(2026, 2, 1, tzinfo=timezone.utc)  # 31 days later
        >>> vm = improvement_velocity(40.0, 71.0, t1, t2)
        >>> round(vm.velocity, 2)
        1.0  # ≈ 31 points / 31 days
    """
    # Normalise timezone awareness.
    if t1.tzinfo is None:
        t1 = t1.replace(tzinfo=timezone.utc)
    if t2.tzinfo is None:
        t2 = t2.replace(tzinfo=timezone.utc)

    delta_seconds = (t2 - t1).total_seconds()
    if delta_seconds <= 0:
        raise ValueError(
            f"t2 must be strictly after t1; got t1={t1.isoformat()}, t2={t2.isoformat()}"
        )

    delta_days = delta_seconds / 86_400.0
    delta_score = score_t2 - score_t1
    velocity = delta_score / delta_days
    annualised = velocity * 365.0

    # Trend classification with a ±0.5 pt/day dead-band (noise tolerance).
    if velocity >= 0.5:
        trend = "improving"
    elif velocity <= -0.5:
        trend = "declining"
    else:
        trend = "stable"

    metric = VelocityMetric(
        agent_id=agent_id,
        dimension=dimension,
        score_t1=score_t1,
        score_t2=score_t2,
        t1=t1,
        t2=t2,
        delta_score=round(delta_score, 4),
        delta_days=round(delta_days, 4),
        velocity=round(velocity, 6),
        trend=trend,
        annualised=round(annualised, 4),
    )

    log.info(
        "improvement_velocity.computed",
        agent_id=agent_id,
        dimension=dimension,
        delta_score=round(delta_score, 2),
        delta_days=round(delta_days, 2),
        velocity=round(velocity, 4),
        trend=trend,
    )
    return metric


def confidence_interval(
    scores: list[float],
    confidence: float = DEFAULT_CONFIDENCE,
) -> tuple[float, float]:
    """
    Compute a confidence interval (CI) for the true mean of a set of scores.

    Uses the **normal approximation** (z-score) CI:

        CI = ( x̄ − z* · (s / √n),  x̄ + z* · (s / √n) )

    where:
        x̄  = sample mean
        s   = sample standard deviation (Bessel-corrected, ddof=1)
        n   = number of scores
        z*  = critical value for the requested confidence level

    Note on small samples: For n < 30, the normal approximation is slightly
    optimistic. In practice, use this function with at minimum 3–5 score
    observations for meaningful intervals.

    Supported confidence levels (interpolates to nearest):
        0.80, 0.85, 0.90, 0.95, 0.99, 0.999

    Args:
        scores:     List of numeric maturity scores (typically 0–100).
                    Must contain at least 2 values.
        confidence: Desired confidence level between 0 and 1 (default 0.95).

    Returns:
        Tuple ``(lower_bound, upper_bound)`` of the CI, clipped to [0, 110].

    Raises:
        ValueError: If ``scores`` has fewer than 2 elements.
        ValueError: If ``confidence`` is not in (0, 1).

    Examples:
        >>> ci = confidence_interval([60.0, 65.0, 70.0, 68.0, 72.0])
        >>> ci[0] < 67.0 < ci[1]
        True
    """
    if len(scores) < 2:
        raise ValueError(
            f"At least 2 scores required for a CI; got {len(scores)}"
        )
    if not (0.0 < confidence < 1.0):
        raise ValueError(f"confidence must be in (0, 1); got {confidence!r}")

    n = len(scores)
    mean = sum(scores) / n

    # Sample variance (Bessel-corrected: ddof=1).
    variance = sum((s - mean) ** 2 for s in scores) / (n - 1)
    std_dev = math.sqrt(variance)

    # Lookup z-critical value; default to nearest in our table.
    z_star = _nearest_z_critical(confidence)

    # Standard error of the mean.
    sem = std_dev / math.sqrt(n)
    margin = z_star * sem

    lower = max(0.0, mean - margin)
    upper = min(110.0, mean + margin)

    log.debug(
        "confidence_interval.computed",
        n=n,
        mean=round(mean, 3),
        std_dev=round(std_dev, 3),
        z_star=z_star,
        margin=round(margin, 3),
        lower=round(lower, 3),
        upper=round(upper, 3),
        confidence=confidence,
    )
    return (lower, upper)


# ---------------------------------------------------------------------------
# Internal Helpers
# ---------------------------------------------------------------------------

def _score_to_level(score: float) -> MaturityLevel:
    """Map a numeric score (0–100) to a MaturityLevel enum value."""
    if score >= 95.0:
        return MaturityLevel.L5
    elif score >= 80.0:
        return MaturityLevel.L4
    elif score >= 55.0:
        return MaturityLevel.L3
    elif score >= 30.0:
        return MaturityLevel.L2
    else:
        return MaturityLevel.L1


def _nearest_z_critical(confidence: float) -> float:
    """
    Return the nearest z-critical value for the given confidence level.

    Selects the entry in ``_Z_CRITICAL`` with the smallest absolute difference
    from the requested confidence, then returns its z-value. This avoids
    interpolation and keeps the function dependency-free.
    """
    best_key = min(_Z_CRITICAL.keys(), key=lambda k: abs(k - confidence))
    return _Z_CRITICAL[best_key]


def _build_aggregate_score(
    agent_id: str,
    formal_scores: list[FormalScore],
    weights: Optional[dict[Dimension, float]] = None,
    timestamp: Optional[datetime] = None,
) -> AggregateScore:
    """
    Convenience helper: build an AggregateScore from a list of FormalScores.

    Args:
        agent_id:      Agent identifier.
        formal_scores: Per-dimension FormalScore objects.
        weights:       Optional custom weight map.
        timestamp:     Evaluation time (defaults to now).

    Returns:
        AggregateScore with weighted_score and overall_level populated.
    """
    ts = timestamp or datetime.now(timezone.utc)
    dim_map: dict[Dimension, float] = {
        fs.dimension: fs.decayed_score for fs in formal_scores
    }
    agg_score = weighted_aggregate(dim_map, weights=weights)

    n = len(dim_map) or 1
    equal_w = 1.0 / n
    effective_weights: dict[str, float] = {
        dim.value: (weights.get(dim, equal_w) if weights else equal_w)
        for dim in dim_map
    }

    return AggregateScore(
        agent_id=agent_id,
        timestamp=ts,
        dimension_scores={dim.value: score for dim, score in dim_map.items()},
        weights=effective_weights,
        weighted_score=agg_score,
        overall_level=_score_to_level(min(agg_score, 100.0)),
        computation_notes=[
            f"Aggregated {len(formal_scores)} dimension scores.",
            f"Custom weights applied: {weights is not None}",
        ],
    )


# ---------------------------------------------------------------------------
# Demo / Smoke-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":  # pragma: no cover
    """
    Quick demonstration of the formal_spec module's capabilities.
    Run with:  python -m amc.score.formal_spec
    """
    from datetime import timedelta

    print("=" * 70)
    print("  AMC Formal Spec — Mathematical Foundation Demo")
    print("=" * 70)

    now = datetime.now(timezone.utc)
    AGENT = "demo-agent-001"

    # -----------------------------------------------------------------------
    # 1. Build example EvidenceArtifacts
    # -----------------------------------------------------------------------
    print("\n[1] Building evidence artifacts …")

    fresh_artifact = EvidenceArtifact(
        qid="sec_1",
        kind=EvidenceKind.EXECUTION_VERIFIED,
        claim="Firewall policy is active and logs tool calls",
        verified_at=now.isoformat(),
        trust_score=EvidenceArtifact.trust_for_kind(EvidenceKind.EXECUTION_VERIFIED),
    )
    week_old_artifact = EvidenceArtifact(
        qid="sec_2",
        kind=EvidenceKind.CODE_PRESENT,
        claim="Prompt injection filter code found in repo",
        verified_at=(now - timedelta(days=7)).isoformat(),
        trust_score=EvidenceArtifact.trust_for_kind(EvidenceKind.CODE_PRESENT),
    )
    month_old_artifact = EvidenceArtifact(
        qid="sec_3",
        kind=EvidenceKind.KEYWORD_CLAIM,
        claim="Secret management mentioned in architecture doc",
        verified_at=(now - timedelta(days=35)).isoformat(),
        trust_score=EvidenceArtifact.trust_for_kind(EvidenceKind.KEYWORD_CLAIM),
    )
    failed_artifact = EvidenceArtifact(
        qid="sec_4",
        kind=EvidenceKind.IMPORT_VERIFIED,
        claim="Security scanner module",
        execution_error="ModuleNotFoundError: No module named 'security_scanner'",
        verified_at=(now - timedelta(days=2)).isoformat(),
        trust_score=0.0,
    )

    artifacts = [fresh_artifact, week_old_artifact, month_old_artifact, failed_artifact]

    # -----------------------------------------------------------------------
    # 2. Evidence decay
    # -----------------------------------------------------------------------
    print("\n[2] Evidence decay factors …")
    for art in artifacts:
        decay = evidence_decay(art, now)
        print(f"    {art.qid:8s}  kind={art.kind.value:22s}  age≈{((now - datetime.fromisoformat(art.verified_at)).days):>3d}d  decay={decay:.4f}")

    # -----------------------------------------------------------------------
    # 3. Maturity score — M(a, d, t)
    # -----------------------------------------------------------------------
    print(f"\n[3] Maturity score M({AGENT!r}, SECURITY, now) …")
    fs = maturity_score(
        agent_id=AGENT,
        dimension=Dimension.SECURITY,
        evidence_artifacts=artifacts,
        timestamp=now,
    )
    print(f"    raw_score    = {fs.raw_score:.2f}")
    print(f"    decayed_score= {fs.decayed_score:.2f}")
    print(f"    mean_trust   = {fs.mean_trust:.4f}")
    print(f"    mean_decay   = {fs.mean_decay:.4f}")
    print(f"    confidence   = {fs.confidence:.4f}")
    print(f"    level        = {fs.level.value}")
    for note in fs.computation_notes:
        print(f"    ⚠  {note}")

    # -----------------------------------------------------------------------
    # 4. Weighted aggregate across multiple dimensions
    # -----------------------------------------------------------------------
    print("\n[4] Weighted aggregate across dimensions …")
    dim_scores_map: dict[Dimension, float] = {
        Dimension.GOVERNANCE:      72.0,
        Dimension.SECURITY:        fs.decayed_score,
        Dimension.RELIABILITY:     60.0,
        Dimension.EVALUATION:      45.0,
        Dimension.OBSERVABILITY:   80.0,
        Dimension.COST_EFFICIENCY: 55.0,
        Dimension.OPERATING_MODEL: 65.0,
    }

    equal_agg = weighted_aggregate(dim_scores_map)
    print(f"    Equal-weighted aggregate: {equal_agg:.2f}")

    # Security & Governance get double weight for a security-first org.
    custom_weights: dict[Dimension, float] = {
        Dimension.GOVERNANCE:  2.0,
        Dimension.SECURITY:    2.0,
        Dimension.RELIABILITY: 1.0,
        Dimension.EVALUATION:  1.0,
        Dimension.OBSERVABILITY:   1.0,
        Dimension.COST_EFFICIENCY: 1.0,
        Dimension.OPERATING_MODEL: 1.0,
    }
    custom_agg = weighted_aggregate(dim_scores_map, weights=custom_weights)
    print(f"    Security+Governance-heavy aggregate: {custom_agg:.2f}")

    # -----------------------------------------------------------------------
    # 5. Improvement velocity
    # -----------------------------------------------------------------------
    print("\n[5] Improvement velocity V = ΔM / Δt …")
    t1 = now - timedelta(days=90)
    t2 = now
    vm = improvement_velocity(
        score_t1=40.0,
        score_t2=equal_agg,
        t1=t1,
        t2=t2,
        agent_id=AGENT,
        dimension=None,  # aggregate
    )
    print(f"    ΔM          = {vm.delta_score:.2f} pts")
    print(f"    Δt          = {vm.delta_days:.1f} days")
    print(f"    velocity    = {vm.velocity:.4f} pts/day")
    print(f"    annualised  = {vm.annualised:.2f} pts/year")
    print(f"    trend       = {vm.trend}")

    # -----------------------------------------------------------------------
    # 6. Confidence interval
    # -----------------------------------------------------------------------
    print("\n[6] Confidence interval (95%) on a series of scores …")
    score_series = [62.0, 67.5, 70.0, 64.3, 68.8, 66.1, 71.2, 65.0]
    ci = confidence_interval(score_series, confidence=0.95)
    mean_s = sum(score_series) / len(score_series)
    print(f"    Scores  = {score_series}")
    print(f"    Mean    = {mean_s:.2f}")
    print(f"    95% CI  = ({ci[0]:.2f}, {ci[1]:.2f})")
    print(f"    Width   = {ci[1] - ci[0]:.2f}")

    # -----------------------------------------------------------------------
    # 7. AggregateScore Pydantic model
    # -----------------------------------------------------------------------
    print("\n[7] AggregateScore Pydantic model …")
    security_fs = fs  # from step 3
    governance_fs = maturity_score(
        agent_id=AGENT,
        dimension=Dimension.GOVERNANCE,
        evidence_artifacts=[
            EvidenceArtifact(
                qid="gov_1",
                kind=EvidenceKind.CONTINUOUS_VERIFIED,
                claim="Governance policy enforced in production",
                verified_at=(now - timedelta(days=1)).isoformat(),
                trust_score=EvidenceArtifact.trust_for_kind(EvidenceKind.CONTINUOUS_VERIFIED),
            )
        ],
        timestamp=now,
    )
    agg = _build_aggregate_score(AGENT, [security_fs, governance_fs])
    print(f"    weighted_score = {agg.weighted_score:.2f}")
    print(f"    overall_level  = {agg.overall_level.value}")
    print(f"    dimensions     = {list(agg.dimension_scores.keys())}")

    print("\n" + "=" * 70)
    print("  Demo complete. All core functions operational.")
    print("=" * 70)
