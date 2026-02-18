"""Tool Response Validator — Wave-2 Tool Intelligence.

Validates tool call outputs against expected schemas and constraints:
  - JSON Schema-style type/required field checking
  - Value constraints: min/max, enum, regex pattern, non-empty
  - Custom assertion rules (callable or dict-based)
  - Structured violation report with remediation hints

SQLite-backed for audit log of all validations.
"""
from __future__ import annotations

import json
import re
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS response_validations (
    validation_id   TEXT PRIMARY KEY,
    tool_name       TEXT NOT NULL DEFAULT '',
    valid           INTEGER NOT NULL DEFAULT 1,
    violations_json TEXT NOT NULL DEFAULT '[]',
    warnings_json   TEXT NOT NULL DEFAULT '[]',
    score           REAL NOT NULL DEFAULT 1.0,
    tenant_id       TEXT NOT NULL DEFAULT '',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resp_val_tool ON response_validations(tool_name);
CREATE INDEX IF NOT EXISTS idx_resp_val_valid ON response_validations(valid);
"""

# ---------------------------------------------------------------------------
# Violation + Warning models
# ---------------------------------------------------------------------------


@dataclass
class Violation:
    field: str
    rule: str
    message: str
    severity: str = "error"    # "error" | "warning"

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "field": self.field,
            "rule": self.rule,
            "message": self.message,
            "severity": self.severity,
        }


@dataclass
class ValidationReport:
    validation_id: str
    tool_name: str
    valid: bool
    violations: list[Violation]
    warnings: list[Violation]
    score: float               # 1.0 = fully valid; 0.0 = completely invalid
    tenant_id: str
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "validation_id": self.validation_id,
            "tool_name": self.tool_name,
            "valid": self.valid,
            "violations": [v.dict for v in self.violations],
            "warnings": [w.dict for w in self.warnings],
            "score": self.score,
            "tenant_id": self.tenant_id,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


# ---------------------------------------------------------------------------
# Validation rules engine
# ---------------------------------------------------------------------------

_TYPE_CHECKS: dict[str, type | tuple[type, ...]] = {
    "string": str,
    "integer": int,
    "number": (int, float),
    "boolean": bool,
    "array": list,
    "object": dict,
    "null": type(None),
}


def _check_type(value: Any, expected: str) -> bool:
    if expected not in _TYPE_CHECKS:
        return True  # unknown type → pass
    expected_type = _TYPE_CHECKS[expected]
    if expected == "integer" and isinstance(value, bool):
        return False  # bool is a subclass of int; reject
    if expected == "number" and isinstance(value, bool):
        return False
    return isinstance(value, expected_type)


def _validate_field(
    field_path: str,
    value: Any,
    schema: dict[str, Any],
    violations: list[Violation],
    warnings: list[Violation],
) -> None:
    """Validate a single field value against its sub-schema."""
    # Type check
    expected_type = schema.get("type")
    if expected_type and not _check_type(value, expected_type):
        violations.append(Violation(
            field=field_path, rule="type",
            message=f"Expected type '{expected_type}', got '{type(value).__name__}'",
        ))
        return  # skip further checks if type is wrong

    # Enum
    enum = schema.get("enum")
    if enum is not None and value not in enum:
        violations.append(Violation(
            field=field_path, rule="enum",
            message=f"Value '{value}' not in allowed enum: {enum}",
        ))

    # String constraints
    if isinstance(value, str):
        min_len = schema.get("minLength")
        max_len = schema.get("maxLength")
        pattern = schema.get("pattern")
        if min_len is not None and len(value) < min_len:
            violations.append(Violation(
                field=field_path, rule="minLength",
                message=f"String length {len(value)} < minLength {min_len}",
            ))
        if max_len is not None and len(value) > max_len:
            violations.append(Violation(
                field=field_path, rule="maxLength",
                message=f"String length {len(value)} > maxLength {max_len}",
            ))
        if pattern and not re.search(pattern, value):
            violations.append(Violation(
                field=field_path, rule="pattern",
                message=f"Value '{value[:50]}' does not match pattern '{pattern}'",
            ))
        if schema.get("nonEmpty") and not value.strip():
            violations.append(Violation(
                field=field_path, rule="nonEmpty",
                message="Field must be non-empty",
            ))

    # Numeric constraints
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        minimum = schema.get("minimum")
        maximum = schema.get("maximum")
        exclusive_min = schema.get("exclusiveMinimum")
        exclusive_max = schema.get("exclusiveMaximum")
        if minimum is not None and value < minimum:
            violations.append(Violation(
                field=field_path, rule="minimum",
                message=f"Value {value} < minimum {minimum}",
            ))
        if maximum is not None and value > maximum:
            violations.append(Violation(
                field=field_path, rule="maximum",
                message=f"Value {value} > maximum {maximum}",
            ))
        if exclusive_min is not None and value <= exclusive_min:
            violations.append(Violation(
                field=field_path, rule="exclusiveMinimum",
                message=f"Value {value} must be > {exclusive_min}",
            ))
        if exclusive_max is not None and value >= exclusive_max:
            violations.append(Violation(
                field=field_path, rule="exclusiveMaximum",
                message=f"Value {value} must be < {exclusive_max}",
            ))

    # Array constraints
    if isinstance(value, list):
        min_items = schema.get("minItems")
        max_items = schema.get("maxItems")
        if min_items is not None and len(value) < min_items:
            violations.append(Violation(
                field=field_path, rule="minItems",
                message=f"Array length {len(value)} < minItems {min_items}",
            ))
        if max_items is not None and len(value) > max_items:
            violations.append(Violation(
                field=field_path, rule="maxItems",
                message=f"Array length {len(value)} > maxItems {max_items}",
            ))
        items_schema = schema.get("items")
        if items_schema:
            for idx, item in enumerate(value):
                _validate_field(f"{field_path}[{idx}]", item, items_schema, violations, warnings)

    # Nested object
    if isinstance(value, dict) and "properties" in schema:
        nested_required = schema.get("required", [])
        for req_key in nested_required:
            if req_key not in value:
                violations.append(Violation(
                    field=f"{field_path}.{req_key}", rule="required",
                    message=f"Required field '{req_key}' missing in nested object",
                ))
        for prop_name, prop_schema in schema.get("properties", {}).items():
            if prop_name in value:
                _validate_field(f"{field_path}.{prop_name}", value[prop_name], prop_schema, violations, warnings)


def _validate_response(
    response: Any,
    schema: dict[str, Any],
    constraints: list[dict[str, Any]] | None = None,
) -> tuple[list[Violation], list[Violation]]:
    """Run full validation; return (violations, warnings)."""
    violations: list[Violation] = []
    warnings: list[Violation] = []

    # Top-level type
    top_type = schema.get("type")
    if top_type and not _check_type(response, top_type):
        violations.append(Violation(
            field="$", rule="type",
            message=f"Response type expected '{top_type}', got '{type(response).__name__}'",
        ))
        return violations, warnings

    # Required fields
    if isinstance(response, dict):
        for req_key in schema.get("required", []):
            if req_key not in response:
                violations.append(Violation(
                    field=req_key, rule="required",
                    message=f"Required field '{req_key}' missing from response",
                ))

        # Property validation
        for prop_name, prop_schema in schema.get("properties", {}).items():
            if prop_name in response:
                _validate_field(prop_name, response[prop_name], prop_schema, violations, warnings)

    # Custom constraints
    for constraint in (constraints or []):
        ctype = constraint.get("type", "")
        field_path = constraint.get("field", "$")
        value = _get_nested(response, field_path)

        if ctype == "not_null":
            if value is None:
                violations.append(Violation(
                    field=field_path, rule="not_null",
                    message=f"Field '{field_path}' must not be null",
                ))
        elif ctype == "regex":
            pattern = constraint.get("pattern", "")
            if not isinstance(value, str) or not re.search(pattern, value):
                violations.append(Violation(
                    field=field_path, rule="regex",
                    message=f"Field '{field_path}' does not match pattern '{pattern}'",
                ))
        elif ctype == "range":
            lo = constraint.get("min")
            hi = constraint.get("max")
            if isinstance(value, (int, float)):
                if lo is not None and value < lo:
                    violations.append(Violation(
                        field=field_path, rule="range",
                        message=f"Field '{field_path}' value {value} < min {lo}",
                    ))
                if hi is not None and value > hi:
                    violations.append(Violation(
                        field=field_path, rule="range",
                        message=f"Field '{field_path}' value {value} > max {hi}",
                    ))
        elif ctype == "warning":
            msg = constraint.get("message", f"Warning on field '{field_path}'")
            warnings.append(Violation(
                field=field_path, rule="custom_warning",
                message=msg, severity="warning",
            ))

    return violations, warnings


def _get_nested(obj: Any, path: str) -> Any:
    """Resolve dot-notation path in dict. Returns None if not found."""
    if path == "$" or not path:
        return obj
    parts = path.split(".")
    cur = obj
    for part in parts:
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


def _score(
    violations: list[Violation],
    warnings: list[Violation],
    total_checks: int,
) -> float:
    if total_checks == 0:
        return 1.0
    penalty = len(violations) * 1.0 + len(warnings) * 0.25
    return round(max(0.0, 1.0 - penalty / max(total_checks, 1)), 3)


# ---------------------------------------------------------------------------
# Core validator
# ---------------------------------------------------------------------------


class ToolResponseValidator:
    """Validate tool responses against schemas. SQLite-backed audit log."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(product_db_path(db_path))
        self._conn = self._init_db()

    def _init_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.executescript(_SCHEMA_SQL)
        conn.commit()
        return conn

    def validate(
        self,
        tool_name: str,
        response: Any,
        schema: dict[str, Any],
        constraints: list[dict[str, Any]] | None = None,
        tenant_id: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> ValidationReport:
        """Validate a tool response and persist the report."""
        violations, warnings = _validate_response(response, schema, constraints)
        # Count total checks as schema required fields + properties + constraints
        total = (
            len(schema.get("required", []))
            + len(schema.get("properties", {}))
            + len(constraints or [])
        )
        score = _score(violations, warnings, total)
        valid = len(violations) == 0

        validation_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        self._conn.execute(
            """INSERT INTO response_validations
               (validation_id,tool_name,valid,violations_json,warnings_json,
                score,tenant_id,metadata_json,created_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                validation_id, tool_name,
                1 if valid else 0,
                json.dumps([v.dict for v in violations]),
                json.dumps([w.dict for w in warnings]),
                score, tenant_id, json.dumps(metadata or {}), now,
            ),
        )
        self._conn.commit()

        return ValidationReport(
            validation_id=validation_id, tool_name=tool_name,
            valid=valid, violations=violations, warnings=warnings,
            score=score, tenant_id=tenant_id,
            metadata=metadata or {}, created_at=now,
        )

    def get_report(self, validation_id: str) -> ValidationReport | None:
        row = self._conn.execute(
            "SELECT * FROM response_validations WHERE validation_id=?", (validation_id,)
        ).fetchone()
        return self._row_to_report(row) if row else None

    def list_reports(
        self,
        tool_name: str | None = None,
        valid_only: bool | None = None,
        tenant_id: str | None = None,
        limit: int = 100,
    ) -> list[ValidationReport]:
        q = "SELECT * FROM response_validations WHERE 1=1"
        params: list[Any] = []
        if tool_name:
            q += " AND tool_name=?"; params.append(tool_name)
        if valid_only is True:
            q += " AND valid=1"
        elif valid_only is False:
            q += " AND valid=0"
        if tenant_id:
            q += " AND tenant_id=?"; params.append(tenant_id)
        q += " ORDER BY created_at DESC LIMIT ?"; params.append(limit)
        return [self._row_to_report(r) for r in self._conn.execute(q, params).fetchall()]

    def summary(self, tool_name: str | None = None) -> dict[str, Any]:
        """Aggregate validation stats."""
        q = "SELECT valid, score FROM response_validations WHERE 1=1"
        params: list[Any] = []
        if tool_name:
            q += " AND tool_name=?"; params.append(tool_name)
        rows = self._conn.execute(q, params).fetchall()
        total = len(rows)
        if not total:
            return {"total": 0, "valid": 0, "invalid": 0, "avg_score": 0.0}
        valid_count = sum(1 for r in rows if r["valid"])
        avg_score = sum(r["score"] for r in rows) / total
        return {
            "total": total,
            "valid": valid_count,
            "invalid": total - valid_count,
            "avg_score": round(avg_score, 4),
        }

    @staticmethod
    def _row_to_report(row: sqlite3.Row) -> ValidationReport:
        violations = [
            Violation(field=v["field"], rule=v["rule"], message=v["message"], severity=v.get("severity", "error"))
            for v in json.loads(row["violations_json"])
        ]
        warnings = [
            Violation(field=v["field"], rule=v["rule"], message=v["message"], severity=v.get("severity", "warning"))
            for v in json.loads(row["warnings_json"])
        ]
        return ValidationReport(
            validation_id=row["validation_id"], tool_name=row["tool_name"],
            valid=bool(row["valid"]), violations=violations, warnings=warnings,
            score=row["score"], tenant_id=row["tenant_id"],
            metadata=json.loads(row["metadata_json"]), created_at=row["created_at"],
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_validator: ToolResponseValidator | None = None


def get_response_validator(db_path: str | Path | None = None) -> ToolResponseValidator:
    global _validator
    if _validator is None:
        _validator = ToolResponseValidator(db_path=db_path)
    return _validator


__all__ = [
    "Violation",
    "ValidationReport",
    "ToolResponseValidator",
    "get_response_validator",
]
