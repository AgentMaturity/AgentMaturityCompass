"""Structured Output Enforcer — schema-enforce + auto-repair LLM outputs.

Accepts JSON/markdown/table schemas and validates or repairs a raw LLM response
to match the declared structure.  No external dependencies beyond stdlib.

API: POST /api/v1/product/output/enforce
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import structlog

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class OutputFormat(str, Enum):
    JSON = "json"
    MARKDOWN = "markdown"
    TABLE = "table"


class ValidationStatus(str, Enum):
    VALID = "valid"
    REPAIRED = "repaired"
    FAILED = "failed"


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class OutputSchema:
    """Declares the expected structure of an LLM output."""

    format: OutputFormat
    # JSON schemas: dict of {field: type_str}  e.g. {"name": "str", "score": "float"}
    fields: dict[str, str] = field(default_factory=dict)
    # Markdown: list of required heading titles
    required_headings: list[str] = field(default_factory=list)
    # Table: list of required column headers
    required_columns: list[str] = field(default_factory=list)
    # Allow extra keys in JSON (default True)
    strict: bool = False


@dataclass
class EnforceRequest:
    """Input to the enforcer."""

    raw_output: str
    schema: OutputSchema
    max_repair_attempts: int = 2
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class EnforceResult:
    """Result of enforcement."""

    status: ValidationStatus
    format: str
    original: str
    output: str
    parsed: Any | None
    errors: list[str]
    repairs_applied: list[str]
    metadata: dict[str, Any]

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "status": self.status.value,
            "format": self.format,
            "original": self.original,
            "output": self.output,
            "parsed": self.parsed,
            "errors": self.errors,
            "repairs_applied": self.repairs_applied,
            "metadata": self.metadata,
        }


# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------

_PY_TYPE_MAP: dict[str, type] = {
    "str": str,
    "string": str,
    "int": int,
    "integer": int,
    "float": float,
    "number": float,
    "bool": bool,
    "boolean": bool,
    "list": list,
    "array": list,
    "dict": dict,
    "object": dict,
}


def _validate_json(text: str, schema: OutputSchema) -> tuple[Any, list[str]]:
    """Parse JSON and check field presence/types. Returns (parsed, errors)."""
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        return None, [f"JSON parse error: {exc}"]

    if not isinstance(data, dict):
        return data, ["Root element must be a JSON object"]

    errors: list[str] = []
    for fname, ftype in schema.fields.items():
        if fname not in data:
            errors.append(f"Missing required field: '{fname}'")
            continue
        expected = _PY_TYPE_MAP.get(ftype.lower())
        if expected and not isinstance(data[fname], expected):
            errors.append(
                f"Field '{fname}' expected {ftype}, got {type(data[fname]).__name__}"
            )
    if schema.strict:
        extra = set(data.keys()) - set(schema.fields.keys())
        if extra:
            errors.append(f"Unexpected fields: {sorted(extra)}")
    return data, errors


def _validate_markdown(text: str, schema: OutputSchema) -> list[str]:
    """Check required headings exist in markdown."""
    errors = []
    headings_found = {
        m.group(1).strip().lower()
        for m in re.finditer(r"^#+\s+(.+)$", text, re.MULTILINE)
    }
    for heading in schema.required_headings:
        if heading.lower() not in headings_found:
            errors.append(f"Missing required heading: '{heading}'")
    return errors


def _validate_table(text: str, schema: OutputSchema) -> tuple[list[str], list[str]]:
    """Check markdown table columns.  Returns (found_cols, errors)."""
    errors = []
    # Find first pipe-delimited row
    header_match = re.search(r"^\|(.+)\|", text, re.MULTILINE)
    if not header_match:
        return [], [f"No markdown table found (expected columns: {schema.required_columns})"]
    cols = [c.strip().lower() for c in header_match.group(1).split("|")]
    for col in schema.required_columns:
        if col.lower() not in cols:
            errors.append(f"Missing required column: '{col}'")
    return cols, errors


# ---------------------------------------------------------------------------
# Repairers
# ---------------------------------------------------------------------------


def _repair_json(text: str, schema: OutputSchema, errors: list[str]) -> tuple[str, list[str]]:
    """Attempt to repair common JSON issues."""
    repairs: list[str] = []

    # 1. Extract JSON block from a code fence
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence_match:
        candidate = fence_match.group(1)
        try:
            json.loads(candidate)
            repairs.append("Extracted JSON from code fence")
            text = candidate
        except json.JSONDecodeError:
            pass

    # 2. Fix trailing commas
    clean = re.sub(r",\s*([}\]])", r"\1", text)
    if clean != text:
        repairs.append("Removed trailing commas")
        text = clean

    # 3. Inject missing fields with defaults
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return text, repairs

    changed = False
    for fname, ftype in schema.fields.items():
        if fname not in data:
            defaults: dict[str, Any] = {
                "str": "", "string": "", "int": 0, "integer": 0,
                "float": 0.0, "number": 0.0, "bool": False, "boolean": False,
                "list": [], "array": [], "dict": {}, "object": {},
            }
            data[fname] = defaults.get(ftype.lower(), None)
            repairs.append(f"Injected default for missing field '{fname}'")
            changed = True

    if changed:
        text = json.dumps(data)

    return text, repairs


def _repair_markdown(text: str, schema: OutputSchema, errors: list[str]) -> tuple[str, list[str]]:
    """Append missing headings as empty sections."""
    repairs = []
    existing = {
        m.group(1).strip().lower()
        for m in re.finditer(r"^#+\s+(.+)$", text, re.MULTILINE)
    }
    for heading in schema.required_headings:
        if heading.lower() not in existing:
            text += f"\n\n## {heading}\n\n_No content provided._"
            repairs.append(f"Added missing heading: '{heading}'")
    return text, repairs


def _repair_table(text: str, schema: OutputSchema, errors: list[str]) -> tuple[str, list[str]]:
    """Append a minimal table if none found, or add missing columns."""
    repairs = []
    if "No markdown table found" in "\n".join(errors):
        header = " | ".join(schema.required_columns)
        sep = " | ".join(["---"] * len(schema.required_columns))
        text += f"\n\n| {header} |\n| {sep} |\n| {' | '.join([''] * len(schema.required_columns))} |\n"
        repairs.append("Inserted empty table with required columns")
    return text, repairs


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class StructuredOutputEnforcer:
    """Validate and auto-repair LLM outputs against a declared schema."""

    def enforce(self, request: EnforceRequest) -> EnforceResult:
        fmt = request.schema.format
        raw = request.raw_output
        errors: list[str] = []
        repairs: list[str] = []
        parsed: Any = None
        output = raw

        # --- validate ---
        if fmt == OutputFormat.JSON:
            parsed, errors = _validate_json(raw, request.schema)
        elif fmt == OutputFormat.MARKDOWN:
            errors = _validate_markdown(raw, request.schema)
        elif fmt == OutputFormat.TABLE:
            _, errors = _validate_table(raw, request.schema)

        if not errors:
            log.debug("structured_output_valid", format=fmt.value)
            return EnforceResult(
                status=ValidationStatus.VALID,
                format=fmt.value,
                original=raw,
                output=raw,
                parsed=parsed,
                errors=[],
                repairs_applied=[],
                metadata=request.metadata,
            )

        # --- repair loop ---
        current = raw
        for attempt in range(request.max_repair_attempts):
            if fmt == OutputFormat.JSON:
                current, attempt_repairs = _repair_json(current, request.schema, errors)
                repairs.extend(attempt_repairs)
                parsed, errors = _validate_json(current, request.schema)
            elif fmt == OutputFormat.MARKDOWN:
                current, attempt_repairs = _repair_markdown(current, request.schema, errors)
                repairs.extend(attempt_repairs)
                errors = _validate_markdown(current, request.schema)
            elif fmt == OutputFormat.TABLE:
                current, attempt_repairs = _repair_table(current, request.schema, errors)
                repairs.extend(attempt_repairs)
                _, errors = _validate_table(current, request.schema)

            if not errors:
                output = current
                break
        else:
            output = current

        status = ValidationStatus.REPAIRED if not errors else ValidationStatus.FAILED

        log.info(
            "structured_output_enforced",
            format=fmt.value,
            status=status.value,
            repairs=len(repairs),
            remaining_errors=len(errors),
        )

        return EnforceResult(
            status=status,
            format=fmt.value,
            original=raw,
            output=output,
            parsed=parsed if not errors else None,
            errors=errors,
            repairs_applied=repairs,
            metadata=request.metadata,
        )


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_enforcer: StructuredOutputEnforcer | None = None


def get_structured_output_enforcer() -> StructuredOutputEnforcer:
    global _enforcer
    if _enforcer is None:
        _enforcer = StructuredOutputEnforcer()
    return _enforcer


__all__ = [
    "OutputFormat",
    "ValidationStatus",
    "OutputSchema",
    "EnforceRequest",
    "EnforceResult",
    "StructuredOutputEnforcer",
    "get_structured_output_enforcer",
]
