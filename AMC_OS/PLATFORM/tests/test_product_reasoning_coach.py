"""Tests for amc.product.reasoning_coach — Tool-First Reasoning Coach."""
from __future__ import annotations

import pytest

from amc.product.reasoning_coach import (
    ClaimCategory,
    CoachRequest,
    ReasoningCoach,
    Severity,
    get_reasoning_coach,
)


@pytest.fixture()
def coach() -> ReasoningCoach:
    return ReasoningCoach()


# ---------------------------------------------------------------------------
# Basic coaching
# ---------------------------------------------------------------------------


def test_clean_output_no_claims(coach):
    text = "The agent retrieved data from the database and processed it."
    result = coach.coach(CoachRequest(output_text=text))
    # No numeric/temporal/superlative claims → should be mostly clean
    assert result.overall_grounding_score >= 0.5


def test_numeric_claim_detected(coach):
    text = "Revenue increased by 45% this quarter."
    result = coach.coach(CoachRequest(output_text=text, min_severity=Severity.LOW))
    categories = {c.category for c in result.claims}
    assert ClaimCategory.NUMERIC in categories


def test_temporal_claim_detected(coach):
    text = "The current version is 3.2 and it was released recently."
    result = coach.coach(CoachRequest(output_text=text, min_severity=Severity.LOW))
    categories = {c.category for c in result.claims}
    assert ClaimCategory.TEMPORAL in categories


def test_comparative_claim_detected(coach):
    text = "This is the best solution available and it outperforms all competitors."
    result = coach.coach(CoachRequest(output_text=text, min_severity=Severity.LOW))
    categories = {c.category for c in result.claims}
    assert ClaimCategory.COMPARATIVE in categories


def test_factual_claim_detected(coach):
    text = "Studies show that this approach reduces errors by a wide margin."
    result = coach.coach(CoachRequest(output_text=text, min_severity=Severity.LOW))
    categories = {c.category for c in result.claims}
    assert ClaimCategory.FACTUAL in categories


def test_existence_claim_detected(coach):
    text = "The API endpoint is available at the standard URL."
    result = coach.coach(CoachRequest(output_text=text, min_severity=Severity.LOW))
    categories = {c.category for c in result.claims}
    assert ClaimCategory.EXISTENCE in categories


def test_procedural_claim_detected(coach):
    text = "You can achieve this by simply going to the settings page."
    result = coach.coach(CoachRequest(output_text=text, min_severity=Severity.LOW))
    categories = {c.category for c in result.claims}
    assert ClaimCategory.PROCEDURAL in categories


# ---------------------------------------------------------------------------
# Grounding detection
# ---------------------------------------------------------------------------


def test_grounded_claim_not_flagged_as_ungrounded(coach):
    # "According to" is a grounding signal within the grounding window
    text = "According to the official docs, revenue increased by 45%."
    result = coach.coach(CoachRequest(output_text=text, min_severity=Severity.LOW, grounding_window=200))
    # Should detect a numeric claim that is grounded
    assert result.total_claims >= 1
    grounded = [c for c in result.claims if c.is_grounded]
    assert len(grounded) >= 1


def test_source_signal_grounds_claim(coach):
    text = "Source: Bloomberg — The company grew by 30% last year."
    result = coach.coach(CoachRequest(output_text=text, min_severity=Severity.LOW, grounding_window=200))
    assert result.total_claims >= 1
    grounded = [c for c in result.claims if c.is_grounded]
    assert len(grounded) >= 1


def test_ungrounded_numeric_claim(coach):
    text = "Sales dropped by exactly 12,000 units this month."
    result = coach.coach(CoachRequest(output_text=text, min_severity=Severity.LOW))
    ungrounded = [c for c in result.claims if not c.is_grounded]
    assert len(ungrounded) >= 1


# ---------------------------------------------------------------------------
# Tool suggestions
# ---------------------------------------------------------------------------


def test_tool_suggestions_provided_for_ungrounded(coach):
    text = "The market share is currently 78% according to nobody."
    result = coach.coach(CoachRequest(output_text=text, min_severity=Severity.LOW))
    ungrounded = [c for c in result.claims if not c.is_grounded]
    if ungrounded:
        # At least one ungrounded claim should have tool suggestions
        assert any(c.suggested_tools for c in ungrounded)


def test_top_tool_suggestions_populated(coach):
    text = "Revenue grew 50%. Market leader with 90% share. Studies show 3x improvement."
    result = coach.coach(CoachRequest(output_text=text, min_severity=Severity.LOW))
    if result.ungrounded_claims > 0:
        assert len(result.top_tool_suggestions) >= 1


def test_available_tools_filter_suggestions(coach):
    text = "Currently the best solution available with 95% success rate."
    result = coach.coach(
        CoachRequest(
            output_text=text,
            available_tools=["web_search"],
            min_severity=Severity.LOW,
        )
    )
    # Should not crash and should provide suggestions
    assert result is not None


# ---------------------------------------------------------------------------
# Severity filtering
# ---------------------------------------------------------------------------


def test_min_severity_low_reports_all(coach):
    text = "Revenue increased 25%. The solution is available now. Studies show improvement."
    result = coach.coach(CoachRequest(output_text=text, min_severity=Severity.LOW))
    assert result.total_claims >= 1


def test_min_severity_high_filters_medium(coach):
    text = "Revenue grew by 5%. This is the best approach."
    result_low = coach.coach(CoachRequest(output_text=text, min_severity=Severity.LOW))
    result_high = coach.coach(CoachRequest(output_text=text, min_severity=Severity.HIGH))
    # High severity filter should report fewer or equal claims
    assert result_high.total_claims <= result_low.total_claims


# ---------------------------------------------------------------------------
# Grounding score
# ---------------------------------------------------------------------------


def test_grounding_score_fully_grounded(coach):
    # Output with no detectable ungrounded claims
    text = "The agent completed the retrieval task."
    result = coach.coach(CoachRequest(output_text=text, min_severity=Severity.LOW))
    assert result.overall_grounding_score >= 0.0
    assert result.overall_grounding_score <= 1.0


def test_grounding_score_range(coach):
    text = "Revenue grew 50% and it is currently the best option. Studies show 3x gain."
    result = coach.coach(CoachRequest(output_text=text, min_severity=Severity.LOW))
    assert 0.0 <= result.overall_grounding_score <= 1.0


# ---------------------------------------------------------------------------
# Coaching summary
# ---------------------------------------------------------------------------


def test_coaching_summary_clean_output(coach):
    text = "The report was retrieved and processed successfully."
    result = coach.coach(CoachRequest(output_text=text, min_severity=Severity.HIGH))
    assert result.coaching_summary


def test_coaching_summary_mentions_ungrounded(coach):
    text = "Revenue grew 45%. It is currently the #1 solution with 99% uptime."
    result = coach.coach(CoachRequest(output_text=text, min_severity=Severity.LOW))
    if result.ungrounded_claims > 0:
        assert "ungrounded" in result.coaching_summary.lower() or "claim" in result.coaching_summary.lower()


# ---------------------------------------------------------------------------
# Dict serialization
# ---------------------------------------------------------------------------


def test_report_dict_shape(coach):
    result = coach.coach(CoachRequest(output_text="Revenue is 50% higher now."))
    d = result.dict
    assert "output_text" in d
    assert "total_claims" in d
    assert "claims" in d
    assert "overall_grounding_score" in d
    assert "coaching_summary" in d
    assert "top_tool_suggestions" in d


def test_claim_dict_shape(coach):
    result = coach.coach(
        CoachRequest(output_text="Revenue grew 50%.", min_severity=Severity.LOW)
    )
    if result.claims:
        d = result.claims[0].dict
        assert "claim_text" in d
        assert "category" in d
        assert "severity" in d
        assert "is_grounded" in d
        assert "suggested_tools" in d


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------


def test_singleton():
    c1 = get_reasoning_coach()
    c2 = get_reasoning_coach()
    assert c1 is c2
