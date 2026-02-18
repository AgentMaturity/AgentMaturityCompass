"""Tests for amc.product.onboarding_wizard — Agent Onboarding Wizard."""
from __future__ import annotations
import pytest

from amc.product.onboarding_wizard import (
    OnboardingStep,
    OnboardingStatus,
    OAuthStatus,
    StartSessionInput,
    StepAdvanceInput,
    OAuthConnectionInput,
    WorkflowSelectionInput,
    FirstRunInput,
    PreferencesInput,
    OnboardingWizard,
)


@pytest.fixture()
def wizard(tmp_path):
    return OnboardingWizard(db_path=tmp_path / "onboarding.db")


# ---------------------------------------------------------------------------
# Session lifecycle
# ---------------------------------------------------------------------------

def test_start_session(wizard):
    sess = wizard.start_session(StartSessionInput(
        tenant_id="t1", agent_id="agent-1", org_name="ACME Corp"
    ))
    assert sess.session_id
    assert sess.tenant_id == "t1"
    assert sess.agent_id == "agent-1"
    assert sess.current_step == OnboardingStep.WELCOME.value
    assert sess.status == OnboardingStatus.IN_PROGRESS.value
    assert sess.data["org_name"] == "ACME Corp"


def test_get_session_returns_none_for_unknown(wizard):
    assert wizard.get_session("nonexistent") is None


def test_advance_step_moves_to_next(wizard):
    sess = wizard.start_session(StartSessionInput(tenant_id="t1", agent_id="a1"))
    advanced = wizard.advance_step(StepAdvanceInput(
        session_id=sess.session_id, step_data={"verified": True}
    ))
    assert advanced.current_step == OnboardingStep.OAUTH.value
    assert advanced.data["verified"] is True


def test_advance_step_through_all_steps(wizard):
    sess = wizard.start_session(StartSessionInput(tenant_id="t1", agent_id="a1"))
    steps_count = len(OnboardingStep) - 1  # exclude welcome (already there)
    for _ in range(steps_count - 1):  # stop before complete
        sess = wizard.advance_step(StepAdvanceInput(session_id=sess.session_id))

    # Advance to complete
    final = wizard.advance_step(StepAdvanceInput(session_id=sess.session_id))
    assert final.current_step == OnboardingStep.COMPLETE.value
    assert final.status == OnboardingStatus.COMPLETED.value
    assert final.completed_at is not None


def test_advance_completed_session_raises(wizard):
    sess = wizard.start_session(StartSessionInput(tenant_id="t1", agent_id="a1"))
    # rush to complete
    steps_to_complete = len(OnboardingStep) - 1
    for _ in range(steps_to_complete):
        sess = wizard.advance_step(StepAdvanceInput(session_id=sess.session_id))
    with pytest.raises(ValueError, match="cannot advance"):
        wizard.advance_step(StepAdvanceInput(session_id=sess.session_id))


def test_abandon_session(wizard):
    sess = wizard.start_session(StartSessionInput(tenant_id="t1", agent_id="a1"))
    abandoned = wizard.abandon_session(sess.session_id)
    assert abandoned.status == OnboardingStatus.ABANDONED.value


def test_list_sessions_filtered(wizard):
    wizard.start_session(StartSessionInput(tenant_id="t2", agent_id="a1"))
    wizard.start_session(StartSessionInput(tenant_id="t2", agent_id="a2"))
    wizard.start_session(StartSessionInput(tenant_id="t3", agent_id="a3"))
    result = wizard.list_sessions(tenant_id="t2")
    assert len(result) == 2
    assert all(s.tenant_id == "t2" for s in result)


def test_list_sessions_by_status(wizard):
    sess = wizard.start_session(StartSessionInput(tenant_id="t1", agent_id="a1"))
    wizard.abandon_session(sess.session_id)
    active = wizard.list_sessions(status=OnboardingStatus.IN_PROGRESS.value)
    abandoned = wizard.list_sessions(status=OnboardingStatus.ABANDONED.value)
    assert any(s.session_id == sess.session_id for s in abandoned)


# ---------------------------------------------------------------------------
# OAuth connections
# ---------------------------------------------------------------------------

def test_add_oauth_connection_pending(wizard):
    sess = wizard.start_session(StartSessionInput(tenant_id="t1", agent_id="a1"))
    conn = wizard.add_oauth_connection(OAuthConnectionInput(
        session_id=sess.session_id, provider="google", scopes=["email", "calendar"]
    ))
    assert conn.provider == "google"
    assert conn.status == OAuthStatus.PENDING.value
    assert "email" in conn.scopes


def test_add_oauth_connection_connected(wizard):
    sess = wizard.start_session(StartSessionInput(tenant_id="t1", agent_id="a1"))
    conn = wizard.add_oauth_connection(OAuthConnectionInput(
        session_id=sess.session_id, provider="slack",
        access_token="tok-123", scopes=["channels:read"]
    ))
    assert conn.status == OAuthStatus.CONNECTED.value


def test_list_oauth_connections(wizard):
    sess = wizard.start_session(StartSessionInput(tenant_id="t1", agent_id="a1"))
    wizard.add_oauth_connection(OAuthConnectionInput(session_id=sess.session_id, provider="google"))
    wizard.add_oauth_connection(OAuthConnectionInput(session_id=sess.session_id, provider="hubspot"))
    conns = wizard.list_oauth_connections(sess.session_id)
    assert len(conns) == 2
    providers = {c.provider for c in conns}
    assert providers == {"google", "hubspot"}


# ---------------------------------------------------------------------------
# Workflow selections
# ---------------------------------------------------------------------------

def test_select_workflow(wizard):
    sess = wizard.start_session(StartSessionInput(tenant_id="t1", agent_id="a1"))
    sel = wizard.select_workflow(WorkflowSelectionInput(
        session_id=sess.session_id,
        workflow_id="wf-email-outreach",
        workflow_name="Email Outreach",
        enabled=True,
    ))
    assert sel.workflow_id == "wf-email-outreach"
    assert sel.enabled is True


def test_upsert_workflow_selection(wizard):
    sess = wizard.start_session(StartSessionInput(tenant_id="t1", agent_id="a1"))
    wizard.select_workflow(WorkflowSelectionInput(
        session_id=sess.session_id, workflow_id="wf-1", workflow_name="WF1", enabled=True
    ))
    # Update via upsert
    sel2 = wizard.select_workflow(WorkflowSelectionInput(
        session_id=sess.session_id, workflow_id="wf-1", workflow_name="WF1", enabled=False
    ))
    assert sel2.enabled is False
    # Should still be one record
    selections = wizard.list_workflow_selections(sess.session_id)
    assert len(selections) == 1


def test_list_workflow_selections(wizard):
    sess = wizard.start_session(StartSessionInput(tenant_id="t1", agent_id="a1"))
    wizard.select_workflow(WorkflowSelectionInput(session_id=sess.session_id, workflow_id="wf-a", workflow_name="A"))
    wizard.select_workflow(WorkflowSelectionInput(session_id=sess.session_id, workflow_id="wf-b", workflow_name="B"))
    sels = wizard.list_workflow_selections(sess.session_id)
    assert len(sels) == 2


# ---------------------------------------------------------------------------
# First-run
# ---------------------------------------------------------------------------

def test_record_first_run_success(wizard):
    sess = wizard.start_session(StartSessionInput(tenant_id="t1", agent_id="a1"))
    result = wizard.record_first_run(FirstRunInput(
        session_id=sess.session_id, job_id="job-001",
        success=True, output_preview="Email sent successfully!",
        metrics={"duration_ms": 1200, "tokens": 500},
    ))
    assert result.success is True
    assert result.job_id == "job-001"
    assert result.metrics["duration_ms"] == 1200


def test_record_first_run_failure(wizard):
    sess = wizard.start_session(StartSessionInput(tenant_id="t1", agent_id="a1"))
    result = wizard.record_first_run(FirstRunInput(
        session_id=sess.session_id, job_id="job-002", success=False
    ))
    assert result.success is False


def test_get_first_run_result(wizard):
    sess = wizard.start_session(StartSessionInput(tenant_id="t1", agent_id="a1"))
    wizard.record_first_run(FirstRunInput(
        session_id=sess.session_id, job_id="job-x", success=True
    ))
    fetched = wizard.get_first_run_result(sess.session_id)
    assert fetched is not None
    assert fetched.job_id == "job-x"


def test_no_first_run_returns_none(wizard):
    sess = wizard.start_session(StartSessionInput(tenant_id="t1", agent_id="a1"))
    assert wizard.get_first_run_result(sess.session_id) is None
