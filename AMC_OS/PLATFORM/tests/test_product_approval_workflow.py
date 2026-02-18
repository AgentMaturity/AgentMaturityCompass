"""Tests for amc.product.approval_workflow — Draft→Approve→Send Workflow."""
from __future__ import annotations
import pytest

from amc.product.approval_workflow import (
    DraftStatus,
    ApprovalDecision,
    DraftCreateInput,
    DraftUpdateInput,
    SubmitForApprovalInput,
    ApprovalDecisionInput,
    RevisionInput,
    SendInput,
    ApprovalWorkflowManager,
)


@pytest.fixture()
def mgr(tmp_path):
    return ApprovalWorkflowManager(db_path=tmp_path / "approvals.db")


# ---------------------------------------------------------------------------
# Draft CRUD
# ---------------------------------------------------------------------------

def test_create_draft(mgr):
    draft = mgr.create_draft(DraftCreateInput(
        tenant_id="t1", author_id="user-1",
        title="Q1 Outreach", content="Hello {name}!",
        draft_type="email", metadata={"campaign": "q1"}
    ))
    assert draft.draft_id
    assert draft.status == DraftStatus.DRAFT.value
    assert draft.version == 1
    assert draft.content == "Hello {name}!"
    assert draft.metadata["campaign"] == "q1"


def test_get_draft(mgr):
    d = mgr.create_draft(DraftCreateInput(tenant_id="t1", author_id="u1", title="X", content="X"))
    fetched = mgr.get_draft(d.draft_id)
    assert fetched.draft_id == d.draft_id


def test_get_unknown_draft(mgr):
    assert mgr.get_draft("nonexistent") is None


def test_update_draft(mgr):
    draft = mgr.create_draft(DraftCreateInput(tenant_id="t1", author_id="u1", title="V1", content="old"))
    updated = mgr.update_draft(DraftUpdateInput(
        draft_id=draft.draft_id, content="new content", title="V2"
    ))
    assert updated.content == "new content"
    assert updated.title == "V2"
    assert updated.version == 2


def test_update_submitted_draft_raises(mgr):
    draft = mgr.create_draft(DraftCreateInput(tenant_id="t1", author_id="u1", title="X", content="X"))
    mgr.submit_for_approval(SubmitForApprovalInput(
        draft_id=draft.draft_id, approver_ids=["approver-1"]
    ))
    with pytest.raises(ValueError, match="cannot be edited"):
        mgr.update_draft(DraftUpdateInput(draft_id=draft.draft_id, content="new"))


def test_list_drafts_filtered(mgr):
    mgr.create_draft(DraftCreateInput(tenant_id="t1", author_id="u1", title="A", content="A"))
    mgr.create_draft(DraftCreateInput(tenant_id="t1", author_id="u1", title="B", content="B"))
    mgr.create_draft(DraftCreateInput(tenant_id="t2", author_id="u2", title="C", content="C"))
    result = mgr.list_drafts(tenant_id="t1")
    assert len(result) == 2
    assert all(d.tenant_id == "t1" for d in result)


# ---------------------------------------------------------------------------
# Approval routing
# ---------------------------------------------------------------------------

def test_submit_for_approval(mgr):
    draft = mgr.create_draft(DraftCreateInput(tenant_id="t1", author_id="u1", title="X", content="X"))
    reqs = mgr.submit_for_approval(SubmitForApprovalInput(
        draft_id=draft.draft_id, approver_ids=["approver-1", "approver-2"]
    ))
    assert len(reqs) == 2
    assert all(r.status == "pending" for r in reqs)
    updated_draft = mgr.get_draft(draft.draft_id)
    assert updated_draft.status == DraftStatus.PENDING_APPROVAL.value


def test_submit_without_approvers_raises(mgr):
    draft = mgr.create_draft(DraftCreateInput(tenant_id="t1", author_id="u1", title="X", content="X"))
    with pytest.raises(ValueError, match="At least one approver"):
        mgr.submit_for_approval(SubmitForApprovalInput(
            draft_id=draft.draft_id, approver_ids=[]
        ))


def test_approve_single_approver(mgr):
    draft = mgr.create_draft(DraftCreateInput(tenant_id="t1", author_id="u1", title="X", content="X"))
    reqs = mgr.submit_for_approval(SubmitForApprovalInput(
        draft_id=draft.draft_id, approver_ids=["approver-1"]
    ))
    req = mgr.decide(ApprovalDecisionInput(
        request_id=reqs[0].request_id,
        approver_id="approver-1",
        decision=ApprovalDecision.APPROVED,
        note="LGTM",
    ))
    assert req.status == "approved"
    draft_after = mgr.get_draft(draft.draft_id)
    assert draft_after.status == DraftStatus.APPROVED.value


def test_reject_draft(mgr):
    draft = mgr.create_draft(DraftCreateInput(tenant_id="t1", author_id="u1", title="X", content="X"))
    reqs = mgr.submit_for_approval(SubmitForApprovalInput(
        draft_id=draft.draft_id, approver_ids=["approver-1"]
    ))
    mgr.decide(ApprovalDecisionInput(
        request_id=reqs[0].request_id,
        approver_id="approver-1",
        decision=ApprovalDecision.REJECTED,
        note="Needs work",
    ))
    draft_after = mgr.get_draft(draft.draft_id)
    assert draft_after.status == DraftStatus.REJECTED.value


def test_decide_wrong_approver_raises(mgr):
    draft = mgr.create_draft(DraftCreateInput(tenant_id="t1", author_id="u1", title="X", content="X"))
    reqs = mgr.submit_for_approval(SubmitForApprovalInput(
        draft_id=draft.draft_id, approver_ids=["approver-1"]
    ))
    with pytest.raises(ValueError, match="Approver mismatch"):
        mgr.decide(ApprovalDecisionInput(
            request_id=reqs[0].request_id,
            approver_id="wrong-approver",
            decision=ApprovalDecision.APPROVED,
        ))


def test_list_requests(mgr):
    draft = mgr.create_draft(DraftCreateInput(tenant_id="t1", author_id="u1", title="X", content="X"))
    mgr.submit_for_approval(SubmitForApprovalInput(
        draft_id=draft.draft_id, approver_ids=["a1", "a2"]
    ))
    requests = mgr.list_requests(draft_id=draft.draft_id)
    assert len(requests) == 2


# ---------------------------------------------------------------------------
# Revision
# ---------------------------------------------------------------------------

def test_revision_flow(mgr):
    draft = mgr.create_draft(DraftCreateInput(tenant_id="t1", author_id="u1", title="X", content="v1"))
    reqs = mgr.submit_for_approval(SubmitForApprovalInput(
        draft_id=draft.draft_id, approver_ids=["approver-1"]
    ))
    mgr.decide(ApprovalDecisionInput(
        request_id=reqs[0].request_id,
        approver_id="approver-1",
        decision=ApprovalDecision.REJECTED,
        note="Fix it",
    ))
    rev = mgr.submit_revision(RevisionInput(
        draft_id=draft.draft_id,
        request_id=reqs[0].request_id,
        revised_by="u1",
        revision_note="Fixed the tone",
        new_content="v2 improved content",
    ))
    assert rev.new_content == "v2 improved content"
    draft_after = mgr.get_draft(draft.draft_id)
    assert draft_after.status == DraftStatus.IN_REVISION.value
    assert draft_after.content == "v2 improved content"
    assert draft_after.version >= 2  # original 1, +1 for revision


def test_revision_on_non_rejected_raises(mgr):
    draft = mgr.create_draft(DraftCreateInput(tenant_id="t1", author_id="u1", title="X", content="X"))
    with pytest.raises(ValueError, match="must be rejected"):
        mgr.submit_revision(RevisionInput(
            draft_id=draft.draft_id, request_id="req-x",
            revised_by="u1", revision_note="n", new_content="new"
        ))


# ---------------------------------------------------------------------------
# Send
# ---------------------------------------------------------------------------

def test_send_approved_draft(mgr):
    draft = mgr.create_draft(DraftCreateInput(tenant_id="t1", author_id="u1", title="X", content="X"))
    reqs = mgr.submit_for_approval(SubmitForApprovalInput(
        draft_id=draft.draft_id, approver_ids=["approver-1"]
    ))
    mgr.decide(ApprovalDecisionInput(
        request_id=reqs[0].request_id,
        approver_id="approver-1",
        decision=ApprovalDecision.APPROVED,
    ))
    send_ev = mgr.send_draft(SendInput(
        draft_id=draft.draft_id, sent_by="u1",
        channel="email", recipients=["alice@example.com", "bob@example.com"]
    ))
    assert send_ev.send_status == "sent"
    assert len(send_ev.recipients) == 2
    draft_after = mgr.get_draft(draft.draft_id)
    assert draft_after.status == DraftStatus.SENT.value


def test_send_unapproved_raises(mgr):
    draft = mgr.create_draft(DraftCreateInput(tenant_id="t1", author_id="u1", title="X", content="X"))
    with pytest.raises(ValueError, match="must be approved"):
        mgr.send_draft(SendInput(draft_id=draft.draft_id, sent_by="u1"))


def test_get_send_events(mgr):
    draft = mgr.create_draft(DraftCreateInput(tenant_id="t1", author_id="u1", title="X", content="X"))
    reqs = mgr.submit_for_approval(SubmitForApprovalInput(
        draft_id=draft.draft_id, approver_ids=["approver-1"]
    ))
    mgr.decide(ApprovalDecisionInput(
        request_id=reqs[0].request_id,
        approver_id="approver-1",
        decision=ApprovalDecision.APPROVED,
    ))
    mgr.send_draft(SendInput(draft_id=draft.draft_id, sent_by="u1"))
    events = mgr.get_send_events(draft.draft_id)
    assert len(events) == 1
