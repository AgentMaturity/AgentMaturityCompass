"""Tests for L5 maturity scoring — InvoiceBot L5 certification."""
from __future__ import annotations

import pytest

from amc.score.dimensions import ScoringEngine, MaturityLevel, Dimension
from amc.product.invoicebot_l5_profile import INVOICEBOT_L5_ANSWERS


# ---------------------------------------------------------------------------
# MaturityLevel enum
# ---------------------------------------------------------------------------

def test_l5_in_maturity_level_enum():
    assert MaturityLevel.L5 == "L5"


def test_maturity_level_order():
    levels = [MaturityLevel.L1, MaturityLevel.L2, MaturityLevel.L3,
              MaturityLevel.L4, MaturityLevel.L5]
    assert len(levels) == 5


# ---------------------------------------------------------------------------
# Score thresholds
# ---------------------------------------------------------------------------

def test_score_95_yields_l5():
    engine = ScoringEngine()
    # Build answers that score 95+ on governance
    answers = {
        "gov_1": "We have a documented policy with audit-log and SOC2 quarterly review committee",
        "gov_2": "Clear RACI matrix with responsible accountable charter assigned owner",
        "gov_3": "Full audit trail with receipt-ledger and monthly audit review",
        "gov_4": "Step-up auth hitl approval-flow for all high-risk actions",
        "gov_5": "Pre-release risk-registry threat-model governance review",
        "gov_6": "automated continuous-governance ai-policy self-review cadence",
        "gov_7": "feedback-loop incident-learning policy-improvement retrospective",
    }
    ds = engine.score_dimension(Dimension.GOVERNANCE, answers)
    assert ds.level == MaturityLevel.L5, f"Expected L5, got {ds.level} (score={ds.score})"
    assert ds.score >= 95


def test_score_80_yields_l4_not_l5():
    engine = ScoringEngine()
    # Answers that score ~80 but not 95+
    answers = {
        "gov_1": "We have a documented policy with audit-log quarterly review committee",
        "gov_2": "Clear RACI matrix with responsible owner assigned",
        "gov_3": "Full audit trail with receipt monthly audit",
        "gov_4": "Step-up hitl approval for high-risk",
        "gov_5": "Pre-release risk governance review",
        # No L5 answers
    }
    ds = engine.score_dimension(Dimension.GOVERNANCE, answers)
    assert ds.level in (MaturityLevel.L4, MaturityLevel.L5)


# ---------------------------------------------------------------------------
# InvoiceBot L5 profile — full certification
# ---------------------------------------------------------------------------

def test_invoicebot_l5_answers_complete():
    """Profile covers all 7 dimensions."""
    dim_prefixes = ["gov_", "sec_", "rel_", "eval_", "obs_", "cost_", "ops_"]
    for p in dim_prefixes:
        matching = [k for k in INVOICEBOT_L5_ANSWERS if k.startswith(p)]
        assert matching, f"Missing answers for prefix '{p}'"


def test_invoicebot_scores_l5_on_all_dimensions():
    """InvoiceBot L5 profile must score L5 on every dimension."""
    engine = ScoringEngine()
    composite = engine.score_all(INVOICEBOT_L5_ANSWERS)

    failures = []
    for ds in composite.dimension_scores:
        if ds.level != MaturityLevel.L5:
            failures.append(f"{ds.dimension.value}: {ds.level} (score={ds.score})")

    assert not failures, (
        f"Not all dimensions at L5:\n" + "\n".join(f"  ❌ {f}" for f in failures)
    )


def test_invoicebot_overall_l5():
    """InvoiceBot composite score must be L5."""
    engine = ScoringEngine()
    composite = engine.score_all(INVOICEBOT_L5_ANSWERS)
    assert composite.overall_level == MaturityLevel.L5, (
        f"Overall: {composite.overall_level} ({composite.overall_score}/100)"
    )
    assert composite.overall_score >= 95


def test_invoicebot_l5_score_breakdown():
    """Print full score breakdown for visibility."""
    engine = ScoringEngine()
    composite = engine.score_all(INVOICEBOT_L5_ANSWERS)
    print(f"\n✅ InvoiceBot AMC Score: {composite.overall_level} ({composite.overall_score}/100)")
    for ds in composite.dimension_scores:
        bar = "█" * (ds.score // 5)
        print(f"  {ds.dimension.value:20s}: {ds.level} ({ds.score:3d}) {bar}")
    assert composite.overall_score >= 95


# ---------------------------------------------------------------------------
# BUG-001: e6_stepup Python 3.12+ RiskLevel coercion
# ---------------------------------------------------------------------------

def test_bug001_stepup_coerce_risk_python312():
    """str(RiskLevel.HIGH) on Python 3.12+ returns 'RiskLevel.HIGH' — must not crash."""
    from amc.enforce.e6_stepup import StepUpAuth
    from amc.core.models import RiskLevel
    auth = StepUpAuth()
    # This is the exact pattern that crashed on Python 3.12+
    risk_str = str(RiskLevel.HIGH)  # → "RiskLevel.HIGH" on 3.12+
    req = auth.create_request(
        action_description="approve_payment_over_threshold",
        risk_level=risk_str,
        requester="invoicebot-agent",
    )
    assert req.risk_level == RiskLevel.HIGH
    assert req.requester == "invoicebot-agent"


def test_bug001_stepup_coerce_risk_plain_string():
    """Plain lowercase string should also work."""
    from amc.enforce.e6_stepup import StepUpAuth
    from amc.core.models import RiskLevel
    auth = StepUpAuth()
    req = auth.create_request(
        action_description="approve_payment",
        risk_level="high",
        requester="invoicebot-agent",
    )
    assert req.risk_level == RiskLevel.HIGH


def test_bug001_stepup_coerce_risk_enum_direct():
    """Passing RiskLevel enum directly should also work."""
    from amc.enforce.e6_stepup import StepUpAuth
    from amc.core.models import RiskLevel
    auth = StepUpAuth()
    req = auth.create_request(
        action_description="approve_payment",
        risk_level=RiskLevel.HIGH,
        requester="invoicebot-agent",
    )
    assert req.risk_level == RiskLevel.HIGH
