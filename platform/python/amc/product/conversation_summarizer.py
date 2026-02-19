"""Conversation Summarizer — structured state from conversation history.

Extracts decisions, tasks, open items, and a concise summary from a raw
conversation transcript.  Pure Python, no SQLite (stateless transformer).

API: POST /api/v1/product/conversation/summarize
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import structlog

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"


class TaskStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    BLOCKED = "blocked"


class ItemType(str, Enum):
    DECISION = "decision"
    TASK = "task"
    OPEN_ITEM = "open_item"
    BLOCKER = "blocker"


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class ConversationMessage:
    """A single message turn in the conversation."""

    role: MessageRole
    content: str
    turn: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ExtractedDecision:
    """A decision that was made during the conversation."""

    decision: str
    rationale: str
    made_by: str
    turn: int

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "decision": self.decision,
            "rationale": self.rationale,
            "made_by": self.made_by,
            "turn": self.turn,
        }


@dataclass
class ExtractedTask:
    """An action item or task identified in the conversation."""

    task: str
    owner: str
    status: TaskStatus
    priority: str
    turn: int

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "task": self.task,
            "owner": self.owner,
            "status": self.status.value,
            "priority": self.priority,
            "turn": self.turn,
        }


@dataclass
class ExtractedOpenItem:
    """An unresolved question or open item."""

    item: str
    item_type: ItemType
    turn: int

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "item": self.item,
            "item_type": self.item_type.value,
            "turn": self.turn,
        }


@dataclass
class ConversationSummary:
    """Full structured state extracted from a conversation."""

    summary: str
    key_points: list[str]
    decisions: list[ExtractedDecision]
    tasks: list[ExtractedTask]
    open_items: list[ExtractedOpenItem]
    blockers: list[str]
    turn_count: int
    participant_roles: list[str]
    sentiment: str    # "positive" | "neutral" | "negative"
    metadata: dict[str, Any]

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "summary": self.summary,
            "key_points": self.key_points,
            "decisions": [d.dict for d in self.decisions],
            "tasks": [t.dict for t in self.tasks],
            "open_items": [o.dict for o in self.open_items],
            "blockers": self.blockers,
            "turn_count": self.turn_count,
            "participant_roles": self.participant_roles,
            "sentiment": self.sentiment,
            "metadata": self.metadata,
        }


@dataclass
class SummarizeRequest:
    """Input to the conversation summarizer."""

    messages: list[ConversationMessage]
    max_summary_length: int = 500
    extract_tasks: bool = True
    extract_decisions: bool = True
    extract_open_items: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Extraction heuristics
# ---------------------------------------------------------------------------

# Decision signals — phrases that indicate a conclusion was reached
_DECISION_SIGNALS = [
    re.compile(r"\b(we(?:'ve| have)? decided|decision(?:\s+is)?:|agreed(?:\s+to)?|will\s+go\s+with|approved|confirmed|chosen)\b", re.I),
    re.compile(r"\b(final(?:ly)?\s+(?:we|the\s+team)?\s*(?:will|agreed|decided))\b", re.I),
    re.compile(r"\b(let[''']s\s+(?:go\s+with|proceed\s+with|use))\b", re.I),
]

# Task/action item signals
_TASK_SIGNALS = [
    re.compile(r"\b(?:action\s+item:|todo:|to[-\s]do:|next\s+step(?:s)?:)", re.I),
    re.compile(r"\b(?:please\s+\w+|you\s+(?:should|need\s+to|must)|i(?:'ll|\s+will)\s+\w+)\b", re.I),
    re.compile(r"\b(?:assign(?:ed)?\s+to|owner:|responsible\s+for)\b", re.I),
]

# Open item signals
_OPEN_SIGNALS = [
    re.compile(r"\b(open\s+(?:question|item|issue)|tbd|to\s+be\s+determined|unclear|not\s+sure|needs?\s+(?:more)?\s+(?:info|investigation)|pending)\b", re.I),
]

# Question signals
_QUESTION_SIGNALS = [
    re.compile(r"\?$"),
    re.compile(r"\b(what|how|when|where|why|who|should\s+we|can\s+you|could\s+you)\b", re.I),
]

# Blocker signals
_BLOCKER_SIGNALS = [
    re.compile(r"\b(block(?:ed|er)|stuck|waiting\s+on|dependency|can(?:'t|not)\s+proceed|issue\s+with)\b", re.I),
]

# Priority extraction
_PRIORITY_MAP = {
    "urgent": "high",
    "asap": "high",
    "immediately": "high",
    "critical": "high",
    "important": "medium",
    "soon": "medium",
    "when\s+(?:you\s+can|possible)": "low",
    "eventually": "low",
    "low\s+priority": "low",
}

# Positive/negative sentiment words
_POSITIVE_WORDS = {"great", "good", "excellent", "perfect", "agree", "yes", "done", "resolved", "thanks", "approved"}
_NEGATIVE_WORDS = {"issue", "problem", "error", "fail", "block", "urgent", "critical", "broken", "stuck", "unclear"}


def _extract_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n", text) if s.strip()]


def _detect_priority(text: str) -> str:
    tl = text.lower()
    for pattern, level in _PRIORITY_MAP.items():
        if re.search(pattern, tl):
            return level
    return "medium"


def _detect_owner(text: str) -> str:
    """Try to extract a person/team name from an action item."""
    # Look for "@mention" or "Name:" patterns
    mention = re.search(r"@(\w+)", text)
    if mention:
        return mention.group(1)
    colon_match = re.search(r"^(\w+(?:\s\w+)?)\s*:", text)
    if colon_match:
        return colon_match.group(1)
    return "unassigned"


def _detect_sentiment(messages: list[ConversationMessage]) -> str:
    pos = neg = 0
    for msg in messages:
        words = set(msg.content.lower().split())
        pos += len(words & _POSITIVE_WORDS)
        neg += len(words & _NEGATIVE_WORDS)
    if pos > neg * 1.5:
        return "positive"
    if neg > pos * 1.5:
        return "negative"
    return "neutral"


def _build_summary(messages: list[ConversationMessage], max_len: int) -> tuple[str, list[str]]:
    """Produce a condensed prose summary + key points."""
    # Group by topic segments (simple: first/last/middle)
    total = len(messages)
    key_points: list[str] = []

    # Extract non-system messages
    substantive = [m for m in messages if m.role != MessageRole.SYSTEM]
    if not substantive:
        return "No conversation content found.", []

    # Key points: notable user/assistant turns
    for msg in substantive:
        sentences = _extract_sentences(msg.content)
        for s in sentences[:2]:
            if len(s) > 20 and not any(signal.search(s) for signal in _OPEN_SIGNALS):
                key_points.append(s[:200])
                if len(key_points) >= 5:
                    break
        if len(key_points) >= 5:
            break

    # Build summary prose
    if total == 0:
        summary = "Empty conversation."
    elif total <= 2:
        summary = f"Brief exchange ({total} turn{'s' if total > 1 else ''}). {substantive[0].content[:200]}"
    else:
        first_content = substantive[0].content[:100].strip()
        last_content = substantive[-1].content[:100].strip()
        summary = (
            f"Conversation of {total} turns. "
            f"Started with: \"{first_content}\". "
            f"Concluded with: \"{last_content}\"."
        )

    if len(summary) > max_len:
        summary = summary[:max_len].rstrip() + "…"

    return summary, key_points


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class ConversationSummarizer:
    """Extract structured state from a conversation transcript."""

    def summarize(self, request: SummarizeRequest) -> ConversationSummary:
        messages = request.messages
        decisions: list[ExtractedDecision] = []
        tasks: list[ExtractedTask] = []
        open_items: list[ExtractedOpenItem] = []
        blockers: list[str] = []

        for msg in messages:
            turn = msg.turn
            sentences = _extract_sentences(msg.content)

            for sentence in sentences:
                # Decisions
                if request.extract_decisions:
                    for sig in _DECISION_SIGNALS:
                        if sig.search(sentence):
                            decisions.append(
                                ExtractedDecision(
                                    decision=sentence[:300],
                                    rationale="",
                                    made_by=msg.role.value,
                                    turn=turn,
                                )
                            )
                            break

                # Tasks
                if request.extract_tasks:
                    for sig in _TASK_SIGNALS:
                        if sig.search(sentence):
                            tasks.append(
                                ExtractedTask(
                                    task=sentence[:300],
                                    owner=_detect_owner(sentence),
                                    status=TaskStatus.OPEN,
                                    priority=_detect_priority(sentence),
                                    turn=turn,
                                )
                            )
                            break

                # Blockers
                for sig in _BLOCKER_SIGNALS:
                    if sig.search(sentence):
                        blockers.append(sentence[:200])
                        break

                # Open items
                if request.extract_open_items:
                    is_question = any(sig.search(sentence) for sig in _QUESTION_SIGNALS)
                    is_open = any(sig.search(sentence) for sig in _OPEN_SIGNALS)
                    if is_open or (is_question and msg.role == MessageRole.USER):
                        open_items.append(
                            ExtractedOpenItem(
                                item=sentence[:300],
                                item_type=ItemType.OPEN_ITEM if is_open else ItemType.OPEN_ITEM,
                                turn=turn,
                            )
                        )

        # Deduplicate by fuzzy prefix
        def _dedup(items: list, key: Any) -> list:
            seen: set[str] = set()
            out = []
            for item in items:
                k = str(key(item))[:60].lower()
                if k not in seen:
                    seen.add(k)
                    out.append(item)
            return out

        decisions = _dedup(decisions, lambda d: d.decision)
        tasks = _dedup(tasks, lambda t: t.task)
        open_items = _dedup(open_items, lambda o: o.item)
        blockers = list(dict.fromkeys(b[:200] for b in blockers))

        summary, key_points = _build_summary(messages, request.max_summary_length)
        sentiment = _detect_sentiment(messages)
        roles = list({m.role.value for m in messages})

        log.info(
            "conversation_summarized",
            turns=len(messages),
            decisions=len(decisions),
            tasks=len(tasks),
            open_items=len(open_items),
            blockers=len(blockers),
        )

        return ConversationSummary(
            summary=summary,
            key_points=key_points,
            decisions=decisions,
            tasks=tasks,
            open_items=open_items,
            blockers=blockers,
            turn_count=len(messages),
            participant_roles=roles,
            sentiment=sentiment,
            metadata=request.metadata,
        )


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_summarizer: ConversationSummarizer | None = None


def get_conversation_summarizer() -> ConversationSummarizer:
    global _summarizer
    if _summarizer is None:
        _summarizer = ConversationSummarizer()
    return _summarizer


__all__ = [
    "MessageRole",
    "TaskStatus",
    "ItemType",
    "ConversationMessage",
    "ExtractedDecision",
    "ExtractedTask",
    "ExtractedOpenItem",
    "ConversationSummary",
    "SummarizeRequest",
    "ConversationSummarizer",
    "get_conversation_summarizer",
]
