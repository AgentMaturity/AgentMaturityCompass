"""The gate's decisions, without spawning pytest or the CLI.

The plugin this replaces had no tests at all, which is how a threshold check that
could never run survived. Each case below names the failure it exists to stop.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from pytest_amc.gate import evaluate, min_layer_level  # noqa: E402


def result(**overrides):
    """A trustworthy, verified result unless a test says otherwise."""
    base = {
        "verificationPassed": True,
        "status": "VALID",
        "trustLabel": "MEASURED",
        "layerScores": [
            {"layerName": "a", "confidenceWeightedFinalLevel": 3},
            {"layerName": "b", "confidenceWeightedFinalLevel": 2},
        ],
    }
    base.update(overrides)
    return base


def test_fails_when_the_ledger_does_not_verify():
    verdict = evaluate(result(verificationPassed=False), min_level=0)
    assert verdict.failed
    assert "did not verify" in verdict.reason


def test_evidence_integrity_is_checked_even_with_no_level_requested():
    # The default settings must still be able to FAIL. The old plugin's defaults
    # printed "meets minimum L0" for every run and could fail nothing.
    assert evaluate(result(verificationPassed=False), min_level=0).failed
    assert not evaluate(result(), min_level=0).failed


def test_verification_can_be_waived_but_not_by_default():
    broken = result(verificationPassed=False)
    assert evaluate(broken, min_level=0).failed
    assert not evaluate(broken, min_level=0, require_verification=False).failed


def test_judges_the_weakest_layer_not_the_average():
    # Averaging would let a strong layer hide a bare one; a maturity claim is
    # only as good as its weakest layer.
    assert min_layer_level(result()) == 2
    assert evaluate(result(), min_level=2).failed is False
    assert evaluate(result(), min_level=3).failed is True


def test_refuses_to_judge_a_level_on_an_untrustworthy_result():
    # The case that actually occurs: an empty workspace scores every layer 0 and
    # is labelled unusable. Passing `--amc-min-level 0` there would report
    # "meets the bar" about a number AMC has just disclaimed.
    unusable = result(status="INVALID", trustLabel="UNRELIABLE — DO NOT USE FOR CLAIMS",
                      layerScores=[{"layerName": "a", "confidenceWeightedFinalLevel": 0}])
    verdict = evaluate(unusable, min_level=1)
    assert verdict.failed
    assert "untrustworthy" in verdict.reason
    assert verdict.level is None


def test_reports_no_level_when_there_are_no_layers():
    verdict = evaluate(result(layerScores=[]), min_level=1)
    assert verdict.failed
    assert "no layer levels" in verdict.reason


def test_reads_neither_score_nor_level_keys():
    """The keys the old plugin read do not exist in either scoring mode.

    A result carrying only those would have been reported as L0 and passed; it
    must now be refused for having nothing to judge.
    """
    verdict = evaluate({"verificationPassed": True, "status": "VALID",
                        "trustLabel": "MEASURED", "score": 0.9, "level": "L4"}, min_level=1)
    assert verdict.failed
    assert "no layer levels" in verdict.reason
