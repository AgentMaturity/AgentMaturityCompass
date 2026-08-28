"""Decide whether an AMC result should fail a build.

Kept apart from the pytest wiring so the decision can be tested without spawning
a pytest run. The old plugin had no such seam and no test, which is part of why
it went unnoticed that its gate could not fire.

WHAT THIS REFUSES TO DO. It will not pass a level gate on a result AMC has
labelled unusable. `quickscore --auto` reports a `trustLabel`, and on a workspace
with no evidence that label reads "UNRELIABLE — DO NOT USE FOR CLAIMS" while
every layer level is 0. A gate that let `--amc-min-level 0` succeed there would
be reporting "meets the bar" about a number AMC has just said not to rely on.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

__all__ = ["Verdict", "evaluate", "min_layer_level", "MISSING_LEVEL"]

#: What `layerScores` reports when a layer has no measured level.
MISSING_LEVEL = 0


@dataclass(frozen=True)
class Verdict:
    """Whether to fail, and the one line explaining why."""

    failed: bool
    reason: str
    #: None when the result was not trustworthy enough to read a level from.
    level: Optional[int] = None


def min_layer_level(result: dict[str, Any]) -> Optional[int]:
    """The lowest confidence-weighted level across layers, or None if absent.

    The LOWEST, not the average: a maturity claim is only as good as its weakest
    layer, and averaging lets a strong layer hide a bare one.
    """
    layers = result.get("layerScores")
    if not isinstance(layers, list) or not layers:
        return None
    levels: list[int] = []
    for layer in layers:
        value = layer.get("confidenceWeightedFinalLevel") if isinstance(layer, dict) else None
        if isinstance(value, (int, float)):
            levels.append(int(value))
    return min(levels) if levels else None


def evaluate(
    result: dict[str, Any],
    *,
    min_level: int = 0,
    require_verification: bool = True,
) -> Verdict:
    """Turn a `quickscore --auto --json` result into a pass or a fail.

    ``require_verification`` gates on AMC's own evidence-integrity verdict, which
    is the one thing a CI run can establish without answering any questions. It
    defaults on: a build that ran agents and left an unverifiable ledger has a
    problem whatever its maturity level says.
    """
    if require_verification and result.get("verificationPassed") is not True:
        return Verdict(True, "the evidence ledger did not verify")

    if min_level <= 0:
        # No level was asked for. Say so, rather than reporting a pass against a
        # bar nobody set — the old plugin printed "meets minimum L0" for every
        # run, which reads as a checked result and was not one.
        return Verdict(False, "no minimum level requested; evidence integrity only")

    label = str(result.get("trustLabel") or "")
    status = str(result.get("status") or "")
    if status != "VALID" or "UNRELIABLE" in label.upper():
        # A level gate on an untrustworthy score would be worse than no gate: it
        # would report a maturity verdict AMC has explicitly disclaimed.
        return Verdict(
            True,
            f"refusing to judge a level against an untrustworthy result (status={status or 'unknown'};"
            f" {label or 'no trust label'})",
        )

    level = min_layer_level(result)
    if level is None:
        return Verdict(True, "the result carried no layer levels to judge")
    if level < min_level:
        return Verdict(True, f"lowest layer level L{level} is below the required L{min_level}", level)
    return Verdict(False, f"lowest layer level L{level} meets the required L{min_level}", level)
