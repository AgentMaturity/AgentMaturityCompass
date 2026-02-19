"""Error-to-Fix Translator — Tool error interpretation and remediation.

Interprets tool error strings into concrete remediation steps, corrected
parameters, and alternate routes. Ships with a built-in pattern library
and persists error logs for observability.
"""
from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_ERROR_NAMESPACE = UUID("d3e4f5a6-b7c8-9012-def0-123456789003")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS error_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    log_id          TEXT NOT NULL UNIQUE,
    tool_name       TEXT NOT NULL DEFAULT '',
    error_string    TEXT NOT NULL,
    error_category  TEXT NOT NULL DEFAULT 'unknown',
    matched_pattern TEXT NOT NULL DEFAULT '',
    confidence      TEXT NOT NULL DEFAULT 'low',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_error_log_tool     ON error_log(tool_name);
CREATE INDEX IF NOT EXISTS idx_error_log_category ON error_log(error_category);
CREATE INDEX IF NOT EXISTS idx_error_log_created  ON error_log(created_at);
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_log_id(tool_name: str, error: str, ts: str) -> str:
    return str(uuid5(_ERROR_NAMESPACE, f"{tool_name}:{error[:50]}:{ts}"))


# ---------------------------------------------------------------------------
# Built-in error pattern library
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ErrorPattern:
    """A known error regex pattern with remediation steps."""

    regex: str
    category: str
    description: str
    remediation: list[str]
    corrected_params: dict[str, Any] = field(default_factory=dict)
    alternate_routes: list[str] = field(default_factory=list)


_BUILTIN_PATTERNS: list[ErrorPattern] = [
    ErrorPattern(
        regex=r"(connection|connect)\s*(refused|timed?\s*out|reset|error)",
        category="network",
        description="Network connection failure",
        remediation=[
            "Check that the target host is reachable and accepting connections",
            "Verify firewall/proxy rules allow outbound traffic to the endpoint",
            "Increase timeout_ms if intermittent network latency is the issue",
            "Retry with exponential backoff: wait 1 s, 2 s, 4 s before giving up",
        ],
        corrected_params={"timeout_ms": 30000, "max_retries": 3},
        alternate_routes=["Use a cached/fallback endpoint if available"],
    ),
    ErrorPattern(
        regex=r"(401|unauthorized|authentication\s*failed|invalid\s*(api\s*)?key|invalid\s*token)",
        category="auth",
        description="Authentication or authorization failure",
        remediation=[
            "Verify the API key/token is correct and has not expired",
            "Confirm the token has the required scopes/permissions",
            "Rotate the credential if it may have been compromised",
            "Ensure the Authorization header is formatted as 'Bearer <token>'",
        ],
        corrected_params={},
        alternate_routes=["Use an OAuth2 refresh flow to obtain a new token"],
    ),
    ErrorPattern(
        regex=r"(403|forbidden|permission\s*denied|access\s*denied)",
        category="authz",
        description="Permission/authorization failure",
        remediation=[
            "Confirm the caller has the required role or policy attached",
            "Request elevated permissions or use a service account with broader access",
            "Check resource-level ACLs or bucket policies",
        ],
        corrected_params={},
        alternate_routes=["Escalate to an operator with sufficient permissions"],
    ),
    ErrorPattern(
        regex=r"(404|not\s*found|resource\s*(does\s*not\s*exist|not\s*found))",
        category="not_found",
        description="Resource not found",
        remediation=[
            "Verify the resource ID/path/URL is correct and has not been deleted",
            "Check for typos in the identifier or trailing slashes in the URL",
            "List available resources to confirm the correct reference",
        ],
        corrected_params={},
        alternate_routes=["Fall back to a default resource or skip this step"],
    ),
    ErrorPattern(
        regex=r"(429|rate\s*limit|too\s*many\s*requests|quota\s*exceeded|throttl)",
        category="rate_limit",
        description="Rate limit or quota exceeded",
        remediation=[
            "Add a delay between requests (start with 1–2 seconds)",
            "Implement exponential backoff with jitter",
            "Reduce the batch size or request frequency",
            "Respect the Retry-After header for the mandatory wait time",
        ],
        corrected_params={"delay_ms": 2000, "max_retries": 5},
        alternate_routes=["Queue requests and drain at a lower rate"],
    ),
    ErrorPattern(
        regex=r"(500|internal\s*server\s*error|server\s*error|upstream\s*error)",
        category="server_error",
        description="Remote server internal error",
        remediation=[
            "Retry the request — server-side 5xx errors are often transient",
            "Contact the API provider if the error persists across multiple retries",
            "Check the provider status page for ongoing incidents",
        ],
        corrected_params={"max_retries": 3},
        alternate_routes=["Fall back to a secondary endpoint or cached result"],
    ),
    ErrorPattern(
        regex=r"(timeout|timed?\s*out|deadline\s*exceeded|operation\s*timed?\s*out)",
        category="timeout",
        description="Operation timed out",
        remediation=[
            "Increase the timeout parameter (double the current value as a start)",
            "Reduce the scope of the request (smaller batch, fewer fields)",
            "Check if the remote service is under heavy load",
        ],
        corrected_params={"timeout_ms": 60000},
        alternate_routes=["Split into smaller sub-requests"],
    ),
    ErrorPattern(
        regex=r"(invalid\s*(parameter|argument|input|value|field)|validation\s*error|schema\s*(error|violation))",
        category="validation",
        description="Invalid parameter or schema validation failure",
        remediation=[
            "Review the parameter names and types against the tool's contract",
            "Ensure all required fields are present and non-null",
            "Check enum values are from the allowed set",
        ],
        corrected_params={},
        alternate_routes=["Use the /api/v1/product/tool-contract/repair endpoint to auto-fix params"],
    ),
    ErrorPattern(
        regex=r"(json\s*(decode|parse|error)|invalid\s*json|unexpected\s*(token|end\s*of\s*(input|json)))",
        category="parse_error",
        description="JSON parsing or serialization error",
        remediation=[
            "Validate the JSON payload with a linter before sending",
            "Check for unescaped special characters (quotes, backslashes)",
            "Ensure Content-Type is set to application/json",
        ],
        corrected_params={},
        alternate_routes=["Use json.dumps(ensure_ascii=True) to sanitize before sending"],
    ),
    ErrorPattern(
        regex=r"(ssl|certificate|tls|cert\s*(expired|invalid|verify|failed))",
        category="ssl",
        description="SSL/TLS certificate error",
        remediation=[
            "Verify the server certificate is valid and not expired",
            "Ensure the system trust store includes the required CA",
            "Do not set verify=False in production — obtain a valid certificate instead",
        ],
        corrected_params={},
        alternate_routes=["Provide the CA bundle path via ssl_ca_bundle parameter"],
    ),
    ErrorPattern(
        regex=r"(disk\s*(full|quota)|no\s*space\s*left|storage\s*(full|exceeded))",
        category="storage",
        description="Storage or disk space exhausted",
        remediation=[
            "Free up disk space by removing temporary files or old exports",
            "Increase the storage quota for the workspace",
            "Move large files to object storage (S3, GCS)",
        ],
        corrected_params={},
        alternate_routes=["Write output to a streaming endpoint instead of disk"],
    ),
    ErrorPattern(
        regex=r"(key\s*error|keyerror|attribute\s*error|attributeerror|type\s*error|typeerror)",
        category="code_error",
        description="Python runtime / type error",
        remediation=[
            "Check that the key/attribute name is spelled correctly",
            "Ensure you are accessing the correct nested level of the response dict",
            "Use .get() with a default instead of direct dict access",
        ],
        corrected_params={},
        alternate_routes=["Enable verbose logging to capture the full traceback"],
    ),
]


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class ErrorTranslationResult:
    """Result of translating an error string into remediation steps."""

    error_string: str
    tool_name: str
    error_category: str
    description: str
    remediation_steps: list[str]
    corrected_params: dict[str, Any]
    alternate_routes: list[str]
    matched_pattern: str
    confidence: str          # "high" | "medium" | "low"

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "error_string": self.error_string,
            "tool_name": self.tool_name,
            "error_category": self.error_category,
            "description": self.description,
            "remediation_steps": self.remediation_steps,
            "corrected_params": self.corrected_params,
            "alternate_routes": self.alternate_routes,
            "matched_pattern": self.matched_pattern,
            "confidence": self.confidence,
        }


# ---------------------------------------------------------------------------
# Core translator
# ---------------------------------------------------------------------------


class ErrorTranslator:
    """Translate tool error strings into concrete remediation steps."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(product_db_path(db_path))
        self._conn = self._init_db()
        # Pre-compile regexes for speed
        self._compiled = [
            (re.compile(p.regex, re.IGNORECASE), p) for p in _BUILTIN_PATTERNS
        ]

    def _init_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.executescript(_SCHEMA)
        conn.commit()
        return conn

    def translate(
        self,
        error_string: str,
        tool_name: str = "",
        params: dict[str, Any] | None = None,
    ) -> ErrorTranslationResult:
        """Interpret an error string and return remediation steps."""
        error_lower = (error_string or "").lower()

        matched_pattern = ""
        category = "unknown"
        description = "Unrecognized error"
        remediation: list[str] = []
        corrected: dict[str, Any] = {}
        alternates: list[str] = []
        confidence = "low"

        # Primary pass: full regex match
        for compiled_re, pattern in self._compiled:
            if compiled_re.search(error_lower):
                matched_pattern = pattern.regex
                category = pattern.category
                description = pattern.description
                remediation = list(pattern.remediation)
                corrected = dict(pattern.corrected_params)
                alternates = list(pattern.alternate_routes)
                confidence = "high"
                break

        # Fallback pass: partial keyword overlap (≥ 2 tokens)
        if confidence == "low":
            for compiled_re, pattern in self._compiled:
                words = set(re.findall(r"\b\w+\b", pattern.regex.lower()))
                error_words = set(re.findall(r"\b\w+\b", error_lower))
                if len(words & error_words) >= 2:
                    matched_pattern = pattern.regex
                    category = pattern.category
                    description = pattern.description
                    remediation = list(pattern.remediation)
                    corrected = dict(pattern.corrected_params)
                    alternates = list(pattern.alternate_routes)
                    confidence = "medium"
                    break

        # Merge with incoming params so callers get ready-to-use overrides
        if params and corrected:
            merged: dict[str, Any] = {}
            for key, default_val in corrected.items():
                merged[key] = params.get(key, default_val)
            corrected = merged

        if not remediation:
            remediation = [
                "Capture the full stack trace and inspect the immediate cause",
                "Check the tool's documentation for known error codes",
                "Enable debug logging to see more context",
            ]

        # Persist the error for observability
        ts = _utc_now()
        log_id = _make_log_id(tool_name, error_string, ts)
        try:
            self._conn.execute(
                """
                INSERT OR IGNORE INTO error_log
                    (log_id, tool_name, error_string, error_category,
                     matched_pattern, confidence, metadata_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, '{}', ?)
                """,
                (log_id, tool_name, error_string[:1000], category, matched_pattern, confidence, ts),
            )
            self._conn.commit()
        except Exception:
            pass  # non-critical logging failure

        log.info(
            "error_translated",
            tool_name=tool_name,
            category=category,
            confidence=confidence,
        )

        return ErrorTranslationResult(
            error_string=error_string,
            tool_name=tool_name,
            error_category=category,
            description=description,
            remediation_steps=remediation,
            corrected_params=corrected,
            alternate_routes=alternates,
            matched_pattern=matched_pattern,
            confidence=confidence,
        )

    def get_categories(self) -> list[str]:
        """Return all known error categories from the built-in library."""
        return sorted({p.category for p in _BUILTIN_PATTERNS})

    def get_error_history(
        self,
        tool_name: str | None = None,
        category: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Query stored error log entries."""
        q = "SELECT * FROM error_log WHERE 1=1"
        params: list[Any] = []
        if tool_name:
            q += " AND tool_name=?"
            params.append(tool_name)
        if category:
            q += " AND error_category=?"
            params.append(category)
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        rows = self._conn.execute(q, params).fetchall()
        return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_translator: ErrorTranslator | None = None


def get_error_translator(
    db_path: str | Path | None = None,
) -> ErrorTranslator:
    global _translator
    if _translator is None:
        _translator = ErrorTranslator(db_path=db_path)
    return _translator


__all__ = [
    "ErrorPattern",
    "ErrorTranslationResult",
    "ErrorTranslator",
    "get_error_translator",
]
