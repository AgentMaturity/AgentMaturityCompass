"""Tests for amc.product.plan_generator — Step-by-Step Plan Generator."""
from __future__ import annotations

import pytest

from amc.product.plan_generator import (
    PlanComplexity,
    PlanGenerator,
    PlanRequest,
    RiskLevel,
    StepType,
    get_plan_generator,
)


@pytest.fixture()
def gen() -> PlanGenerator:
    return PlanGenerator()


# ---------------------------------------------------------------------------
# Basic generation
# ---------------------------------------------------------------------------


def test_generate_returns_plan(gen):
    plan = gen.generate(PlanRequest(goal="Fetch all customer records from the database."))
    assert plan.goal
    assert len(plan.steps) >= 1
    assert plan.total_estimated_duration_min > 0


def test_generate_fetch_goal_has_fetch_steps(gen):
    plan = gen.generate(PlanRequest(goal="Retrieve sales data from the API."))
    titles = [s.title.lower() for s in plan.steps]
    assert any("fetch" in t or "data" in t or "source" in t for t in titles)


def test_generate_send_goal_has_review_step(gen):
    plan = gen.generate(
        PlanRequest(goal="Send email notification to all users.", include_human_review_steps=True)
    )
    types = [s.step_type for s in plan.steps]
    assert StepType.HUMAN_REVIEW in types


def test_generate_analyze_goal_matches_pattern(gen):
    plan = gen.generate(PlanRequest(goal="Analyze the monthly revenue report."))
    titles = " ".join(s.title.lower() for s in plan.steps)
    assert "analys" in titles or "summary" in titles or "data" in titles


def test_generate_create_goal(gen):
    plan = gen.generate(PlanRequest(goal="Create a draft marketing campaign."))
    assert len(plan.steps) >= 2


def test_generate_update_goal(gen):
    plan = gen.generate(PlanRequest(goal="Update the customer profile with new data."))
    titles = " ".join(s.title.lower() for s in plan.steps)
    assert "current" in titles or "state" in titles or "change" in titles or "retrieve" in titles


def test_generate_monitor_goal(gen):
    plan = gen.generate(PlanRequest(goal="Monitor server performance metrics."))
    titles = " ".join(s.title.lower() for s in plan.steps)
    assert "monitor" in titles or "signal" in titles or "alert" in titles


def test_generate_default_steps_for_unknown_goal(gen):
    plan = gen.generate(PlanRequest(goal="Do something vague and undefined XYZ."))
    assert len(plan.steps) >= 1


# ---------------------------------------------------------------------------
# Risk detection
# ---------------------------------------------------------------------------


def test_high_risk_for_delete_goal(gen):
    plan = gen.generate(PlanRequest(goal="Delete all inactive accounts from the system."))
    # At least one step should have high risk
    risks = {s.risk_level for s in plan.steps}
    assert RiskLevel.HIGH in risks


def test_low_risk_for_read_goal(gen):
    plan = gen.generate(PlanRequest(goal="Read and display the list of products."))
    risks = {s.risk_level for s in plan.steps}
    # Low-risk goal: should not escalate to HIGH risk
    assert RiskLevel.HIGH not in risks


def test_medium_risk_for_deploy_goal(gen):
    plan = gen.generate(PlanRequest(goal="Deploy the new version to production."))
    risks = {s.risk_level for s in plan.steps}
    assert RiskLevel.MEDIUM in risks or RiskLevel.HIGH in risks


# ---------------------------------------------------------------------------
# Complexity classification
# ---------------------------------------------------------------------------


def test_simple_complexity_for_short_plan(gen):
    plan = gen.generate(PlanRequest(goal="Read the config file.", max_steps=2))
    assert plan.complexity in (PlanComplexity.SIMPLE, PlanComplexity.MODERATE)


def test_complex_plan_has_many_steps(gen):
    plan = gen.generate(
        PlanRequest(
            goal="Create and deploy a complete monitoring system for all services.",
            max_steps=10,
        )
    )
    assert len(plan.steps) >= 3


# ---------------------------------------------------------------------------
# Plan fields
# ---------------------------------------------------------------------------


def test_plan_has_open_questions(gen):
    plan = gen.generate(PlanRequest(goal="Process every transaction in the queue."))
    assert isinstance(plan.open_questions, list)
    assert len(plan.open_questions) >= 1


def test_plan_has_assumptions(gen):
    plan = gen.generate(PlanRequest(goal="Automatically update the latest records."))
    assert any("accessible" in a.lower() or "assumption" in a.lower() or "no human" in a.lower() or "data" in a.lower() for a in plan.assumptions)


def test_plan_critical_path_covers_all_steps(gen):
    plan = gen.generate(PlanRequest(goal="Fetch and send a report."))
    step_nums = {s.step_number for s in plan.steps}
    assert set(plan.critical_path) == step_nums


# ---------------------------------------------------------------------------
# Max steps cap
# ---------------------------------------------------------------------------


def test_max_steps_respected(gen):
    plan = gen.generate(PlanRequest(goal="Analyze everything.", max_steps=3))
    assert len(plan.steps) <= 3


# ---------------------------------------------------------------------------
# Available tools injection
# ---------------------------------------------------------------------------


def test_available_tools_injected_into_steps(gen):
    plan = gen.generate(
        PlanRequest(
            goal="Fetch data from the search API.",
            available_tools=["search_tool", "fetch_api"],
        )
    )
    all_tools: list[str] = []
    for s in plan.steps:
        all_tools.extend(s.estimated_tool_calls)
    # At least one step should reference the available tools
    assert any("search_tool" in t or "fetch_api" in t for t in all_tools)


# ---------------------------------------------------------------------------
# Step dict
# ---------------------------------------------------------------------------


def test_step_dict_keys(gen):
    plan = gen.generate(PlanRequest(goal="Analyze the data."))
    d = plan.steps[0].dict
    assert "step_number" in d
    assert "title" in d
    assert "step_type" in d
    assert "risk_level" in d
    assert "acceptance_criteria" in d


def test_plan_dict_keys(gen):
    plan = gen.generate(PlanRequest(goal="Fetch the records."))
    d = plan.dict
    assert "goal" in d
    assert "steps" in d
    assert "complexity" in d
    assert "total_estimated_duration_min" in d


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------


def test_singleton():
    g1 = get_plan_generator()
    g2 = get_plan_generator()
    assert g1 is g2
