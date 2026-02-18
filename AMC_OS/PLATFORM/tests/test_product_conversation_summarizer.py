"""Tests for amc.product.conversation_summarizer — Conversation Summarizer."""
from __future__ import annotations

import pytest

from amc.product.conversation_summarizer import (
    ConversationMessage,
    ConversationSummarizer,
    MessageRole,
    SummarizeRequest,
    TaskStatus,
    get_conversation_summarizer,
)


@pytest.fixture()
def summarizer() -> ConversationSummarizer:
    return ConversationSummarizer()


def _msg(role: MessageRole, content: str, turn: int = 0) -> ConversationMessage:
    return ConversationMessage(role=role, content=content, turn=turn)


# ---------------------------------------------------------------------------
# Basic summarization
# ---------------------------------------------------------------------------


def test_empty_conversation_returns_result(summarizer):
    result = summarizer.summarize(SummarizeRequest(messages=[]))
    assert result.summary
    assert result.turn_count == 0


def test_single_message_summarized(summarizer):
    msgs = [_msg(MessageRole.USER, "Hello, I need help with my invoice.", 1)]
    result = summarizer.summarize(SummarizeRequest(messages=msgs))
    assert result.turn_count == 1
    assert "1 turn" in result.summary


def test_two_turn_conversation(summarizer):
    msgs = [
        _msg(MessageRole.USER, "Can you analyze the Q3 results?", 1),
        _msg(MessageRole.ASSISTANT, "Sure, I will start with the revenue data.", 2),
    ]
    result = summarizer.summarize(SummarizeRequest(messages=msgs))
    assert result.turn_count == 2


def test_summary_contains_key_content(summarizer):
    msgs = [
        _msg(MessageRole.USER, "We need to invoice client ACME Corp for project Alpha.", 1),
        _msg(MessageRole.ASSISTANT, "Understood. I will draft the invoice now.", 2),
    ]
    result = summarizer.summarize(SummarizeRequest(messages=msgs))
    assert "invoice" in result.summary.lower() or len(result.key_points) >= 1


# ---------------------------------------------------------------------------
# Decision extraction
# ---------------------------------------------------------------------------


def test_extracts_decision_from_message(summarizer):
    msgs = [
        _msg(MessageRole.ASSISTANT, "We have decided to use the new billing system.", 1),
    ]
    result = summarizer.summarize(SummarizeRequest(messages=msgs, extract_decisions=True))
    assert len(result.decisions) >= 1
    assert any("billing" in d.decision.lower() for d in result.decisions)


def test_no_decisions_extracted_when_disabled(summarizer):
    msgs = [
        _msg(MessageRole.ASSISTANT, "We have decided to go with approach A.", 1),
    ]
    result = summarizer.summarize(SummarizeRequest(messages=msgs, extract_decisions=False))
    assert result.decisions == []


def test_agreed_signal_triggers_decision(summarizer):
    msgs = [_msg(MessageRole.USER, "Great, agreed to proceed with the cloud migration.", 1)]
    result = summarizer.summarize(SummarizeRequest(messages=msgs))
    assert len(result.decisions) >= 1


# ---------------------------------------------------------------------------
# Task extraction
# ---------------------------------------------------------------------------


def test_extracts_action_item(summarizer):
    msgs = [
        _msg(MessageRole.USER, "Action item: please review the contract by Friday.", 1),
    ]
    result = summarizer.summarize(SummarizeRequest(messages=msgs, extract_tasks=True))
    assert len(result.tasks) >= 1


def test_extracts_todo(summarizer):
    msgs = [_msg(MessageRole.ASSISTANT, "TODO: update the pricing table.", 1)]
    result = summarizer.summarize(SummarizeRequest(messages=msgs))
    assert len(result.tasks) >= 1


def test_no_tasks_when_disabled(summarizer):
    msgs = [_msg(MessageRole.USER, "Action item: do this thing.", 1)]
    result = summarizer.summarize(SummarizeRequest(messages=msgs, extract_tasks=False))
    assert result.tasks == []


def test_task_has_status_open(summarizer):
    msgs = [_msg(MessageRole.USER, "TODO: finish the report.", 1)]
    result = summarizer.summarize(SummarizeRequest(messages=msgs))
    if result.tasks:
        assert result.tasks[0].status == TaskStatus.OPEN


# ---------------------------------------------------------------------------
# Open items
# ---------------------------------------------------------------------------


def test_question_becomes_open_item(summarizer):
    msgs = [_msg(MessageRole.USER, "What is the deadline for this project?", 1)]
    result = summarizer.summarize(SummarizeRequest(messages=msgs, extract_open_items=True))
    assert len(result.open_items) >= 1


def test_tbd_signal_is_open_item(summarizer):
    msgs = [_msg(MessageRole.ASSISTANT, "The pricing model is TBD.", 1)]
    result = summarizer.summarize(SummarizeRequest(messages=msgs))
    assert len(result.open_items) >= 1


def test_no_open_items_when_disabled(summarizer):
    msgs = [_msg(MessageRole.USER, "What is this about?", 1)]
    result = summarizer.summarize(SummarizeRequest(messages=msgs, extract_open_items=False))
    assert result.open_items == []


# ---------------------------------------------------------------------------
# Blockers
# ---------------------------------------------------------------------------


def test_blocker_extracted(summarizer):
    msgs = [_msg(MessageRole.USER, "We are blocked on the legal approval. Cannot proceed.", 1)]
    result = summarizer.summarize(SummarizeRequest(messages=msgs))
    assert len(result.blockers) >= 1


# ---------------------------------------------------------------------------
# Sentiment
# ---------------------------------------------------------------------------


def test_positive_sentiment(summarizer):
    msgs = [
        _msg(MessageRole.USER, "Great work, everything is done and resolved. Thanks!", 1),
        _msg(MessageRole.ASSISTANT, "Excellent! Everything is good and approved.", 2),
    ]
    result = summarizer.summarize(SummarizeRequest(messages=msgs))
    assert result.sentiment in ("positive", "neutral")


def test_negative_sentiment(summarizer):
    msgs = [
        _msg(MessageRole.USER, "There is a critical problem. The system is broken and stuck.", 1),
        _msg(MessageRole.ASSISTANT, "I see the error. This issue is urgent and critical.", 2),
    ]
    result = summarizer.summarize(SummarizeRequest(messages=msgs))
    assert result.sentiment in ("negative", "neutral")


# ---------------------------------------------------------------------------
# Participant roles
# ---------------------------------------------------------------------------


def test_participant_roles_captured(summarizer):
    msgs = [
        _msg(MessageRole.USER, "Hello.", 1),
        _msg(MessageRole.ASSISTANT, "Hi.", 2),
        _msg(MessageRole.SYSTEM, "Init.", 0),
    ]
    result = summarizer.summarize(SummarizeRequest(messages=msgs))
    assert "user" in result.participant_roles
    assert "assistant" in result.participant_roles


# ---------------------------------------------------------------------------
# Max summary length
# ---------------------------------------------------------------------------


def test_summary_length_capped(summarizer):
    msgs = [_msg(MessageRole.USER, "This is test content. " * 50, 1)]
    result = summarizer.summarize(SummarizeRequest(messages=msgs, max_summary_length=100))
    assert len(result.summary) <= 115  # buffer for ellipsis


# ---------------------------------------------------------------------------
# Dict serialization
# ---------------------------------------------------------------------------


def test_summary_dict_keys(summarizer):
    result = summarizer.summarize(SummarizeRequest(messages=[]))
    d = result.dict
    assert "summary" in d
    assert "decisions" in d
    assert "tasks" in d
    assert "open_items" in d
    assert "blockers" in d
    assert "sentiment" in d


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------


def test_singleton():
    s1 = get_conversation_summarizer()
    s2 = get_conversation_summarizer()
    assert s1 is s2
