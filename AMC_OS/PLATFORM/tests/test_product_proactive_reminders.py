"""Tests for amc.product.proactive_reminders — Proactive Reminders & Follow-ups."""
from __future__ import annotations
import pytest
from datetime import datetime, timedelta, timezone

from amc.product.proactive_reminders import (
    ReminderType,
    ReminderStatus,
    SubscriptionInput,
    ReminderCreateInput,
    SnoozeInput,
    ProactiveReminderManager,
)


@pytest.fixture()
def mgr(tmp_path):
    return ProactiveReminderManager(db_path=tmp_path / "reminders.db")


def _future(hours: int = 24) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def _past(hours: int = 1) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()


# ---------------------------------------------------------------------------
# Subscriptions
# ---------------------------------------------------------------------------

def test_subscribe(mgr):
    sub = mgr.subscribe(SubscriptionInput(
        tenant_id="t1", owner_id="user-1",
        reminder_type=ReminderType.FOLLOW_UP,
        label="Follow-up subscription",
        channels=["email", "slack"],
    ))
    assert sub.sub_id
    assert sub.opt_in is True
    assert "email" in sub.channels
    assert "slack" in sub.channels


def test_subscribe_idempotent(mgr):
    mgr.subscribe(SubscriptionInput(
        tenant_id="t1", owner_id="u1",
        reminder_type=ReminderType.RENEWAL_NUDGE,
    ))
    # Repeat subscribe updates existing
    sub2 = mgr.subscribe(SubscriptionInput(
        tenant_id="t1", owner_id="u1",
        reminder_type=ReminderType.RENEWAL_NUDGE,
        channels=["sms"],
    ))
    assert "sms" in sub2.channels
    # Should be one subscription
    subs = mgr.list_subscriptions("t1", owner_id="u1")
    assert len(subs) == 1


def test_unsubscribe(mgr):
    mgr.subscribe(SubscriptionInput(
        tenant_id="t1", owner_id="u1",
        reminder_type=ReminderType.FOLLOW_UP,
    ))
    result = mgr.unsubscribe("t1", "u1", ReminderType.FOLLOW_UP.value)
    assert result is True
    subs = mgr.list_subscriptions("t1", owner_id="u1", opt_in_only=True)
    assert len(subs) == 0


def test_list_subscriptions(mgr):
    mgr.subscribe(SubscriptionInput(
        tenant_id="t1", owner_id="u1", reminder_type=ReminderType.FOLLOW_UP
    ))
    mgr.subscribe(SubscriptionInput(
        tenant_id="t1", owner_id="u1", reminder_type=ReminderType.RENEWAL_NUDGE
    ))
    mgr.subscribe(SubscriptionInput(
        tenant_id="t2", owner_id="u2", reminder_type=ReminderType.MEETING
    ))
    result = mgr.list_subscriptions("t1")
    assert len(result) == 2


# ---------------------------------------------------------------------------
# Reminders
# ---------------------------------------------------------------------------

def test_create_reminder(mgr):
    rem = mgr.create_reminder(ReminderCreateInput(
        tenant_id="t1", owner_id="u1",
        reminder_type=ReminderType.FOLLOW_UP,
        subject="Follow up on proposal",
        body="Check if they received the proposal.",
        due_at=_future(48),
        ref_id="deal-123", ref_type="deal",
    ))
    assert rem.reminder_id
    assert rem.subject == "Follow up on proposal"
    assert rem.status == ReminderStatus.SCHEDULED.value
    assert rem.ref_id == "deal-123"


def test_create_reminder_auto_subscribes(mgr):
    """Creating a reminder auto-creates a subscription if missing."""
    rem = mgr.create_reminder(ReminderCreateInput(
        tenant_id="t1", owner_id="new-user",
        reminder_type=ReminderType.TASK_DUE,
        subject="Task due",
        due_at=_future(12),
    ))
    assert rem.reminder_id
    subs = mgr.list_subscriptions("t1", owner_id="new-user")
    assert len(subs) >= 1


def test_get_due_reminders(mgr):
    # One due now, one in the future
    mgr.create_reminder(ReminderCreateInput(
        tenant_id="t1", owner_id="u1",
        reminder_type=ReminderType.FOLLOW_UP,
        subject="Past due",
        due_at=_past(1),
    ))
    mgr.create_reminder(ReminderCreateInput(
        tenant_id="t1", owner_id="u1",
        reminder_type=ReminderType.FOLLOW_UP,
        subject="Future",
        due_at=_future(10),
    ))
    due = mgr.get_due_reminders()
    assert len(due) == 1
    assert due[0].subject == "Past due"


def test_mark_sent(mgr):
    rem = mgr.create_reminder(ReminderCreateInput(
        tenant_id="t1", owner_id="u1",
        reminder_type=ReminderType.MEETING,
        subject="Meeting",
        due_at=_future(2),
    ))
    sent = mgr.mark_sent(rem.reminder_id)
    assert sent.status == ReminderStatus.SENT.value
    assert sent.sent_at is not None


def test_cancel_reminder(mgr):
    rem = mgr.create_reminder(ReminderCreateInput(
        tenant_id="t1", owner_id="u1",
        reminder_type=ReminderType.PAYMENT,
        subject="Pay invoice",
        due_at=_future(72),
    ))
    cancelled = mgr.cancel_reminder(rem.reminder_id)
    assert cancelled.status == ReminderStatus.CANCELLED.value


def test_snooze_reminder(mgr):
    rem = mgr.create_reminder(ReminderCreateInput(
        tenant_id="t1", owner_id="u1",
        reminder_type=ReminderType.FOLLOW_UP,
        subject="Follow up",
        due_at=_past(1),
    ))
    new_due = _future(48)
    snoozed = mgr.snooze_reminder(SnoozeInput(
        reminder_id=rem.reminder_id,
        snoozed_by="u1",
        snooze_until=new_due,
        reason="Will do it later",
    ))
    # After snooze it's rescheduled
    assert snoozed.status == ReminderStatus.SCHEDULED.value
    assert snoozed.due_at == new_due


def test_list_reminders_by_owner(mgr):
    mgr.create_reminder(ReminderCreateInput(
        tenant_id="t1", owner_id="u1",
        reminder_type=ReminderType.FOLLOW_UP, subject="A", due_at=_future(10)
    ))
    mgr.create_reminder(ReminderCreateInput(
        tenant_id="t1", owner_id="u1",
        reminder_type=ReminderType.MEETING, subject="B", due_at=_future(20)
    ))
    mgr.create_reminder(ReminderCreateInput(
        tenant_id="t1", owner_id="u2",
        reminder_type=ReminderType.FOLLOW_UP, subject="C", due_at=_future(30)
    ))
    result = mgr.list_reminders("t1", owner_id="u1")
    assert len(result) == 2


def test_list_reminders_by_type(mgr):
    mgr.create_reminder(ReminderCreateInput(
        tenant_id="t1", owner_id="u1",
        reminder_type=ReminderType.RENEWAL_NUDGE,
        subject="Renew", due_at=_future(5)
    ))
    mgr.create_reminder(ReminderCreateInput(
        tenant_id="t1", owner_id="u1",
        reminder_type=ReminderType.FOLLOW_UP,
        subject="Follow", due_at=_future(5)
    ))
    result = mgr.list_reminders(
        "t1", reminder_type=ReminderType.RENEWAL_NUDGE.value
    )
    assert len(result) == 1
    assert result[0].reminder_type == ReminderType.RENEWAL_NUDGE.value


def test_missing_info_reminder(mgr):
    rem = mgr.create_reminder(ReminderCreateInput(
        tenant_id="t1", owner_id="u1",
        reminder_type=ReminderType.MISSING_INFO,
        subject="Need company size",
        body="Please fill in your company size to proceed.",
        due_at=_future(24),
        ref_id="lead-456", ref_type="lead",
    ))
    assert rem.reminder_type == ReminderType.MISSING_INFO.value
    assert rem.ref_type == "lead"
