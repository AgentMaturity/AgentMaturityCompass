"""
ContentModerationBot — V1 (ungoverned)
Classifies user-generated content as safe/unsafe using keyword matching.
No governance, no audit trail, no injection detection, no circuit breakers.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class ContentCategory(str, Enum):
    SAFE = "safe"
    UNSAFE = "unsafe"
    UNCERTAIN = "uncertain"


class ViolationType(str, Enum):
    HATE_SPEECH = "hate_speech"
    HARASSMENT = "harassment"
    VIOLENCE = "violence"
    SPAM = "spam"
    SEXUAL = "sexual_content"
    SELF_HARM = "self_harm"
    NONE = "none"


@dataclass
class ModerationDecision:
    content_id: str
    category: ContentCategory
    violation_type: ViolationType
    confidence: float
    flagged: bool
    escalated: bool
    reason: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: dict[str, Any] = field(default_factory=dict)


# Keyword lists for basic classification
UNSAFE_KEYWORDS: dict[ViolationType, list[str]] = {
    ViolationType.HATE_SPEECH: ["hate", "slur", "racist", "bigot", "nazi"],
    ViolationType.HARASSMENT: ["threat", "bully", "harass", "stalk", "dox"],
    ViolationType.VIOLENCE: ["kill", "murder", "bomb", "attack", "shoot"],
    ViolationType.SPAM: ["buy now", "click here", "free money", "act fast", "limited offer"],
    ViolationType.SEXUAL: ["explicit", "nsfw", "porn", "nude"],
    ViolationType.SELF_HARM: ["suicide", "self-harm", "cut myself", "end it all"],
}

SAFE_INDICATORS = ["thank you", "great job", "love this", "helpful", "awesome", "well done"]


class ContentModerationBot:
    """
    Content moderation agent — V1.
    Simple keyword matching, no governance features.
    """

    def __init__(self, agent_id: str = "content-mod-bot-v1"):
        self.agent_id = agent_id
        self._call_count = 0

    def moderate(self, content: str, content_id: str | None = None) -> ModerationDecision:
        """Classify content as safe/unsafe using keyword matching."""
        self._call_count += 1
        cid = content_id or f"content-{self._call_count}"
        lower = content.lower()

        # Check unsafe keywords
        for vtype, keywords in UNSAFE_KEYWORDS.items():
            for kw in keywords:
                if kw in lower:
                    confidence = 0.7 if len(content) > 50 else 0.85
                    return ModerationDecision(
                        content_id=cid,
                        category=ContentCategory.UNSAFE,
                        violation_type=vtype,
                        confidence=confidence,
                        flagged=True,
                        escalated=False,
                        reason=f"Keyword match: '{kw}' detected → {vtype.value}",
                    )

        # Check safe indicators
        for indicator in SAFE_INDICATORS:
            if indicator in lower:
                return ModerationDecision(
                    content_id=cid,
                    category=ContentCategory.SAFE,
                    violation_type=ViolationType.NONE,
                    confidence=0.9,
                    flagged=False,
                    escalated=False,
                    reason=f"Safe indicator matched: '{indicator}'",
                )

        # Uncertain — short or ambiguous content
        if len(content.split()) < 3:
            return ModerationDecision(
                content_id=cid,
                category=ContentCategory.UNCERTAIN,
                violation_type=ViolationType.NONE,
                confidence=0.4,
                flagged=False,
                escalated=True,
                reason="Content too short for confident classification",
            )

        # Default: safe
        return ModerationDecision(
            content_id=cid,
            category=ContentCategory.SAFE,
            violation_type=ViolationType.NONE,
            confidence=0.6,
            flagged=False,
            escalated=False,
            reason="No unsafe patterns detected",
        )

    def get_stats(self) -> dict[str, Any]:
        return {"agent_id": self.agent_id, "total_calls": self._call_count}
