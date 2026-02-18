"""Tool-First Reasoning Coach — detect unsupported claims, suggest tool calls.

Intercepts agent planning steps / outputs, identifies unsupported or
hallucination-prone claims, and suggests concrete tool calls to ground them.
Pure Python, no SQLite required.

API: POST /api/v1/product/reasoning/coach
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


class ClaimCategory(str, Enum):
    NUMERIC = "numeric"            # Specific numbers/statistics stated without source
    TEMPORAL = "temporal"          # Date/time assertions ("currently", "as of today")
    EXISTENCE = "existence"        # Claims about entity existence ("X exists", "Y is available")
    COMPARATIVE = "comparative"    # "best", "fastest", "cheapest" superlatives
    FACTUAL = "factual"            # General factual claims
    PROCEDURAL = "procedural"      # "You can do X by…" procedural steps
    CAUSAL = "causal"              # "X causes Y" causal claims


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ToolSuggestionType(str, Enum):
    SEARCH = "search"
    FETCH = "fetch"
    QUERY = "query"
    CALCULATE = "calculate"
    VERIFY = "verify"
    LIST = "list"


# ---------------------------------------------------------------------------
# Patterns for claim detection
# ---------------------------------------------------------------------------

# (pattern, category, severity)
_CLAIM_PATTERNS: list[tuple[re.Pattern, ClaimCategory, Severity]] = [
    # Numeric claims  — trailing \b omitted after % since % is non-word char
    (re.compile(r"\b\d+(?:\.\d+)?%"), ClaimCategory.NUMERIC, Severity.HIGH),
    (re.compile(r"\b\d+(?:,\d{3})+\b"), ClaimCategory.NUMERIC, Severity.HIGH),          # large numbers
    (re.compile(r"\$\s*\d+(?:\.\d+)?(?:[KkMmBb])?"), ClaimCategory.NUMERIC, Severity.HIGH),
    (re.compile(r"\b(?:exactly|precisely|approximately)\s+\d+\b", re.I), ClaimCategory.NUMERIC, Severity.MEDIUM),

    # Temporal claims
    (re.compile(r"\b(?:currently|as\s+of\s+(?:today|now|2\d{3})|recently|latest|up-?to-?date)\b", re.I), ClaimCategory.TEMPORAL, Severity.HIGH),
    (re.compile(r"\b(?:last\s+(?:week|month|year|quarter))\b", re.I), ClaimCategory.TEMPORAL, Severity.MEDIUM),

    # Existence claims
    (re.compile(r"\b(?:is\s+available|does\s+exist|is\s+listed|can\s+be\s+found)\b", re.I), ClaimCategory.EXISTENCE, Severity.MEDIUM),
    (re.compile(r"\b(?:no\s+longer\s+(?:exists?|available)|has\s+been\s+(?:removed|deprecated))\b", re.I), ClaimCategory.EXISTENCE, Severity.HIGH),

    # Comparative/superlative
    (re.compile(r"\b(?:best|fastest|cheapest|most\s+(?:popular|common|effective|reliable)|number\s+one|#1|top\s+\d+)\b", re.I), ClaimCategory.COMPARATIVE, Severity.MEDIUM),
    (re.compile(r"\b(?:outperforms|beats|surpasses|exceeds)\b", re.I), ClaimCategory.COMPARATIVE, Severity.MEDIUM),

    # Factual
    (re.compile(r"\b(?:it\s+is\s+(?:a\s+fact|known|established|proven|widely\s+accepted)\s+that)\b", re.I), ClaimCategory.FACTUAL, Severity.HIGH),
    (re.compile(r"\b(?:studies?\s+(?:show|suggest|indicate|found))\b", re.I), ClaimCategory.FACTUAL, Severity.HIGH),

    # Procedural
    (re.compile(r"\b(?:you\s+can\s+(?:do|achieve|get|access)\s+\w+\s+by)\b", re.I), ClaimCategory.PROCEDURAL, Severity.MEDIUM),
    (re.compile(r"\b(?:simply\s+(?:go\s+to|click|navigate\s+to|visit))\b", re.I), ClaimCategory.PROCEDURAL, Severity.MEDIUM),

    # Causal
    (re.compile(r"\b(?:\w+\s+causes?\s+\w+|\w+\s+leads?\s+to\s+\w+|\w+\s+results?\s+in\s+\w+)\b", re.I), ClaimCategory.CAUSAL, Severity.MEDIUM),
]

# Tool suggestion rules: (category, severity) → suggested tools
_TOOL_SUGGESTION_RULES: dict[tuple[ClaimCategory, Severity | None], list[dict[str, str]]] = {
    (ClaimCategory.NUMERIC, None): [
        {"tool": "web_search", "type": ToolSuggestionType.SEARCH.value, "hint": "Search for the exact statistic with a credible source."},
        {"tool": "calculate", "type": ToolSuggestionType.CALCULATE.value, "hint": "Compute the value from first principles if formula-based."},
    ],
    (ClaimCategory.TEMPORAL, None): [
        {"tool": "web_fetch", "type": ToolSuggestionType.FETCH.value, "hint": "Fetch the current page or resource to verify timeliness."},
        {"tool": "web_search", "type": ToolSuggestionType.SEARCH.value, "hint": "Search for current status with date filter."},
    ],
    (ClaimCategory.EXISTENCE, None): [
        {"tool": "web_search", "type": ToolSuggestionType.SEARCH.value, "hint": "Search to verify entity/resource exists."},
        {"tool": "api_call", "type": ToolSuggestionType.QUERY.value, "hint": "Query the relevant API/database to confirm existence."},
    ],
    (ClaimCategory.COMPARATIVE, None): [
        {"tool": "web_search", "type": ToolSuggestionType.SEARCH.value, "hint": "Search for independent comparison or benchmark."},
        {"tool": "web_fetch", "type": ToolSuggestionType.FETCH.value, "hint": "Fetch authoritative ranking or benchmark page."},
    ],
    (ClaimCategory.FACTUAL, None): [
        {"tool": "web_search", "type": ToolSuggestionType.SEARCH.value, "hint": "Search for primary source or authoritative reference."},
        {"tool": "web_fetch", "type": ToolSuggestionType.FETCH.value, "hint": "Fetch the source document that supports this claim."},
    ],
    (ClaimCategory.PROCEDURAL, None): [
        {"tool": "web_fetch", "type": ToolSuggestionType.FETCH.value, "hint": "Fetch the official documentation to verify steps."},
        {"tool": "api_call", "type": ToolSuggestionType.VERIFY.value, "hint": "Test the procedure in a sandbox environment."},
    ],
    (ClaimCategory.CAUSAL, None): [
        {"tool": "web_search", "type": ToolSuggestionType.SEARCH.value, "hint": "Search for peer-reviewed evidence for this causal link."},
    ],
}

# Phrases that indicate a claim is already grounded
# Note: patterns ending with ':' omit trailing \b since ':' is a non-word char
_GROUNDED_SIGNALS = re.compile(
    r"(?:"
    r"\baccording\s+to"
    r"|\bsource:"
    r"|\breference:"
    r"|\bcitation:"
    r"|\bas\s+reported\s+by\b"
    r"|\bvia\b"
    r"|\bper\s+\w+"
    r"|\bfrom\s+the\s+docs?\b"
    r"|\btool\s+output\b"
    r"|\bretrieved\s+from\b"
    r"|\bfetched\s+from\b"
    r")",
    re.I,
)


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class UnsupportedClaim:
    """A detected unsupported claim in the output."""

    claim_text: str
    category: ClaimCategory
    severity: Severity
    matched_pattern: str
    char_start: int
    char_end: int
    is_grounded: bool              # True if nearby grounding signal found
    suggested_tools: list[dict[str, str]]

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "claim_text": self.claim_text,
            "category": self.category.value,
            "severity": self.severity.value,
            "matched_pattern": self.matched_pattern,
            "char_start": self.char_start,
            "char_end": self.char_end,
            "is_grounded": self.is_grounded,
            "suggested_tools": self.suggested_tools,
        }


@dataclass
class CoachReport:
    """Full coaching report for an agent output."""

    output_text: str
    total_claims: int
    ungrounded_claims: int
    claims: list[UnsupportedClaim]
    overall_grounding_score: float   # 0.0 = all claims ungrounded, 1.0 = fully grounded
    coaching_summary: str
    top_tool_suggestions: list[dict[str, str]]
    metadata: dict[str, Any]

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "output_text": self.output_text,
            "total_claims": self.total_claims,
            "ungrounded_claims": self.ungrounded_claims,
            "claims": [c.dict for c in self.claims],
            "overall_grounding_score": round(self.overall_grounding_score, 4),
            "coaching_summary": self.coaching_summary,
            "top_tool_suggestions": self.top_tool_suggestions,
            "metadata": self.metadata,
        }


@dataclass
class CoachRequest:
    """Input to the reasoning coach."""

    output_text: str
    available_tools: list[str] = field(default_factory=list)
    # Minimum severity to report (LOW = report everything)
    min_severity: Severity = Severity.MEDIUM
    # Window around a match to check for grounding signals (chars)
    grounding_window: int = 150
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class ReasoningCoach:
    """Detect unsupported claims in agent outputs and suggest tool calls."""

    def coach(self, request: CoachRequest) -> CoachReport:
        text = request.output_text
        claims: list[UnsupportedClaim] = []
        seen_spans: list[tuple[int, int]] = []

        _sev_order = [Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL]
        min_sev_idx = _sev_order.index(request.min_severity)

        for pattern, category, severity in _CLAIM_PATTERNS:
            # Skip below threshold
            if _sev_order.index(severity) < min_sev_idx:
                continue

            for m in pattern.finditer(text):
                start, end = m.start(), m.end()
                # Deduplicate overlapping matches
                if any(s <= start < e or s < end <= e for s, e in seen_spans):
                    continue
                seen_spans.append((start, end))

                # Surrounding context window
                ctx_start = max(0, start - request.grounding_window)
                ctx_end = min(len(text), end + request.grounding_window)
                context = text[ctx_start:ctx_end]

                is_grounded = bool(_GROUNDED_SIGNALS.search(context))

                # Get tool suggestions for this category
                suggested = _TOOL_SUGGESTION_RULES.get((category, None), [])
                # Filter by available tools if caller specified them
                if request.available_tools:
                    suggested = [
                        s for s in suggested
                        if any(s["tool"] in av for av in request.available_tools)
                    ] or suggested  # fallback to all suggestions if none match

                claims.append(
                    UnsupportedClaim(
                        claim_text=m.group()[:200],
                        category=category,
                        severity=severity,
                        matched_pattern=pattern.pattern[:100],
                        char_start=start,
                        char_end=end,
                        is_grounded=is_grounded,
                        suggested_tools=suggested[:2],
                    )
                )

        # Sort by severity (critical first), then by position
        _sev_rank = {Severity.CRITICAL: 4, Severity.HIGH: 3, Severity.MEDIUM: 2, Severity.LOW: 1}
        claims.sort(key=lambda c: (-_sev_rank[c.severity], c.char_start))

        ungrounded = [c for c in claims if not c.is_grounded]
        total = len(claims)
        grounding_score = (
            1.0 - (len(ungrounded) / total) if total else 1.0
        )

        # Aggregate top tool suggestions
        tool_counts: dict[str, dict[str, str]] = {}
        for claim in ungrounded:
            for sug in claim.suggested_tools:
                tool_counts[sug["tool"]] = sug
        top_tools = list(tool_counts.values())[:5]

        # Coaching summary
        if not ungrounded:
            summary = "Output is well-grounded — no unsupported claims detected above the threshold."
        else:
            high_sev = [c for c in ungrounded if c.severity in (Severity.HIGH, Severity.CRITICAL)]
            summary = (
                f"Found {len(ungrounded)} ungrounded claim(s) "
                f"({len(high_sev)} high/critical severity). "
                f"Recommended: use tool calls to verify before presenting output."
            )

        log.info(
            "reasoning_coached",
            total_claims=total,
            ungrounded=len(ungrounded),
            grounding_score=round(grounding_score, 4),
        )

        return CoachReport(
            output_text=text,
            total_claims=total,
            ungrounded_claims=len(ungrounded),
            claims=claims,
            overall_grounding_score=grounding_score,
            coaching_summary=summary,
            top_tool_suggestions=top_tools,
            metadata=request.metadata,
        )


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_coach: ReasoningCoach | None = None


def get_reasoning_coach() -> ReasoningCoach:
    global _coach
    if _coach is None:
        _coach = ReasoningCoach()
    return _coach


__all__ = [
    "ClaimCategory",
    "Severity",
    "ToolSuggestionType",
    "UnsupportedClaim",
    "CoachReport",
    "CoachRequest",
    "ReasoningCoach",
    "get_reasoning_coach",
]
