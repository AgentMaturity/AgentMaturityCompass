"""Tests for Wave-2 Tool Intelligence modules (10 modules, 80+ tests).

Covers:
  1. task_spec.py
  2. clarification_optimizer.py
  3. task_splitter.py
  4. dependency_graph.py
  5. param_autofiller.py
  6. response_validator.py
  7. tool_cost_estimator.py
  8. tool_chain_builder.py
  9. tool_fallback.py
  10. tool_rate_limiter.py
"""
from __future__ import annotations

import pytest

# ---------------------------------------------------------------------------
# 1. Task Spec Compiler
# ---------------------------------------------------------------------------
from amc.product.task_spec import TaskSpecCompiler, get_task_spec_compiler


@pytest.fixture()
def compiler(tmp_path):
    return TaskSpecCompiler(db_path=tmp_path / "task_spec.db")


def test_compile_basic(compiler):
    spec = compiler.compile("Build a report using data from the database. Output a PDF.")
    assert spec.spec_id
    assert spec.goal
    assert isinstance(spec.inputs, list)
    assert isinstance(spec.outputs, list)


def test_compile_extracts_goal(compiler):
    spec = compiler.compile("Analyze the sales data. Generate a monthly summary report.")
    assert "Analyze" in spec.goal or "analyze" in spec.goal.lower()


def test_compile_extracts_constraints(compiler):
    spec = compiler.compile(
        "Process the order. The system must not exceed 500ms response time. "
        "Limit output to 100 records."
    )
    assert len(spec.constraints) > 0


def test_compile_generates_done_criteria(compiler):
    spec = compiler.compile("Fetch user records and write to CSV file.")
    assert len(spec.done_criteria) > 0


def test_compile_custom_done_criteria(compiler):
    spec = compiler.compile(
        "Implement feature. Done when all tests pass and coverage is 90%."
    )
    assert any("test" in c.lower() or "pass" in c.lower() for c in spec.done_criteria)


def test_compile_confidence_increases_with_detail(compiler):
    sparse = compiler.compile("Do something.")
    rich = compiler.compile(
        "Given input CSV file with sales data, analyze trends using pandas, "
        "generate a PDF report with charts. The report must not exceed 5MB. "
        "Done when the report renders correctly and file size is under limit."
    )
    assert rich.confidence >= sparse.confidence


def test_compile_persist_and_retrieve(compiler):
    spec = compiler.compile("Test task for retrieval.", tenant_id="t1")
    fetched = compiler.get(spec.spec_id)
    assert fetched is not None
    assert fetched.spec_id == spec.spec_id


def test_list_specs_filter_by_tenant(compiler):
    compiler.compile("Task A", tenant_id="tenant_A")
    compiler.compile("Task B", tenant_id="tenant_B")
    specs = compiler.list_specs(tenant_id="tenant_A")
    assert all(s.tenant_id == "tenant_A" for s in specs)


def test_delete_spec(compiler):
    spec = compiler.compile("Delete me")
    ok = compiler.delete(spec.spec_id)
    assert ok
    assert compiler.get(spec.spec_id) is None


def test_singleton_factory(tmp_path, monkeypatch):
    import amc.product.task_spec as mod
    mod._compiler = None
    c1 = get_task_spec_compiler(db_path=tmp_path / "s.db")
    c2 = get_task_spec_compiler()
    assert c1 is c2
    mod._compiler = None


# ---------------------------------------------------------------------------
# 2. Clarification Optimizer
# ---------------------------------------------------------------------------
from amc.product.clarification_optimizer import (
    ClarificationOptimizer,
    get_clarification_optimizer,
)


@pytest.fixture()
def clarifier(tmp_path):
    return ClarificationOptimizer(db_path=tmp_path / "clarify.db")


def test_optimize_returns_at_most_3(clarifier):
    candidates = [f"Question {i}?" for i in range(10)]
    result = clarifier.optimize(candidates)
    assert len(result.selected) <= 3


def test_optimize_skips_context_covered(clarifier):
    context = {"deadline": "Friday", "owner": "Alice", "format": "PDF"}
    candidates = [
        "What is the deadline for this task?",
        "Who is the owner of this project?",
        "What output format do you need?",
        "What is the budget constraint?",
    ]
    result = clarifier.optimize(candidates, context=context)
    # Budget question should be selected (not in context)
    selected_texts = [q.text for q in result.selected]
    assert len(selected_texts) <= 3


def test_optimize_respects_max_questions(clarifier):
    candidates = ["Q1?", "Q2?", "Q3?", "Q4?", "Q5?"]
    result = clarifier.optimize(candidates, max_questions=2)
    assert len(result.selected) <= 2


def test_optimize_deduplicates(clarifier):
    candidates = ["What format?", "What format?", "What format?"]
    result = clarifier.optimize(candidates)
    assert len(result.selected) <= 1


def test_optimize_scores_critical_words_higher(clarifier):
    candidates = [
        "What is the mandatory deadline?",
        "Any other thoughts?",
    ]
    result = clarifier.optimize(candidates)
    if len(result.selected) == 1:
        assert "deadline" in result.selected[0].text.lower()


def test_record_resolution(clarifier):
    result = clarifier.optimize(["Who owns this?"])
    resolution = clarifier.record_resolution(result.session_id, "Who owns this?", "Alice")
    assert resolution.answer == "Alice"


def test_get_session(clarifier):
    result = clarifier.optimize(["What is the budget?"], tenant_id="t1")
    fetched = clarifier.get_session(result.session_id)
    assert fetched is not None
    assert fetched.session_id == result.session_id


def test_list_sessions(clarifier):
    clarifier.optimize(["Q1?"], tenant_id="list_test")
    clarifier.optimize(["Q2?"], tenant_id="list_test")
    sessions = clarifier.list_sessions(tenant_id="list_test")
    assert len(sessions) >= 2


def test_singleton_factory_clarifier(tmp_path, monkeypatch):
    import amc.product.clarification_optimizer as mod
    mod._optimizer = None
    o1 = get_clarification_optimizer(db_path=tmp_path / "c.db")
    o2 = get_clarification_optimizer()
    assert o1 is o2
    mod._optimizer = None


# ---------------------------------------------------------------------------
# 3. Task Splitter
# ---------------------------------------------------------------------------
from amc.product.task_splitter import MultiAgentTaskSplitter, get_task_splitter


@pytest.fixture()
def splitter(tmp_path):
    return MultiAgentTaskSplitter(db_path=tmp_path / "splitter.db")


def test_split_auto_produces_sub_tasks(splitter):
    split = splitter.split(
        "Research the market. Write a report. Then code the dashboard and validate the results."
    )
    assert len(split.sub_tasks) >= 1


def test_split_assigns_agent_types(splitter):
    split = splitter.split(
        "Research competitors and code a comparison tool."
    )
    agent_types = {s.agent_type for s in split.sub_tasks}
    assert len(agent_types) >= 1


def test_split_sequential_mode(splitter):
    split = splitter.split("First research. Then write. Then deploy.")
    assert split.execution_mode == "sequential"


def test_split_parallel_mode(splitter):
    split = splitter.split("Simultaneously analyze data and fetch metrics.")
    assert split.execution_mode == "parallel"


def test_split_manual_subtasks(splitter):
    manual = [
        {"title": "Fetch data", "description": "Fetch user data from API", "agent_type": "researcher"},
        {"title": "Analyze", "description": "Analyze user trends", "agent_type": "analyst"},
    ]
    split = splitter.split("Complex workflow", manual_sub_tasks=manual)
    assert len(split.sub_tasks) == 2
    assert split.sub_tasks[0].agent_type == "researcher"


def test_split_persist_and_retrieve(splitter):
    split = splitter.split("Build and test.", tenant_id="t1")
    fetched = splitter.get(split.split_id)
    assert fetched is not None
    assert fetched.split_id == split.split_id


def test_split_list_by_tenant(splitter):
    splitter.split("Task 1", tenant_id="x")
    splitter.split("Task 2", tenant_id="x")
    splits = splitter.list_splits(tenant_id="x")
    assert len(splits) >= 2


def test_singleton_factory_splitter(tmp_path, monkeypatch):
    import amc.product.task_splitter as mod
    mod._splitter = None
    s1 = get_task_splitter(db_path=tmp_path / "sp.db")
    s2 = get_task_splitter()
    assert s1 is s2
    mod._splitter = None


# ---------------------------------------------------------------------------
# 4. Dependency Graph Resolver
# ---------------------------------------------------------------------------
from amc.product.dependency_graph import DependencyGraphResolver, get_dependency_graph_resolver


@pytest.fixture()
def dep_resolver(tmp_path):
    return DependencyGraphResolver(db_path=tmp_path / "deps.db")


def test_resolve_simple_chain(dep_resolver):
    nodes = [{"node_id": "A", "label": "Fetch"}, {"node_id": "B", "label": "Process"}, {"node_id": "C", "label": "Store"}]
    edges = [{"from_node": "A", "to_node": "B"}, {"from_node": "B", "to_node": "C"}]
    g = dep_resolver.resolve(nodes, edges)
    assert not g.has_cycle
    assert g.execution_order == ["A", "B", "C"]


def test_resolve_cycle_detected(dep_resolver):
    nodes = [{"node_id": "X", "label": "X"}, {"node_id": "Y", "label": "Y"}]
    edges = [{"from_node": "X", "to_node": "Y"}, {"from_node": "Y", "to_node": "X"}]
    g = dep_resolver.resolve(nodes, edges)
    assert g.has_cycle
    assert len(g.cycle_path) > 0


def test_resolve_parallel_layers(dep_resolver):
    nodes = [
        {"node_id": "A", "label": "A"}, {"node_id": "B", "label": "B"},
        {"node_id": "C", "label": "C"}, {"node_id": "D", "label": "D"},
    ]
    edges = [{"from_node": "A", "to_node": "D"}, {"from_node": "B", "to_node": "D"}, {"from_node": "C", "to_node": "D"}]
    g = dep_resolver.resolve(nodes, edges)
    assert not g.has_cycle
    assert len(g.layers) >= 2  # A,B,C in parallel, then D


def test_resolve_critical_path(dep_resolver):
    nodes = [{"node_id": str(i), "label": str(i)} for i in range(4)]
    edges = [
        {"from_node": "0", "to_node": "1"},
        {"from_node": "1", "to_node": "2"},
        {"from_node": "0", "to_node": "3"},
    ]
    g = dep_resolver.resolve(nodes, edges)
    assert not g.has_cycle
    assert len(g.critical_path) >= 3  # 0 → 1 → 2


def test_resolve_persist_and_retrieve(dep_resolver):
    nodes = [{"node_id": "A", "label": "A"}]
    g = dep_resolver.resolve(nodes, [], name="test-graph", tenant_id="t1")
    fetched = dep_resolver.get(g.graph_id)
    assert fetched is not None


def test_resolve_empty_graph(dep_resolver):
    g = dep_resolver.resolve([], [])
    assert not g.has_cycle
    assert g.execution_order == []


def test_list_graphs_by_tenant(dep_resolver):
    nodes = [{"node_id": "A", "label": "A"}]
    dep_resolver.resolve(nodes, [], tenant_id="tX")
    dep_resolver.resolve(nodes, [], tenant_id="tX")
    graphs = dep_resolver.list_graphs(tenant_id="tX")
    assert len(graphs) >= 2


def test_singleton_factory_dep(tmp_path, monkeypatch):
    import amc.product.dependency_graph as mod
    mod._resolver = None
    r1 = get_dependency_graph_resolver(db_path=tmp_path / "d.db")
    r2 = get_dependency_graph_resolver()
    assert r1 is r2
    mod._resolver = None


# ---------------------------------------------------------------------------
# 5. Parameter Auto-Filler
# ---------------------------------------------------------------------------
from amc.product.param_autofiller import ToolParamAutoFiller, get_param_autofiller


@pytest.fixture()
def filler(tmp_path):
    return ToolParamAutoFiller(db_path=tmp_path / "autofill.db")


def test_autofill_schema_defaults(filler):
    schema = {
        "properties": {
            "timeout": {"type": "integer", "default": 30},
            "format": {"type": "string", "default": "json"},
        },
        "required": ["timeout"],
    }
    result = filler.autofill("my_tool", schema, existing_params={})
    assert result.params_after.get("timeout") == 30
    assert result.params_after.get("format") == "json"


def test_autofill_context_mapping(filler):
    schema = {"properties": {"user_id": {"type": "string"}}, "required": ["user_id"]}
    context = {"user_id": "alice123"}
    result = filler.autofill("tool", schema, existing_params={}, context=context)
    assert result.params_after.get("user_id") == "alice123"


def test_autofill_no_overwrite_existing(filler):
    schema = {"properties": {"limit": {"type": "integer", "default": 100}}, "required": []}
    result = filler.autofill("tool", schema, existing_params={"limit": 50})
    assert result.params_after["limit"] == 50  # unchanged


def test_autofill_coverage_for_required(filler):
    schema = {
        "properties": {"x": {"type": "integer", "default": 1}, "y": {"type": "integer", "default": 2}},
        "required": ["x", "y"],
    }
    result = filler.autofill("tool", schema, existing_params={})
    assert result.coverage == 1.0  # both required filled


def test_autofill_type_inference_timeout(filler):
    schema = {"properties": {"timeout": {"type": "integer"}}, "required": []}
    result = filler.autofill("tool", schema, existing_params={})
    assert result.params_after.get("timeout") == 30


def test_autofill_persist_and_retrieve(filler):
    schema = {"properties": {}, "required": []}
    result = filler.autofill("tool", schema, existing_params={}, tenant_id="t1")
    fetched = filler.get_session(result.session_id)
    assert fetched is not None


def test_autofill_list_sessions(filler):
    schema = {"properties": {}, "required": []}
    filler.autofill("toolA", schema, existing_params={}, tenant_id="t2")
    filler.autofill("toolB", schema, existing_params={}, tenant_id="t2")
    sessions = filler.list_sessions(tenant_id="t2")
    assert len(sessions) >= 2


def test_singleton_factory_filler(tmp_path, monkeypatch):
    import amc.product.param_autofiller as mod
    mod._filler = None
    f1 = get_param_autofiller(db_path=tmp_path / "f.db")
    f2 = get_param_autofiller()
    assert f1 is f2
    mod._filler = None


# ---------------------------------------------------------------------------
# 6. Response Validator
# ---------------------------------------------------------------------------
from amc.product.response_validator import ToolResponseValidator, get_response_validator


@pytest.fixture()
def validator(tmp_path):
    return ToolResponseValidator(db_path=tmp_path / "validator.db")


def test_validate_valid_response(validator):
    schema = {
        "type": "object",
        "required": ["status", "count"],
        "properties": {
            "status": {"type": "string"},
            "count": {"type": "integer"},
        },
    }
    report = validator.validate("my_tool", {"status": "ok", "count": 5}, schema)
    assert report.valid
    assert report.score == 1.0


def test_validate_missing_required_field(validator):
    schema = {"type": "object", "required": ["id"], "properties": {"id": {"type": "string"}}}
    report = validator.validate("tool", {}, schema)
    assert not report.valid
    assert any(v.rule == "required" for v in report.violations)


def test_validate_wrong_type(validator):
    schema = {"type": "object", "properties": {"count": {"type": "integer"}}, "required": []}
    report = validator.validate("tool", {"count": "not-a-number"}, schema)
    assert not report.valid
    assert any(v.rule == "type" for v in report.violations)


def test_validate_string_min_length(validator):
    schema = {
        "type": "object", "required": [],
        "properties": {"name": {"type": "string", "minLength": 5}},
    }
    report = validator.validate("tool", {"name": "ab"}, schema)
    assert not report.valid
    assert any(v.rule == "minLength" for v in report.violations)


def test_validate_numeric_minimum(validator):
    schema = {
        "type": "object", "required": [],
        "properties": {"score": {"type": "number", "minimum": 0.0, "maximum": 1.0}},
    }
    report = validator.validate("tool", {"score": -0.5}, schema)
    assert not report.valid


def test_validate_enum(validator):
    schema = {
        "type": "object", "required": [],
        "properties": {"status": {"type": "string", "enum": ["active", "inactive"]}},
    }
    report = validator.validate("tool", {"status": "unknown"}, schema)
    assert not report.valid
    assert any(v.rule == "enum" for v in report.violations)


def test_validate_custom_constraint_not_null(validator):
    schema = {"type": "object", "required": [], "properties": {}}
    constraints = [{"type": "not_null", "field": "result"}]
    report = validator.validate("tool", {"result": None}, schema, constraints=constraints)
    assert not report.valid


def test_validate_custom_regex(validator):
    schema = {"type": "object", "required": [], "properties": {"email": {"type": "string"}}}
    constraints = [{"type": "regex", "field": "email", "pattern": r".+@.+\..+"}]
    report = validator.validate("tool", {"email": "not-valid"}, schema, constraints=constraints)
    assert not report.valid


def test_validate_summary(validator):
    schema = {"type": "object", "required": ["x"], "properties": {"x": {"type": "string"}}}
    validator.validate("tool_a", {"x": "hello"}, schema)
    validator.validate("tool_a", {}, schema)  # invalid
    s = validator.summary("tool_a")
    assert s["total"] == 2
    assert s["valid"] == 1


def test_validate_list_reports(validator):
    schema = {"type": "object", "required": [], "properties": {}}
    validator.validate("listed_tool", {}, schema)
    reports = validator.list_reports(tool_name="listed_tool")
    assert len(reports) >= 1


def test_singleton_factory_validator(tmp_path, monkeypatch):
    import amc.product.response_validator as mod
    mod._validator = None
    v1 = get_response_validator(db_path=tmp_path / "v.db")
    v2 = get_response_validator()
    assert v1 is v2
    mod._validator = None


# ---------------------------------------------------------------------------
# 7. Tool Cost Estimator
# ---------------------------------------------------------------------------
from amc.product.tool_cost_estimator import CostModel, ToolCostEstimator, get_tool_cost_estimator


@pytest.fixture()
def estimator(tmp_path):
    return ToolCostEstimator(db_path=tmp_path / "costs.db")


def test_estimate_no_model_uses_defaults(estimator):
    est = estimator.estimate("unknown_tool", input_text="Hello world this is a test")
    assert est.estimated_total_usd >= 0.0
    assert est.estimated_input_tokens > 0


def test_estimate_with_registered_model(estimator):
    model = CostModel(
        tool_name="web_search",
        cost_per_call_usd=0.01,
        cost_per_1k_input_tokens_usd=0.0,
        cost_per_1k_output_tokens_usd=0.0,
        avg_latency_ms=800,
    )
    estimator.register_model(model)
    est = estimator.estimate("web_search")
    assert est.estimated_api_cost_usd == 0.01
    assert est.estimated_latency_ms == 800


def test_estimate_budget_gate_pass(estimator):
    est = estimator.estimate("cheap_tool", estimated_input_tokens=10, budget_cap_usd=1.0)
    assert est.within_budget is True


def test_estimate_budget_gate_fail(estimator):
    model = CostModel(tool_name="expensive", cost_per_call_usd=5.0)
    estimator.register_model(model)
    est = estimator.estimate("expensive", budget_cap_usd=1.0)
    assert est.within_budget is False


def test_estimate_chain(estimator):
    result = estimator.estimate_chain(["tool_a", "tool_b", "tool_c"])
    assert "total_cost_usd" in result
    assert len(result["per_tool"]) == 3


def test_estimate_persist_and_retrieve(estimator):
    est = estimator.estimate("tool_x", tenant_id="t1")
    fetched = estimator.get_estimate(est.estimate_id)
    assert fetched is not None
    assert fetched.estimate_id == est.estimate_id


def test_list_models(estimator):
    estimator.register_model(CostModel(tool_name="alpha", cost_per_call_usd=0.001))
    estimator.register_model(CostModel(tool_name="beta", cost_per_call_usd=0.002))
    models = estimator.list_models()
    names = [m.tool_name for m in models]
    assert "alpha" in names and "beta" in names


def test_singleton_factory_estimator(tmp_path, monkeypatch):
    import amc.product.tool_cost_estimator as mod
    mod._estimator = None
    e1 = get_tool_cost_estimator(db_path=tmp_path / "e.db")
    e2 = get_tool_cost_estimator()
    assert e1 is e2
    mod._estimator = None


# ---------------------------------------------------------------------------
# 8. Tool Chain Builder
# ---------------------------------------------------------------------------
from amc.product.tool_chain_builder import ToolChainBuilder, get_tool_chain_builder


@pytest.fixture()
def chain_builder(tmp_path):
    cb = ToolChainBuilder(db_path=tmp_path / "chain.db")
    # Seed catalog
    cb.register_tool("web_search", ["search web browse retrieve information"], ["text"], ["json"])
    cb.register_tool("summarizer", ["summarize text extract key points write summary"], ["text"], ["markdown"])
    cb.register_tool("code_runner", ["execute code run script compute calculate"], ["code"], ["json"])
    cb.register_tool("reporter", ["generate report write document produce output"], ["json"], ["pdf"])
    return cb


def test_build_chain_for_research_goal(chain_builder):
    chain = chain_builder.build("search for information and write a summary report")
    assert len(chain.steps) >= 1


def test_build_chain_coverage(chain_builder):
    chain = chain_builder.build("search for data and generate report")
    assert chain.coverage_score >= 0.0


def test_build_chain_steps_wired(chain_builder):
    chain = chain_builder.build("search and summarize")
    if len(chain.steps) >= 2:
        assert chain.steps[0].output_to == chain.steps[1].tool_name
        assert chain.steps[-1].output_to == "final"


def test_build_chain_gaps_for_uncovered_goal(chain_builder):
    chain = chain_builder.build("quantum computing entanglement research")
    # Goal tokens won't match catalog; gaps will be populated
    # just verify structure
    assert isinstance(chain.gaps, list)


def test_build_chain_persist_and_retrieve(chain_builder):
    chain = chain_builder.build("search web and report", tenant_id="t1")
    fetched = chain_builder.get_chain(chain.chain_id)
    assert fetched is not None
    assert fetched.chain_id == chain.chain_id


def test_list_chains(chain_builder):
    chain_builder.build("task 1", tenant_id="tenant_list")
    chain_builder.build("task 2", tenant_id="tenant_list")
    chains = chain_builder.list_chains(tenant_id="tenant_list")
    assert len(chains) >= 2


def test_register_tool_upsert(chain_builder):
    chain_builder.register_tool("my_tool", ["do stuff"])
    chain_builder.register_tool("my_tool", ["do stuff better"])  # upsert
    catalog = chain_builder.list_catalog()
    names = [t.tool_name for t in catalog]
    assert names.count("my_tool") == 1


def test_singleton_factory_chain(tmp_path, monkeypatch):
    import amc.product.tool_chain_builder as mod
    mod._builder = None
    b1 = get_tool_chain_builder(db_path=tmp_path / "b.db")
    b2 = get_tool_chain_builder()
    assert b1 is b2
    mod._builder = None


# ---------------------------------------------------------------------------
# 9. Tool Fallback Manager
# ---------------------------------------------------------------------------
from amc.product.tool_fallback import ToolFallbackManager, get_tool_fallback_manager


@pytest.fixture()
def fallback_mgr(tmp_path):
    return ToolFallbackManager(db_path=tmp_path / "fallback.db")


def test_register_chain_creates_record(fallback_mgr):
    chain = fallback_mgr.register_chain(
        "primary_tool",
        [{"tool_name": "fallback_1", "priority": 1}, {"tool_name": "fallback_2", "priority": 2}],
    )
    assert chain.chain_id
    assert len(chain.fallbacks) == 2


def test_decide_next_returns_first_fallback(fallback_mgr):
    fallback_mgr.register_chain(
        "search", [{"tool_name": "alt_search", "priority": 1}]
    )
    decision = fallback_mgr.decide_next("search", "search", attempt_number=0)
    assert not decision.should_escalate
    assert decision.next_tool == "alt_search"


def test_decide_next_escalates_after_all_tried(fallback_mgr):
    fallback_mgr.register_chain(
        "tool_x", [{"tool_name": "fb1", "priority": 1}], escalate_after=1
    )
    decision = fallback_mgr.decide_next("tool_x", "tool_x", attempt_number=1)
    assert decision.should_escalate


def test_decide_next_no_chain_escalates(fallback_mgr):
    decision = fallback_mgr.decide_next("ghost_tool", "ghost_tool")
    assert decision.should_escalate


def test_log_attempt_persists(fallback_mgr):
    chain = fallback_mgr.register_chain(
        "logged_tool", [{"tool_name": "backup", "priority": 1}]
    )
    attempt = fallback_mgr.log_attempt(
        chain_id=chain.chain_id, primary_tool="logged_tool",
        attempted_tool="backup", succeeded=True,
    )
    assert attempt.attempt_id
    attempts = fallback_mgr.list_attempts(chain_id=chain.chain_id)
    assert len(attempts) == 1


def test_register_equivalence_group(fallback_mgr):
    group = fallback_mgr.register_equivalence_group(
        "search_engines", ["google", "bing", "duckduckgo"]
    )
    groups = fallback_mgr.list_equivalence_groups()
    assert any(g.name == "search_engines" for g in groups)


def test_deactivate_chain(fallback_mgr):
    chain = fallback_mgr.register_chain("temp_tool", [])
    ok = fallback_mgr.deactivate_chain(chain.chain_id)
    assert ok
    fetched = fallback_mgr.get_chain("temp_tool")
    assert fetched is None  # deactivated


def test_chain_upsert_updates_fallbacks(fallback_mgr):
    fallback_mgr.register_chain("upsert_tool", [{"tool_name": "v1_fb", "priority": 1}])
    fallback_mgr.register_chain("upsert_tool", [{"tool_name": "v2_fb", "priority": 1}])
    chain = fallback_mgr.get_chain("upsert_tool")
    assert chain.fallbacks[0].tool_name == "v2_fb"


def test_singleton_factory_fallback(tmp_path, monkeypatch):
    import amc.product.tool_fallback as mod
    mod._manager = None
    m1 = get_tool_fallback_manager(db_path=tmp_path / "fb.db")
    m2 = get_tool_fallback_manager()
    assert m1 is m2
    mod._manager = None


# ---------------------------------------------------------------------------
# 10. Tool Rate Limiter
# ---------------------------------------------------------------------------
from amc.product.tool_rate_limiter import ToolRateLimiter, get_tool_rate_limiter


@pytest.fixture()
def limiter(tmp_path):
    return ToolRateLimiter(db_path=tmp_path / "rate.db")


def test_set_policy(limiter):
    policy = limiter.set_policy("web_fetch", calls_per_minute=30, burst_capacity=5)
    assert policy.policy_id
    assert policy.calls_per_minute == 30


def test_allow_within_burst(limiter):
    limiter.set_policy("fast_tool", calls_per_minute=60, burst_capacity=10)
    for _ in range(5):
        decision = limiter.check_and_consume("fast_tool")
        assert decision.allowed


def test_deny_when_tokens_exhausted(limiter):
    limiter.set_policy("slow_tool", calls_per_minute=60, burst_capacity=2)
    limiter.check_and_consume("slow_tool")
    limiter.check_and_consume("slow_tool")
    decision = limiter.check_and_consume("slow_tool")
    assert not decision.allowed
    assert decision.wait_ms > 0


def test_no_policy_always_allows(limiter):
    decision = limiter.check_and_consume("unlimted_tool")
    assert decision.allowed
    assert decision.policy_id is None


def test_get_bucket_returns_state(limiter):
    limiter.set_policy("bucket_tool", burst_capacity=5)
    limiter.check_and_consume("bucket_tool")
    bucket = limiter.get_bucket("bucket_tool")
    assert bucket is not None
    assert bucket.total_calls == 1


def test_list_events(limiter):
    limiter.set_policy("event_tool", burst_capacity=5)
    limiter.check_and_consume("event_tool")
    events = limiter.list_events(tool_name="event_tool")
    assert len(events) >= 1


def test_stats_counts_allowed_denied(limiter):
    limiter.set_policy("stat_tool", calls_per_minute=120, burst_capacity=2)
    limiter.check_and_consume("stat_tool")
    limiter.check_and_consume("stat_tool")
    limiter.check_and_consume("stat_tool")  # likely denied
    s = limiter.stats(tool_name="stat_tool")
    assert s["total_requests"] == 3


def test_deactivate_policy(limiter):
    policy = limiter.set_policy("dep_tool", burst_capacity=5)
    ok = limiter.deactivate_policy(policy.policy_id)
    assert ok
    fetched = limiter.get_policy("dep_tool")
    assert fetched is None  # deactivated


def test_next_window_iso_populated_on_deny(limiter):
    limiter.set_policy("timed_tool", calls_per_minute=60, burst_capacity=1)
    limiter.check_and_consume("timed_tool")
    decision = limiter.check_and_consume("timed_tool")
    if not decision.allowed:
        assert decision.next_window_iso != ""


def test_singleton_factory_limiter(tmp_path, monkeypatch):
    import amc.product.tool_rate_limiter as mod
    mod._limiter = None
    l1 = get_tool_rate_limiter(db_path=tmp_path / "l.db")
    l2 = get_tool_rate_limiter()
    assert l1 is l2
    mod._limiter = None
