"""Safe tool call parallelizer for AMC platform.

Provides:
- Dependency graph construction for ordered tool call sequences
- Identification of parallelizable groups (topological sort + wave grouping)
- Deterministic execution with fixed settings + output joining
- Async + sync execution interfaces

The parallelizer is safe-by-default: it checks for dependency cycles,
respects declared side-effects, and enforces determinism settings.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import time
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Awaitable


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

class ExecutionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


class SideEffectPolicy(str, Enum):
    """How to treat tool calls with side-effects."""
    ALLOW = "allow"           # Run side-effectful calls in parallel (caller's risk)
    SERIALIZE = "serialize"   # Always run side-effectful calls sequentially
    DENY = "deny"             # Fail if a side-effectful call is scheduled in parallel


@dataclass
class ToolCall:
    """A single tool invocation with metadata."""

    call_id: str
    tool_name: str
    parameters: dict[str, Any]
    depends_on: list[str] = field(default_factory=list)   # call_ids this call depends on
    has_side_effects: bool = False
    timeout_ms: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "ToolCall":
        return cls(
            call_id=str(d.get("call_id", d.get("id", str(uuid.uuid4())))),
            tool_name=str(d["tool_name"]),
            parameters=dict(d.get("parameters", d.get("params", {}))),
            depends_on=list(d.get("depends_on", [])),
            has_side_effects=bool(d.get("has_side_effects", False)),
            timeout_ms=d.get("timeout_ms"),
            metadata=dict(d.get("metadata", {})),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "call_id": self.call_id,
            "tool_name": self.tool_name,
            "parameters": self.parameters,
            "depends_on": self.depends_on,
            "has_side_effects": self.has_side_effects,
            "timeout_ms": self.timeout_ms,
            "metadata": self.metadata,
        }


@dataclass
class CallResult:
    """Result of executing a single tool call."""

    call_id: str
    tool_name: str
    status: ExecutionStatus
    output: Any
    error: str | None
    duration_ms: float
    output_hash: str | None  # For determinism scoring

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "call_id": self.call_id,
            "tool_name": self.tool_name,
            "status": self.status.value,
            "output": self.output,
            "error": self.error,
            "duration_ms": self.duration_ms,
            "output_hash": self.output_hash,
        }


@dataclass
class ParallelWave:
    """A group of calls that can execute concurrently."""

    wave_index: int
    call_ids: list[str]
    is_sequential: bool = False  # True if serialized due to side-effects

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "wave_index": self.wave_index,
            "call_ids": self.call_ids,
            "is_sequential": self.is_sequential,
        }


@dataclass
class ExecutionPlan:
    """The computed execution plan for a set of tool calls."""

    plan_id: str
    calls: list[ToolCall]
    waves: list[ParallelWave]
    has_cycle: bool
    cycle_detail: str
    total_calls: int
    parallelizable_count: int
    sequential_count: int

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "plan_id": self.plan_id,
            "waves": [w.dict for w in self.waves],
            "has_cycle": self.has_cycle,
            "cycle_detail": self.cycle_detail,
            "total_calls": self.total_calls,
            "parallelizable_count": self.parallelizable_count,
            "sequential_count": self.sequential_count,
        }


@dataclass
class ExecutionResult:
    """Full result of parallel plan execution."""

    plan_id: str
    results: list[CallResult]
    total_calls: int
    success_count: int
    failure_count: int
    skipped_count: int
    wall_time_ms: float
    consistency_scores: dict[str, float]  # call_id → consistency score if repeated

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "plan_id": self.plan_id,
            "results": [r.dict for r in self.results],
            "total_calls": self.total_calls,
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "skipped_count": self.skipped_count,
            "wall_time_ms": self.wall_time_ms,
            "consistency_scores": self.consistency_scores,
        }


# ---------------------------------------------------------------------------
# Dependency Graph + Plan Builder
# ---------------------------------------------------------------------------

class DependencyGraph:
    """Directed acyclic graph for tool call dependencies."""

    def __init__(self, calls: list[ToolCall]) -> None:
        self._calls: dict[str, ToolCall] = {c.call_id: c for c in calls}
        self._adj: dict[str, list[str]] = defaultdict(list)   # call_id → dependents
        self._indeg: dict[str, int] = {c.call_id: 0 for c in calls}
        self._build()

    def _build(self) -> None:
        for call in self._calls.values():
            for dep_id in call.depends_on:
                if dep_id in self._calls:
                    self._adj[dep_id].append(call.call_id)
                    self._indeg[call.call_id] = self._indeg.get(call.call_id, 0) + 1

    def detect_cycle(self) -> tuple[bool, str]:
        """Kahn's algorithm to detect cycles. Returns (has_cycle, detail)."""
        indeg = dict(self._indeg)
        queue: deque[str] = deque(cid for cid, d in indeg.items() if d == 0)
        visited = 0
        while queue:
            node = queue.popleft()
            visited += 1
            for neighbor in self._adj.get(node, []):
                indeg[neighbor] -= 1
                if indeg[neighbor] == 0:
                    queue.append(neighbor)
        if visited < len(self._calls):
            remaining = [cid for cid, d in indeg.items() if d > 0]
            return True, f"Cycle detected involving call_ids: {remaining}"
        return False, ""

    def topological_waves(self) -> list[list[str]]:
        """Group calls into waves (BFS levels) for maximum parallelism."""
        indeg = dict(self._indeg)
        queue: deque[str] = deque(cid for cid, d in indeg.items() if d == 0)
        waves: list[list[str]] = []

        while queue:
            wave_size = len(queue)
            wave: list[str] = []
            for _ in range(wave_size):
                node = queue.popleft()
                wave.append(node)
                for neighbor in self._adj.get(node, []):
                    indeg[neighbor] -= 1
                    if indeg[neighbor] == 0:
                        queue.append(neighbor)
            if wave:
                waves.append(sorted(wave))  # sort for determinism

        return waves


def build_execution_plan(
    calls: list[ToolCall],
    side_effect_policy: SideEffectPolicy = SideEffectPolicy.SERIALIZE,
) -> ExecutionPlan:
    """Build an execution plan with dependency graph analysis.

    Args:
        calls: List of tool calls to schedule.
        side_effect_policy: Controls how side-effectful calls are handled.

    Returns:
        ExecutionPlan with wave groupings.

    Raises:
        ValueError: If dependency graph contains a cycle.
    """
    plan_id = str(uuid.uuid4())
    graph = DependencyGraph(calls)
    has_cycle, cycle_detail = graph.detect_cycle()

    if has_cycle:
        return ExecutionPlan(
            plan_id=plan_id,
            calls=calls,
            waves=[],
            has_cycle=True,
            cycle_detail=cycle_detail,
            total_calls=len(calls),
            parallelizable_count=0,
            sequential_count=len(calls),
        )

    raw_waves = graph.topological_waves()
    call_map = {c.call_id: c for c in calls}
    waves: list[ParallelWave] = []
    parallel_count = 0
    sequential_count = 0

    for wave_idx, wave_cids in enumerate(raw_waves):
        side_effect_calls = [
            cid for cid in wave_cids if call_map[cid].has_side_effects
        ]
        non_se_calls = [cid for cid in wave_cids if not call_map[cid].has_side_effects]

        if side_effect_policy == SideEffectPolicy.DENY and side_effect_calls:
            raise ValueError(
                f"Wave {wave_idx} contains side-effectful calls and "
                f"policy=DENY: {side_effect_calls}"
            )

        if side_effect_policy == SideEffectPolicy.SERIALIZE and side_effect_calls:
            # Emit non-SE calls as one parallel wave, then each SE call as its own wave
            if non_se_calls:
                waves.append(
                    ParallelWave(wave_index=wave_idx, call_ids=non_se_calls, is_sequential=False)
                )
                parallel_count += len(non_se_calls)
            for se_cid in side_effect_calls:
                waves.append(
                    ParallelWave(wave_index=wave_idx, call_ids=[se_cid], is_sequential=True)
                )
                sequential_count += 1
        else:
            # ALLOW policy or no side-effect calls: run whole wave in parallel
            is_seq = len(wave_cids) == 1
            waves.append(
                ParallelWave(wave_index=wave_idx, call_ids=wave_cids, is_sequential=is_seq)
            )
            if is_seq:
                sequential_count += len(wave_cids)
            else:
                parallel_count += len(wave_cids)

    return ExecutionPlan(
        plan_id=plan_id,
        calls=calls,
        waves=waves,
        has_cycle=False,
        cycle_detail="",
        total_calls=len(calls),
        parallelizable_count=parallel_count,
        sequential_count=sequential_count,
    )


# ---------------------------------------------------------------------------
# Executor
# ---------------------------------------------------------------------------

def _hash_output(output: Any) -> str:
    try:
        canonical = json.dumps(output, sort_keys=True, ensure_ascii=True, default=str)
    except (TypeError, ValueError):
        canonical = str(output)
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


ToolHandler = Callable[[str, dict[str, Any]], Any]
AsyncToolHandler = Callable[[str, dict[str, Any]], Awaitable[Any]]


async def _call_with_timeout(
    handler: AsyncToolHandler,
    tool_name: str,
    parameters: dict[str, Any],
    timeout_ms: int | None,
) -> Any:
    coro = handler(tool_name, parameters)
    if timeout_ms is not None:
        return await asyncio.wait_for(coro, timeout=timeout_ms / 1000.0)
    return await coro


async def _execute_plan_async(
    plan: ExecutionPlan,
    handler: AsyncToolHandler,
    determinism_settings: dict[str, Any] | None = None,
    fail_fast: bool = False,
) -> ExecutionResult:
    """Execute a plan asynchronously, respecting wave ordering."""
    settings = determinism_settings or {}
    call_map = {c.call_id: c for c in plan.calls}
    results: dict[str, CallResult] = {}
    start_wall = time.monotonic()

    for wave in plan.waves:
        if fail_fast and any(
            r.status == ExecutionStatus.FAILED
            for r in results.values()
        ):
            # Skip remaining waves
            for cid in wave.call_ids:
                call = call_map[cid]
                results[cid] = CallResult(
                    call_id=cid,
                    tool_name=call.tool_name,
                    status=ExecutionStatus.SKIPPED,
                    output=None,
                    error="Skipped due to upstream failure (fail_fast=True)",
                    duration_ms=0.0,
                    output_hash=None,
                )
            continue

        if wave.is_sequential:
            # Run calls in this wave sequentially
            for cid in wave.call_ids:
                call = call_map[cid]
                # Check if any dependency failed
                dep_failed = any(
                    results.get(dep_id, CallResult(
                        call_id=dep_id, tool_name="", status=ExecutionStatus.PENDING,
                        output=None, error=None, duration_ms=0, output_hash=None,
                    )).status == ExecutionStatus.FAILED
                    for dep_id in call.depends_on
                )
                if dep_failed and fail_fast:
                    results[cid] = CallResult(
                        call_id=cid,
                        tool_name=call.tool_name,
                        status=ExecutionStatus.SKIPPED,
                        output=None,
                        error="Skipped: dependency failed",
                        duration_ms=0.0,
                        output_hash=None,
                    )
                    continue

                result = await _invoke_single(call, handler, settings)
                results[cid] = result
        else:
            # Run concurrently
            tasks = {
                cid: asyncio.create_task(
                    _invoke_single(call_map[cid], handler, settings)
                )
                for cid in wave.call_ids
            }
            completed = await asyncio.gather(*tasks.values(), return_exceptions=True)
            for cid, outcome in zip(tasks.keys(), completed):
                call = call_map[cid]
                if isinstance(outcome, Exception):
                    results[cid] = CallResult(
                        call_id=cid,
                        tool_name=call.tool_name,
                        status=ExecutionStatus.FAILED,
                        output=None,
                        error=str(outcome),
                        duration_ms=0.0,
                        output_hash=None,
                    )
                else:
                    results[cid] = outcome  # type: ignore[assignment]

    wall_ms = (time.monotonic() - start_wall) * 1000.0
    all_results = [results[c.call_id] for c in plan.calls if c.call_id in results]
    success = sum(1 for r in all_results if r.status == ExecutionStatus.SUCCESS)
    failure = sum(1 for r in all_results if r.status == ExecutionStatus.FAILED)
    skipped = sum(1 for r in all_results if r.status == ExecutionStatus.SKIPPED)

    return ExecutionResult(
        plan_id=plan.plan_id,
        results=all_results,
        total_calls=len(all_results),
        success_count=success,
        failure_count=failure,
        skipped_count=skipped,
        wall_time_ms=round(wall_ms, 2),
        consistency_scores={},
    )


async def _invoke_single(
    call: ToolCall,
    handler: AsyncToolHandler,
    settings: dict[str, Any],
) -> CallResult:
    """Invoke a single tool call through the handler."""
    start = time.monotonic()
    params = dict(call.parameters)
    # Inject determinism settings if applicable
    if settings.get("seed") is not None and "seed" not in params:
        params["seed"] = settings["seed"]
    if settings.get("temperature") is not None and "temperature" not in params:
        params["temperature"] = settings["temperature"]

    try:
        output = await _call_with_timeout(handler, call.tool_name, params, call.timeout_ms)
        duration_ms = (time.monotonic() - start) * 1000.0
        out_hash = _hash_output(output)
        return CallResult(
            call_id=call.call_id,
            tool_name=call.tool_name,
            status=ExecutionStatus.SUCCESS,
            output=output,
            error=None,
            duration_ms=round(duration_ms, 2),
            output_hash=out_hash,
        )
    except Exception as exc:
        duration_ms = (time.monotonic() - start) * 1000.0
        return CallResult(
            call_id=call.call_id,
            tool_name=call.tool_name,
            status=ExecutionStatus.FAILED,
            output=None,
            error=str(exc),
            duration_ms=round(duration_ms, 2),
            output_hash=None,
        )


# ---------------------------------------------------------------------------
# Sync wrapper for non-async contexts
# ---------------------------------------------------------------------------

def _sync_handler_to_async(sync_fn: ToolHandler) -> AsyncToolHandler:
    """Wrap a sync tool handler to be async-compatible."""
    async def wrapper(tool_name: str, parameters: dict[str, Any]) -> Any:
        return sync_fn(tool_name, parameters)
    return wrapper


# ---------------------------------------------------------------------------
# ToolParallelizer — main service
# ---------------------------------------------------------------------------

class ToolParallelizer:
    """Safe parallel tool call execution engine."""

    def __init__(
        self,
        side_effect_policy: SideEffectPolicy = SideEffectPolicy.SERIALIZE,
        default_timeout_ms: int | None = None,
        default_determinism_settings: dict[str, Any] | None = None,
    ) -> None:
        self._side_effect_policy = side_effect_policy
        self._default_timeout_ms = default_timeout_ms
        self._determinism_settings = default_determinism_settings or {}
        self._result_history: list[ExecutionResult] = []  # In-memory for this session

    def build_plan(
        self,
        calls: list[ToolCall] | list[dict[str, Any]],
        side_effect_policy: SideEffectPolicy | None = None,
    ) -> ExecutionPlan:
        """Build an execution plan (does not execute).

        Args:
            calls: List of ToolCall objects or raw dicts.
            side_effect_policy: Override instance-level policy.

        Returns:
            ExecutionPlan ready for execution or inspection.
        """
        normalized = [
            c if isinstance(c, ToolCall) else ToolCall.from_dict(c)
            for c in calls
        ]
        policy = side_effect_policy if side_effect_policy is not None else self._side_effect_policy
        return build_execution_plan(normalized, side_effect_policy=policy)

    def analyze_parallelism(
        self,
        calls: list[ToolCall] | list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Analyze a call list and report parallelism opportunities without executing."""
        plan = self.build_plan(calls)
        parallelism_ratio = (
            plan.parallelizable_count / plan.total_calls
            if plan.total_calls else 0.0
        )
        return {
            "plan_id": plan.plan_id,
            "has_cycle": plan.has_cycle,
            "cycle_detail": plan.cycle_detail,
            "total_calls": plan.total_calls,
            "wave_count": len(plan.waves),
            "parallelizable_count": plan.parallelizable_count,
            "sequential_count": plan.sequential_count,
            "parallelism_ratio": round(parallelism_ratio, 4),
            "waves": [w.dict for w in plan.waves],
        }

    async def execute_async(
        self,
        calls: list[ToolCall] | list[dict[str, Any]],
        handler: AsyncToolHandler,
        determinism_settings: dict[str, Any] | None = None,
        fail_fast: bool = False,
        side_effect_policy: SideEffectPolicy | None = None,
    ) -> ExecutionResult:
        """Execute tool calls asynchronously according to dependency graph.

        Args:
            calls: Tool calls to execute.
            handler: Async callable ``(tool_name, parameters) → output``.
            determinism_settings: Overrides for seeds/temperatures etc.
            fail_fast: Skip remaining calls after first failure.
            side_effect_policy: Override instance-level policy for this run.

        Returns:
            ExecutionResult with all results joined.
        """
        plan = self.build_plan(calls, side_effect_policy=side_effect_policy)
        if plan.has_cycle:
            raise ValueError(f"Cannot execute: {plan.cycle_detail}")

        settings = {**self._determinism_settings, **(determinism_settings or {})}
        result = await _execute_plan_async(plan, handler, settings, fail_fast=fail_fast)
        self._result_history.append(result)
        return result

    def execute_sync(
        self,
        calls: list[ToolCall] | list[dict[str, Any]],
        handler: ToolHandler,
        determinism_settings: dict[str, Any] | None = None,
        fail_fast: bool = False,
        side_effect_policy: SideEffectPolicy | None = None,
    ) -> ExecutionResult:
        """Synchronous convenience wrapper around execute_async.

        Uses ``asyncio.run`` internally — do NOT call from within a running loop.
        For async contexts use ``execute_async`` directly.
        """
        async_handler = _sync_handler_to_async(handler)
        return asyncio.run(
            self.execute_async(
                calls=calls,
                handler=async_handler,
                determinism_settings=determinism_settings,
                fail_fast=fail_fast,
                side_effect_policy=side_effect_policy,
            )
        )

    def join_results(
        self,
        result: ExecutionResult,
        strategy: str = "dict",
        error_on_failure: bool = False,
    ) -> Any:
        """Join execution results into a single value.

        Strategies:
        - ``dict``: {call_id: output} for all successful results
        - ``list``: [output, ...] in original call order
        - ``first_success``: Return first successful output
        - ``merge``: Deep merge all dict outputs

        Args:
            result: ExecutionResult to join.
            strategy: Join strategy name.
            error_on_failure: Raise if any call failed.

        Returns:
            Joined output.
        """
        if error_on_failure and result.failure_count > 0:
            failed = [r for r in result.results if r.status == ExecutionStatus.FAILED]
            msgs = "; ".join(f"{r.call_id}: {r.error}" for r in failed)
            raise RuntimeError(f"Tool execution failures: {msgs}")

        success_results = [r for r in result.results if r.status == ExecutionStatus.SUCCESS]

        if strategy == "dict":
            return {r.call_id: r.output for r in success_results}

        if strategy == "list":
            return [r.output for r in success_results]

        if strategy == "first_success":
            return success_results[0].output if success_results else None

        if strategy == "merge":
            merged: dict[str, Any] = {}
            for r in success_results:
                if isinstance(r.output, dict):
                    merged.update(r.output)
                else:
                    merged[r.call_id] = r.output
            return merged

        raise ValueError(f"Unknown join strategy: {strategy!r}")

    def history(self, limit: int = 20) -> list[dict[str, Any]]:
        """Return recent execution summaries."""
        recent = self._result_history[-limit:]
        return [
            {
                "plan_id": r.plan_id,
                "total_calls": r.total_calls,
                "success_count": r.success_count,
                "failure_count": r.failure_count,
                "wall_time_ms": r.wall_time_ms,
            }
            for r in recent
        ]


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_PARALLELIZER: ToolParallelizer | None = None


def get_parallelizer(
    side_effect_policy: SideEffectPolicy = SideEffectPolicy.SERIALIZE,
    reset: bool = False,
) -> ToolParallelizer:
    global _PARALLELIZER
    if _PARALLELIZER is None or reset:
        _PARALLELIZER = ToolParallelizer(side_effect_policy=side_effect_policy)
    return _PARALLELIZER


__all__ = [
    "ExecutionStatus",
    "SideEffectPolicy",
    "ToolCall",
    "CallResult",
    "ParallelWave",
    "ExecutionPlan",
    "ExecutionResult",
    "DependencyGraph",
    "build_execution_plan",
    "ToolParallelizer",
    "get_parallelizer",
]
