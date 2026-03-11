"""Tests for AMC SDK types."""

from amc_sdk.types import ScoreResult, DimensionScore, AssuranceResult, Finding, Report


def test_score_result_level_num():
    r = ScoreResult(score=72.5, level="L3", agent_id="test")
    assert r.level_num == 3


def test_score_result_meets():
    r = ScoreResult(score=72.5, level="L3", agent_id="test")
    assert r.meets("L3") is True
    assert r.meets("L2") is True
    assert r.meets("L4") is False


def test_score_result_meets_string_target():
    r = ScoreResult(score=50.0, level="L2", agent_id="test")
    assert r.meets("L2") is True
    assert r.meets("L3") is False


def test_assurance_result_pass_rate():
    r = AssuranceResult(agent_id="test", total=10, passed=7, failed=3)
    assert r.pass_rate == 0.7


def test_assurance_result_empty():
    r = AssuranceResult(agent_id="test", total=0, passed=0, failed=0)
    assert r.pass_rate == 0.0


def test_report_save_json(tmp_path):
    r = Report(agent_id="test", framework="eu-ai-act", content="<html>", raw={"score": 72})
    path = tmp_path / "report.json"
    r.save_json(str(path))
    assert path.exists()
    import json
    data = json.loads(path.read_text())
    assert data["score"] == 72


def test_report_save_html(tmp_path):
    r = Report(agent_id="test", framework="eu-ai-act", content="<html>report</html>", raw={})
    path = tmp_path / "report.html"
    r.save_html(str(path))
    assert path.exists()
    assert "<html>" in path.read_text()


def test_dimension_score():
    d = DimensionScore(name="skills", score=75.0, level="L3", details="Good")
    assert d.name == "skills"
    assert d.score == 75.0


def test_finding():
    f = Finding(id="f1", title="Injection", severity="high", passed=False, details="Failed", pack="injection")
    assert f.passed is False
    assert f.severity == "high"
