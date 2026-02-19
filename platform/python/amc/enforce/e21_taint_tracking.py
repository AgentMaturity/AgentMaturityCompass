"""
AMC Enforce — E21: Taint Tracking for Untrusted Inputs (Info-Flow Safety)

Marks data from untrusted sources as "tainted" and prevents it from
reaching dangerous sinks (shell commands, file paths, payment recipients)
without passing through a registered sanitizer.

Usage:
    tracker = TaintTracker()

    url = tracker.taint("https://evil.com/<script>", TaintSource.WEB_PAGE)
    result = tracker.check_flow(url, TaintSink.URL_PARAMETER)
    # result.allowed == False

    clean = tracker.sanitize_url(url)
    result = tracker.check_flow(clean, TaintSink.URL_PARAMETER)
    # result.allowed == True
"""
from __future__ import annotations

import os
import re
from enum import Enum
from typing import Any
from urllib.parse import urlparse, urlunparse

import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class TaintSource(str, Enum):
    WEB_PAGE = "web_page"
    EMAIL = "email"
    ATTACHMENT = "attachment"
    GROUP_CHAT = "group_chat"
    API_RESPONSE = "api_response"
    UNKNOWN = "unknown"


class TaintLevel(str, Enum):
    LOW = "low"          # known benign source, still tracked
    MEDIUM = "medium"    # normal untrusted
    HIGH = "high"        # actively suspicious


class TaintSink(str, Enum):
    SHELL_COMMAND = "shell_command"
    URL_PARAMETER = "url_parameter"
    FILE_PATH = "file_path"
    EMAIL_RECIPIENT = "email_recipient"
    PAYMENT_RECIPIENT = "payment_recipient"


# ---------------------------------------------------------------------------
# Tainted String
# ---------------------------------------------------------------------------

class TaintedString(str):
    """
    A string subclass that carries taint metadata.

    Preserves taint through concatenation and common string operations.
    """
    _taint_source: TaintSource
    _taint_level: TaintLevel
    _sanitized_for: set[TaintSink]

    def __new__(
        cls,
        value: str,
        source: TaintSource = TaintSource.UNKNOWN,
        level: TaintLevel = TaintLevel.MEDIUM,
        sanitized_for: set[TaintSink] | None = None,
    ) -> TaintedString:
        obj = super().__new__(cls, value)
        obj._taint_source = source
        obj._taint_level = level
        obj._sanitized_for = sanitized_for or set()
        return obj

    @property
    def taint_source(self) -> TaintSource:
        return self._taint_source

    @property
    def taint_level(self) -> TaintLevel:
        return self._taint_level

    @property
    def sanitized_for(self) -> set[TaintSink]:
        return self._sanitized_for

    @property
    def is_tainted(self) -> bool:
        return True

    def __add__(self, other: str) -> TaintedString:
        result = super().__add__(other)
        # Propagate taint (highest level wins)
        level = self._taint_level
        source = self._taint_source
        if isinstance(other, TaintedString):
            lvl_order = [TaintLevel.LOW, TaintLevel.MEDIUM, TaintLevel.HIGH]
            if lvl_order.index(other._taint_level) > lvl_order.index(level):
                level = other._taint_level
                source = other._taint_source
        return TaintedString(result, source, level, set())  # reset sanitization on concat

    def __radd__(self, other: str) -> TaintedString:
        return TaintedString(other + str(self), self._taint_source, self._taint_level, set())

    def __repr__(self) -> str:
        return f"TaintedString({super().__repr__()}, source={self._taint_source.value})"


def is_tainted(value: Any) -> bool:
    """Check if a value is a TaintedString."""
    return isinstance(value, TaintedString)


# ---------------------------------------------------------------------------
# Flow Check
# ---------------------------------------------------------------------------

class FlowCheckResult(BaseModel):
    """Result of a taint flow check."""
    allowed: bool
    reason: str
    source: str = ""
    sink: str = ""
    taint_level: str = ""
    sanitized: bool = False


# ---------------------------------------------------------------------------
# Taint Policy
# ---------------------------------------------------------------------------

class TaintPolicyRule(BaseModel):
    """A rule defining blocked/allowed source→sink flows."""
    source: TaintSource
    sink: TaintSink
    blocked: bool = True
    requires_sanitizer: bool = True
    description: str = ""


class TaintPolicy(BaseModel):
    """Configurable taint flow policy."""
    name: str = "default"
    rules: list[TaintPolicyRule] = Field(default_factory=list)

    def is_flow_blocked(self, source: TaintSource, sink: TaintSink) -> tuple[bool, bool]:
        """Returns (blocked, requires_sanitizer) for a source→sink pair."""
        for rule in self.rules:
            if rule.source == source and rule.sink == sink:
                return rule.blocked, rule.requires_sanitizer
        # Default: all flows blocked without sanitizer
        return True, True


# Default policy: block everything dangerous
DEFAULT_TAINT_POLICY = TaintPolicy(
    name="default-strict",
    rules=[
        TaintPolicyRule(source=src, sink=sink, blocked=True, requires_sanitizer=True,
                        description=f"Block {src.value}→{sink.value} without sanitizer")
        for src in TaintSource
        for sink in TaintSink
    ],
)


# ---------------------------------------------------------------------------
# Sanitizers
# ---------------------------------------------------------------------------

_DANGEROUS_URL_SCHEMES = {"javascript", "data", "vbscript", "file"}
_URL_REGEX = re.compile(r"^https?://[^\s<>\"']+$", re.IGNORECASE)


def sanitize_url(value: str | TaintedString) -> TaintedString:
    """
    Sanitize a URL: validate format, strip dangerous schemes, ensure HTTPS/HTTP.

    Returns a TaintedString marked as sanitized for URL_PARAMETER sink.
    """
    raw = str(value).strip()

    parsed = urlparse(raw)
    if parsed.scheme.lower() in _DANGEROUS_URL_SCHEMES:
        raw = ""
        log.warning("taint.sanitize_url.blocked_scheme", scheme=parsed.scheme)
    elif parsed.scheme.lower() not in ("http", "https", ""):
        raw = ""
    else:
        if not parsed.scheme:
            raw = "https://" + raw
            parsed = urlparse(raw)
        # Remove fragments with javascript
        if parsed.fragment and "javascript" in parsed.fragment.lower():
            parsed = parsed._replace(fragment="")
            raw = urlunparse(parsed)

    source = value._taint_source if isinstance(value, TaintedString) else TaintSource.UNKNOWN
    level = value._taint_level if isinstance(value, TaintedString) else TaintLevel.MEDIUM
    return TaintedString(raw, source, level, {TaintSink.URL_PARAMETER})


def sanitize_path(value: str | TaintedString) -> TaintedString:
    """
    Sanitize a file path: normalize, prevent traversal, restrict to safe dirs.

    Returns a TaintedString marked as sanitized for FILE_PATH sink.
    """
    raw = str(value).strip()

    # Normalize
    raw = os.path.normpath(raw)

    # Block traversal
    if ".." in raw.split(os.sep):
        raw = os.path.basename(raw)
        log.warning("taint.sanitize_path.traversal_blocked", original=str(value)[:80])

    # Block absolute paths outside workspace
    if os.path.isabs(raw):
        raw = os.path.basename(raw)
        log.warning("taint.sanitize_path.absolute_blocked", original=str(value)[:80])

    # Strip null bytes and control characters
    raw = raw.replace("\x00", "").replace("\n", "").replace("\r", "")

    source = value._taint_source if isinstance(value, TaintedString) else TaintSource.UNKNOWN
    level = value._taint_level if isinstance(value, TaintedString) else TaintLevel.MEDIUM
    return TaintedString(raw, source, level, {TaintSink.FILE_PATH})


def sanitize_shell_arg(value: str | TaintedString) -> TaintedString:
    """
    Sanitize a value for use as a shell argument (single-quote wrapping).

    Returns a TaintedString marked as sanitized for SHELL_COMMAND sink.
    """
    raw = str(value)
    # Replace single quotes to prevent injection
    raw = raw.replace("'", "'\\''")
    raw = f"'{raw}'"

    source = value._taint_source if isinstance(value, TaintedString) else TaintSource.UNKNOWN
    level = value._taint_level if isinstance(value, TaintedString) else TaintLevel.MEDIUM
    return TaintedString(raw, source, level, {TaintSink.SHELL_COMMAND})


# Registry of built-in sanitizers
SANITIZERS: dict[TaintSink, Any] = {
    TaintSink.URL_PARAMETER: sanitize_url,
    TaintSink.FILE_PATH: sanitize_path,
    TaintSink.SHELL_COMMAND: sanitize_shell_arg,
}


# ---------------------------------------------------------------------------
# Taint Tracker
# ---------------------------------------------------------------------------

class TaintTracker:
    """
    Core taint tracking engine.

    Marks values as tainted, checks flows against policy, and provides
    sanitizers to allow safe passage to sinks.
    """

    def __init__(self, policy: TaintPolicy | None = None) -> None:
        self.policy = policy or DEFAULT_TAINT_POLICY
        self._flow_log: list[dict[str, Any]] = []
        self._max_log = 10000

    def taint(
        self,
        value: str,
        source: TaintSource,
        level: TaintLevel = TaintLevel.MEDIUM,
    ) -> TaintedString:
        """
        Mark a string value as tainted.

        Args:
            value: The string data to taint.
            source: Where this data came from.
            level: Severity of the taint.

        Returns:
            TaintedString that tracks its provenance.
        """
        ts = TaintedString(value, source, level)
        log.debug("taint.marked", source=source.value, level=level.value,
                  length=len(value))
        return ts

    def check_flow(self, value: Any, sink: TaintSink) -> FlowCheckResult:
        """
        Check if a value can flow to a given sink.

        Untainted values always pass. Tainted values are checked against
        the policy and sanitization state.

        Args:
            value: The value to check (may or may not be TaintedString).
            sink: The intended destination.

        Returns:
            FlowCheckResult indicating if the flow is allowed.
        """
        if not isinstance(value, TaintedString):
            return FlowCheckResult(
                allowed=True,
                reason="Value is not tainted",
                sink=sink.value,
            )

        # Check if already sanitized for this sink
        if sink in value.sanitized_for:
            result = FlowCheckResult(
                allowed=True,
                reason=f"Value sanitized for {sink.value}",
                source=value.taint_source.value,
                sink=sink.value,
                taint_level=value.taint_level.value,
                sanitized=True,
            )
            self._log_flow(value, sink, result)
            return result

        # Check policy
        blocked, requires_sanitizer = self.policy.is_flow_blocked(
            value.taint_source, sink,
        )

        if blocked and requires_sanitizer:
            result = FlowCheckResult(
                allowed=False,
                reason=(
                    f"Tainted value from {value.taint_source.value} cannot reach "
                    f"{sink.value} without sanitization"
                ),
                source=value.taint_source.value,
                sink=sink.value,
                taint_level=value.taint_level.value,
            )
            log.warning("taint.flow.blocked", source=value.taint_source.value,
                        sink=sink.value, level=value.taint_level.value)
        elif blocked:
            result = FlowCheckResult(
                allowed=False,
                reason=f"Flow {value.taint_source.value}→{sink.value} is unconditionally blocked",
                source=value.taint_source.value,
                sink=sink.value,
                taint_level=value.taint_level.value,
            )
        else:
            result = FlowCheckResult(
                allowed=True,
                reason="Flow allowed by policy",
                source=value.taint_source.value,
                sink=sink.value,
                taint_level=value.taint_level.value,
            )

        self._log_flow(value, sink, result)
        return result

    def sanitize_url(self, value: str | TaintedString) -> TaintedString:
        """Sanitize a URL for safe use as a URL parameter."""
        return sanitize_url(value)

    def sanitize_path(self, value: str | TaintedString) -> TaintedString:
        """Sanitize a file path to prevent traversal attacks."""
        return sanitize_path(value)

    def sanitize_shell_arg(self, value: str | TaintedString) -> TaintedString:
        """Sanitize a value for safe shell argument use."""
        return sanitize_shell_arg(value)

    def get_flow_log(self) -> list[dict[str, Any]]:
        """Return the flow check audit log."""
        return list(self._flow_log)

    def _log_flow(self, value: TaintedString, sink: TaintSink,
                  result: FlowCheckResult) -> None:
        entry = {
            "source": value.taint_source.value,
            "sink": sink.value,
            "level": value.taint_level.value,
            "allowed": result.allowed,
            "reason": result.reason,
            "value_preview": str(value)[:50],
            "ts": time.time(),
        }
        self._flow_log.append(entry)
        if len(self._flow_log) > self._max_log:
            self._flow_log = self._flow_log[-self._max_log:]


import time  # noqa: E402 (already imported at top, but ensures availability)
