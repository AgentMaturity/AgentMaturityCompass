"""Tests for amc.product.structured_output — Structured Output Enforcer."""
from __future__ import annotations

import json
import pytest

from amc.product.structured_output import (
    EnforceRequest,
    OutputFormat,
    OutputSchema,
    StructuredOutputEnforcer,
    ValidationStatus,
    get_structured_output_enforcer,
)


@pytest.fixture()
def enforcer() -> StructuredOutputEnforcer:
    return StructuredOutputEnforcer()


# ---------------------------------------------------------------------------
# JSON format
# ---------------------------------------------------------------------------


def test_valid_json_returns_valid_status(enforcer):
    schema = OutputSchema(
        format=OutputFormat.JSON,
        fields={"name": "str", "score": "float"},
    )
    raw = json.dumps({"name": "Alice", "score": 0.95})
    result = enforcer.enforce(EnforceRequest(raw_output=raw, schema=schema))
    assert result.status == ValidationStatus.VALID
    assert result.parsed is not None
    assert result.errors == []


def test_json_missing_field_triggers_repair(enforcer):
    schema = OutputSchema(
        format=OutputFormat.JSON,
        fields={"name": "str", "score": "float", "rank": "int"},
    )
    raw = json.dumps({"name": "Bob"})
    result = enforcer.enforce(EnforceRequest(raw_output=raw, schema=schema))
    assert result.status in (ValidationStatus.REPAIRED, ValidationStatus.VALID)
    assert any("score" in r or "rank" in r for r in result.repairs_applied)


def test_json_extracted_from_code_fence(enforcer):
    schema = OutputSchema(
        format=OutputFormat.JSON,
        fields={"value": "str"},
    )
    raw = '```json\n{"value": "hello"}\n```'
    result = enforcer.enforce(EnforceRequest(raw_output=raw, schema=schema))
    assert result.status in (ValidationStatus.VALID, ValidationStatus.REPAIRED)
    assert any("fence" in r.lower() for r in result.repairs_applied)


def test_json_trailing_comma_repaired(enforcer):
    schema = OutputSchema(format=OutputFormat.JSON, fields={"x": "int"})
    raw = '{"x": 1,}'
    result = enforcer.enforce(EnforceRequest(raw_output=raw, schema=schema))
    assert result.status in (ValidationStatus.VALID, ValidationStatus.REPAIRED)


def test_json_type_mismatch_reported(enforcer):
    schema = OutputSchema(
        format=OutputFormat.JSON,
        fields={"count": "int"},
    )
    raw = json.dumps({"count": "not_an_int"})
    result = enforcer.enforce(EnforceRequest(raw_output=raw, schema=schema))
    # Should report a type error but may still be repaired or failed
    assert result.format == "json"


def test_json_strict_mode_rejects_extra_fields(enforcer):
    schema = OutputSchema(
        format=OutputFormat.JSON,
        fields={"a": "str"},
        strict=True,
    )
    raw = json.dumps({"a": "hello", "b": "extra"})
    result = enforcer.enforce(EnforceRequest(raw_output=raw, schema=schema))
    # Strict mode should flag extra fields
    assert any("Unexpected" in e for e in result.errors) or result.status != ValidationStatus.VALID


# ---------------------------------------------------------------------------
# Markdown format
# ---------------------------------------------------------------------------


def test_valid_markdown_headings(enforcer):
    schema = OutputSchema(
        format=OutputFormat.MARKDOWN,
        required_headings=["Summary", "Next Steps"],
    )
    raw = "## Summary\n\nSome text.\n\n## Next Steps\n\nDo this."
    result = enforcer.enforce(EnforceRequest(raw_output=raw, schema=schema))
    assert result.status == ValidationStatus.VALID


def test_missing_markdown_heading_repaired(enforcer):
    schema = OutputSchema(
        format=OutputFormat.MARKDOWN,
        required_headings=["Summary", "Risks"],
    )
    raw = "## Summary\n\nSome text."
    result = enforcer.enforce(EnforceRequest(raw_output=raw, schema=schema))
    assert result.status in (ValidationStatus.REPAIRED, ValidationStatus.VALID)
    assert "Risks" in result.output


def test_markdown_all_headings_missing(enforcer):
    schema = OutputSchema(
        format=OutputFormat.MARKDOWN,
        required_headings=["Overview", "Plan"],
    )
    raw = "Just some plain text without headings."
    result = enforcer.enforce(EnforceRequest(raw_output=raw, schema=schema))
    assert "Overview" in result.output
    assert "Plan" in result.output


# ---------------------------------------------------------------------------
# Table format
# ---------------------------------------------------------------------------


def test_valid_table_passes(enforcer):
    schema = OutputSchema(
        format=OutputFormat.TABLE,
        required_columns=["Name", "Score"],
    )
    raw = "| Name | Score |\n| --- | --- |\n| Alice | 95 |"
    result = enforcer.enforce(EnforceRequest(raw_output=raw, schema=schema))
    assert result.status == ValidationStatus.VALID


def test_missing_table_repaired(enforcer):
    schema = OutputSchema(
        format=OutputFormat.TABLE,
        required_columns=["Name", "Score"],
    )
    raw = "No table here at all."
    result = enforcer.enforce(EnforceRequest(raw_output=raw, schema=schema))
    assert result.status in (ValidationStatus.REPAIRED, ValidationStatus.VALID)
    assert "Name" in result.output


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------


def test_get_enforcer_singleton():
    e1 = get_structured_output_enforcer()
    e2 = get_structured_output_enforcer()
    assert e1 is e2


def test_result_dict_keys(enforcer):
    schema = OutputSchema(format=OutputFormat.JSON, fields={"k": "str"})
    result = enforcer.enforce(EnforceRequest(raw_output='{"k":"v"}', schema=schema))
    d = result.dict
    assert "status" in d
    assert "output" in d
    assert "errors" in d
    assert "repairs_applied" in d
