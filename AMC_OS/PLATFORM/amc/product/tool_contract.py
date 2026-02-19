"""Tool contract validation and repair suggestion helpers."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field


def _coerce(value: Any, target_type: str) -> tuple[Any, bool]:
    """Try safe coercion used for repair suggestions."""
    if target_type in {"int", "integer"}:
        if isinstance(value, bool):
            return value, False
        if isinstance(value, int):
            return value, True
        if isinstance(value, float) and value.is_integer():
            return int(value), True
        if isinstance(value, str):
            try:
                return int(value), True
            except ValueError:
                return value, False
    elif target_type in {"float", "number"}:
        if isinstance(value, bool):
            return value, False
        if isinstance(value, (int, float)):
            return float(value), True
        if isinstance(value, str):
            try:
                return float(value), True
            except ValueError:
                return value, False
    elif target_type == "str":
        if isinstance(value, str):
            return value, True
        if value is None:
            return "", True
        return str(value), True
    elif target_type == "bool":
        if isinstance(value, bool):
            return value, True
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"true", "1", "yes", "on"}:
                return True, True
            if lowered in {"false", "0", "no", "off"}:
                return False, True
    elif target_type == "list":
        if isinstance(value, list):
            return value, True
    elif target_type == "dict":
        if isinstance(value, dict):
            return value, True
    return value, False


def _normalize_type(value: str) -> str:
    value = (value or "").lower()
    aliases = {
        "integer": "int",
        "number": "float",
        "string": "str",
        "boolean": "bool",
        "array": "list",
        "object": "dict",
    }
    return aliases.get(value, value)


@dataclass(frozen=True)
class ParameterContract:
    """Normalized contract for one parameter."""

    param_type: str
    required: bool = False
    default: Any | None = None
    enum: list[Any] | None = None


class ToolContract(BaseModel):
    """Normalized contract for one tool."""

    tool_name: str = ""
    parameters: dict[str, ParameterContract] = Field(default_factory=dict)
    allow_extra: bool = False


class ToolContractValidation(BaseModel):
    """Result of schema-check for a single tool invocation."""

    tool_name: str
    valid: bool
    missing: list[str] = Field(default_factory=list)
    unexpected: list[str] = Field(default_factory=list)
    type_issues: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    repaired_payload: dict[str, Any] = Field(default_factory=dict)


class ToolContractRegistry:
    """In-memory registry for tool contracts used by planner/runtime checks."""

    def __init__(self) -> None:
        self._contracts: dict[str, ToolContract] = {}

    def register(self, raw_spec: dict[str, Any]) -> ToolContract:
        """Register contract from a light JSON-like spec."""
        tool_name = str(raw_spec["tool_name"])
        params: dict[str, ParameterContract] = {}
        allow_extra = bool(raw_spec.get("allow_extra", False))

        if "parameters" in raw_spec:
            raw_params = raw_spec["parameters"] or {}
            for name, spec in raw_params.items():
                params[name] = ParameterContract(
                    param_type=_normalize_type(str(spec.get("type", "string"))),
                    required=bool(spec.get("required", False)),
                    default=spec.get("default"),
                    enum=spec.get("enum"),
                )
            if not params and "required" in raw_spec:
                raise ValueError("invalid contract parameters")
        elif "properties" in raw_spec:
            # JSON-schema style: properties + required
            props = raw_spec.get("properties") or {}
            required = set(raw_spec.get("required") or [])
            allow_extra = bool(raw_spec.get("allow_extra", raw_spec.get("additionalProperties", True)))
            for name, spec in props.items():
                params[name] = ParameterContract(
                    param_type=_normalize_type(str(spec.get("type", "string"))),
                    required=name in required,
                    default=spec.get("default"),
                    enum=spec.get("enum"),
                )
        else:
            raise ValueError("contract must include 'parameters' or JSON-schema 'properties'")

        contract = ToolContract(tool_name=tool_name, parameters=params, allow_extra=allow_extra)
        self._contracts[tool_name] = contract
        return contract

    def get(self, tool_name: str) -> ToolContract | None:
        return self._contracts.get(tool_name)

    def validate(
        self,
        tool_name: str,
        invocation: dict[str, Any],
    ) -> ToolContractValidation:
        """Validate invocation payload against registered schema."""
        contract = self.get(tool_name)
        if contract is None:
            return ToolContractValidation(
                tool_name=tool_name,
                valid=False,
                suggestions=[f"No contract found for '{tool_name}'"],
            )

        params = _extract_params(invocation)
        missing: list[str] = []
        unexpected: list[str] = []
        type_issues: list[str] = []
        suggestions: list[str] = []

        for name, spec in contract.parameters.items():
            if name not in params:
                if spec.required:
                    missing.append(name)
                elif spec.default is not None:
                    suggestions.append(f"Set default for '{name}' to {spec.default!r}.")
                continue

            value = params[name]
            if spec.param_type and not _matches_type(value, spec.param_type):
                coerced, ok = _coerce(value, spec.param_type)
                if ok:
                    suggestions.append(
                        f"coerce '{name}' from {value!r} ({type(value).__name__}) to {spec.param_type}"
                    )
                else:
                    type_issues.append(f"'{name}' expects {spec.param_type}, got {type(value).__name__}")

            if spec.enum is not None and value is not None and value not in spec.enum:
                type_issues.append(
                    f"'{name}' has unsupported value {value!r}; allowed: {spec.enum!r}"
                )

        if not contract.allow_extra:
            extra = [k for k in params if k not in contract.parameters]
            unexpected.extend(extra)

        repaired_payload = suggest_tool_call_repair(params, contract)

        return ToolContractValidation(
            tool_name=tool_name,
            valid=(not missing and not unexpected and not type_issues),
            missing=missing,
            unexpected=unexpected,
            type_issues=type_issues,
            suggestions=suggestions,
            repaired_payload=repaired_payload,
        )


def suggest_tool_call_repair(invocation: dict[str, Any], contract: ToolContract | dict[str, Any]) -> dict[str, Any]:
    """Return a best-effort repaired version of *invocation* parameters."""
    resolved = contract if isinstance(contract, ToolContract) else _normalize_contract(contract)
    params = dict(_extract_params(invocation))
    repaired = dict(params)

    for name, spec in resolved.parameters.items():
        if name not in repaired:
            if spec.default is not None:
                repaired[name] = spec.default
            continue

        value = repaired[name]
        if spec.param_type and not _matches_type(value, spec.param_type):
            coerced, ok = _coerce(value, spec.param_type)
            if ok:
                repaired[name] = coerced

    if not resolved.allow_extra:
        for key in list(repaired):
            if key not in resolved.parameters:
                del repaired[key]

    return repaired


def repair_tool_call(
    invocation: dict[str, Any],
    contract: ToolContract | dict[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    """Apply deterministic repair and return both repaired payload and notes."""
    resolved = contract if isinstance(contract, ToolContract) else _normalize_contract(contract)
    original = dict(_extract_params(invocation))
    repaired = dict(original)
    notes: list[str] = []

    for name, spec in resolved.parameters.items():
        if name in repaired:
            value = repaired[name]
            if spec.param_type and not _matches_type(value, spec.param_type):
                coerced, ok = _coerce(value, spec.param_type)
                if ok:
                    repaired[name] = coerced
                    notes.append(f"coerced '{name}' to {spec.param_type}")
                else:
                    notes.append(f"could not coerce '{name}', keeping original")
        elif spec.default is not None:
            repaired[name] = spec.default
            notes.append(f"applied default for '{name}'")

    if not resolved.allow_extra:
        for key in list(repaired):
            if key not in resolved.parameters:
                notes.append(f"removed unsupported '{key}'")
                del repaired[key]

    return repaired, notes


def _normalize_contract(raw: dict[str, Any]) -> ToolContract:
    if isinstance(raw, ToolContract):
        return raw
    contract = ToolContractRegistry()
    return contract.register(raw)


def _extract_params(invocation: dict[str, Any]) -> dict[str, Any]:
    if "parameters" in invocation and isinstance(invocation["parameters"], dict):
        return dict(invocation["parameters"])
    if "args" in invocation and isinstance(invocation["args"], dict):
        return dict(invocation["args"])
    if "arguments" in invocation and isinstance(invocation["arguments"], dict):
        return dict(invocation["arguments"])
    return {k: v for k, v in invocation.items() if k not in {"tool_name", "tool", "id", "task_id"}}


def _matches_type(value: Any, target_type: str) -> bool:
    if value is None:
        return False
    if target_type == "int":
        return isinstance(value, int) and not isinstance(value, bool)
    if target_type == "float":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if target_type == "str":
        return isinstance(value, str)
    if target_type == "bool":
        return isinstance(value, bool)
    if target_type == "list":
        return isinstance(value, list)
    if target_type == "dict":
        return isinstance(value, dict)
    return True


def validate_tool_contract(
    contract_registry: ToolContractRegistry,
    tool_name: str,
    invocation: dict[str, Any],
) -> ToolContractValidation:
    """Convenience wrapper for one-off checks."""
    return contract_registry.validate(tool_name, invocation)


__all__ = [
    "ParameterContract",
    "ToolContract",
    "ToolContractValidation",
    "ToolContractRegistry",
    "suggest_tool_call_repair",
    "repair_tool_call",
    "validate_tool_contract",
]
