"""Tool Parameter Auto-Filler — Wave-2 Tool Intelligence.

Given a tool's JSON schema and current context (session memory, recent outputs,
environment defaults), infers and fills missing or optional parameters.

Strategy:
  1. Schema defaults → fill from JSON Schema "default" fields
  2. Context mapping → match context keys to param names (fuzzy)
  3. Type coercion → cast extracted value to required type
  4. Confidence scoring → report confidence per filled param

No external dependencies; pure heuristic matching.
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
CREATE TABLE IF NOT EXISTS autofill_sessions (
    session_id      TEXT PRIMARY KEY,
    tool_name       TEXT NOT NULL DEFAULT '',
    params_before   TEXT NOT NULL DEFAULT '{}',
    params_after    TEXT NOT NULL DEFAULT '{}',
    fills_json      TEXT NOT NULL DEFAULT '[]',
    coverage        REAL NOT NULL DEFAULT 0.0,
    tenant_id       TEXT NOT NULL DEFAULT '',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_autofill_tool ON autofill_sessions(tool_name);
"""

# ---------------------------------------------------------------------------
# Type coercion helpers
# ---------------------------------------------------------------------------

_BOOL_TRUE = {"true", "yes", "1", "on", "enabled"}
_BOOL_FALSE = {"false", "no", "0", "off", "disabled"}


def _coerce(value: Any, target_type: str) -> tuple[Any, bool]:
    """Attempt to coerce value to target_type. Returns (coerced, success)."""
    try:
        if target_type == "string":
            return str(value), True
        if target_type == "integer":
            return int(float(str(value))), True
        if target_type == "number":
            return float(str(value)), True
        if target_type == "boolean":
            sv = str(value).lower()
            if sv in _BOOL_TRUE:
                return True, True
            if sv in _BOOL_FALSE:
                return False, True
        if target_type == "array":
            if isinstance(value, list):
                return value, True
            # Try splitting comma-separated string
            if isinstance(value, str):
                return [v.strip() for v in value.split(",") if v.strip()], True
        if target_type == "object":
            if isinstance(value, dict):
                return value, True
            if isinstance(value, str):
                return json.loads(value), True
        return value, True  # pass-through
    except (ValueError, TypeError, json.JSONDecodeError):
        return value, False


def _normalize_key(key: str) -> str:
    """Lowercase + strip underscores/hyphens for fuzzy matching."""
    return re.sub(r"[_\-\s]+", "", key.lower())


def _find_context_value(
    param_name: str, context: dict[str, Any]
) -> tuple[Any, float]:
    """Try to match a param_name to a context key. Returns (value, confidence)."""
    norm_param = _normalize_key(param_name)

    # Exact match
    if param_name in context:
        return context[param_name], 1.0

    # Normalized exact match
    for k, v in context.items():
        if _normalize_key(k) == norm_param:
            return v, 0.95

    # Substring containment (param name is part of context key or vice versa)
    for k, v in context.items():
        nk = _normalize_key(k)
        if norm_param in nk or nk in norm_param:
            return v, 0.7

    # Token overlap
    param_tokens = set(re.findall(r"\w+", param_name.lower()))
    best_overlap = 0.0
    best_val: Any = None
    for k, v in context.items():
        ctx_tokens = set(re.findall(r"\w+", k.lower()))
        if not ctx_tokens:
            continue
        overlap = len(param_tokens & ctx_tokens) / max(len(param_tokens), 1)
        if overlap > best_overlap:
            best_overlap = overlap
            best_val = v

    if best_overlap >= 0.5:
        return best_val, best_overlap * 0.6

    return None, 0.0


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class ParamFill:
    param_name: str
    original_value: Any        # None if was missing
    filled_value: Any
    source: str                # "default" | "context" | "inferred"
    confidence: float
    coerced: bool

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "param_name": self.param_name,
            "original_value": self.original_value,
            "filled_value": self.filled_value,
            "source": self.source,
            "confidence": self.confidence,
            "coerced": self.coerced,
        }


@dataclass
class AutofillResult:
    session_id: str
    tool_name: str
    params_before: dict[str, Any]
    params_after: dict[str, Any]
    fills: list[ParamFill]
    coverage: float            # fraction of required params now filled
    tenant_id: str
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "tool_name": self.tool_name,
            "params_before": self.params_before,
            "params_after": self.params_after,
            "fills": [f.dict for f in self.fills],
            "coverage": self.coverage,
            "tenant_id": self.tenant_id,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


# ---------------------------------------------------------------------------
# Core auto-filler
# ---------------------------------------------------------------------------


class ToolParamAutoFiller:
    """Fill missing tool parameters from schema defaults + context."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(product_db_path(db_path))
        self._conn = self._init_db()

    def _init_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.executescript(_SCHEMA_SQL)
        conn.commit()
        return conn

    def autofill(
        self,
        tool_name: str,
        tool_schema: dict[str, Any],
        existing_params: dict[str, Any],
        context: dict[str, Any] | None = None,
        tenant_id: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> AutofillResult:
        """Fill missing params from schema + context and persist."""
        ctx = context or {}
        params_after = dict(existing_params)
        fills: list[ParamFill] = []

        schema_props: dict[str, Any] = tool_schema.get("properties", {})
        required_fields: list[str] = tool_schema.get("required", [])

        for param_name, param_schema in schema_props.items():
            if param_name in params_after and params_after[param_name] is not None:
                continue  # already provided

            original = params_after.get(param_name)
            target_type = param_schema.get("type", "string")

            # Strategy 1: schema default
            if "default" in param_schema:
                raw = param_schema["default"]
                coerced_val, ok = _coerce(raw, target_type)
                fills.append(ParamFill(
                    param_name=param_name, original_value=original,
                    filled_value=coerced_val, source="default",
                    confidence=1.0, coerced=ok,
                ))
                params_after[param_name] = coerced_val
                continue

            # Strategy 2: context mapping
            ctx_val, confidence = _find_context_value(param_name, ctx)
            if ctx_val is not None and confidence >= 0.5:
                coerced_val, ok = _coerce(ctx_val, target_type)
                fills.append(ParamFill(
                    param_name=param_name, original_value=original,
                    filled_value=coerced_val, source="context",
                    confidence=round(confidence, 3), coerced=ok,
                ))
                params_after[param_name] = coerced_val
                continue

            # Strategy 3: type-specific inference
            inferred = self._infer_by_type(param_name, target_type, param_schema)
            if inferred is not None:
                fills.append(ParamFill(
                    param_name=param_name, original_value=original,
                    filled_value=inferred, source="inferred",
                    confidence=0.4, coerced=False,
                ))
                params_after[param_name] = inferred

        # Coverage = fraction of required fields now filled
        filled_required = sum(
            1 for f in required_fields
            if params_after.get(f) is not None
        )
        coverage = round(filled_required / max(len(required_fields), 1), 3)

        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        self._conn.execute(
            """INSERT INTO autofill_sessions
               (session_id,tool_name,params_before,params_after,
                fills_json,coverage,tenant_id,metadata_json,created_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                session_id, tool_name,
                json.dumps(existing_params), json.dumps(params_after),
                json.dumps([f.dict for f in fills]),
                coverage, tenant_id, json.dumps(metadata or {}), now,
            ),
        )
        self._conn.commit()

        return AutofillResult(
            session_id=session_id, tool_name=tool_name,
            params_before=existing_params, params_after=params_after,
            fills=fills, coverage=coverage,
            tenant_id=tenant_id, metadata=metadata or {}, created_at=now,
        )

    def get_session(self, session_id: str) -> AutofillResult | None:
        row = self._conn.execute(
            "SELECT * FROM autofill_sessions WHERE session_id=?", (session_id,)
        ).fetchone()
        if not row:
            return None
        return self._row_to_result(row)

    def list_sessions(
        self,
        tool_name: str | None = None,
        tenant_id: str | None = None,
        limit: int = 50,
    ) -> list[AutofillResult]:
        q = "SELECT * FROM autofill_sessions WHERE 1=1"
        params: list[Any] = []
        if tool_name:
            q += " AND tool_name=?"; params.append(tool_name)
        if tenant_id:
            q += " AND tenant_id=?"; params.append(tenant_id)
        q += " ORDER BY created_at DESC LIMIT ?"; params.append(limit)
        return [self._row_to_result(r) for r in self._conn.execute(q, params).fetchall()]

    # ------------------------------------------------------------------
    # Private
    # ------------------------------------------------------------------

    @staticmethod
    def _infer_by_type(name: str, type_: str, schema: dict[str, Any]) -> Any:
        """Last-resort type-based defaults for common patterns."""
        if type_ == "boolean":
            return False
        if type_ == "integer":
            # Common patterns
            if "timeout" in name.lower():
                return 30
            if "limit" in name.lower() or "max" in name.lower():
                return 100
            if "page" in name.lower():
                return 1
            return None
        if type_ == "string":
            enum = schema.get("enum")
            if enum:
                return enum[0]
            return None
        if type_ == "array":
            return []
        if type_ == "object":
            return {}
        return None

    @staticmethod
    def _row_to_result(row: sqlite3.Row) -> AutofillResult:
        fills_raw = json.loads(row["fills_json"])
        fills = [
            ParamFill(
                param_name=f["param_name"], original_value=f["original_value"],
                filled_value=f["filled_value"], source=f["source"],
                confidence=f["confidence"], coerced=f["coerced"],
            )
            for f in fills_raw
        ]
        return AutofillResult(
            session_id=row["session_id"], tool_name=row["tool_name"],
            params_before=json.loads(row["params_before"]),
            params_after=json.loads(row["params_after"]),
            fills=fills, coverage=row["coverage"],
            tenant_id=row["tenant_id"],
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"],
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_filler: ToolParamAutoFiller | None = None


def get_param_autofiller(db_path: str | Path | None = None) -> ToolParamAutoFiller:
    global _filler
    if _filler is None:
        _filler = ToolParamAutoFiller(db_path=db_path)
    return _filler


__all__ = [
    "ParamFill",
    "AutofillResult",
    "ToolParamAutoFiller",
    "get_param_autofiller",
]
