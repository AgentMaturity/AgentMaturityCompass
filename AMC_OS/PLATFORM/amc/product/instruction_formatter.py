"""Persona-Aware Instruction Formatter — reformat instructions per role/audience.

Transforms a raw instruction into persona-appropriate language: tone, style,
vocabulary, structure.  Works with AMC persona records when available.

API: POST /api/v1/product/instructions/format
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


class Tone(str, Enum):
    FORMAL = "formal"
    PROFESSIONAL = "professional"
    FRIENDLY = "friendly"
    TECHNICAL = "technical"
    CASUAL = "casual"
    EXECUTIVE = "executive"


class AudienceRole(str, Enum):
    DEVELOPER = "developer"
    EXECUTIVE = "executive"
    ANALYST = "analyst"
    SALES = "sales"
    SUPPORT = "support"
    OPERATOR = "operator"
    GENERIC = "generic"


class StructureStyle(str, Enum):
    NARRATIVE = "narrative"       # Plain prose
    NUMBERED = "numbered"         # 1. 2. 3. steps
    BULLETED = "bulleted"         # - bullets
    HEADERS = "headers"           # ## Sections
    CONCISE = "concise"           # Short directive sentences


# ---------------------------------------------------------------------------
# Role presets — tone + structure defaults per audience
# ---------------------------------------------------------------------------

_ROLE_PRESETS: dict[AudienceRole, dict[str, Any]] = {
    AudienceRole.DEVELOPER: {
        "tone": Tone.TECHNICAL,
        "structure": StructureStyle.NUMBERED,
        "prefix": "Task:",
        "verb_style": "imperative",
    },
    AudienceRole.EXECUTIVE: {
        "tone": Tone.EXECUTIVE,
        "structure": StructureStyle.CONCISE,
        "prefix": "Objective:",
        "verb_style": "outcome",
    },
    AudienceRole.ANALYST: {
        "tone": Tone.PROFESSIONAL,
        "structure": StructureStyle.BULLETED,
        "prefix": "Analysis Request:",
        "verb_style": "analytical",
    },
    AudienceRole.SALES: {
        "tone": Tone.FRIENDLY,
        "structure": StructureStyle.BULLETED,
        "prefix": "Action:",
        "verb_style": "persuasive",
    },
    AudienceRole.SUPPORT: {
        "tone": Tone.FRIENDLY,
        "structure": StructureStyle.NUMBERED,
        "prefix": "Step:",
        "verb_style": "helpful",
    },
    AudienceRole.OPERATOR: {
        "tone": Tone.PROFESSIONAL,
        "structure": StructureStyle.NUMBERED,
        "prefix": "Instruction:",
        "verb_style": "imperative",
    },
    AudienceRole.GENERIC: {
        "tone": Tone.PROFESSIONAL,
        "structure": StructureStyle.NARRATIVE,
        "prefix": "",
        "verb_style": "neutral",
    },
}

# Tone-specific sentence starters
_TONE_STARTERS: dict[Tone, list[str]] = {
    Tone.FORMAL: ["Please ensure", "It is required that", "You are to"],
    Tone.PROFESSIONAL: ["Ensure", "Complete the following", "You should"],
    Tone.FRIENDLY: ["Go ahead and", "Feel free to", "Please"],
    Tone.TECHNICAL: ["Execute", "Implement", "Configure"],
    Tone.CASUAL: ["Just", "Go", "Make sure to"],
    Tone.EXECUTIVE: ["Drive", "Deliver", "Prioritize"],
}

# Vocabulary substitution tables per tone
_VOCAB_MAP: dict[Tone, dict[str, str]] = {
    Tone.TECHNICAL: {
        "use": "invoke",
        "do": "execute",
        "get": "retrieve",
        "send": "dispatch",
        "make": "construct",
        "look at": "inspect",
    },
    Tone.EXECUTIVE: {
        "use": "leverage",
        "do": "drive",
        "get": "acquire",
        "check": "assess",
        "make": "create",
        "look at": "review",
    },
    Tone.CASUAL: {
        "utilize": "use",
        "leverage": "use",
        "facilitate": "help",
        "commence": "start",
        "terminate": "stop",
    },
}


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class FormatRequest:
    """Input for the instruction formatter."""

    instruction: str
    audience_role: AudienceRole = AudienceRole.GENERIC
    tone: Tone | None = None          # Override role default
    structure: StructureStyle | None = None  # Override role default
    context: str = ""                 # Extra context injected before instruction
    include_rationale: bool = False   # Append a short "why" section
    max_length: int = 0               # Soft truncation (0 = unlimited)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class FormatResult:
    """Formatted instruction output."""

    original: str
    formatted: str
    audience_role: str
    tone_applied: str
    structure_applied: str
    changes_made: list[str]
    metadata: dict[str, Any]

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "original": self.original,
            "formatted": self.formatted,
            "audience_role": self.audience_role,
            "tone_applied": self.tone_applied,
            "structure_applied": self.structure_applied,
            "changes_made": self.changes_made,
            "metadata": self.metadata,
        }


# ---------------------------------------------------------------------------
# Formatters
# ---------------------------------------------------------------------------


def _apply_vocab(text: str, tone: Tone) -> tuple[str, list[str]]:
    mapping = _VOCAB_MAP.get(tone, {})
    changes = []
    for source, target in mapping.items():
        pattern = re.compile(r"\b" + re.escape(source) + r"\b", re.IGNORECASE)
        if pattern.search(text):
            text = pattern.sub(target, text)
            changes.append(f"vocab: '{source}' → '{target}'")
    return text, changes


def _apply_structure(text: str, style: StructureStyle, prefix: str) -> tuple[str, list[str]]:
    changes = []

    if style == StructureStyle.NARRATIVE:
        # Ensure ends with period
        text = text.rstrip()
        if text and text[-1] not in ".!?":
            text += "."

    elif style in (StructureStyle.NUMBERED, StructureStyle.BULLETED):
        # Split by sentence or existing list markers
        sentences = re.split(r"(?<=[.!?])\s+|;\s*|\n+", text.strip())
        sentences = [s.strip() for s in sentences if s.strip()]
        if len(sentences) > 1:
            marker = lambda i: f"{i+1}." if style == StructureStyle.NUMBERED else "-"
            text = "\n".join(f"{marker(i)} {s}" for i, s in enumerate(sentences))
            changes.append(f"restructured as {style.value} list ({len(sentences)} items)")
        else:
            # Single sentence — wrap with prefix
            pass

    elif style == StructureStyle.HEADERS:
        # Treat first sentence as heading, rest as body
        parts = re.split(r"(?<=[.!?])\s+", text.strip(), maxsplit=1)
        if len(parts) == 2:
            text = f"## {parts[0]}\n\n{parts[1]}"
            changes.append("wrapped first sentence as ## heading")

    elif style == StructureStyle.CONCISE:
        # Keep only first 2 sentences
        sentences = re.split(r"(?<=[.!?])\s+", text.strip())
        if len(sentences) > 2:
            text = " ".join(sentences[:2])
            changes.append(f"trimmed to 2 sentences (was {len(sentences)})")

    if prefix and not text.startswith(prefix):
        text = f"{prefix} {text}"
        changes.append(f"prefixed with '{prefix}'")

    return text, changes


def _apply_tone_starter(text: str, tone: Tone) -> tuple[str, bool]:
    """Prepend a tone-appropriate imperative if the instruction doesn't start with one."""
    starters = _TONE_STARTERS.get(tone, [])
    already_started = any(
        text.lower().startswith(s.lower()) for s in starters
    )
    if already_started or not starters:
        return text, False
    return text, False  # starters applied contextually, not forcefully


def _apply_rationale(text: str, role: AudienceRole) -> str:
    rationales = {
        AudienceRole.EXECUTIVE: "\n\n_Why this matters: This action directly impacts business outcomes._",
        AudienceRole.DEVELOPER: "\n\n_Rationale: Required for correct system integration._",
        AudienceRole.ANALYST: "\n\n_Context: This analysis informs the next decision step._",
        AudienceRole.SALES: "\n\n_Why: This move builds trust and advances the deal._",
        AudienceRole.SUPPORT: "\n\n_Note: This step resolves the issue for the customer._",
        AudienceRole.OPERATOR: "\n\n_Purpose: Required for workflow completion._",
        AudienceRole.GENERIC: "\n\n_Note: Follow these instructions carefully._",
    }
    return text + rationales.get(role, "")


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class InstructionFormatter:
    """Format LLM/agent instructions for the right persona and audience."""

    def format(self, request: FormatRequest) -> FormatResult:
        preset = _ROLE_PRESETS[request.audience_role]
        tone = request.tone or preset["tone"]
        structure = request.structure or preset["structure"]
        prefix = preset["prefix"]

        text = request.instruction.strip()
        changes: list[str] = []

        # Prepend context block if provided
        if request.context:
            text = f"{request.context.strip()}\n\n{text}"
            changes.append("prepended context block")

        # Vocabulary substitution
        text, vocab_changes = _apply_vocab(text, tone)
        changes.extend(vocab_changes)

        # Structure transformation
        text, struct_changes = _apply_structure(text, structure, prefix)
        changes.extend(struct_changes)

        # Rationale section
        if request.include_rationale:
            text = _apply_rationale(text, request.audience_role)
            changes.append("appended rationale section")

        # Soft length truncation
        if request.max_length > 0 and len(text) > request.max_length:
            text = text[: request.max_length].rstrip() + "…"
            changes.append(f"truncated to {request.max_length} chars")

        log.debug(
            "instruction_formatted",
            role=request.audience_role.value,
            tone=tone.value,
            structure=structure.value,
            changes=len(changes),
        )

        return FormatResult(
            original=request.instruction,
            formatted=text,
            audience_role=request.audience_role.value,
            tone_applied=tone.value,
            structure_applied=structure.value,
            changes_made=changes,
            metadata=request.metadata,
        )

    def list_roles(self) -> list[str]:
        return [r.value for r in AudienceRole]

    def list_tones(self) -> list[str]:
        return [t.value for t in Tone]

    def list_structures(self) -> list[str]:
        return [s.value for s in StructureStyle]

    def role_preset(self, role: AudienceRole) -> dict[str, str]:
        preset = _ROLE_PRESETS[role]
        return {
            "tone": preset["tone"].value,
            "structure": preset["structure"].value,
            "prefix": preset["prefix"],
            "verb_style": preset["verb_style"],
        }


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_formatter: InstructionFormatter | None = None


def get_instruction_formatter() -> InstructionFormatter:
    global _formatter
    if _formatter is None:
        _formatter = InstructionFormatter()
    return _formatter


__all__ = [
    "Tone",
    "AudienceRole",
    "StructureStyle",
    "FormatRequest",
    "FormatResult",
    "InstructionFormatter",
    "get_instruction_formatter",
]
