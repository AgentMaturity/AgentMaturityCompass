"""Tests for amc.product.instruction_formatter — Persona-Aware Instruction Formatter."""
from __future__ import annotations

import pytest

from amc.product.instruction_formatter import (
    AudienceRole,
    FormatRequest,
    InstructionFormatter,
    StructureStyle,
    Tone,
    get_instruction_formatter,
)


@pytest.fixture()
def formatter() -> InstructionFormatter:
    return InstructionFormatter()


# ---------------------------------------------------------------------------
# Basic formatting
# ---------------------------------------------------------------------------


def test_generic_role_formats_instruction(formatter):
    result = formatter.format(FormatRequest(instruction="Analyze the sales data."))
    assert result.formatted
    assert result.original == "Analyze the sales data."
    assert result.audience_role == AudienceRole.GENERIC.value


def test_developer_role_uses_technical_tone(formatter):
    result = formatter.format(
        FormatRequest(instruction="Use the API to get the data.", audience_role=AudienceRole.DEVELOPER)
    )
    assert result.tone_applied == Tone.TECHNICAL.value
    assert result.formatted


def test_executive_role_uses_concise_structure(formatter):
    result = formatter.format(
        FormatRequest(
            instruction="We need to look at the revenue numbers.",
            audience_role=AudienceRole.EXECUTIVE,
        )
    )
    assert result.structure_applied == StructureStyle.CONCISE.value


def test_support_role_uses_numbered_structure(formatter):
    result = formatter.format(
        FormatRequest(
            instruction="Help the customer. Find the issue. Provide a solution.",
            audience_role=AudienceRole.SUPPORT,
        )
    )
    assert result.structure_applied == StructureStyle.NUMBERED.value


def test_sales_role_uses_bulleted_structure(formatter):
    result = formatter.format(
        FormatRequest(
            instruction="Follow up. Send proposal. Schedule demo.",
            audience_role=AudienceRole.SALES,
        )
    )
    assert result.structure_applied == StructureStyle.BULLETED.value


# ---------------------------------------------------------------------------
# Vocabulary substitution
# ---------------------------------------------------------------------------


def test_technical_tone_substitutes_vocab(formatter):
    result = formatter.format(
        FormatRequest(
            instruction="Use the tool to get the data.",
            audience_role=AudienceRole.DEVELOPER,
        )
    )
    # "use" → "invoke", "get" → "retrieve" in technical vocab
    assert "invoke" in result.formatted.lower() or "retrieve" in result.formatted.lower()


def test_executive_tone_substitutes_leverage(formatter):
    result = formatter.format(
        FormatRequest(
            instruction="Use this approach to check the results.",
            audience_role=AudienceRole.EXECUTIVE,
        )
    )
    # "use" → "leverage", "check" → "assess"
    assert "leverage" in result.formatted.lower() or "assess" in result.formatted.lower()


# ---------------------------------------------------------------------------
# Tone/structure overrides
# ---------------------------------------------------------------------------


def test_tone_override(formatter):
    result = formatter.format(
        FormatRequest(
            instruction="Complete the task.",
            audience_role=AudienceRole.GENERIC,
            tone=Tone.CASUAL,
        )
    )
    assert result.tone_applied == Tone.CASUAL.value


def test_structure_override(formatter):
    result = formatter.format(
        FormatRequest(
            instruction="Do A. Then do B. Finally do C.",
            audience_role=AudienceRole.GENERIC,
            structure=StructureStyle.HEADERS,
        )
    )
    assert result.structure_applied == StructureStyle.HEADERS.value


# ---------------------------------------------------------------------------
# Context prepend
# ---------------------------------------------------------------------------


def test_context_prepended_to_instruction(formatter):
    result = formatter.format(
        FormatRequest(
            instruction="Generate the report.",
            context="You are working on Q4 financials.",
        )
    )
    assert "Q4 financials" in result.formatted
    assert any("context" in c.lower() for c in result.changes_made)


# ---------------------------------------------------------------------------
# Rationale
# ---------------------------------------------------------------------------


def test_rationale_appended(formatter):
    result = formatter.format(
        FormatRequest(
            instruction="Deploy the update.",
            audience_role=AudienceRole.DEVELOPER,
            include_rationale=True,
        )
    )
    assert "rationale" in result.formatted.lower() or "required" in result.formatted.lower()
    assert any("rationale" in c.lower() for c in result.changes_made)


# ---------------------------------------------------------------------------
# Max length truncation
# ---------------------------------------------------------------------------


def test_max_length_truncates_output(formatter):
    result = formatter.format(
        FormatRequest(
            instruction="This is a very long instruction " * 20,
            max_length=100,
        )
    )
    assert len(result.formatted) <= 110  # small buffer for ellipsis
    assert any("truncated" in c.lower() for c in result.changes_made)


# ---------------------------------------------------------------------------
# Introspection helpers
# ---------------------------------------------------------------------------


def test_list_roles(formatter):
    roles = formatter.list_roles()
    assert "developer" in roles
    assert "executive" in roles


def test_list_tones(formatter):
    tones = formatter.list_tones()
    assert "technical" in tones
    assert "formal" in tones


def test_list_structures(formatter):
    structs = formatter.list_structures()
    assert "numbered" in structs
    assert "bulleted" in structs


def test_role_preset(formatter):
    preset = formatter.role_preset(AudienceRole.DEVELOPER)
    assert preset["tone"] == "technical"
    assert preset["structure"] == "numbered"


# ---------------------------------------------------------------------------
# Result dict
# ---------------------------------------------------------------------------


def test_result_dict_shape(formatter):
    result = formatter.format(FormatRequest(instruction="Do something."))
    d = result.dict
    assert "original" in d
    assert "formatted" in d
    assert "audience_role" in d
    assert "changes_made" in d


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------


def test_singleton():
    f1 = get_instruction_formatter()
    f2 = get_instruction_formatter()
    assert f1 is f2
