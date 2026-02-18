"""Tests for amc.product.retention_autopilot — Subscription Retention Autopilot."""
from __future__ import annotations
import pytest

from amc.product.retention_autopilot import (
    RiskBand,
    WinbackStatus,
    UsageSignalInput,
    ChurnScoreInput,
    WinbackTriggerInput,
    FlowEventInput,
    RetentionAutopilot,
    _compute_churn_score,
    _score_to_band,
)


@pytest.fixture()
def autopilot(tmp_path):
    return RetentionAutopilot(db_path=tmp_path / "retention.db")


# ---------------------------------------------------------------------------
# Usage signals
# ---------------------------------------------------------------------------

def test_record_signal(autopilot):
    sig = autopilot.record_signal(UsageSignalInput(
        tenant_id="t1", signal_type="logins_per_week", value=5.0,
        unit="count", period_start="2026-01-01", period_end="2026-01-07",
    ))
    assert sig.signal_id
    assert sig.tenant_id == "t1"
    assert sig.value == 5.0


def test_get_signals_for_tenant(autopilot):
    autopilot.record_signal(UsageSignalInput(
        tenant_id="t1", signal_type="logins_per_week", value=3.0,
        period_start="2026-01-01", period_end="2026-01-07"
    ))
    autopilot.record_signal(UsageSignalInput(
        tenant_id="t1", signal_type="api_calls", value=1000.0,
        period_start="2026-01-01", period_end="2026-01-07"
    ))
    autopilot.record_signal(UsageSignalInput(
        tenant_id="t2", signal_type="logins_per_week", value=1.0,
        period_start="2026-01-01", period_end="2026-01-07"
    ))
    signals = autopilot.get_signals("t1")
    assert len(signals) == 2


def test_get_signals_by_type(autopilot):
    autopilot.record_signal(UsageSignalInput(
        tenant_id="t1", signal_type="logins_per_week", value=5.0,
        period_start="2026-01-01", period_end="2026-01-07"
    ))
    autopilot.record_signal(UsageSignalInput(
        tenant_id="t1", signal_type="api_calls", value=100.0,
        period_start="2026-01-01", period_end="2026-01-07"
    ))
    login_sigs = autopilot.get_signals("t1", signal_type="logins_per_week")
    assert len(login_sigs) == 1
    assert login_sigs[0].signal_type == "logins_per_week"


# ---------------------------------------------------------------------------
# Churn scoring
# ---------------------------------------------------------------------------

def test_compute_churn_score_pure():
    """Unit test the scoring function with no DB."""
    from amc.product.retention_autopilot import UsageSignalRecord
    now = "2026-01-07"
    signals = [
        UsageSignalRecord(
            signal_id="s1", tenant_id="t1", signal_type="logins_per_week",
            value=5.0, unit="count", period_start="2026-01-01",
            period_end=now, metadata={}, recorded_at=now
        ),
        UsageSignalRecord(
            signal_id="s2", tenant_id="t1", signal_type="payment_failures",
            value=2.0, unit="count", period_start="2026-01-01",
            period_end=now, metadata={}, recorded_at=now
        ),
    ]
    score, factors = _compute_churn_score(signals)
    assert 0.0 <= score <= 100.0
    assert any(f["signal_type"] == "logins_per_week" for f in factors)
    # More logins → lower score
    base = 40.0
    expected = base + (-2.0 * 5.0) + (5.0 * 2.0)
    assert abs(score - max(0, min(100, expected))) < 0.01


def test_score_to_band():
    assert _score_to_band(90.0) == RiskBand.CRITICAL
    assert _score_to_band(70.0) == RiskBand.HIGH
    assert _score_to_band(45.0) == RiskBand.MEDIUM
    assert _score_to_band(10.0) == RiskBand.LOW


def test_compute_churn_score_no_signals(autopilot):
    result = autopilot.compute_churn_score(ChurnScoreInput(tenant_id="t-empty"))
    # base score 40 → medium
    assert result.tenant_id == "t-empty"
    assert result.churn_score == 40.0
    assert result.risk_band == RiskBand.MEDIUM.value


def test_compute_churn_score_high_risk(autopilot):
    result = autopilot.compute_churn_score(ChurnScoreInput(
        tenant_id="t-risky",
        signals=[
            UsageSignalInput(
                tenant_id="t-risky", signal_type="downgrade_request",
                value=1.0, period_start="2026-01-01", period_end="2026-01-07"
            ),
            UsageSignalInput(
                tenant_id="t-risky", signal_type="payment_failures",
                value=3.0, period_start="2026-01-01", period_end="2026-01-07"
            ),
        ]
    ))
    # 40 + 8 + 15 = 63 → HIGH
    assert result.risk_band in (RiskBand.HIGH.value, RiskBand.CRITICAL.value)


def test_get_latest_score(autopilot):
    autopilot.compute_churn_score(ChurnScoreInput(tenant_id="t1"))
    score = autopilot.get_latest_score("t1")
    assert score is not None
    assert score.tenant_id == "t1"


def test_get_latest_score_no_data(autopilot):
    assert autopilot.get_latest_score("unknown-tenant") is None


def test_list_scores(autopilot):
    for _ in range(3):
        autopilot.compute_churn_score(ChurnScoreInput(tenant_id="t-multi"))
    scores = autopilot.list_scores("t-multi")
    assert len(scores) == 3


# ---------------------------------------------------------------------------
# Win-back flows
# ---------------------------------------------------------------------------

def test_trigger_winback(autopilot):
    flow = autopilot.trigger_winback(WinbackTriggerInput(
        tenant_id="t1",
        trigger_reason="high_churn_score",
        flow_type="email_sequence",
    ))
    assert flow.flow_id
    assert flow.status == WinbackStatus.ACTIVE.value
    assert flow.trigger_reason == "high_churn_score"
    assert len(flow.steps) > 0  # default steps


def test_trigger_winback_custom_steps(autopilot):
    custom_steps = [
        {"step": 0, "action": "personal_call", "delay_hours": 0},
        {"step": 1, "action": "offer_free_month", "delay_hours": 24},
    ]
    flow = autopilot.trigger_winback(WinbackTriggerInput(
        tenant_id="t1", trigger_reason="low_usage",
        steps=custom_steps,
    ))
    assert len(flow.steps) == 2
    assert flow.steps[0]["action"] == "personal_call"


def test_record_flow_event(autopilot):
    flow = autopilot.trigger_winback(WinbackTriggerInput(
        tenant_id="t1", trigger_reason="test"
    ))
    event = autopilot.record_flow_event(FlowEventInput(
        flow_id=flow.flow_id, step_index=0,
        action="send_reengagement_email", result="sent",
        details={"email_id": "e-123"},
    ))
    assert event.action == "send_reengagement_email"
    assert event.result == "sent"
    updated_flow = autopilot._get_flow(flow.flow_id)
    assert updated_flow.current_step == 1


def test_complete_flow(autopilot):
    flow = autopilot.trigger_winback(WinbackTriggerInput(
        tenant_id="t1", trigger_reason="test"
    ))
    completed = autopilot.complete_flow(flow.flow_id, outcome="retained")
    assert completed.status == WinbackStatus.COMPLETED.value
    assert completed.outcome == "retained"
    assert completed.completed_at is not None


def test_list_flows(autopilot):
    autopilot.trigger_winback(WinbackTriggerInput(tenant_id="t1", trigger_reason="a"))
    autopilot.trigger_winback(WinbackTriggerInput(tenant_id="t1", trigger_reason="b"))
    flows = autopilot.list_flows("t1")
    assert len(flows) == 2


def test_list_flows_by_status(autopilot):
    flow = autopilot.trigger_winback(WinbackTriggerInput(
        tenant_id="t1", trigger_reason="x"
    ))
    autopilot.complete_flow(flow.flow_id)
    active = autopilot.list_flows("t1", status=WinbackStatus.ACTIVE.value)
    completed = autopilot.list_flows("t1", status=WinbackStatus.COMPLETED.value)
    assert any(f.flow_id == flow.flow_id for f in completed)
    assert not any(f.flow_id == flow.flow_id for f in active)
