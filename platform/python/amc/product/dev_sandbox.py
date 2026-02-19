"""AMC Product — Local Dev Environment with Mocked Tools (Feature 12).

Provides a deterministic local execution environment for agent development
with contract-based mock tools, avoiding real API calls during testing.

Key concepts
------------
- **MockTool**: a named tool stub that returns deterministic or scripted
  responses without making real API calls.
- **MockToolRegistry**: registry of available mock tools, keyed by tool name.
- **ContractCheck**: validates that a mock response conforms to the tool's
  declared output schema.
- **DevSandbox**: sandboxed execution context that routes tool calls through
  the mock registry and records them.
- **SandboxSession**: a single isolated dev/test run with its own call log.

Revenue path: faster iteration cycles for AMC builders → more workflows
deployed on the platform → pipeline growth (Lever C).
"""
from __future__ import annotations

import json
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Any, Callable

import structlog

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class MockMode(str, Enum):
    STATIC = "static"        # Always return the same fixed response
    SEQUENCE = "sequence"    # Return responses in sequence (loop at end)
    CALLABLE = "callable"    # Call a Python function for response
    ERROR = "error"          # Always raise an error (tests error handling)


@dataclass
class MockResponse:
    """Defines how a mock tool responds to calls."""
    mode: MockMode = MockMode.STATIC
    static_response: dict[str, Any] = field(default_factory=dict)
    sequence: list[dict[str, Any]] = field(default_factory=list)
    callable_fn: Callable[[dict[str, Any]], dict[str, Any]] | None = None
    error_message: str = "Mock error"
    latency_ms: int = 0       # Simulated latency


@dataclass
class MockTool:
    """A named mock tool with contract schema and response definitions."""
    name: str
    description: str = ""
    input_schema: dict[str, Any] = field(default_factory=dict)   # JSON Schema subset
    output_schema: dict[str, Any] = field(default_factory=dict)
    response: MockResponse = field(default_factory=MockResponse)
    _call_count: int = field(default=0, init=False, compare=False)
    _seq_index: int = field(default=0, init=False, compare=False)

    def call(self, params: dict[str, Any]) -> dict[str, Any]:
        """Execute the mock and return the response."""
        self._call_count += 1

        if self.response.latency_ms > 0:
            time.sleep(self.response.latency_ms / 1000.0)

        if self.response.mode == MockMode.ERROR:
            raise RuntimeError(f"[MOCK] {self.name}: {self.response.error_message}")

        if self.response.mode == MockMode.CALLABLE and self.response.callable_fn:
            return self.response.callable_fn(params)

        if self.response.mode == MockMode.SEQUENCE:
            seq = self.response.sequence
            if not seq:
                return {}
            result = seq[self._seq_index % len(seq)]
            self._seq_index += 1
            return result

        return dict(self.response.static_response)

    def validate_input(self, params: dict[str, Any]) -> list[str]:
        """Validate params against input_schema. Returns list of violations."""
        return _validate_against_schema(params, self.input_schema)

    def validate_output(self, result: dict[str, Any]) -> list[str]:
        """Validate result against output_schema. Returns list of violations."""
        return _validate_against_schema(result, self.output_schema)

    @property
    def call_count(self) -> int:
        return self._call_count

    def reset(self) -> None:
        self._call_count = 0
        self._seq_index = 0


def _validate_against_schema(
    data: dict[str, Any],
    schema: dict[str, Any],
) -> list[str]:
    """Minimal schema validation (required fields + basic type checks)."""
    violations: list[str] = []
    required = schema.get("required", [])
    props = schema.get("properties", {})

    for field_name in required:
        if field_name not in data:
            violations.append(f"Missing required field: '{field_name}'")

    for field_name, field_schema in props.items():
        if field_name not in data:
            continue
        expected_type = field_schema.get("type")
        value = data[field_name]
        if expected_type:
            type_map = {
                "string": str,
                "integer": int,
                "number": (int, float),
                "boolean": bool,
                "array": list,
                "object": dict,
                "null": type(None),
            }
            expected = type_map.get(expected_type)
            if expected and not isinstance(value, expected):
                violations.append(
                    f"Field '{field_name}' expected type '{expected_type}', "
                    f"got {type(value).__name__}"
                )
        enum_vals = field_schema.get("enum")
        if enum_vals and value not in enum_vals:
            violations.append(f"Field '{field_name}' must be one of {enum_vals}, got {value!r}")

    return violations


# ---------------------------------------------------------------------------
# Pre-built mock library
# ---------------------------------------------------------------------------

def _make_builtin_mocks() -> list[MockTool]:
    """Return a set of commonly-used built-in mock tools."""
    return [
        MockTool(
            name="search",
            description="Mock web search returning canned results",
            input_schema={
                "required": ["query"],
                "properties": {"query": {"type": "string"}, "limit": {"type": "integer"}},
            },
            output_schema={
                "required": ["results"],
                "properties": {
                    "results": {"type": "array"},
                    "total": {"type": "integer"},
                },
            },
            response=MockResponse(
                mode=MockMode.STATIC,
                static_response={
                    "results": [
                        {"title": "Mock Result 1", "url": "https://example.com/1", "snippet": "Relevant content 1"},
                        {"title": "Mock Result 2", "url": "https://example.com/2", "snippet": "Relevant content 2"},
                    ],
                    "total": 2,
                },
            ),
        ),
        MockTool(
            name="email_send",
            description="Mock email sender — logs but does not send",
            input_schema={
                "required": ["to", "subject", "body"],
                "properties": {
                    "to": {"type": "string"},
                    "subject": {"type": "string"},
                    "body": {"type": "string"},
                },
            },
            output_schema={
                "required": ["sent", "message_id"],
                "properties": {"sent": {"type": "boolean"}, "message_id": {"type": "string"}},
            },
            response=MockResponse(
                mode=MockMode.STATIC,
                static_response={"sent": True, "message_id": "mock-msg-001"},
            ),
        ),
        MockTool(
            name="calendar_create",
            description="Mock calendar event creator",
            input_schema={
                "required": ["title", "start_time"],
                "properties": {
                    "title": {"type": "string"},
                    "start_time": {"type": "string"},
                    "duration_minutes": {"type": "integer"},
                },
            },
            output_schema={
                "required": ["event_id", "created"],
                "properties": {"event_id": {"type": "string"}, "created": {"type": "boolean"}},
            },
            response=MockResponse(
                mode=MockMode.STATIC,
                static_response={"event_id": "mock-cal-001", "created": True},
            ),
        ),
        MockTool(
            name="http_get",
            description="Mock HTTP GET — returns dummy JSON",
            input_schema={
                "required": ["url"],
                "properties": {"url": {"type": "string"}, "headers": {"type": "object"}},
            },
            output_schema={
                "required": ["status_code", "body"],
                "properties": {"status_code": {"type": "integer"}, "body": {"type": "object"}},
            },
            response=MockResponse(
                mode=MockMode.STATIC,
                static_response={"status_code": 200, "body": {"mocked": True}},
            ),
        ),
        MockTool(
            name="database_query",
            description="Mock SQL query executor",
            input_schema={
                "required": ["query"],
                "properties": {"query": {"type": "string"}, "params": {"type": "array"}},
            },
            output_schema={
                "required": ["rows", "count"],
                "properties": {"rows": {"type": "array"}, "count": {"type": "integer"}},
            },
            response=MockResponse(
                mode=MockMode.STATIC,
                static_response={"rows": [{"id": 1, "name": "Alice"}], "count": 1},
            ),
        ),
        MockTool(
            name="llm_complete",
            description="Mock LLM completion",
            input_schema={
                "required": ["prompt"],
                "properties": {"prompt": {"type": "string"}, "max_tokens": {"type": "integer"}},
            },
            output_schema={
                "required": ["text", "tokens_used"],
                "properties": {"text": {"type": "string"}, "tokens_used": {"type": "integer"}},
            },
            response=MockResponse(
                mode=MockMode.STATIC,
                static_response={"text": "This is a mock LLM response.", "tokens_used": 12},
            ),
        ),
    ]


# ---------------------------------------------------------------------------
# MockToolRegistry
# ---------------------------------------------------------------------------


@dataclass
class ToolCallRecord:
    """Record of a single mock tool call in a sandbox session."""
    call_id: str
    tool_name: str
    params: dict[str, Any]
    result: dict[str, Any] | None
    error: str | None
    input_violations: list[str]
    output_violations: list[str]
    duration_ms: int
    called_at: str

    @property
    def passed_contract(self) -> bool:
        return not self.input_violations and not self.output_violations and self.error is None


class MockToolRegistry:
    """Manages a collection of named mock tools."""

    def __init__(self, load_builtins: bool = True) -> None:
        self._tools: dict[str, MockTool] = {}
        self._lock = Lock()
        if load_builtins:
            for tool in _make_builtin_mocks():
                self.register(tool)

    def register(self, tool: MockTool) -> None:
        with self._lock:
            self._tools[tool.name] = tool
        log.debug("mock_registry.register", tool=tool.name)

    def get(self, name: str) -> MockTool | None:
        return self._tools.get(name)

    def list_tools(self) -> list[str]:
        return sorted(self._tools.keys())

    def reset_all(self) -> None:
        for tool in self._tools.values():
            tool.reset()

    def stats(self) -> dict[str, int]:
        return {name: t.call_count for name, t in self._tools.items()}


# ---------------------------------------------------------------------------
# DevSandbox
# ---------------------------------------------------------------------------


@dataclass
class SandboxSession:
    """Single isolated sandbox run with its own call log."""
    session_id: str
    created_at: str
    call_log: list[ToolCallRecord] = field(default_factory=list)

    @property
    def total_calls(self) -> int:
        return len(self.call_log)

    @property
    def failed_calls(self) -> list[ToolCallRecord]:
        return [c for c in self.call_log if not c.passed_contract]

    @property
    def contract_pass_rate(self) -> float:
        if not self.call_log:
            return 1.0
        return len([c for c in self.call_log if c.passed_contract]) / len(self.call_log)

    @property
    def as_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "created_at": self.created_at,
            "total_calls": self.total_calls,
            "contract_pass_rate": round(self.contract_pass_rate, 4),
            "failed_calls": len(self.failed_calls),
            "calls": [
                {
                    "call_id": c.call_id,
                    "tool_name": c.tool_name,
                    "params": c.params,
                    "result": c.result,
                    "error": c.error,
                    "input_violations": c.input_violations,
                    "output_violations": c.output_violations,
                    "duration_ms": c.duration_ms,
                    "called_at": c.called_at,
                    "passed_contract": c.passed_contract,
                }
                for c in self.call_log
            ],
        }


class DevSandbox:
    """Local dev sandbox that routes tool calls through mock registry."""

    def __init__(
        self,
        registry: MockToolRegistry | None = None,
        enforce_contracts: bool = True,
    ) -> None:
        self._registry = registry or MockToolRegistry()
        self._enforce = enforce_contracts
        self._sessions: dict[str, SandboxSession] = {}
        self._lock = Lock()
        log.info("dev_sandbox.init", enforce_contracts=enforce_contracts)

    def create_session(self) -> SandboxSession:
        """Create a new isolated sandbox session."""
        session_id = str(uuid.uuid4())
        session = SandboxSession(
            session_id=session_id,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        with self._lock:
            self._sessions[session_id] = session
        log.info("dev_sandbox.session_created", session_id=session_id)
        return session

    def call_tool(
        self,
        session_id: str,
        tool_name: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """Call a mock tool within a session, logging the call."""
        session = self._sessions.get(session_id)
        if session is None:
            raise ValueError(f"Unknown session: {session_id}")

        tool = self._registry.get(tool_name)
        if tool is None:
            raise ValueError(f"Unknown tool: '{tool_name}'. Available: {self._registry.list_tools()}")

        # Contract check: inputs
        input_violations = tool.validate_input(params)
        if input_violations and self._enforce:
            log.warning("dev_sandbox.contract_violation", tool=tool_name, violations=input_violations)

        start_ms = time.time() * 1000
        result: dict[str, Any] | None = None
        error: str | None = None
        output_violations: list[str] = []

        try:
            result = tool.call(params)
            output_violations = tool.validate_output(result)
            if output_violations and self._enforce:
                log.warning("dev_sandbox.output_violation", tool=tool_name, violations=output_violations)
        except Exception as exc:
            error = str(exc)
            log.error("dev_sandbox.tool_error", tool=tool_name, error=error)

        duration_ms = int(time.time() * 1000 - start_ms)
        record = ToolCallRecord(
            call_id=str(uuid.uuid4()),
            tool_name=tool_name,
            params=params,
            result=result,
            error=error,
            input_violations=input_violations,
            output_violations=output_violations,
            duration_ms=duration_ms,
            called_at=datetime.now(timezone.utc).isoformat(),
        )
        with self._lock:
            session.call_log.append(record)

        if error:
            raise RuntimeError(error)

        return result or {}

    def get_session(self, session_id: str) -> SandboxSession | None:
        return self._sessions.get(session_id)

    def register_mock(
        self,
        name: str,
        response: dict[str, Any] | None = None,
        mode: MockMode = MockMode.STATIC,
        sequence: list[dict[str, Any]] | None = None,
        callable_fn: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
        error_message: str = "Mock error",
        input_schema: dict[str, Any] | None = None,
        output_schema: dict[str, Any] | None = None,
    ) -> MockTool:
        """Register or replace a mock tool with the given definition."""
        mock_response = MockResponse(
            mode=mode,
            static_response=response or {},
            sequence=sequence or [],
            callable_fn=callable_fn,
            error_message=error_message,
        )
        tool = MockTool(
            name=name,
            input_schema=input_schema or {},
            output_schema=output_schema or {},
            response=mock_response,
        )
        self._registry.register(tool)
        return tool

    @property
    def registry(self) -> MockToolRegistry:
        return self._registry


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_default_sandbox: DevSandbox | None = None


def get_dev_sandbox(enforce_contracts: bool = True) -> DevSandbox:
    global _default_sandbox
    if _default_sandbox is None:
        _default_sandbox = DevSandbox(enforce_contracts=enforce_contracts)
    return _default_sandbox


__all__ = [
    "MockMode",
    "MockResponse",
    "MockTool",
    "MockToolRegistry",
    "SandboxSession",
    "ToolCallRecord",
    "DevSandbox",
    "get_dev_sandbox",
]
