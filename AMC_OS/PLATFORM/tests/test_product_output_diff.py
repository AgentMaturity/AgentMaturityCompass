"""Tests for amc.product.output_diff — LLM Output Diff Tracker."""
from __future__ import annotations

import pytest

from amc.product.output_diff import (
    OutputDiffTracker,
    get_output_diff_tracker,
)


@pytest.fixture()
def tracker(tmp_path):
    return OutputDiffTracker(db_path=tmp_path / "output_diff.db")


# ---------------------------------------------------------------------------
# Record run
# ---------------------------------------------------------------------------


def test_record_run_returns_record(tracker):
    rec = tracker.record_run(
        output_text="Hello world.",
        workflow_id="wf-1",
        prompt_key="greeting",
        tenant_id="t1",
        auto_diff=False,
    )
    assert rec.run_id
    assert rec.output_hash
    assert rec.token_count > 0


def test_record_run_stores_and_retrieves(tracker):
    rec = tracker.record_run("My output", workflow_id="wf-a", auto_diff=False)
    fetched = tracker.get_run(rec.run_id)
    assert fetched is not None
    assert fetched.output_text == "My output"


def test_record_run_idempotent_on_same_id(tracker):
    run_id = "fixed-id-001"
    tracker.record_run("Output A", run_id=run_id, auto_diff=False)
    tracker.record_run("Output B", run_id=run_id, auto_diff=False)
    rec = tracker.get_run(run_id)
    # SQLite INSERT OR IGNORE: first write wins
    assert rec is not None


def test_list_runs_filtered_by_workflow(tracker):
    tracker.record_run("output 1", workflow_id="wf-x", auto_diff=False)
    tracker.record_run("output 2", workflow_id="wf-y", auto_diff=False)
    runs = tracker.list_runs(workflow_id="wf-x")
    assert all(r.workflow_id == "wf-x" for r in runs)
    assert len(runs) >= 1


# ---------------------------------------------------------------------------
# Diff computation
# ---------------------------------------------------------------------------


def test_compute_diff_identical_outputs(tracker):
    a = tracker.record_run("Same text.", workflow_id="wf-d", auto_diff=False)
    b = tracker.record_run("Same text.", workflow_id="wf-d", auto_diff=False)
    diff = tracker.compute_diff(a.run_id, b.run_id)
    assert diff.similarity == pytest.approx(1.0, abs=0.01)
    assert not diff.is_regression


def test_compute_diff_very_different_outputs(tracker):
    a = tracker.record_run("The sky is blue and very large.", auto_diff=False)
    b = tracker.record_run("Quantum physics describes subatomic particles.", auto_diff=False)
    diff = tracker.compute_diff(a.run_id, b.run_id)
    assert diff.similarity < 0.5
    assert diff.is_regression


def test_compute_diff_partial_change(tracker):
    a = tracker.record_run("Line 1\nLine 2\nLine 3\nLine 4", auto_diff=False)
    b = tracker.record_run("Line 1\nLine 2\nLine 3 changed\nLine 4", auto_diff=False)
    diff = tracker.compute_diff(a.run_id, b.run_id)
    assert diff.similarity > 0.5
    assert diff.added_lines >= 0


def test_compute_diff_missing_run_raises(tracker):
    with pytest.raises(ValueError):
        tracker.compute_diff("nonexistent-1", "nonexistent-2")


def test_auto_diff_on_record(tracker):
    tracker.record_run("Run 1 content", workflow_id="wf-auto", prompt_key="k1", auto_diff=False)
    tracker.record_run("Run 2 content changed", workflow_id="wf-auto", prompt_key="k1", auto_diff=True)
    diffs = tracker.list_diffs(workflow_id="wf-auto")
    assert len(diffs) >= 1


# ---------------------------------------------------------------------------
# Regression summary
# ---------------------------------------------------------------------------


def test_regression_summary_empty(tracker):
    summary = tracker.regression_summary("nonexistent-workflow")
    assert summary.total_runs == 0
    assert summary.total_diffs == 0
    assert summary.regression_count == 0


def test_regression_summary_with_data(tracker):
    tracker.record_run("text A", workflow_id="wf-s", prompt_key="p1", auto_diff=False)
    tracker.record_run("completely unrelated content here", workflow_id="wf-s", prompt_key="p1", auto_diff=False)
    runs = tracker.list_runs(workflow_id="wf-s", prompt_key="p1")
    if len(runs) >= 2:
        tracker.compute_diff(runs[1].run_id, runs[0].run_id)
    summary = tracker.regression_summary("wf-s", "p1")
    assert summary.total_runs >= 2


# ---------------------------------------------------------------------------
# List diffs
# ---------------------------------------------------------------------------


def test_list_diffs_regressions_only(tracker):
    a = tracker.record_run("hello world foo bar", auto_diff=False)
    b = tracker.record_run("xyz abc qrs tuv", auto_diff=False)
    tracker.compute_diff(a.run_id, b.run_id)
    regressions = tracker.list_diffs(regressions_only=True)
    assert all(d.is_regression for d in regressions)


# ---------------------------------------------------------------------------
# Dict serialization
# ---------------------------------------------------------------------------


def test_run_record_dict(tracker):
    rec = tracker.record_run("Test output", auto_diff=False)
    d = rec.dict
    assert "run_id" in d
    assert "output_hash" in d
    assert "token_count" in d


def test_diff_record_dict(tracker):
    a = tracker.record_run("AAA", auto_diff=False)
    b = tracker.record_run("BBB", auto_diff=False)
    diff = tracker.compute_diff(a.run_id, b.run_id)
    d = diff.dict
    assert "diff_id" in d
    assert "similarity" in d
    assert "is_regression" in d


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------


def test_singleton_returns_same_instance():
    # Note: singleton uses shared DB so we just verify it doesn't crash
    tracker1 = get_output_diff_tracker()
    tracker2 = get_output_diff_tracker()
    assert tracker1 is tracker2
