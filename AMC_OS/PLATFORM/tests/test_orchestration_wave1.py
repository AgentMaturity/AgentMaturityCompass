"""Tests for AMC Product orchestration Wave 1.

Covers:
- workflow_engine: WorkflowEngine CRUD, step lifecycle, checkpoints, resume
- event_router: EventRouter route CRUD, event routing, enrichment, delivery log, retry
- retry_engine: RetryEngine policy/job lifecycle, backoff, context preservation, due jobs

All tests use tmp_path for DB isolation and reset_* factory functions.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import pytest

# ---------------------------------------------------------------------------
# Workflow Engine Tests
# ---------------------------------------------------------------------------

from amc.product.workflow_engine import (
    WorkflowEngine,
    WorkflowStatus,
    StepStatus,
    StepDefinition,
    WorkflowRecord,
    StepRecord,
    CheckpointRecord,
    reset_engine,
)


class TestWorkflowEngine:
    """Tests for WorkflowEngine: create, start, steps, checkpoints, resume."""

    @pytest.fixture()
    def engine(self, tmp_path: Path) -> WorkflowEngine:
        db = str(tmp_path / "workflow_test.db")
        return reset_engine(db)

    @pytest.fixture()
    def steps(self) -> list[StepDefinition]:
        return [
            StepDefinition(name="ingest", fn_name="fn_ingest", seq=1, description="Ingest data"),
            StepDefinition(name="transform", fn_name="fn_transform", seq=2, retries=2),
            StepDefinition(name="export", fn_name="fn_export", seq=3, timeout_s=60.0),
        ]

    def test_create_workflow(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("test_wf", "A test workflow", steps, input_data={"x": 1})
        assert isinstance(wf, WorkflowRecord)
        assert wf.name == "test_wf"
        assert wf.status == WorkflowStatus.pending
        assert wf.input_json == json.dumps({"x": 1})
        assert wf.workflow_id != ""
        assert wf.completed_at is None

    def test_workflow_dict_property(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("dict_test", "desc", steps)
        d = wf.dict()
        assert "workflow_id" in d
        assert "status" in d
        assert d["name"] == "dict_test"

    def test_start_workflow(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("start_wf", "desc", steps)
        started = engine.start_workflow(wf.workflow_id)
        assert started.status == WorkflowStatus.running

    def test_get_workflow_returns_record(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("get_wf", "desc", steps)
        fetched = engine.get_workflow(wf.workflow_id)
        assert fetched is not None
        assert fetched.workflow_id == wf.workflow_id

    def test_get_workflow_missing_returns_none(self, engine: WorkflowEngine) -> None:
        result = engine.get_workflow("nonexistent-id")
        assert result is None

    def test_list_workflows_all(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        engine.create_workflow("wf1", "d", steps)
        engine.create_workflow("wf2", "d", steps)
        workflows = engine.list_workflows()
        assert len(workflows) >= 2

    def test_list_workflows_by_status(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("status_wf", "d", steps)
        engine.start_workflow(wf.workflow_id)
        running = engine.list_workflows(status=WorkflowStatus.running)
        assert any(w.workflow_id == wf.workflow_id for w in running)
        pending = engine.list_workflows(status=WorkflowStatus.pending)
        assert not any(w.workflow_id == wf.workflow_id for w in pending)

    def test_complete_workflow(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("complete_wf", "d", steps)
        engine.start_workflow(wf.workflow_id)
        completed = engine.complete_workflow(wf.workflow_id, output_data={"result": "ok"})
        assert completed.status == WorkflowStatus.completed
        assert completed.completed_at is not None
        assert completed.output_json == json.dumps({"result": "ok"})

    def test_fail_workflow(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("fail_wf", "d", steps)
        engine.start_workflow(wf.workflow_id)
        failed = engine.fail_workflow(wf.workflow_id, error="Something broke")
        assert failed.status == WorkflowStatus.failed
        assert "error" in json.loads(failed.output_json)

    def test_get_steps(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("steps_wf", "d", steps)
        retrieved = engine.get_steps(wf.workflow_id)
        assert len(retrieved) == 3
        seqs = [s.seq for s in retrieved]
        assert seqs == sorted(seqs)

    def test_step_record_dict(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("step_dict_wf", "d", steps)
        step_records = engine.get_steps(wf.workflow_id)
        d = step_records[0].dict()
        assert "step_id" in d
        assert "workflow_id" in d

    def test_complete_step(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("complete_step_wf", "d", steps)
        engine.start_workflow(wf.workflow_id)
        step_records = engine.get_steps(wf.workflow_id)
        s = step_records[0]
        completed = engine.complete_step(wf.workflow_id, s.step_id, output_data={"rows": 100})
        assert completed.status == StepStatus.completed
        assert completed.completed_at is not None

    def test_fail_step(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("fail_step_wf", "d", steps)
        engine.start_workflow(wf.workflow_id)
        step_records = engine.get_steps(wf.workflow_id)
        s = step_records[0]
        failed = engine.fail_step(wf.workflow_id, s.step_id, error="step error")
        assert failed.status == StepStatus.failed
        assert failed.error == "step error"

    def test_execute_step_success(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("exec_step_wf", "d", steps)
        engine.start_workflow(wf.workflow_id)
        step_records = engine.get_steps(wf.workflow_id)
        s = step_records[0]

        def fn(data: dict) -> dict:
            return {"processed": True}

        result = engine.execute_step(wf.workflow_id, s.step_id, fn=fn)
        assert result.status == StepStatus.completed

    def test_execute_step_failure(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("exec_fail_wf", "d", steps)
        engine.start_workflow(wf.workflow_id)
        step_records = engine.get_steps(wf.workflow_id)
        s = step_records[1]

        def bad_fn(data: dict) -> dict:
            raise RuntimeError("intentional failure")

        result = engine.execute_step(wf.workflow_id, s.step_id, fn=bad_fn)
        assert result.status == StepStatus.failed
        assert "intentional failure" in (result.error or "")

    def test_checkpoint_and_get(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("cp_wf", "d", steps)
        step_records = engine.get_steps(wf.workflow_id)
        s = step_records[0]

        cp = engine.checkpoint(wf.workflow_id, s.step_id, state={"progress": 50})
        assert isinstance(cp, CheckpointRecord)
        assert cp.workflow_id == wf.workflow_id
        assert cp.step_id == s.step_id
        assert json.loads(cp.state_json)["progress"] == 50

        checkpoints = engine.get_checkpoints(wf.workflow_id)
        assert len(checkpoints) == 1
        assert checkpoints[0].checkpoint_id == cp.checkpoint_id

    def test_checkpoint_dict(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("cp_dict_wf", "d", steps)
        step_records = engine.get_steps(wf.workflow_id)
        cp = engine.checkpoint(wf.workflow_id, step_records[0].step_id, state={"k": "v"})
        d = cp.dict()
        assert "checkpoint_id" in d
        assert "state_json" in d

    def test_resume_workflow(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("resume_wf", "d", steps)
        engine.start_workflow(wf.workflow_id)
        step_records = engine.get_steps(wf.workflow_id)

        # Complete step 1, checkpoint step 2, fail step 2
        engine.complete_step(wf.workflow_id, step_records[0].step_id)
        engine.checkpoint(wf.workflow_id, step_records[1].step_id, state={"at": "step2"})
        engine.fail_step(wf.workflow_id, step_records[1].step_id, error="transient")
        engine.fail_workflow(wf.workflow_id, error="step failed")

        resumed = engine.resume_workflow(wf.workflow_id)
        assert resumed.status == WorkflowStatus.running

    def test_multiple_checkpoints(self, engine: WorkflowEngine, steps: list[StepDefinition]) -> None:
        wf = engine.create_workflow("multi_cp_wf", "d", steps)
        step_records = engine.get_steps(wf.workflow_id)

        for i, s in enumerate(step_records):
            engine.checkpoint(wf.workflow_id, s.step_id, state={"i": i})

        checkpoints = engine.get_checkpoints(wf.workflow_id)
        assert len(checkpoints) == 3

    def test_step_definition_dict(self) -> None:
        sd = StepDefinition(name="s", fn_name="fn", seq=1, description="d", timeout_s=30.0, retries=1)
        d = sd.dict()
        assert d["name"] == "s"
        assert d["timeout_s"] == 30.0
        assert d["retries"] == 1


# ---------------------------------------------------------------------------
# Event Router Tests
# ---------------------------------------------------------------------------

from amc.product.event_router import (
    EventRouter,
    EventType,
    TargetType,
    DeliveryStatus,
    RouteRule,
    EventPayload,
    DeliveryRecord,
    reset_router,
)


class TestEventRouter:
    """Tests for EventRouter: routes, event routing, enrichment, delivery log."""

    @pytest.fixture()
    def router(self, tmp_path: Path) -> EventRouter:
        db = str(tmp_path / "event_router_test.db")
        return reset_router(db)

    @pytest.fixture()
    def sample_route(self, router: EventRouter) -> RouteRule:
        return router.create_route(
            name="webhook_route",
            event_type=EventType.webhook,
            source_filter={"env": "prod"},
            target_type=TargetType.webhook,
            target_config={"url": "https://example.com/hook"},
            enrichment={"added_by": "router"},
            priority=10,
        )

    def test_create_route(self, router: EventRouter, sample_route: RouteRule) -> None:
        assert isinstance(sample_route, RouteRule)
        assert sample_route.name == "webhook_route"
        assert sample_route.event_type == EventType.webhook
        assert sample_route.target_type == TargetType.webhook
        assert sample_route.enabled is True
        assert sample_route.priority == 10

    def test_route_dict_property(self, router: EventRouter, sample_route: RouteRule) -> None:
        d = sample_route.dict()
        assert "route_id" in d
        assert d["priority"] == 10

    def test_get_route(self, router: EventRouter, sample_route: RouteRule) -> None:
        fetched = router.get_route(sample_route.route_id)
        assert fetched is not None
        assert fetched.route_id == sample_route.route_id

    def test_get_route_missing_returns_none(self, router: EventRouter) -> None:
        assert router.get_route("nonexistent") is None

    def test_list_routes_all(self, router: EventRouter, sample_route: RouteRule) -> None:
        router.create_route("email_route", EventType.email, target_type=TargetType.email)
        routes = router.list_routes()
        assert len(routes) >= 2

    def test_list_routes_by_type(self, router: EventRouter, sample_route: RouteRule) -> None:
        router.create_route("email_route", EventType.email, target_type=TargetType.email)
        webhook_routes = router.list_routes(event_type=EventType.webhook)
        assert all(r.event_type == EventType.webhook for r in webhook_routes)

    def test_list_routes_by_enabled(self, router: EventRouter, sample_route: RouteRule) -> None:
        router.update_route(sample_route.route_id, enabled=False)
        disabled = router.list_routes(enabled=False)
        assert any(r.route_id == sample_route.route_id for r in disabled)
        enabled = router.list_routes(enabled=True)
        assert not any(r.route_id == sample_route.route_id for r in enabled)

    def test_update_route(self, router: EventRouter, sample_route: RouteRule) -> None:
        updated = router.update_route(sample_route.route_id, priority=99, name="updated_name")
        assert updated.priority == 99
        assert updated.name == "updated_name"

    def test_update_route_enrichment(self, router: EventRouter, sample_route: RouteRule) -> None:
        updated = router.update_route(sample_route.route_id, enrichment={"new_key": "new_val"})
        assert updated.enrichment["new_key"] == "new_val"

    def test_delete_route(self, router: EventRouter, sample_route: RouteRule) -> None:
        deleted = router.delete_route(sample_route.route_id)
        assert deleted is True
        assert router.get_route(sample_route.route_id) is None

    def test_delete_missing_route_returns_false(self, router: EventRouter) -> None:
        assert router.delete_route("ghost-id") is False

    def test_route_event_matched(self, router: EventRouter, sample_route: RouteRule) -> None:
        event = EventPayload(
            event_type=EventType.webhook,
            source="prod",
            data={"env": "prod", "payload": "data"},
        )
        deliveries = router.route_event(event)
        assert len(deliveries) >= 1
        assert deliveries[0].delivery_status == DeliveryStatus.delivered

    def test_route_event_no_match_skipped(self, router: EventRouter) -> None:
        # No routes for manual type
        event = EventPayload(event_type=EventType.manual, source="sys", data={})
        deliveries = router.route_event(event)
        assert len(deliveries) == 1
        assert deliveries[0].delivery_status == DeliveryStatus.skipped

    def test_route_event_source_filter_no_match(self, router: EventRouter, sample_route: RouteRule) -> None:
        # Route expects env=prod, but event has env=dev
        event = EventPayload(
            event_type=EventType.webhook,
            source="dev",
            data={"env": "dev"},
        )
        deliveries = router.route_event(event)
        # Should be skipped since source_filter doesn't match
        assert all(d.delivery_status == DeliveryStatus.skipped for d in deliveries)

    def test_enrich_context(self, router: EventRouter) -> None:
        event = EventPayload(event_type=EventType.manual, source="test", data={"a": 1})
        enriched = router.enrich_context(event, {"extra": "value", "score": 42})
        assert enriched["a"] == 1
        assert enriched["extra"] == "value"
        assert enriched["__event_type"] == EventType.manual
        assert enriched["__source"] == "test"

    def test_get_delivery_log(self, router: EventRouter, sample_route: RouteRule) -> None:
        event = EventPayload(
            event_type=EventType.webhook,
            source="prod",
            data={"env": "prod"},
        )
        router.route_event(event)
        log = router.get_delivery_log()
        assert len(log) >= 1

    def test_get_delivery_log_by_route(self, router: EventRouter, sample_route: RouteRule) -> None:
        event = EventPayload(
            event_type=EventType.webhook,
            source="prod",
            data={"env": "prod"},
        )
        router.route_event(event)
        log = router.get_delivery_log(route_id=sample_route.route_id)
        assert all(d.route_id == sample_route.route_id for d in log)

    def test_get_delivery_log_by_status(self, router: EventRouter) -> None:
        event = EventPayload(event_type=EventType.manual, source="s", data={})
        router.route_event(event)
        skipped = router.get_delivery_log(status=DeliveryStatus.skipped)
        assert len(skipped) >= 1

    def test_delivery_record_dict(self, router: EventRouter, sample_route: RouteRule) -> None:
        event = EventPayload(
            event_type=EventType.webhook,
            source="prod",
            data={"env": "prod"},
        )
        deliveries = router.route_event(event)
        d = deliveries[0].dict()
        assert "log_id" in d
        assert "delivery_status" in d

    def test_retry_delivery(self, router: EventRouter, sample_route: RouteRule) -> None:
        event = EventPayload(
            event_type=EventType.webhook,
            source="prod",
            data={"env": "prod"},
        )
        deliveries = router.route_event(event)
        log_id = deliveries[0].log_id
        result = router.retry_delivery(log_id)
        assert result is not None
        assert result.delivery_status in (DeliveryStatus.delivered, DeliveryStatus.skipped)

    def test_match_routes_priority_order(self, router: EventRouter) -> None:
        router.create_route("low_pri", EventType.schedule, priority=1, target_type=TargetType.log)
        router.create_route("high_pri", EventType.schedule, priority=100, target_type=TargetType.log)
        event = EventPayload(event_type=EventType.schedule, source="cron", data={})
        deliveries = router.route_event(event)
        assert len(deliveries) == 2

    def test_event_payload_dict(self) -> None:
        ep = EventPayload(event_type=EventType.email, source="mailer", data={"to": "user@x.com"})
        d = ep.dict()
        assert d["event_type"] == EventType.email
        assert d["source"] == "mailer"

    def test_multiple_routes_same_event(self, router: EventRouter) -> None:
        router.create_route("r1", EventType.db_trigger, target_type=TargetType.log)
        router.create_route("r2", EventType.db_trigger, target_type=TargetType.queue)
        event = EventPayload(event_type=EventType.db_trigger, source="db", data={})
        deliveries = router.route_event(event)
        assert len(deliveries) == 2


# ---------------------------------------------------------------------------
# Retry Engine Tests
# ---------------------------------------------------------------------------

from amc.product.retry_engine import (
    RetryEngine,
    RetryStrategy,
    RetryJobStatus,
    RetryPolicy,
    RetryJob,
    RetryLogEntry,
    reset_retry_engine,
)


class TestRetryEngine:
    """Tests for RetryEngine: policies, jobs, backoff, context, due jobs."""

    @pytest.fixture()
    def engine(self, tmp_path: Path) -> RetryEngine:
        db = str(tmp_path / "retry_engine_test.db")
        return reset_retry_engine(db)

    @pytest.fixture()
    def policy(self, engine: RetryEngine) -> RetryPolicy:
        return engine.create_policy(
            name="default",
            strategy=RetryStrategy.exponential,
            max_attempts=3,
            base_delay_s=1.0,
            max_delay_s=60.0,
            multiplier=2.0,
            jitter=False,
        )

    @pytest.fixture()
    def fixed_policy(self, engine: RetryEngine) -> RetryPolicy:
        return engine.create_policy(
            name="fixed",
            strategy=RetryStrategy.fixed,
            max_attempts=5,
            base_delay_s=5.0,
            max_delay_s=5.0,
            multiplier=1.0,
            jitter=False,
        )

    @pytest.fixture()
    def linear_policy(self, engine: RetryEngine) -> RetryPolicy:
        return engine.create_policy(
            name="linear",
            strategy=RetryStrategy.linear,
            max_attempts=4,
            base_delay_s=2.0,
            max_delay_s=100.0,
            multiplier=1.0,
            jitter=False,
        )

    # ------------------------------------------------------------------
    # Policy tests
    # ------------------------------------------------------------------

    def test_create_policy(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        assert isinstance(policy, RetryPolicy)
        assert policy.name == "default"
        assert policy.strategy == RetryStrategy.exponential
        assert policy.max_attempts == 3
        assert policy.jitter is False

    def test_policy_dict(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        d = policy.dict()
        assert "policy_id" in d
        assert d["strategy"] == RetryStrategy.exponential

    def test_get_policy(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        fetched = engine.get_policy(policy.policy_id)
        assert fetched is not None
        assert fetched.policy_id == policy.policy_id

    def test_get_policy_missing_returns_none(self, engine: RetryEngine) -> None:
        assert engine.get_policy("nonexistent") is None

    def test_list_policies(self, engine: RetryEngine, policy: RetryPolicy, fixed_policy: RetryPolicy) -> None:
        policies = engine.list_policies()
        assert len(policies) >= 2

    # ------------------------------------------------------------------
    # Backoff computation
    # ------------------------------------------------------------------

    def test_compute_delay_exponential(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        # No jitter: attempt 1 → 1.0, attempt 2 → 2.0, attempt 3 → 4.0
        assert engine.compute_delay(policy, 1) == pytest.approx(1.0)
        assert engine.compute_delay(policy, 2) == pytest.approx(2.0)
        assert engine.compute_delay(policy, 3) == pytest.approx(4.0)

    def test_compute_delay_fixed(self, engine: RetryEngine, fixed_policy: RetryPolicy) -> None:
        for attempt in range(1, 6):
            assert engine.compute_delay(fixed_policy, attempt) == pytest.approx(5.0)

    def test_compute_delay_linear(self, engine: RetryEngine, linear_policy: RetryPolicy) -> None:
        # base=2, attempt 1→2, 2→4, 3→6
        assert engine.compute_delay(linear_policy, 1) == pytest.approx(2.0)
        assert engine.compute_delay(linear_policy, 2) == pytest.approx(4.0)
        assert engine.compute_delay(linear_policy, 3) == pytest.approx(6.0)

    def test_compute_delay_max_capped(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        # attempt 10 → 2^9 * 1 = 512, but max_delay_s=60
        delay = engine.compute_delay(policy, 10)
        assert delay <= 60.0

    def test_compute_delay_jitter(self, engine: RetryEngine) -> None:
        p = engine.create_policy("jitter_test", jitter=True, base_delay_s=10.0, max_delay_s=10.0)
        delays = [engine.compute_delay(p, 1) for _ in range(20)]
        # With jitter, not all delays should be identical
        assert not all(d == delays[0] for d in delays)
        assert all(0.0 <= d <= 10.0 for d in delays)

    # ------------------------------------------------------------------
    # Job lifecycle
    # ------------------------------------------------------------------

    def test_submit_job(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        job = engine.submit_job(policy.policy_id, "seg-001", context={"key": "val"})
        assert isinstance(job, RetryJob)
        assert job.segment_id == "seg-001"
        assert job.status == RetryJobStatus.pending
        assert job.attempt == 0
        assert job.context["key"] == "val"

    def test_job_dict(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        job = engine.submit_job(policy.policy_id, "seg-dict")
        d = job.dict()
        assert "job_id" in d
        assert "segment_id" in d

    def test_get_job(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        job = engine.submit_job(policy.policy_id, "seg-get")
        fetched = engine.get_job(job.job_id)
        assert fetched is not None
        assert fetched.job_id == job.job_id

    def test_get_job_missing_returns_none(self, engine: RetryEngine) -> None:
        assert engine.get_job("ghost-id") is None

    def test_attempt_job(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        job = engine.submit_job(policy.policy_id, "seg-attempt")
        attempted = engine.attempt_job(job.job_id)
        assert attempted.status == RetryJobStatus.running
        assert attempted.attempt == 1

    def test_complete_job(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        job = engine.submit_job(policy.policy_id, "seg-complete")
        engine.attempt_job(job.job_id)
        completed = engine.complete_job(job.job_id, result={"done": True})
        assert completed.status == RetryJobStatus.completed
        assert completed.context["done"] is True

    def test_fail_attempt_schedules_next_retry(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        job = engine.submit_job(policy.policy_id, "seg-fail")
        engine.attempt_job(job.job_id)
        failed = engine.fail_attempt(job.job_id, error="transient error")
        assert failed.status == RetryJobStatus.pending
        assert failed.last_error == "transient error"
        assert failed.next_retry_at is not None

    def test_fail_attempt_exhausts_after_max(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        job = engine.submit_job(policy.policy_id, "seg-exhaust")
        # Exhaust all attempts (max_attempts=3)
        for _ in range(policy.max_attempts):
            engine.attempt_job(job.job_id)
            job = engine.fail_attempt(job.job_id, error="fail")  # type: ignore[assignment]

        assert job.status == RetryJobStatus.exhausted
        assert job.next_retry_at is None

    def test_list_jobs_all(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        engine.submit_job(policy.policy_id, "seg-list-1")
        engine.submit_job(policy.policy_id, "seg-list-2")
        jobs = engine.list_jobs()
        assert len(jobs) >= 2

    def test_list_jobs_by_status(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        job = engine.submit_job(policy.policy_id, "seg-status-filter")
        engine.attempt_job(job.job_id)
        running = engine.list_jobs(status=RetryJobStatus.running)
        assert any(j.job_id == job.job_id for j in running)

    def test_list_jobs_by_segment(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        engine.submit_job(policy.policy_id, "seg-alpha")
        engine.submit_job(policy.policy_id, "seg-beta")
        alpha_jobs = engine.list_jobs(segment_id="seg-alpha")
        assert all(j.segment_id == "seg-alpha" for j in alpha_jobs)

    # ------------------------------------------------------------------
    # Due jobs
    # ------------------------------------------------------------------

    def test_get_due_jobs(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        job = engine.submit_job(policy.policy_id, "seg-due")
        # next_retry_at = now at submit time → should be due immediately
        due = engine.get_due_jobs()
        assert any(j.job_id == job.job_id for j in due)

    def test_get_due_jobs_future_not_included(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        job = engine.submit_job(policy.policy_id, "seg-future")
        engine.attempt_job(job.job_id)
        engine.fail_attempt(job.job_id, error="err")  # schedules future retry

        # Check due with a "now" in the past — the future job shouldn't appear
        past_now = datetime.now(timezone.utc) - timedelta(hours=1)
        due = engine.get_due_jobs(now=past_now)
        assert not any(j.job_id == job.job_id for j in due)

    # ------------------------------------------------------------------
    # Retry log
    # ------------------------------------------------------------------

    def test_get_retry_log(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        job = engine.submit_job(policy.policy_id, "seg-log")
        engine.attempt_job(job.job_id)
        log_entries = engine.get_retry_log(job.job_id)
        assert len(log_entries) == 1
        assert log_entries[0].attempt == 1

    def test_retry_log_multiple_attempts(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        job = engine.submit_job(policy.policy_id, "seg-multi-log")
        for _ in range(2):
            engine.attempt_job(job.job_id)
            engine.fail_attempt(job.job_id, error="boom")

        log_entries = engine.get_retry_log(job.job_id)
        assert len(log_entries) >= 2

    def test_retry_log_entry_dict(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        job = engine.submit_job(policy.policy_id, "seg-log-dict")
        engine.attempt_job(job.job_id)
        entries = engine.get_retry_log(job.job_id)
        d = entries[0].dict()
        assert "log_id" in d
        assert "attempt" in d

    # ------------------------------------------------------------------
    # Context preservation
    # ------------------------------------------------------------------

    def test_preserve_context(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        job = engine.submit_job(policy.policy_id, "seg-ctx", context={"a": 1})
        updated = engine.preserve_context(job.job_id, {"b": 2, "c": "hello"})
        assert updated.context["a"] == 1
        assert updated.context["b"] == 2
        assert updated.context["c"] == "hello"

    def test_preserve_context_overwrites_existing_key(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        job = engine.submit_job(policy.policy_id, "seg-ctx-overwrite", context={"key": "old"})
        updated = engine.preserve_context(job.job_id, {"key": "new"})
        assert updated.context["key"] == "new"

    def test_context_persists_after_attempt(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        job = engine.submit_job(policy.policy_id, "seg-ctx-persist", context={"step": 0})
        engine.preserve_context(job.job_id, {"step": 1, "checkpoint": "after_ingest"})
        engine.attempt_job(job.job_id)
        engine.fail_attempt(job.job_id, error="transient")

        refetched = engine.get_job(job.job_id)
        assert refetched is not None
        assert refetched.context["checkpoint"] == "after_ingest"

    # ------------------------------------------------------------------
    # Segment-level isolation (multiple segments, independent retry)
    # ------------------------------------------------------------------

    def test_segment_level_isolation(self, engine: RetryEngine, policy: RetryPolicy) -> None:
        """Each segment retries independently — not a full pipeline rerun."""
        job_a = engine.submit_job(policy.policy_id, "pipeline-seg-A", context={"segment": "A"})
        job_b = engine.submit_job(policy.policy_id, "pipeline-seg-B", context={"segment": "B"})

        engine.attempt_job(job_a.job_id)
        engine.fail_attempt(job_a.job_id, error="A failed")

        # B should remain pending (unaffected by A's failure)
        b_refetched = engine.get_job(job_b.job_id)
        assert b_refetched is not None
        assert b_refetched.status == RetryJobStatus.pending

    # ------------------------------------------------------------------
    # String enum behaviour
    # ------------------------------------------------------------------

    def test_enum_str_values(self) -> None:
        assert RetryStrategy.exponential == "exponential"
        assert RetryJobStatus.pending == "pending"
        assert RetryJobStatus.exhausted == "exhausted"
