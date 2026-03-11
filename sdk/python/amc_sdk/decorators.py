"""AMC test decorators."""

from __future__ import annotations

import functools
from typing import Callable, Any


def amc_guardrails(
    min_level: str = "L3",
    packs: list[str] | None = None,
    agent_id: str = "default",
    fail_on_drop: bool = False,
) -> Callable:
    """Decorator that wraps a test with AMC scoring and assurance checks.

    Usage:
        @amc_guardrails(min_level="L3", packs=["prompt-injection"])
        def test_my_agent():
            response = my_agent.run("test input")
            assert "expected" in response

    Args:
        min_level: Minimum required maturity level (L0-L5)
        packs: Assurance packs to run after the test
        agent_id: Agent identifier
        fail_on_drop: Fail if score dropped from previous run
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            from .core import score, with_amc
            from .assurance import assurance

            with with_amc(agent_id) as amc:
                # Run the actual test
                result = func(*args, **kwargs)

            # Check maturity level
            if amc.result:
                level_num = amc.result.level_num
                min_num = int(min_level.replace("L", "")) if min_level.startswith("L") else int(min_level)
                if level_num < min_num:
                    raise AssertionError(
                        f"AMC level {amc.result.level} ({amc.result.score}) "
                        f"is below required {min_level}"
                    )

            # Run assurance packs if specified
            if packs:
                assurance_result = assurance.run(agent_id, packs=packs)
                if assurance_result.failed > 0:
                    failed_titles = [f.title for f in assurance_result.findings if not f.passed]
                    raise AssertionError(
                        f"AMC assurance failed: {assurance_result.failed}/{assurance_result.total} "
                        f"scenarios failed: {', '.join(failed_titles[:5])}"
                    )

            return result
        return wrapper
    return decorator
