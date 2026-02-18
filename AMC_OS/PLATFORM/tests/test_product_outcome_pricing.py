"""Tests for amc.product.outcome_pricing — Outcome-Based Pricing."""
from __future__ import annotations
import pytest

from amc.product.outcome_pricing import (
    OutcomeStatus,
    BillingMode,
    BillingStatus,
    ContractCreateInput,
    ContractUpdateInput,
    OutcomeRecordInput,
    OutcomeVerifyInput,
    BillingEventInput,
    BillingStatusUpdateInput,
    OutcomePricingManager,
    calculate_billing_amount,
)


@pytest.fixture()
def mgr(tmp_path):
    return OutcomePricingManager(db_path=tmp_path / "outcome.db")


def _make_contract(tenant_id="t1", outcome_type="deal_closed", take_rate=0.10, **kwargs):
    return ContractCreateInput(
        tenant_id=tenant_id, name="Test Contract",
        outcome_type=outcome_type, take_rate=take_rate, **kwargs
    )


# ---------------------------------------------------------------------------
# Billing calculation (pure)
# ---------------------------------------------------------------------------

def test_calculate_billing_amount_basic():
    assert calculate_billing_amount(1000.0, 0.10, None) == 100.0


def test_calculate_billing_amount_with_cap():
    assert calculate_billing_amount(10000.0, 0.20, max_take_usd=500.0) == 500.0


def test_calculate_billing_amount_zero():
    assert calculate_billing_amount(0.0, 0.15, None) == 0.0


def test_calculate_billing_amount_below_cap():
    assert calculate_billing_amount(100.0, 0.10, max_take_usd=50.0) == 10.0


# ---------------------------------------------------------------------------
# Contracts
# ---------------------------------------------------------------------------

def test_create_contract(mgr):
    contract = mgr.create_contract(_make_contract(
        outcome_type="deal_closed", take_rate=0.15,
        min_outcome_usd=100.0, max_take_usd=5000.0,
        billing_mode=BillingMode.REALTIME,
    ))
    assert contract.contract_id
    assert contract.take_rate == 0.15
    assert contract.min_outcome_usd == 100.0
    assert contract.max_take_usd == 5000.0
    assert contract.active is True


def test_get_contract(mgr):
    c = mgr.create_contract(_make_contract())
    fetched = mgr.get_contract(c.contract_id)
    assert fetched.contract_id == c.contract_id


def test_get_unknown_contract(mgr):
    assert mgr.get_contract("bad-id") is None


def test_update_contract(mgr):
    c = mgr.create_contract(_make_contract(take_rate=0.10))
    updated = mgr.update_contract(ContractUpdateInput(
        contract_id=c.contract_id, take_rate=0.12, active=True
    ))
    assert updated.take_rate == 0.12


def test_deactivate_contract(mgr):
    c = mgr.create_contract(_make_contract())
    deactivated = mgr.update_contract(ContractUpdateInput(
        contract_id=c.contract_id, active=False
    ))
    assert deactivated.active is False


def test_list_contracts(mgr):
    mgr.create_contract(_make_contract(tenant_id="t1", outcome_type="deal_closed"))
    mgr.create_contract(_make_contract(tenant_id="t1", outcome_type="lead_converted"))
    mgr.create_contract(_make_contract(tenant_id="t2", outcome_type="email_replied"))
    result = mgr.list_contracts("t1")
    assert len(result) == 2


def test_list_contracts_active_only(mgr):
    c1 = mgr.create_contract(_make_contract(outcome_type="a"))
    c2 = mgr.create_contract(_make_contract(outcome_type="b"))
    mgr.update_contract(ContractUpdateInput(contract_id=c1.contract_id, active=False))
    active = mgr.list_contracts("t1", active_only=True)
    assert len(active) == 1
    assert active[0].contract_id == c2.contract_id


# ---------------------------------------------------------------------------
# Outcome records
# ---------------------------------------------------------------------------

def test_record_outcome(mgr):
    c = mgr.create_contract(_make_contract(
        take_rate=0.10, billing_mode=BillingMode.MONTHLY
    ))
    outcome = mgr.record_outcome(OutcomeRecordInput(
        contract_id=c.contract_id,
        job_id="job-001",
        outcome_type="deal_closed",
        outcome_value=5000.0,
        evidence={"deal_id": "CRM-123"},
    ))
    assert outcome.outcome_id
    assert outcome.outcome_value == 5000.0
    assert outcome.billing_amount == pytest.approx(500.0)
    assert outcome.status == OutcomeStatus.PENDING.value


def test_record_outcome_realtime_emits_billing(mgr):
    c = mgr.create_contract(_make_contract(
        take_rate=0.05, billing_mode=BillingMode.REALTIME
    ))
    outcome = mgr.record_outcome(OutcomeRecordInput(
        contract_id=c.contract_id,
        job_id="job-002",
        outcome_type="deal_closed",
        outcome_value=1000.0,
    ))
    events = mgr.list_billing_events("t1")
    assert any(e.outcome_id == outcome.outcome_id for e in events)


def test_record_outcome_inactive_contract_raises(mgr):
    c = mgr.create_contract(_make_contract())
    mgr.update_contract(ContractUpdateInput(contract_id=c.contract_id, active=False))
    with pytest.raises(ValueError, match="inactive"):
        mgr.record_outcome(OutcomeRecordInput(
            contract_id=c.contract_id, job_id="j", outcome_type="x", outcome_value=100.0
        ))


def test_verify_outcome(mgr):
    c = mgr.create_contract(_make_contract(billing_mode=BillingMode.MONTHLY))
    outcome = mgr.record_outcome(OutcomeRecordInput(
        contract_id=c.contract_id, job_id="j", outcome_type="deal_closed", outcome_value=200.0
    ))
    verified = mgr.verify_outcome(OutcomeVerifyInput(
        outcome_id=outcome.outcome_id,
        verified_by="finance-team",
        status=OutcomeStatus.VERIFIED,
    ))
    assert verified.status == OutcomeStatus.VERIFIED.value
    assert verified.verified_at is not None


def test_list_outcomes(mgr):
    c = mgr.create_contract(_make_contract(billing_mode=BillingMode.MONTHLY))
    for i in range(3):
        mgr.record_outcome(OutcomeRecordInput(
            contract_id=c.contract_id, job_id=f"j{i}",
            outcome_type="deal_closed", outcome_value=float(100 * (i + 1))
        ))
    outcomes = mgr.list_outcomes("t1")
    assert len(outcomes) == 3


# ---------------------------------------------------------------------------
# Billing events
# ---------------------------------------------------------------------------

def test_emit_billing_event_manually(mgr):
    c = mgr.create_contract(_make_contract(
        take_rate=0.10, billing_mode=BillingMode.MONTHLY
    ))
    outcome = mgr.record_outcome(OutcomeRecordInput(
        contract_id=c.contract_id, job_id="j1",
        outcome_type="lead_converted", outcome_value=500.0,
    ))
    event = mgr.emit_billing_event(BillingEventInput(
        outcome_id=outcome.outcome_id, external_ref="stripe-pi-123"
    ))
    assert event.billing_amount == pytest.approx(50.0)
    assert event.billing_status == BillingStatus.PENDING.value
    assert event.external_ref == "stripe-pi-123"


def test_update_billing_status_to_paid(mgr):
    c = mgr.create_contract(_make_contract(
        take_rate=0.10, billing_mode=BillingMode.MONTHLY
    ))
    outcome = mgr.record_outcome(OutcomeRecordInput(
        contract_id=c.contract_id, job_id="j1",
        outcome_type="deal", outcome_value=1000.0,
    ))
    event = mgr.emit_billing_event(BillingEventInput(outcome_id=outcome.outcome_id))
    paid = mgr.update_billing_status(BillingStatusUpdateInput(
        event_id=event.event_id, billing_status=BillingStatus.PAID
    ))
    assert paid.billing_status == BillingStatus.PAID.value
    assert paid.paid_at is not None


def test_billing_summary(mgr):
    c = mgr.create_contract(_make_contract(take_rate=0.10, billing_mode=BillingMode.REALTIME))
    mgr.record_outcome(OutcomeRecordInput(
        contract_id=c.contract_id, job_id="j1",
        outcome_type="deal", outcome_value=1000.0,
    ))
    mgr.record_outcome(OutcomeRecordInput(
        contract_id=c.contract_id, job_id="j2",
        outcome_type="deal", outcome_value=2000.0,
    ))
    summary = mgr.billing_summary("t1")
    assert summary["total_events"] == 2
    assert summary["total_billed_usd"] == pytest.approx(300.0)
    assert summary["total_pending_usd"] == pytest.approx(300.0)


def test_list_billing_events_by_status(mgr):
    c = mgr.create_contract(_make_contract(take_rate=0.10, billing_mode=BillingMode.MONTHLY))
    outcome = mgr.record_outcome(OutcomeRecordInput(
        contract_id=c.contract_id, job_id="j1",
        outcome_type="deal", outcome_value=100.0,
    ))
    event = mgr.emit_billing_event(BillingEventInput(outcome_id=outcome.outcome_id))
    mgr.update_billing_status(BillingStatusUpdateInput(
        event_id=event.event_id, billing_status=BillingStatus.INVOICED
    ))
    invoiced = mgr.list_billing_events("t1", billing_status=BillingStatus.INVOICED.value)
    assert len(invoiced) == 1
