"""
AMC Enforce E22 — Structured Output Schema Gate and Auto-Repair
===============================================================

Validates and optionally repairs JSON outputs against registered schemas,
preventing malformed or injected data from propagating through workflows.

Usage::

    from amc.enforce.e22_schema_gate import SchemaGate

    gate = SchemaGate(db_path=":memory:")
    gate.register_schema("invoice_output", {
        "type": "object",
        "required": ["amount", "currency"],
        "properties": {
            "amount": {"type": "integer"},
            "currency": {"type": "string", "default": "USD"},
            "note": {"type": "string"},
        },
        "additionalProperties": False,
    })

    result = gate.validate("invoice_output", {"amount": "42", "extra": "bad"})
    # result.valid == False, extra_fields == ["extra"], errors has type mismatch

    repaired, changes = gate.auto_repair("invoice_output", {"amount": "42", "extra": "bad"})
    # repaired == {"amount": 42, "currency": "USD"}, changes explains what happened
"""
from __future__ import annotations

import copy
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from pydantic import BaseModel, Field

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class SchemaValidation(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    extra_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    explanations: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS schemas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    schema_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(workflow_id, version)
);
"""


# ---------------------------------------------------------------------------
# Type coercion helpers
# ---------------------------------------------------------------------------

def _coerce(value: Any, target_type: str) -> tuple[Any, bool]:
    """Try to coerce *value* to *target_type*. Returns (coerced, success)."""
    if target_type == "integer":
        if isinstance(value, int) and not isinstance(value, bool):
            return value, True
        if isinstance(value, str):
            try:
                return int(value), True
            except ValueError:
                pass
        if isinstance(value, float) and value == int(value):
            return int(value), True
    elif target_type == "number":
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value), True
        if isinstance(value, str):
            try:
                return float(value), True
            except ValueError:
                pass
    elif target_type == "string":
        if isinstance(value, str):
            return value, True
        if isinstance(value, (int, float)):
            return str(value), True
    elif target_type == "boolean":
        if isinstance(value, bool):
            return value, True
    elif target_type == "array":
        if isinstance(value, list):
            return value, True
    elif target_type == "object":
        if isinstance(value, dict):
            return value, True
    return value, False


def _check_type(value: Any, expected: str) -> bool:
    mapping = {
        "string": str, "integer": int, "number": (int, float),
        "boolean": bool, "array": list, "object": dict, "null": type(None),
    }
    if expected == "integer" and isinstance(value, bool):
        return False
    if expected == "number" and isinstance(value, bool):
        return False
    t = mapping.get(expected)
    if t is None:
        return True
    return isinstance(value, t)


# ---------------------------------------------------------------------------
# Gate
# ---------------------------------------------------------------------------

class SchemaGate:
    """JSON schema gate with versioned registry and deterministic auto-repair."""

    def __init__(self, db_path: str = ":memory:", strict: bool = True) -> None:
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._strict = strict

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------
    def register_schema(self, workflow_id: str, schema: dict[str, Any]) -> int:
        """Register a schema. Returns the version number."""
        row = self._conn.execute(
            "SELECT MAX(version) as v FROM schemas WHERE workflow_id = ?", (workflow_id,)
        ).fetchone()
        version = (row["v"] or 0) + 1
        self._conn.execute(
            "INSERT INTO schemas (workflow_id, version, schema_json, created_at) VALUES (?,?,?,?)",
            (workflow_id, version, json.dumps(schema), datetime.now(timezone.utc).isoformat()),
        )
        self._conn.commit()
        logger.info("schema_gate.registered", workflow_id=workflow_id, version=version)
        return version

    def get_schema(self, workflow_id: str, version: int | None = None) -> dict[str, Any] | None:
        if version:
            row = self._conn.execute(
                "SELECT schema_json FROM schemas WHERE workflow_id = ? AND version = ?",
                (workflow_id, version),
            ).fetchone()
        else:
            row = self._conn.execute(
                "SELECT schema_json FROM schemas WHERE workflow_id = ? ORDER BY version DESC LIMIT 1",
                (workflow_id,),
            ).fetchone()
        return json.loads(row["schema_json"]) if row else None

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------
    def validate(self, workflow_id: str, output: dict[str, Any], version: int | None = None) -> SchemaValidation:
        schema = self.get_schema(workflow_id, version)
        if schema is None:
            return SchemaValidation(valid=False, errors=[f"No schema registered for '{workflow_id}'"])

        return self._validate_against(output, schema)

    def _validate_against(self, output: dict[str, Any], schema: dict[str, Any]) -> SchemaValidation:
        errors: list[str] = []
        extra: list[str] = []
        missing: list[str] = []
        explanations: list[str] = []

        if schema.get("type") == "object":
            props = schema.get("properties", {})
            required = set(schema.get("required", []))
            additional = schema.get("additionalProperties", True)

            # Extra fields
            allowed_keys = set(props.keys())
            for key in output:
                if key not in allowed_keys:
                    extra.append(key)
                    msg = f"Extra field '{key}' not in schema"
                    errors.append(msg)
                    explanations.append(f"Field '{key}' is not defined in the schema properties. " +
                                        ("Strict mode rejects extra fields." if self._strict else ""))

            # Missing required
            for key in required:
                if key not in output:
                    missing.append(key)
                    errors.append(f"Required field '{key}' is missing")
                    explanations.append(f"Field '{key}' is listed in 'required' but absent from the output.")

            # Type checking
            for key, prop_schema in props.items():
                if key not in output:
                    continue
                expected_type = prop_schema.get("type")
                if expected_type and not _check_type(output[key], expected_type):
                    errors.append(f"Field '{key}': expected {expected_type}, got {type(output[key]).__name__}")
                    explanations.append(
                        f"Field '{key}' has value {output[key]!r} of type {type(output[key]).__name__}, "
                        f"but schema requires {expected_type}."
                    )

            # Strict mode: extra fields → invalid
            if self._strict and extra:
                pass  # already in errors

            if not self._strict:
                extra_errors = [e for e in errors if "Extra field" in e]
                for e in extra_errors:
                    errors.remove(e)

        valid = len(errors) == 0
        return SchemaValidation(valid=valid, errors=errors, extra_fields=extra,
                                missing_fields=missing, explanations=explanations)

    # ------------------------------------------------------------------
    # Auto-repair
    # ------------------------------------------------------------------
    def auto_repair(self, workflow_id: str, output: dict[str, Any],
                    version: int | None = None) -> tuple[dict[str, Any], list[str]]:
        """Deterministic repair. Returns (repaired_output, list_of_changes).

        Never guesses: if a required field without a default is missing,
        returns the original output with an error description.
        """
        schema = self.get_schema(workflow_id, version)
        if schema is None:
            return output, [f"No schema for '{workflow_id}' — cannot repair"]

        if schema.get("type") != "object":
            return output, ["Auto-repair only supports object schemas"]

        repaired = copy.deepcopy(output)
        changes: list[str] = []
        props = schema.get("properties", {})
        required = set(schema.get("required", []))

        # 1. Remove extra fields
        allowed = set(props.keys())
        for key in list(repaired.keys()):
            if key not in allowed:
                del repaired[key]
                changes.append(f"Removed extra field '{key}'")

        # 2. Apply defaults for missing optional fields
        for key, prop_schema in props.items():
            if key not in repaired:
                if "default" in prop_schema:
                    repaired[key] = prop_schema["default"]
                    changes.append(f"Applied default for '{key}': {prop_schema['default']!r}")
                elif key in required:
                    # Cannot repair — required field with no default
                    return output, [f"Cannot repair: required field '{key}' missing with no default"]

        # 3. Type coercion
        for key, prop_schema in props.items():
            if key not in repaired:
                continue
            expected = prop_schema.get("type")
            if expected and not _check_type(repaired[key], expected):
                coerced, ok = _coerce(repaired[key], expected)
                if ok:
                    old_val = repaired[key]
                    repaired[key] = coerced
                    changes.append(f"Coerced '{key}': {old_val!r} ({type(old_val).__name__}) → {coerced!r} ({expected})")
                else:
                    return output, [f"Cannot coerce '{key}' value {repaired[key]!r} to {expected}"]

        logger.info("schema_gate.repaired", workflow_id=workflow_id, changes=len(changes))
        return repaired, changes
