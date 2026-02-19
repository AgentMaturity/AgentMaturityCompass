"""Tool semantic documentation generator for AMC platform.

Auto-generates structured documentation for any tool spec:
- What it does (summary)
- Parameter documentation
- Usage examples
- Caveats and edge-cases
- Failure modes and mitigations

Docs are cached in-memory by spec hash.  The generator uses deterministic
rule-based inference from tool spec structure — no LLM call required.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class ParamDoc:
    """Documentation for a single parameter."""

    name: str
    param_type: str
    required: bool
    description: str
    default: Any | None
    enum_values: list[Any]
    constraints: list[str]

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "type": self.param_type,
            "required": self.required,
            "description": self.description,
            "default": self.default,
            "enum_values": self.enum_values,
            "constraints": self.constraints,
        }


@dataclass
class ExampleDoc:
    """A usage example for a tool."""

    title: str
    description: str
    input: dict[str, Any]
    expected_output_shape: str
    notes: str = ""

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "description": self.description,
            "input": self.input,
            "expected_output_shape": self.expected_output_shape,
            "notes": self.notes,
        }


@dataclass
class FailureMode:
    """A documented failure mode and mitigation."""

    trigger: str
    symptom: str
    mitigation: str
    severity: str  # low | medium | high | critical

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "trigger": self.trigger,
            "symptom": self.symptom,
            "mitigation": self.mitigation,
            "severity": self.severity,
        }


@dataclass
class ToolSemanticDoc:
    """Full semantic documentation for a tool."""

    tool_name: str
    summary: str
    what_it_does: str
    parameters: list[ParamDoc]
    examples: list[ExampleDoc]
    caveats: list[str]
    failure_modes: list[FailureMode]
    tags: list[str]
    spec_hash: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "tool_name": self.tool_name,
            "summary": self.summary,
            "what_it_does": self.what_it_does,
            "parameters": [p.dict for p in self.parameters],
            "examples": [e.dict for e in self.examples],
            "caveats": self.caveats,
            "failure_modes": [f.dict for f in self.failure_modes],
            "tags": self.tags,
            "spec_hash": self.spec_hash,
        }


# ---------------------------------------------------------------------------
# Inference helpers
# ---------------------------------------------------------------------------

# Well-known tool name patterns → summary/what-it-does templates
_TOOL_PATTERNS: list[tuple[re.Pattern[str], dict[str, str]]] = [
    (
        re.compile(r"send|post|publish|emit|notify|dispatch", re.I),
        {
            "what_it_does": (
                "Sends or dispatches a message/event to an external system or recipient. "
                "Typically performs a network I/O operation and returns a delivery status."
            ),
            "tags": "io,network,messaging,side-effect",
        },
    ),
    (
        re.compile(r"get|fetch|retrieve|read|load|query|search|find|list", re.I),
        {
            "what_it_does": (
                "Reads or queries data from a source (database, API, file-system). "
                "Returns structured data without modifying remote state."
            ),
            "tags": "read,query",
        },
    ),
    (
        re.compile(r"create|add|insert|register|submit|write|upload|save|store", re.I),
        {
            "what_it_does": (
                "Creates or persists a new resource/record in a target system. "
                "Typically has side-effects and should be idempotency-key guarded."
            ),
            "tags": "write,create,side-effect",
        },
    ),
    (
        re.compile(r"update|edit|patch|modify|set|replace|change", re.I),
        {
            "what_it_does": (
                "Modifies an existing resource. Partial (PATCH-style) or full replacement "
                "depending on the spec. Has side-effects."
            ),
            "tags": "write,update,side-effect",
        },
    ),
    (
        re.compile(r"delete|remove|drop|purge|clear|reset", re.I),
        {
            "what_it_does": (
                "Permanently removes or resets a resource. Destructive operation — "
                "should require explicit confirmation in high-risk contexts."
            ),
            "tags": "write,delete,destructive,side-effect",
        },
    ),
    (
        re.compile(r"execute|run|invoke|call|trigger|start|launch", re.I),
        {
            "what_it_does": (
                "Executes a computation, job, or sub-process. May produce side-effects, "
                "spawn external processes, or take significant time."
            ),
            "tags": "exec,compute,side-effect",
        },
    ),
    (
        re.compile(r"validate|check|verify|assert|lint|audit|scan", re.I),
        {
            "what_it_does": (
                "Validates or checks correctness of inputs/state against a policy or schema. "
                "Read-only — returns a pass/fail verdict with optional detail."
            ),
            "tags": "validation,read",
        },
    ),
    (
        re.compile(r"convert|transform|format|encode|decode|parse|serialize", re.I),
        {
            "what_it_does": (
                "Transforms data between formats or representations. Pure/functional "
                "operation that returns the converted result without external side-effects."
            ),
            "tags": "transform,pure",
        },
    ),
    (
        re.compile(r"auth|login|logout|token|oauth|credential|permission|role", re.I),
        {
            "what_it_does": (
                "Handles authentication or authorization operations. May issue, verify, or "
                "revoke credentials. Must be called over secure channels."
            ),
            "tags": "security,auth",
        },
    ),
    (
        re.compile(r"browser|navigate|click|type|screenshot|scrape|web", re.I),
        {
            "what_it_does": (
                "Automates browser interactions or web scraping. Spawns or controls a "
                "headless browser process; latency and resource usage are high."
            ),
            "tags": "browser,automation,slow",
        },
    ),
]

_DEFAULT_WHAT_IT_DOES = (
    "Performs the operation described by this tool specification. "
    "Consult the parameter list for accepted inputs and the failure-modes "
    "section for error handling guidance."
)

_TYPE_CAVEATS: dict[str, str] = {
    "bool": "Boolean parameters are strict; strings 'true'/'false' are typically not accepted without coercion.",
    "int": "Integer parameters do not accept floats or string representations without coercion.",
    "float": "Floating-point precision may vary across implementations.",
    "list": "Provide an array/list value even for single items; a scalar will be rejected.",
    "dict": "Nested objects must be fully formed; partial dicts may fail schema validation.",
}


def _infer_what_it_does(tool_name: str) -> tuple[str, list[str]]:
    """Return (what_it_does, tags) by matching tool name against known patterns."""
    for pattern, info in _TOOL_PATTERNS:
        if pattern.search(tool_name):
            tags = [t.strip() for t in info.get("tags", "").split(",") if t.strip()]
            return info["what_it_does"], tags
    return _DEFAULT_WHAT_IT_DOES, ["general"]


def _build_summary(tool_name: str, description: str, what_it_does: str) -> str:
    """One-liner summary for the tool."""
    if description and len(description) < 200:
        return description.rstrip(".") + "."
    # Derive from tool name
    words = re.sub(r"[_\-]", " ", tool_name).split()
    return " ".join(w.capitalize() for w in words) + ": " + what_it_does.split(".")[0] + "."


def _infer_param_description(name: str, param_type: str, enum_values: list[Any]) -> str:
    """Produce a sensible one-line description from param metadata."""
    if enum_values:
        values_str = ", ".join(repr(v) for v in enum_values[:5])
        return f"Allowed values: {values_str}."
    words = re.sub(r"[_\-]", " ", name).split()
    readable = " ".join(words)
    return f"The {readable} value (type: {param_type})."


def _build_param_docs(raw_params: dict[str, Any], required_set: set[str]) -> list[ParamDoc]:
    docs: list[ParamDoc] = []
    for name, spec in raw_params.items():
        if not isinstance(spec, dict):
            spec = {"type": str(spec)}
        raw_type = spec.get("type", spec.get("param_type", "string"))
        param_type = _normalize_param_type(str(raw_type))
        required = name in required_set or bool(spec.get("required", False))
        default = spec.get("default")
        enum_values: list[Any] = spec.get("enum", []) or []
        description = spec.get("description", "") or _infer_param_description(
            name, param_type, enum_values
        )

        constraints: list[str] = []
        if "minimum" in spec:
            constraints.append(f"minimum: {spec['minimum']}")
        if "maximum" in spec:
            constraints.append(f"maximum: {spec['maximum']}")
        if "minLength" in spec:
            constraints.append(f"minLength: {spec['minLength']}")
        if "maxLength" in spec:
            constraints.append(f"maxLength: {spec['maxLength']}")
        if "pattern" in spec:
            constraints.append(f"pattern: {spec['pattern']}")

        docs.append(
            ParamDoc(
                name=name,
                param_type=param_type,
                required=required,
                description=description,
                default=default,
                enum_values=enum_values,
                constraints=constraints,
            )
        )
    return docs


def _normalize_param_type(t: str) -> str:
    return {
        "integer": "int",
        "number": "float",
        "string": "str",
        "boolean": "bool",
        "array": "list",
        "object": "dict",
    }.get(t.lower(), t.lower())


def _build_caveats(
    tool_name: str,
    param_docs: list[ParamDoc],
    tags: list[str],
) -> list[str]:
    caveats: list[str] = []

    # Type-based caveats
    type_set = {p.param_type for p in param_docs}
    for t, caveat in _TYPE_CAVEATS.items():
        if t in type_set:
            caveats.append(caveat)

    # Tag-based caveats
    if "side-effect" in tags:
        caveats.append(
            "This tool has side-effects. Use an idempotency key or check-before-mutate "
            "guard to avoid duplicate operations."
        )
    if "destructive" in tags:
        caveats.append(
            "Destructive operations cannot be automatically undone. "
            "Confirm intent before invocation in automated pipelines."
        )
    if "security" in tags or "auth" in tags:
        caveats.append(
            "Credentials and tokens must be passed securely; never embed in logs or traces."
        )
    if "browser" in tags or "slow" in tags:
        caveats.append(
            "Browser/automation tools can be slow (seconds to minutes). "
            "Set generous timeouts and avoid calling in hot paths."
        )
    if "network" in tags or "io" in tags:
        caveats.append(
            "Network I/O is unreliable. Implement retry logic with exponential back-off "
            "for transient failures."
        )

    # Required-params caveat
    required = [p.name for p in param_docs if p.required]
    if required:
        caveats.append(
            f"Required parameters that must not be omitted: {', '.join(required)}."
        )

    # Enum caveat
    enum_params = [p for p in param_docs if p.enum_values]
    if enum_params:
        for ep in enum_params:
            vals = ", ".join(repr(v) for v in ep.enum_values[:6])
            caveats.append(f"Parameter '{ep.name}' must be one of: {vals}.")

    return caveats


def _build_examples(
    tool_name: str,
    param_docs: list[ParamDoc],
    tags: list[str],
) -> list[ExampleDoc]:
    examples: list[ExampleDoc] = []

    # Minimal required-params example
    required_params = {p.name: _example_value(p) for p in param_docs if p.required}
    if required_params:
        examples.append(
            ExampleDoc(
                title="Minimal required-parameters call",
                description="Call with only the required parameters supplied.",
                input=required_params,
                expected_output_shape="dict with status indicator and tool-specific payload",
                notes="Omit optional parameters to rely on documented defaults.",
            )
        )

    # Full params example
    all_params = {p.name: _example_value(p) for p in param_docs}
    if all_params and all_params != required_params:
        examples.append(
            ExampleDoc(
                title="Full parameter call",
                description="Call with all parameters supplied explicitly.",
                input=all_params,
                expected_output_shape="dict with complete result set",
                notes="Override defaults when deterministic behaviour is required.",
            )
        )

    # Tag-specific example
    if "messaging" in tags:
        examples.append(
            ExampleDoc(
                title="Idempotent delivery",
                description="Use an idempotency key to prevent duplicate sends.",
                input={**required_params, "idempotency_key": "unique-run-id-001"},
                expected_output_shape="{'delivered': true, 'message_id': '...'}",
                notes="The server deduplicates within the idempotency window.",
            )
        )
    if "query" in tags or "read" in tags:
        examples.append(
            ExampleDoc(
                title="Paginated read",
                description="Limit results and paginate with an offset/cursor.",
                input={**required_params, "limit": 50, "offset": 0},
                expected_output_shape="{'items': [...], 'total': N, 'next_cursor': '...'}",
                notes="Always specify a limit in production to avoid large payloads.",
            )
        )

    return examples


def _example_value(p: ParamDoc) -> Any:
    """Generate a plausible example value for a parameter."""
    if p.enum_values:
        return p.enum_values[0]
    if p.default is not None:
        return p.default
    t = p.param_type
    name = p.name.lower()
    if t == "str":
        if "id" in name:
            return "example-id-001"
        if "email" in name:
            return "user@example.com"
        if "url" in name or "uri" in name:
            return "https://example.com"
        if "name" in name:
            return "example-name"
        return "example-value"
    if t == "int":
        if "port" in name:
            return 443
        if "limit" in name or "size" in name:
            return 100
        if "timeout" in name:
            return 5000
        return 1
    if t == "float":
        return 0.5
    if t == "bool":
        return True
    if t == "list":
        return []
    if t == "dict":
        return {}
    return None


def _build_failure_modes(
    tool_name: str,
    param_docs: list[ParamDoc],
    tags: list[str],
) -> list[FailureMode]:
    modes: list[FailureMode] = []

    # Universal: missing required params
    required = [p.name for p in param_docs if p.required]
    if required:
        modes.append(
            FailureMode(
                trigger=f"Required parameter(s) not provided: {', '.join(required)}",
                symptom="400 Bad Request / validation error",
                mitigation="Ensure all required parameters are present before invocation.",
                severity="high",
            )
        )

    # Type mismatches
    typed = [p for p in param_docs if p.param_type in {"int", "float", "bool", "list", "dict"}]
    if typed:
        names = ", ".join(p.name for p in typed[:3])
        modes.append(
            FailureMode(
                trigger=f"Wrong type supplied for parameter(s): {names}",
                symptom="422 Unprocessable Entity / type coercion error",
                mitigation="Use the tool_contract /check endpoint to validate before calling.",
                severity="medium",
            )
        )

    # Enum violations
    enum_params = [p for p in param_docs if p.enum_values]
    for ep in enum_params[:2]:
        modes.append(
            FailureMode(
                trigger=f"Value for '{ep.name}' outside allowed set {ep.enum_values!r}",
                symptom="422 Unprocessable Entity",
                mitigation=f"Use one of the allowed values: {ep.enum_values!r}.",
                severity="medium",
            )
        )

    # Tag-specific failure modes
    if "network" in tags or "io" in tags or "messaging" in tags:
        modes.append(
            FailureMode(
                trigger="Downstream service unavailable or times out",
                symptom="503 Service Unavailable / timeout exception",
                mitigation="Retry with exponential back-off; route through circuit breaker.",
                severity="high",
            )
        )
    if "side-effect" in tags or "write" in tags:
        modes.append(
            FailureMode(
                trigger="Duplicate call without idempotency key",
                symptom="Duplicate records / double-charge / duplicate send",
                mitigation="Add a unique idempotency key derived from the run ID.",
                severity="high",
            )
        )
    if "destructive" in tags:
        modes.append(
            FailureMode(
                trigger="Resource does not exist at time of deletion",
                symptom="404 Not Found",
                mitigation="Verify existence with a GET before DELETE in critical flows.",
                severity="medium",
            )
        )
    if "auth" in tags or "security" in tags:
        modes.append(
            FailureMode(
                trigger="Expired or revoked credential",
                symptom="401 Unauthorized",
                mitigation="Refresh the token/credential and retry. Use short-lived tokens.",
                severity="critical",
            )
        )
    if "browser" in tags or "slow" in tags:
        modes.append(
            FailureMode(
                trigger="Browser action times out due to slow page load",
                symptom="TimeoutError / empty screenshot",
                mitigation="Increase timeout, add a wait-for-selector guard, check network.",
                severity="medium",
            )
        )

    # Generic: rate limit
    modes.append(
        FailureMode(
            trigger="Too many calls in a short window",
            symptom="429 Too Many Requests",
            mitigation="Implement client-side rate limiting with jitter and back-off.",
            severity="medium",
        )
    )

    return modes


def _spec_hash(spec: dict[str, Any]) -> str:
    canonical = json.dumps(spec, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Generator class
# ---------------------------------------------------------------------------

class ToolSemanticDocGenerator:
    """Generates and caches semantic docs for tool specs."""

    def __init__(self) -> None:
        self._cache: dict[str, ToolSemanticDoc] = {}

    def generate(self, tool_spec: dict[str, Any]) -> ToolSemanticDoc:
        """Generate a ToolSemanticDoc from a tool specification dict.

        Accepted formats:
        - ``{"tool_name": ..., "description": ..., "parameters": {...}}``
        - JSON-schema style with ``"properties"`` and ``"required"``
        """
        h = _spec_hash(tool_spec)
        if h in self._cache:
            return self._cache[h]

        doc = self._generate_uncached(tool_spec, h)
        self._cache[h] = doc
        return doc

    def _generate_uncached(
        self, spec: dict[str, Any], spec_hash: str
    ) -> ToolSemanticDoc:
        tool_name: str = str(spec.get("tool_name", spec.get("name", "unknown_tool")))
        description: str = str(spec.get("description", ""))
        what_it_does, tags = _infer_what_it_does(tool_name)

        # Resolve parameters dict + required set
        raw_params, required_set = self._extract_params_and_required(spec)

        param_docs = _build_param_docs(raw_params, required_set)
        summary = _build_summary(tool_name, description, what_it_does)
        caveats = _build_caveats(tool_name, param_docs, tags)
        examples = _build_examples(tool_name, param_docs, tags)
        failure_modes = _build_failure_modes(tool_name, param_docs, tags)

        return ToolSemanticDoc(
            tool_name=tool_name,
            summary=summary,
            what_it_does=what_it_does,
            parameters=param_docs,
            examples=examples,
            caveats=caveats,
            failure_modes=failure_modes,
            tags=tags,
            spec_hash=spec_hash,
        )

    def _extract_params_and_required(
        self, spec: dict[str, Any]
    ) -> tuple[dict[str, Any], set[str]]:
        """Return (raw_params_dict, required_set) from various spec formats."""
        # AMC-style: parameters dict
        if "parameters" in spec and isinstance(spec["parameters"], dict):
            params = spec["parameters"]
            required = {
                name
                for name, pspec in params.items()
                if isinstance(pspec, dict) and pspec.get("required", False)
            }
            return params, required

        # JSON-schema style: properties + required
        if "properties" in spec and isinstance(spec["properties"], dict):
            params = spec["properties"]
            required = set(spec.get("required", []) or [])
            return params, required

        # Anthropic/OpenAI tool_use style: input_schema
        if "input_schema" in spec and isinstance(spec["input_schema"], dict):
            schema = spec["input_schema"]
            params = schema.get("properties", {})
            required = set(schema.get("required", []) or [])
            return params, required

        # Flat params at top level (keys that are not tool metadata)
        meta_keys = {"tool_name", "name", "description", "allow_extra", "version", "tags"}
        params = {k: v for k, v in spec.items() if k not in meta_keys}
        return params, set()

    def generate_batch(
        self, tool_specs: list[dict[str, Any]]
    ) -> list[ToolSemanticDoc]:
        """Generate docs for multiple tools at once."""
        return [self.generate(spec) for spec in tool_specs]

    def invalidate(self, spec_hash: str) -> bool:
        return bool(self._cache.pop(spec_hash, None))

    def clear_cache(self) -> int:
        n = len(self._cache)
        self._cache.clear()
        return n


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_GENERATOR: ToolSemanticDocGenerator | None = None


def get_doc_generator() -> ToolSemanticDocGenerator:
    global _GENERATOR
    if _GENERATOR is None:
        _GENERATOR = ToolSemanticDocGenerator()
    return _GENERATOR


__all__ = [
    "ParamDoc",
    "ExampleDoc",
    "FailureMode",
    "ToolSemanticDoc",
    "ToolSemanticDocGenerator",
    "get_doc_generator",
]
