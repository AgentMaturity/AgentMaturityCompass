"""Tests for amc.product.collaboration — Team Collaboration Mode."""
from __future__ import annotations
import pytest

from amc.product.collaboration import (
    ActorType,
    TaskStatus,
    HandoffStatus,
    TaskCreateInput,
    TaskUpdateInput,
    AssignInput,
    HandoffInput,
    HandoffAckInput,
    CommentInput,
    CollaborationManager,
)


@pytest.fixture()
def collab(tmp_path):
    return CollaborationManager(db_path=tmp_path / "collab.db")


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

def test_create_task(collab):
    task = collab.create_task(TaskCreateInput(
        tenant_id="t1", title="Write proposal",
        description="Draft Q1 proposal", task_type="writing",
        owner_id="alice", owner_type=ActorType.HUMAN,
        priority=8, tags=["sales", "q1"]
    ))
    assert task.task_id
    assert task.status == TaskStatus.OPEN.value
    assert task.priority == 8
    assert "sales" in task.tags


def test_get_task(collab):
    t = collab.create_task(TaskCreateInput(
        tenant_id="t1", title="Test", owner_id="u1"
    ))
    fetched = collab.get_task(t.task_id)
    assert fetched.task_id == t.task_id


def test_get_unknown_task(collab):
    assert collab.get_task("nonexistent") is None


def test_update_task_status(collab):
    task = collab.create_task(TaskCreateInput(tenant_id="t1", title="X", owner_id="u1"))
    updated = collab.update_task(TaskUpdateInput(
        task_id=task.task_id,
        status=TaskStatus.IN_PROGRESS,
        description="Updated description",
    ))
    assert updated.status == TaskStatus.IN_PROGRESS.value
    assert updated.description == "Updated description"


def test_close_task_sets_closed_at(collab):
    task = collab.create_task(TaskCreateInput(tenant_id="t1", title="X", owner_id="u1"))
    closed = collab.update_task(TaskUpdateInput(task_id=task.task_id, status=TaskStatus.DONE))
    assert closed.closed_at is not None


def test_assign_task(collab):
    task = collab.create_task(TaskCreateInput(tenant_id="t1", title="X", owner_id="u1"))
    assigned = collab.assign_task(AssignInput(
        task_id=task.task_id, assignee_id="agent-007", assignee_type=ActorType.AGENT
    ))
    assert assigned.assignee_id == "agent-007"
    assert assigned.assignee_type == ActorType.AGENT.value
    assert assigned.status == TaskStatus.IN_PROGRESS.value


def test_list_tasks_by_owner(collab):
    collab.create_task(TaskCreateInput(tenant_id="t1", title="A", owner_id="alice"))
    collab.create_task(TaskCreateInput(tenant_id="t1", title="B", owner_id="alice"))
    collab.create_task(TaskCreateInput(tenant_id="t1", title="C", owner_id="bob"))
    result = collab.list_tasks(owner_id="alice")
    assert len(result) == 2
    assert all(t.owner_id == "alice" for t in result)


def test_list_tasks_by_tenant(collab):
    collab.create_task(TaskCreateInput(tenant_id="t1", title="A", owner_id="u1"))
    collab.create_task(TaskCreateInput(tenant_id="t2", title="B", owner_id="u2"))
    result = collab.list_tasks(tenant_id="t1")
    assert len(result) == 1


def test_list_tasks_by_status(collab):
    task = collab.create_task(TaskCreateInput(tenant_id="t1", title="X", owner_id="u1"))
    collab.update_task(TaskUpdateInput(task_id=task.task_id, status=TaskStatus.DONE))
    done = collab.list_tasks(tenant_id="t1", status=TaskStatus.DONE.value)
    assert any(t.task_id == task.task_id for t in done)


# ---------------------------------------------------------------------------
# Handoffs
# ---------------------------------------------------------------------------

def test_create_handoff(collab):
    task = collab.create_task(TaskCreateInput(tenant_id="t1", title="X", owner_id="u1"))
    handoff = collab.create_handoff(HandoffInput(
        task_id=task.task_id,
        from_actor_id="alice",
        from_actor_type=ActorType.HUMAN,
        to_actor_id="agent-1",
        to_actor_type=ActorType.AGENT,
        reason="Too complex for manual",
        context={"urgency": "high"},
    ))
    assert handoff.handoff_id
    assert handoff.status == HandoffStatus.PENDING.value
    assert handoff.from_actor_id == "alice"
    assert handoff.to_actor_id == "agent-1"
    assert handoff.context["urgency"] == "high"


def test_acknowledge_handoff(collab):
    task = collab.create_task(TaskCreateInput(tenant_id="t1", title="X", owner_id="u1"))
    handoff = collab.create_handoff(HandoffInput(
        task_id=task.task_id,
        from_actor_id="u1", from_actor_type=ActorType.HUMAN,
        to_actor_id="agent-1", to_actor_type=ActorType.AGENT,
    ))
    acked = collab.acknowledge_handoff(HandoffAckInput(
        handoff_id=handoff.handoff_id, actor_id="agent-1"
    ))
    assert acked.status == HandoffStatus.ACKNOWLEDGED.value
    assert acked.acknowledged_at is not None


def test_list_handoffs_for_task(collab):
    task = collab.create_task(TaskCreateInput(tenant_id="t1", title="X", owner_id="u1"))
    collab.create_handoff(HandoffInput(
        task_id=task.task_id,
        from_actor_id="u1", from_actor_type=ActorType.HUMAN,
        to_actor_id="agent-1", to_actor_type=ActorType.AGENT,
    ))
    collab.create_handoff(HandoffInput(
        task_id=task.task_id,
        from_actor_id="agent-1", from_actor_type=ActorType.AGENT,
        to_actor_id="u1", to_actor_type=ActorType.HUMAN,
    ))
    handoffs = collab.list_handoffs(task.task_id)
    assert len(handoffs) == 2


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

def test_add_comment(collab):
    task = collab.create_task(TaskCreateInput(tenant_id="t1", title="X", owner_id="u1"))
    comment = collab.add_comment(CommentInput(
        task_id=task.task_id, author_id="alice",
        author_type=ActorType.HUMAN, body="Looks good!",
    ))
    assert comment.comment_id
    assert comment.body == "Looks good!"
    assert comment.author_id == "alice"


def test_add_reply_comment(collab):
    task = collab.create_task(TaskCreateInput(tenant_id="t1", title="X", owner_id="u1"))
    parent = collab.add_comment(CommentInput(
        task_id=task.task_id, author_id="alice", body="Parent"
    ))
    reply = collab.add_comment(CommentInput(
        task_id=task.task_id, author_id="bob",
        body="Reply", parent_comment_id=parent.comment_id
    ))
    assert reply.parent_comment_id == parent.comment_id


def test_list_comments(collab):
    task = collab.create_task(TaskCreateInput(tenant_id="t1", title="X", owner_id="u1"))
    collab.add_comment(CommentInput(task_id=task.task_id, author_id="u1", body="First"))
    collab.add_comment(CommentInput(task_id=task.task_id, author_id="u2", body="Second"))
    comments = collab.list_comments(task.task_id)
    assert len(comments) == 2
    assert comments[0].body == "First"


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

def test_notifications_created_on_assign(collab):
    task = collab.create_task(TaskCreateInput(tenant_id="t1", title="X", owner_id="u1"))
    collab.assign_task(AssignInput(task_id=task.task_id, assignee_id="agent-1"))
    notifs = collab.get_notifications(recipient_id="agent-1")
    assert len(notifs) >= 1
    assert notifs[0].notif_type == "task_assigned"


def test_notifications_created_on_handoff(collab):
    task = collab.create_task(TaskCreateInput(tenant_id="t1", title="X", owner_id="u1"))
    collab.create_handoff(HandoffInput(
        task_id=task.task_id,
        from_actor_id="u1", from_actor_type=ActorType.HUMAN,
        to_actor_id="agent-99", to_actor_type=ActorType.AGENT,
    ))
    notifs = collab.get_notifications(recipient_id="agent-99")
    assert any(n.notif_type == "handoff_request" for n in notifs)


def test_mark_notification_delivered(collab):
    task = collab.create_task(TaskCreateInput(tenant_id="t1", title="X", owner_id="u1"))
    collab.assign_task(AssignInput(task_id=task.task_id, assignee_id="agent-1"))
    notifs = collab.get_notifications(recipient_id="agent-1", unread_only=True)
    assert len(notifs) >= 1
    collab.mark_notification_delivered(notifs[0].notif_id)
    unread_after = collab.get_notifications(recipient_id="agent-1", unread_only=True)
    assert all(n.notif_id != notifs[0].notif_id for n in unread_after)
