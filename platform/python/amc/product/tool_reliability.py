"""Tool Reliability Predictor — Pre-call failure probability prediction.

Analyzes tool call params, predicts failure probability from history,
and suggests fixes. SQLite-backed.
"""
from __future__ import annotations

import json
import sqlite3
import uuid as _uuid_mod
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_RELIABILITY_NAMESPACE = UUID("c2d3e4f5-a6b7-8901-cdef-012345678902")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS tool_call_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id         TEXT NOT NULL UNIQUE,
    tool_name       TEXT NOT NULL,
    params_json     TEXT NOT NULL DEFAULT '{}',
    param_keys      TEXT NOT NULL DEFAULT '[]',
    succeeded       INTEGER NOT NULL DEFAULT 1,
    error_type      TEXT NOT NULL DEFAULT '',
    error_msg       TEXT NOT NULL DEFAULT '',
    latency_ms      INTEGER NOT NULL DEFAULT 0,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reliability_tool    ON tool_call_history(tool_name);
CREATE INDEX IF NOT EXISTS idx_reliability_created ON tool_call_history(created_at);

CREATE TABLE IF NOT EXISTS tool_reliability_cache (
    tool_name       TEXT NOT NULL PRIMARY KEY,
    total_calls     INTEGER NOT NULL DEFAULT 0,
    failures        INTEGER NOT NULL DEFAULT 0,
    failure_rate    REAL NOT NULL DEFAULT 0.0,
    avg_latency_ms  REAL NOT NULL DEFAULT 0.0,
    common_errors   TEXT NOT NULL DEFAULT '[]',
    updated_at      TEXT NOT NULL
);
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_call_id(tool_name: str, ts: str, params_hash: str) -> str:
    # Include a random component so rapid back-to-back calls always get unique IDs.
    return str(uuid5(_RELIABILITY_NAMESPACE, f"{tool_name}:{ts}:{params_hash}:{_uuid_mod.uuid4()}"))


def _params_hash(params: dict[str, Any]) -> str:
    import hashlib
    return hashlib.md5(
        json.dumps(params, sort_keys=True).encode()
    ).hexdigest()[:8]


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class CallRecord:
    """Input for recording a tool call outcome."""

    tool_name: str
    params: dict[str, Any]
    succeeded: bool
    error_type: str = ""
    error_msg: str = ""
    latency_ms: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ReliabilityPrediction:
    """Prediction result for a prospective tool call."""

    tool_name: str
    failure_probability: float
    confidence: str          # "high" | "medium" | "low"
    total_historical_calls: int
    historical_failure_rate: float
    param_risk_factors: list[str]
    suggested_fixes: list[str]
    alternate_tools: list[str]
    predicted_latency_ms: int

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "tool_name": self.tool_name,
            "failure_probability": round(self.failure_probability, 4),
            "confidence": self.confidence,
            "total_historical_calls": self.total_historical_calls,
            "historical_failure_rate": round(self.historical_failure_rate, 4),
            "param_risk_factors": self.param_risk_factors,
            "suggested_fixes": self.suggested_fixes,
            "alternate_tools": self.alternate_tools,
            "predicted_latency_ms": self.predicted_latency_ms,
        }


@dataclass
class ReliabilityStats:
    """Aggregate reliability stats for a tool."""

    tool_name: str
    total_calls: int
    failures: int
    failure_rate: float
    avg_latency_ms: float
    common_errors: list[str]

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "tool_name": self.tool_name,
            "total_calls": self.total_calls,
            "failures": self.failures,
            "failure_rate": round(self.failure_rate, 4),
            "avg_latency_ms": round(self.avg_latency_ms, 2),
            "common_errors": self.common_errors,
        }


# ---------------------------------------------------------------------------
# Param risk heuristics
# ---------------------------------------------------------------------------

_HIGH_RISK_PARAMS = {
    "url", "endpoint", "host", "path", "file_path", "query",
    "timeout", "limit", "max_retries", "token", "api_key", "secret",
}
_EMPTY_SENTINEL: set[Any] = {"", None}  # type: ignore[assignment]


def _assess_param_risks(
    tool_name: str,  # reserved for future tool-specific rules
    params: dict[str, Any],
) -> list[str]:
    """Heuristically identify risky parameter patterns."""
    risks: list[str] = []
    for key, value in params.items():
        kl = key.lower()
        if value in _EMPTY_SENTINEL and kl in _HIGH_RISK_PARAMS:
            risks.append(f"Parameter '{key}' is empty/null (commonly causes failures)")
        if kl in {"timeout", "max_retries"} and isinstance(value, (int, float)) and value <= 0:
            risks.append(f"Parameter '{key}={value}' is non-positive (likely misconfigured)")
        if kl == "url" and isinstance(value, str) and not value.startswith(("http://", "https://")):
            risks.append(
                f"Parameter 'url' does not start with http/https ('{value[:30]}')"
            )
        if kl in {"token", "api_key", "secret"} and isinstance(value, str) and 0 < len(value) < 10:
            risks.append(f"Parameter '{key}' appears too short to be a valid credential")
    return risks


def _suggest_fixes(
    risks: list[str],
    common_errors: list[str],
) -> list[str]:
    """Convert risk factors and historical errors into actionable suggestions."""
    suggestions: list[str] = []
    for risk in risks:
        if "empty/null" in risk:
            param = risk.split("'")[1] if "'" in risk else "param"
            suggestions.append(
                f"Provide a non-empty value for '{param}' before calling the tool"
            )
        if "non-positive" in risk:
            param = risk.split("'")[1] if "'" in risk else "param"
            suggestions.append(
                f"Set '{param}' to a positive integer (e.g. 30 for timeout seconds)"
            )
        if "does not start with http" in risk:
            suggestions.append(
                "Prefix the URL with 'https://' to ensure it is a valid HTTP endpoint"
            )
        if "too short" in risk:
            param = risk.split("'")[1] if "'" in risk else "param"
            suggestions.append(
                f"Verify '{param}' is the full credential, not a truncated value"
            )
    for err in common_errors[:3]:
        suggestions.append(f"Historical error pattern: {err}")
    return suggestions


# ---------------------------------------------------------------------------
# Core predictor
# ---------------------------------------------------------------------------


class ToolReliabilityPredictor:
    """Pre-call reliability predictor backed by SQLite call history."""

    # Minimum sample before switching from "low" to "medium" confidence
    _MEDIUM_THRESHOLD = 5
    _HIGH_THRESHOLD = 30

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(product_db_path(db_path))
        self._conn = self._init_db()

    def _init_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.executescript(_SCHEMA)
        conn.commit()
        return conn

    def record_call(self, record: CallRecord) -> str:
        """Store a tool call outcome for future predictions."""
        ts = _utc_now()
        call_id = _make_call_id(record.tool_name, ts, _params_hash(record.params))
        param_keys = sorted(record.params.keys())
        self._conn.execute(
            """
            INSERT OR IGNORE INTO tool_call_history
                (call_id, tool_name, params_json, param_keys, succeeded,
                 error_type, error_msg, latency_ms, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                call_id,
                record.tool_name,
                json.dumps(record.params),
                json.dumps(param_keys),
                1 if record.succeeded else 0,
                record.error_type,
                record.error_msg,
                record.latency_ms,
                json.dumps(record.metadata),
                ts,
            ),
        )
        self._conn.commit()
        self._refresh_cache(record.tool_name)
        return call_id

    # Alias for backward compatibility
    record = record_call

    def predict(
        self,
        tool_name: str,
        params: dict[str, Any],
        alternate_tools: list[str] | None = None,
    ) -> ReliabilityPrediction:
        """Predict failure probability for a prospective tool call."""
        stats = self.get_stats(tool_name)

        if stats and stats.total_calls >= self._HIGH_THRESHOLD:
            base_prob = stats.failure_rate
            confidence = "high"
            common_errors = stats.common_errors
            avg_latency = int(stats.avg_latency_ms)
        elif stats and stats.total_calls >= self._MEDIUM_THRESHOLD:
            base_prob = stats.failure_rate
            confidence = "medium"
            common_errors = stats.common_errors
            avg_latency = int(stats.avg_latency_ms)
        elif stats and stats.total_calls > 0:
            base_prob = stats.failure_rate
            confidence = "low"
            common_errors = stats.common_errors
            avg_latency = int(stats.avg_latency_ms)
        else:
            base_prob = 0.10   # conservative default with no history
            confidence = "low"
            common_errors = []
            avg_latency = 1000

        param_risks = _assess_param_risks(tool_name, params)
        risk_boost = min(len(param_risks) * 0.10, 0.50)
        failure_prob = min(base_prob + risk_boost, 0.95)

        fixes = _suggest_fixes(param_risks, common_errors)

        return ReliabilityPrediction(
            tool_name=tool_name,
            failure_probability=failure_prob,
            confidence=confidence,
            total_historical_calls=stats.total_calls if stats else 0,
            historical_failure_rate=stats.failure_rate if stats else 0.0,
            param_risk_factors=param_risks,
            suggested_fixes=fixes,
            alternate_tools=alternate_tools or [],
            predicted_latency_ms=avg_latency,
        )

    def get_stats(self, tool_name: str) -> ReliabilityStats | None:
        """Return aggregate reliability stats (cache-first, falls back to live)."""
        row = self._conn.execute(
            "SELECT * FROM tool_reliability_cache WHERE tool_name=?", (tool_name,)
        ).fetchone()
        if row:
            return ReliabilityStats(
                tool_name=row["tool_name"],
                total_calls=row["total_calls"],
                failures=row["failures"],
                failure_rate=row["failure_rate"],
                avg_latency_ms=row["avg_latency_ms"],
                common_errors=json.loads(row["common_errors"]),
            )
        return self._compute_stats(tool_name)

    def list_stats(self, limit: int = 50) -> list[ReliabilityStats]:
        """List all cached reliability stats, worst first."""
        rows = self._conn.execute(
            "SELECT * FROM tool_reliability_cache ORDER BY failure_rate DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [
            ReliabilityStats(
                tool_name=r["tool_name"],
                total_calls=r["total_calls"],
                failures=r["failures"],
                failure_rate=r["failure_rate"],
                avg_latency_ms=r["avg_latency_ms"],
                common_errors=json.loads(r["common_errors"]),
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _compute_stats(self, tool_name: str) -> ReliabilityStats | None:
        row = self._conn.execute(
            """
            SELECT COUNT(*)  AS total,
                   SUM(CASE WHEN succeeded=0 THEN 1 ELSE 0 END) AS failures,
                   AVG(latency_ms) AS avg_lat,
                   GROUP_CONCAT(CASE WHEN succeeded=0 THEN error_type END) AS errors
            FROM tool_call_history
            WHERE tool_name=?
            """,
            (tool_name,),
        ).fetchone()
        if not row or not row["total"]:
            return None
        total = row["total"] or 0
        failures = row["failures"] or 0
        errors_raw = row["errors"] or ""
        error_list = [e for e in errors_raw.split(",") if e]
        common = [e for e, _ in Counter(error_list).most_common(5)]
        return ReliabilityStats(
            tool_name=tool_name,
            total_calls=total,
            failures=failures,
            failure_rate=failures / max(total, 1),
            avg_latency_ms=row["avg_lat"] or 0.0,
            common_errors=common,
        )

    def _refresh_cache(self, tool_name: str) -> None:
        stats = self._compute_stats(tool_name)
        if not stats:
            return
        self._conn.execute(
            """
            INSERT OR REPLACE INTO tool_reliability_cache
                (tool_name, total_calls, failures, failure_rate,
                 avg_latency_ms, common_errors, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                stats.tool_name,
                stats.total_calls,
                stats.failures,
                stats.failure_rate,
                stats.avg_latency_ms,
                json.dumps(stats.common_errors),
                _utc_now(),
            ),
        )
        self._conn.commit()


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_predictor: ToolReliabilityPredictor | None = None


def get_tool_reliability_predictor(
    db_path: str | Path | None = None,
) -> ToolReliabilityPredictor:
    global _predictor
    if _predictor is None:
        _predictor = ToolReliabilityPredictor(db_path=db_path)
    return _predictor


__all__ = [
    "CallRecord",
    "ReliabilityPrediction",
    "ReliabilityStats",
    "ToolReliabilityPredictor",
    "get_tool_reliability_predictor",
]
