"""
AMC Benchmark Runner
====================
Runs all canonical ReferenceAgents through the ScoringEngine and validates
that each agent's composite score falls within its expected range.

Usage (from repo root, with PYTHONPATH set):
    cd AMC_OS/PLATFORM
    python -m amc.benchmarks.benchmark_runner

Exit codes:
    0 — all agents PASS
    1 — one or more agents FAIL
"""
from __future__ import annotations

import sys
from typing import NamedTuple

from amc.score.dimensions import ScoringEngine, Dimension, DIMENSION_RUBRICS  # noqa: F401
from amc.benchmarks.benchmark_suite import (
    ReferenceAgent,
    ALL_REFERENCE_AGENTS,
    L1_REF_AGENT,
    L3_REF_AGENT,
    L5_REF_AGENT,
    MaturityLevel,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class BenchmarkResult(NamedTuple):
    agent_name: str
    expected_level: MaturityLevel
    expected_range: tuple[int, int]
    actual_score: int
    actual_level: MaturityLevel
    score_ok: bool
    level_ok: bool
    passed: bool


def run_agent(agent: ReferenceAgent, engine: ScoringEngine) -> BenchmarkResult:
    """Score one reference agent and check against expectations."""
    if agent.uses_evidence:
        composite = engine.score_with_evidence(agent.evidence_artifacts)
    else:
        composite = engine.score_all(agent.answers)

    actual_score: int = composite.overall_score
    actual_level: MaturityLevel = composite.overall_level

    lo, hi = agent.expected_score_range
    score_ok = lo <= actual_score <= hi

    # For L5-expected agents we accept L4 as well (score 80+ may map to L4).
    acceptable_levels: set[MaturityLevel] = {agent.expected_level}
    if agent.expected_level == MaturityLevel.L5:
        acceptable_levels.add(MaturityLevel.L4)
    level_ok = actual_level in acceptable_levels

    passed = score_ok and level_ok

    return BenchmarkResult(
        agent_name=agent.name,
        expected_level=agent.expected_level,
        expected_range=agent.expected_score_range,
        actual_score=actual_score,
        actual_level=actual_level,
        score_ok=score_ok,
        level_ok=level_ok,
        passed=passed,
    )


def print_result(r: BenchmarkResult) -> None:
    status = "✅ PASS" if r.passed else "❌ FAIL"
    range_str = f"[{r.expected_range[0]}-{r.expected_range[1]}]"
    score_flag = "✓" if r.score_ok else "✗"
    level_flag = "✓" if r.level_ok else "✗"

    print(f"\n{status}  {r.agent_name}")
    print(f"         Expected level : {r.expected_level.value}")
    print(f"         Actual level   : {r.actual_level.value}  {level_flag}")
    print(f"         Expected range : {range_str}")
    print(f"         Actual score   : {r.actual_score}  {score_flag}")
    if not r.passed:
        if not r.score_ok:
            print(f"         ⚠ Score {r.actual_score} is outside expected range {range_str}")
        if not r.level_ok:
            print(f"         ⚠ Level {r.actual_level.value} does not match expected {r.expected_level.value}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run_benchmarks(agents: list[ReferenceAgent] | None = None) -> list[BenchmarkResult]:
    """Run benchmark suite and return results. Exported for programmatic use."""
    if agents is None:
        agents = ALL_REFERENCE_AGENTS

    engine = ScoringEngine()
    results: list[BenchmarkResult] = []

    print("=" * 60)
    print("AMC ScoringEngine — Reference Agent Benchmark Suite")
    print("=" * 60)
    print(f"Running {len(agents)} reference agent(s) ...\n")

    for agent in agents:
        result = run_agent(agent, engine)
        results.append(result)
        print_result(result)

    total = len(results)
    passed = sum(1 for r in results if r.passed)
    failed = total - passed

    print("\n" + "=" * 60)
    print(f"Results: {passed}/{total} PASSED  |  {failed}/{total} FAILED")
    print("=" * 60)

    if failed == 0:
        print("✅ All benchmarks PASSED — scoring engine is correctly calibrated.\n")
    else:
        print("❌ Some benchmarks FAILED — scoring calibration may have regressed.\n")
        print("Failing agents:")
        for r in results:
            if not r.passed:
                print(f"  • {r.agent_name}: score={r.actual_score} (expected {r.expected_range}), "
                      f"level={r.actual_level.value} (expected {r.expected_level.value})")
        print()

    return results


if __name__ == "__main__":
    results = run_benchmarks()
    all_passed = all(r.passed for r in results)
    sys.exit(0 if all_passed else 1)
