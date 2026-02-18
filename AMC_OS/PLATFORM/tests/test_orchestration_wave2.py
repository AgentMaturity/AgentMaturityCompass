"""Tests for Wave 2 Orchestration modules:
- compensation.py  (Module 4)
- rate_limiter.py  (Module 5)
- sync_connector.py (Module 6)

Class-based, tmp_path fixtures, covers all major CRUD + core logic.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# compensation.py tests
# ---------------------------------------------------------------------------
from amc.product.compensation import (
    CompensationEngine,
    CompensationStatus,
    StepStatus,
)


class TestCompensationEngine:
    @pytest.fixture()
    def engine(self, tmp_path: Path) -> CompensationEngine:
        return CompensationEngine(db_path=tmp_path / "comp.db")

    # ------------------------------------------------------------------
    # Plan CRUD
    # ------------------------------------------------------------------

    def test_create_plan_basic(self, engine: CompensationEngine) -> None:
        plan = engine.create_plan(name="saga-1", description="Test saga")
        assert plan.plan_id
        assert plan.name == "saga-1"
        assert plan.description == "Test saga"
        assert plan.status == CompensationStatus.PENDING
        assert plan.metadata == {}

    def test_create_plan_with_metadata(self, engine: CompensationEngine) -> None:
        plan = engine.create_plan("saga-meta", metadata={"env": "test", "version": 2})
        assert plan.metadata["env"] == "test"
        assert plan.metadata["version"] == 2

    def test_get_plan_returns_none_for_missing(self, engine: CompensationEngine) -> None:
        assert engine.get_plan("nonexistent-id") is None

    def test_get_plan_round_trip(self, engine: CompensationEngine) -> None:
        created = engine.create_plan("saga-rt")
        fetched = engine.get_plan(created.plan_id)
        assert fetched is not None
        assert fetched.plan_id == created.plan_id
        assert fetched.name == "saga-rt"

    def test_list_plans_empty(self, engine: CompensationEngine) -> None:
        assert engine.list_plans() == []

    def test_list_plans_with_status_filter(self, engine: CompensationEngine) -> None:
        p1 = engine.create_plan("plan-a")
        engine.create_plan("plan-b")
        engine.complete_plan(p1.plan_id)
        completed = engine.list_plans(status=CompensationStatus.COMPLETED)
        assert len(completed) == 1
        assert completed[0].plan_id == p1.plan_id
        pending = engine.list_plans(status=CompensationStatus.PENDING)
        assert len(pending) == 1

    def test_complete_plan(self, engine: CompensationEngine) -> None:
        plan = engine.create_plan("saga-complete")
        completed = engine.complete_plan(plan.plan_id)
        assert completed.status == CompensationStatus.COMPLETED

    def test_fail_plan(self, engine: CompensationEngine) -> None:
        plan = engine.create_plan("saga-fail")
        failed = engine.fail_plan(plan.plan_id, error="something went wrong")
        assert failed.status == CompensationStatus.FAILED

    def test_plan_dict_property(self, engine: CompensationEngine) -> None:
        plan = engine.create_plan("saga-dict")
        d = plan.dict
        assert d["plan_id"] == plan.plan_id
        assert d["name"] == "saga-dict"
        assert "status" in d
        assert "created_at" in d

    # ------------------------------------------------------------------
    # Step management
    # ------------------------------------------------------------------

    def test_register_step(self, engine: CompensationEngine) -> None:
        plan = engine.create_plan("saga-steps")
        step = engine.register_step(
            plan_id=plan.plan_id,
            name="charge-card",
            seq=1,
            action_fn="payments.charge",
            compensate_fn="payments.refund",
            input_data={"amount": 100, "currency": "USD"},
        )
        assert step.step_id
        assert step.plan_id == plan.plan_id
        assert step.name == "charge-card"
        assert step.seq == 1
        assert step.status == StepStatus.PENDING
        assert step.input_data["amount"] == 100

    def test_execute_step(self, engine: CompensationEngine) -> None:
        plan = engine.create_plan("saga-exec")
        step = engine.register_step(plan.plan_id, "allocate-inventory", seq=1)
        executed = engine.execute_step(
            plan.plan_id, step.step_id, output_data={"allocated": True}
        )
        assert executed.status == StepStatus.COMPLETED
        assert executed.output_data["allocated"] is True
        assert executed.executed_at is not None

    def test_get_steps_ordered(self, engine: CompensationEngine) -> None:
        plan = engine.create_plan("saga-order")
        engine.register_step(plan.plan_id, "step-c", seq=3)
        engine.register_step(plan.plan_id, "step-a", seq=1)
        engine.register_step(plan.plan_id, "step-b", seq=2)
        steps = engine.get_steps(plan.plan_id)
        assert [s.seq for s in steps] == [1, 2, 3]

    def test_step_dict_property(self, engine: CompensationEngine) -> None:
        plan = engine.create_plan("saga-step-dict")
        step = engine.register_step(plan.plan_id, "s1", seq=1)
        d = step.dict
        assert d["step_id"] == step.step_id
        assert d["seq"] == 1
        assert "status" in d
        assert "input_data" in d

    # ------------------------------------------------------------------
    # Compensation cascade
    # ------------------------------------------------------------------

    def test_fail_step_triggers_compensation(
        self, engine: CompensationEngine
    ) -> None:
        plan = engine.create_plan("saga-cascade")
        s1 = engine.register_step(plan.plan_id, "step-1", seq=1)
        s2 = engine.register_step(plan.plan_id, "step-2", seq=2)
        s3 = engine.register_step(plan.plan_id, "step-3", seq=3)

        # Execute steps 1 and 2 successfully
        engine.execute_step(plan.plan_id, s1.step_id, output_data={"ok": True})
        engine.execute_step(plan.plan_id, s2.step_id, output_data={"ok": True})

        # Fail step 3 — should trigger compensation of steps 1 and 2 (in reverse)
        result = engine.fail_step(plan.plan_id, s3.step_id, error="out of stock")
        assert result.status == StepStatus.FAILED

        # Verify plan went to compensating/compensated
        updated_plan = engine.get_plan(plan.plan_id)
        assert updated_plan is not None
        assert updated_plan.status in (
            CompensationStatus.COMPENSATING,
            CompensationStatus.COMPENSATED,
        )

        # Steps 1 and 2 should now be compensated
        steps = engine.get_steps(plan.plan_id)
        step_map = {s.name: s for s in steps}
        assert step_map["step-1"].status == StepStatus.COMPENSATED
        assert step_map["step-2"].status == StepStatus.COMPENSATED

    def test_compensate_step_directly(self, engine: CompensationEngine) -> None:
        plan = engine.create_plan("saga-direct-comp")
        step = engine.register_step(plan.plan_id, "pay", seq=1)
        engine.execute_step(plan.plan_id, step.step_id)
        compensated = engine.compensate_step(plan.plan_id, step.step_id)
        assert compensated.status == StepStatus.COMPENSATED
        assert compensated.compensated_at is not None

    def test_compensate_from_partial(self, engine: CompensationEngine) -> None:
        plan = engine.create_plan("saga-partial")
        s1 = engine.register_step(plan.plan_id, "s1", seq=1)
        s2 = engine.register_step(plan.plan_id, "s2", seq=2)
        s3 = engine.register_step(plan.plan_id, "s3", seq=3)  # noqa: F841
        engine.execute_step(plan.plan_id, s1.step_id)
        engine.execute_step(plan.plan_id, s2.step_id)
        # Manually fail s3 without triggering cascade
        now = datetime.now(timezone.utc).isoformat()
        with engine._lock:
            conn = engine._connect()
            conn.execute(
                "UPDATE compensation_steps SET status='failed' WHERE step_id=?",
                (s3.step_id,),
            )
            conn.commit()
            conn.close()
        compensated = engine.compensate_from(plan.plan_id, s3.step_id)
        # s1 and s2 were completed → both compensated
        assert len(compensated) == 2
        assert all(s.status == StepStatus.COMPENSATED for s in compensated)

    # ------------------------------------------------------------------
    # Log
    # ------------------------------------------------------------------

    def test_log_entries_created_on_actions(
        self, engine: CompensationEngine
    ) -> None:
        plan = engine.create_plan("saga-log")
        step = engine.register_step(plan.plan_id, "step", seq=1)
        engine.execute_step(plan.plan_id, step.step_id)
        entries = engine.get_log(plan.plan_id)
        assert len(entries) >= 1
        actions = [e.action for e in entries]
        assert "execute_step" in actions

    def test_log_entry_dict_property(self, engine: CompensationEngine) -> None:
        plan = engine.create_plan("saga-log-dict")
        step = engine.register_step(plan.plan_id, "step", seq=1)
        engine.execute_step(plan.plan_id, step.step_id)
        entries = engine.get_log(plan.plan_id)
        d = entries[0].dict
        assert "log_id" in d
        assert "action" in d
        assert "executed_at" in d


# ---------------------------------------------------------------------------
# rate_limiter.py tests
# ---------------------------------------------------------------------------
from amc.product.rate_limiter import (
    QueueStatus,
    QuotaPeriod,
    RateLimitManager,
)


class TestRateLimitManager:
    @pytest.fixture()
    def mgr(self, tmp_path: Path) -> RateLimitManager:
        return RateLimitManager(db_path=tmp_path / "rl.db")

    # ------------------------------------------------------------------
    # Config CRUD
    # ------------------------------------------------------------------

    def test_create_config(self, mgr: RateLimitManager) -> None:
        cfg = mgr.create_config(
            connector_id="shopify",
            name="Shopify API",
            requests_per_window=40,
            window_s=1.0,
            burst_limit=50,
        )
        assert cfg.config_id
        assert cfg.connector_id == "shopify"
        assert cfg.requests_per_window == 40
        assert cfg.window_s == 1.0
        assert cfg.burst_limit == 50
        assert cfg.enabled is True

    def test_create_config_idempotent(self, mgr: RateLimitManager) -> None:
        """INSERT OR REPLACE — calling twice returns same config_id."""
        c1 = mgr.create_config("conn-x", "X", 10, 60.0)
        c2 = mgr.create_config("conn-x", "X updated", 20, 60.0)
        assert c1.config_id == c2.config_id

    def test_get_config_by_id(self, mgr: RateLimitManager) -> None:
        cfg = mgr.create_config("ga4", "GA4 API", 100, 100.0)
        fetched = mgr.get_config(cfg.config_id)
        assert fetched is not None
        assert fetched.connector_id == "ga4"

    def test_get_config_returns_none_missing(self, mgr: RateLimitManager) -> None:
        assert mgr.get_config("nonexistent") is None

    def test_get_config_by_connector(self, mgr: RateLimitManager) -> None:
        mgr.create_config("fb-ads", "Facebook Ads", 200, 3600.0)
        result = mgr.get_config_by_connector("fb-ads")
        assert result is not None
        assert result.name == "Facebook Ads"

    def test_list_configs(self, mgr: RateLimitManager) -> None:
        mgr.create_config("c1", "C1", 10, 60.0)
        mgr.create_config("c2", "C2", 20, 60.0)
        configs = mgr.list_configs()
        assert len(configs) == 2

    def test_config_dict_property(self, mgr: RateLimitManager) -> None:
        cfg = mgr.create_config("dict-test", "Dict", 10, 60.0)
        d = cfg.dict
        assert d["connector_id"] == "dict-test"
        assert "requests_per_window" in d
        assert "window_s" in d

    # ------------------------------------------------------------------
    # Rate checking & recording
    # ------------------------------------------------------------------

    def test_check_limit_allowed_when_no_usage(
        self, mgr: RateLimitManager
    ) -> None:
        mgr.create_config("fresh", "Fresh", 5, 60.0)
        status = mgr.check_limit("fresh")
        assert status["allowed"] is True
        assert status["remaining"] == 5

    def test_check_limit_blocks_when_exhausted(
        self, mgr: RateLimitManager
    ) -> None:
        mgr.create_config("exhaust", "Exhaust", 3, 60.0)
        ts = datetime.now(timezone.utc)
        for _ in range(3):
            mgr.record_call("exhaust", now=ts)
        status = mgr.check_limit("exhaust", now=ts)
        assert status["allowed"] is False
        assert status["remaining"] == 0
        assert status["retry_after_s"] >= 0

    def test_check_limit_unknown_connector_allows(
        self, mgr: RateLimitManager
    ) -> None:
        status = mgr.check_limit("unknown-connector")
        assert status["allowed"] is True

    def test_record_call_increments_counter(self, mgr: RateLimitManager) -> None:
        mgr.create_config("incr", "Incr", 100, 60.0)
        ts = datetime.now(timezone.utc)
        w1 = mgr.record_call("incr", now=ts)
        assert w1.count == 1
        w2 = mgr.record_call("incr", now=ts)
        assert w2.count == 2

    def test_record_call_new_window_resets(self, mgr: RateLimitManager) -> None:
        mgr.create_config("win", "Win", 5, 10.0)  # 10-second windows
        ts1 = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        ts2 = ts1 + timedelta(seconds=15)  # different window
        mgr.record_call("win", now=ts1)
        w2 = mgr.record_call("win", now=ts2)
        assert w2.count == 1  # fresh window

    def test_usage_window_dict_property(self, mgr: RateLimitManager) -> None:
        mgr.create_config("uw-dict", "UW", 10, 60.0)
        w = mgr.record_call("uw-dict")
        d = w.dict
        assert "usage_id" in d
        assert "count" in d
        assert "window_start" in d

    # ------------------------------------------------------------------
    # Queue
    # ------------------------------------------------------------------

    def test_enqueue_call(self, mgr: RateLimitManager) -> None:
        mgr.create_config("queue-conn", "Queue", 5, 60.0)
        call = mgr.enqueue_call("queue-conn", {"endpoint": "/orders"}, priority=1)
        assert call.queue_id
        assert call.connector_id == "queue-conn"
        assert call.status == QueueStatus.PENDING
        assert call.payload["endpoint"] == "/orders"

    def test_get_queue_filters_by_status(self, mgr: RateLimitManager) -> None:
        mgr.create_config("qf-conn", "QF", 5, 60.0)
        c1 = mgr.enqueue_call("qf-conn", {"n": 1})
        mgr.enqueue_call("qf-conn", {"n": 2})
        mgr.execute_queued(c1.queue_id)
        pending = mgr.get_queue("qf-conn", status=QueueStatus.PENDING)
        assert len(pending) == 1
        completed = mgr.get_queue("qf-conn", status=QueueStatus.COMPLETED)
        assert len(completed) == 1

    def test_execute_queued(self, mgr: RateLimitManager) -> None:
        mgr.create_config("exec-conn", "Exec", 10, 60.0)
        call = mgr.enqueue_call("exec-conn", {"task": "run"})
        executed = mgr.execute_queued(call.queue_id)
        assert executed.status == QueueStatus.COMPLETED
        assert executed.executed_at is not None

    def test_queued_call_dict_property(self, mgr: RateLimitManager) -> None:
        mgr.create_config("qd-conn", "QD", 10, 60.0)
        call = mgr.enqueue_call("qd-conn", {"x": 1})
        d = call.dict
        assert "queue_id" in d
        assert "status" in d
        assert d["payload"]["x"] == 1

    def test_get_next_window_when_allowed(self, mgr: RateLimitManager) -> None:
        mgr.create_config("next-win", "NW", 10, 60.0)
        ts = datetime.now(timezone.utc)
        nw = mgr.get_next_window("next-win", now=ts)
        # When quota is available, next window is now
        assert nw <= ts + timedelta(seconds=1)

    def test_get_next_window_when_exhausted(self, mgr: RateLimitManager) -> None:
        mgr.create_config("nw-exhaust", "NWE", 2, 60.0)
        ts = datetime(2025, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        mgr.record_call("nw-exhaust", now=ts)
        mgr.record_call("nw-exhaust", now=ts)
        nw = mgr.get_next_window("nw-exhaust", now=ts)
        # Next window should be in the future
        assert nw > ts

    # ------------------------------------------------------------------
    # Quota tracking
    # ------------------------------------------------------------------

    def test_track_quota(self, mgr: RateLimitManager) -> None:
        reset = datetime.now(timezone.utc) + timedelta(hours=1)
        quota = mgr.track_quota("big-conn", QuotaPeriod.HOUR, 10000, reset)
        assert quota.quota_limit == 10000
        assert quota.used == 0
        assert quota.remaining == 10000
        assert quota.period == QuotaPeriod.HOUR

    def test_consume_quota(self, mgr: RateLimitManager) -> None:
        reset = datetime.now(timezone.utc) + timedelta(days=30)
        mgr.track_quota("api-x", QuotaPeriod.MONTH, 50000, reset)
        after = mgr.consume_quota("api-x", QuotaPeriod.MONTH, amount=100)
        assert after.used == 100
        assert after.remaining == 49900

    def test_consume_quota_raises_if_missing(
        self, mgr: RateLimitManager
    ) -> None:
        with pytest.raises(ValueError, match="Quota record not found"):
            mgr.consume_quota("no-such-conn", QuotaPeriod.DAY)

    def test_get_quota(self, mgr: RateLimitManager) -> None:
        reset = datetime.now(timezone.utc) + timedelta(hours=24)
        mgr.track_quota("fetch-q", QuotaPeriod.DAY, 1000, reset)
        q = mgr.get_quota("fetch-q", QuotaPeriod.DAY)
        assert q is not None
        assert q.quota_limit == 1000

    def test_get_quota_none_missing(self, mgr: RateLimitManager) -> None:
        assert mgr.get_quota("nonexistent", QuotaPeriod.MINUTE) is None

    def test_quota_dict_property(self, mgr: RateLimitManager) -> None:
        reset = datetime.now(timezone.utc) + timedelta(hours=1)
        q = mgr.track_quota("qdict", QuotaPeriod.HOUR, 500, reset)
        d = q.dict
        assert d["quota_limit"] == 500
        assert "remaining" in d
        assert d["period"] == "hour"

    def test_get_usage_summary(self, mgr: RateLimitManager) -> None:
        mgr.create_config("summary-conn", "Summary", 50, 60.0)
        reset = datetime.now(timezone.utc) + timedelta(hours=1)
        mgr.track_quota("summary-conn", QuotaPeriod.HOUR, 5000, reset)
        mgr.record_call("summary-conn")
        summary = mgr.get_usage_summary("summary-conn")
        assert summary["connector_id"] == "summary-conn"
        assert summary["config"] is not None
        assert "current_window" in summary
        assert len(summary["quotas"]) == 1


# ---------------------------------------------------------------------------
# sync_connector.py tests
# ---------------------------------------------------------------------------
from amc.product.sync_connector import (
    ChangeType,
    SourceType,
    SyncManager,
    SyncStatus,
)


class TestSyncManager:
    @pytest.fixture()
    def mgr(self, tmp_path: Path) -> SyncManager:
        return SyncManager(db_path=tmp_path / "sync.db")

    # ------------------------------------------------------------------
    # Connector CRUD
    # ------------------------------------------------------------------

    def test_register_connector(self, mgr: SyncManager) -> None:
        c = mgr.register_connector(
            name="orders-db",
            source_type=SourceType.DATABASE,
            config={"host": "localhost", "db": "orders"},
        )
        assert c.connector_id
        assert c.name == "orders-db"
        assert c.source_type == SourceType.DATABASE
        assert c.status == SyncStatus.IDLE
        assert c.config["db"] == "orders"

    def test_register_connector_idempotent(self, mgr: SyncManager) -> None:
        c1 = mgr.register_connector("same-name", SourceType.API)
        c2 = mgr.register_connector("same-name", SourceType.API)
        assert c1.connector_id == c2.connector_id

    def test_get_connector(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("get-me", SourceType.FILE)
        fetched = mgr.get_connector(c.connector_id)
        assert fetched is not None
        assert fetched.name == "get-me"

    def test_get_connector_none_missing(self, mgr: SyncManager) -> None:
        assert mgr.get_connector("nonexistent") is None

    def test_list_connectors_all(self, mgr: SyncManager) -> None:
        mgr.register_connector("c1", SourceType.API)
        mgr.register_connector("c2", SourceType.DATABASE)
        all_connectors = mgr.list_connectors()
        assert len(all_connectors) == 2

    def test_list_connectors_status_filter(self, mgr: SyncManager) -> None:
        c1 = mgr.register_connector("idle-c", SourceType.WEBHOOK)
        mgr.register_connector("another-c", SourceType.API)
        mgr.start_run(c1.connector_id)
        running = mgr.list_connectors(status=SyncStatus.RUNNING)
        assert len(running) == 1
        assert running[0].connector_id == c1.connector_id

    def test_update_connector_config(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("upd-c", SourceType.DATABASE)
        updated = mgr.update_connector(
            c.connector_id, config={"host": "prod-db"}, metadata={"env": "prod"}
        )
        assert updated.config["host"] == "prod-db"
        assert updated.metadata["env"] == "prod"

    def test_update_connector_not_found_raises(self, mgr: SyncManager) -> None:
        with pytest.raises(ValueError, match="not found"):
            mgr.update_connector("nonexistent")

    def test_delete_connector(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("del-me", SourceType.CUSTOM)
        assert mgr.delete_connector(c.connector_id) is True
        assert mgr.get_connector(c.connector_id) is None

    def test_delete_connector_returns_false_missing(
        self, mgr: SyncManager
    ) -> None:
        assert mgr.delete_connector("nonexistent") is False

    def test_connector_dict_property(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("dict-c", SourceType.API)
        d = c.dict
        assert d["connector_id"] == c.connector_id
        assert d["source_type"] == "api"
        assert "status" in d

    # ------------------------------------------------------------------
    # Run lifecycle
    # ------------------------------------------------------------------

    def test_start_run(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("run-c", SourceType.API)
        run = mgr.start_run(c.connector_id, cursor_start="2025-01-01")
        assert run.run_id
        assert run.connector_id == c.connector_id
        assert run.status == SyncStatus.RUNNING
        assert run.cursor_start == "2025-01-01"
        # Connector should now be running
        conn_state = mgr.get_connector(c.connector_id)
        assert conn_state is not None
        assert conn_state.status == SyncStatus.RUNNING

    def test_complete_run(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("complete-c", SourceType.DATABASE)
        run = mgr.start_run(c.connector_id)
        completed = mgr.complete_run(
            run.run_id,
            cursor_end="2025-12-31",
            records_synced=500,
            records_failed=2,
        )
        assert completed.status == SyncStatus.COMPLETED
        assert completed.records_synced == 500
        assert completed.records_failed == 2
        assert completed.cursor_end == "2025-12-31"
        assert completed.completed_at is not None
        # Connector back to idle
        conn = mgr.get_connector(c.connector_id)
        assert conn is not None
        assert conn.status == SyncStatus.IDLE
        assert conn.last_cursor == "2025-12-31"

    def test_fail_run(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("fail-c", SourceType.API)
        run = mgr.start_run(c.connector_id)
        failed = mgr.fail_run(run.run_id, error="connection timeout")
        assert failed.status == SyncStatus.FAILED
        assert failed.error == "connection timeout"
        # Connector should reflect failure
        conn = mgr.get_connector(c.connector_id)
        assert conn is not None
        assert conn.status == SyncStatus.FAILED

    def test_get_run_none_missing(self, mgr: SyncManager) -> None:
        assert mgr.get_run("nonexistent") is None

    def test_list_runs_with_filters(self, mgr: SyncManager) -> None:
        c1 = mgr.register_connector("lr-c1", SourceType.API)
        c2 = mgr.register_connector("lr-c2", SourceType.FILE)
        r1 = mgr.start_run(c1.connector_id)
        mgr.start_run(c2.connector_id)
        mgr.complete_run(r1.run_id)
        # Filter by connector
        runs_c1 = mgr.list_runs(connector_id=c1.connector_id)
        assert len(runs_c1) == 1
        # Filter by status
        completed_runs = mgr.list_runs(status=SyncStatus.COMPLETED)
        assert len(completed_runs) == 1
        running_runs = mgr.list_runs(status=SyncStatus.RUNNING)
        assert len(running_runs) == 1

    def test_run_dict_property(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("run-dict-c", SourceType.DATABASE)
        run = mgr.start_run(c.connector_id)
        d = run.dict
        assert d["run_id"] == run.run_id
        assert d["status"] == "running"
        assert "started_at" in d

    # ------------------------------------------------------------------
    # Change detection
    # ------------------------------------------------------------------

    def test_detect_changes_creates_new(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("detect-c", SourceType.DATABASE)
        run = mgr.start_run(c.connector_id)
        records = [
            {"id": "1", "name": "Alice", "age": 30},
            {"id": "2", "name": "Bob", "age": 25},
        ]
        changes = mgr.detect_changes(run.run_id, records)
        assert len(changes) == 2
        assert all(ch.change_type == ChangeType.CREATED for ch in changes)

    def test_detect_changes_detects_updates(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("update-c", SourceType.DATABASE)
        r1 = mgr.start_run(c.connector_id)
        initial_records = [{"id": "10", "value": "original"}]
        mgr.detect_changes(r1.run_id, initial_records)
        mgr.complete_run(r1.run_id)

        r2 = mgr.start_run(c.connector_id)
        updated_records = [{"id": "10", "value": "modified"}]
        changes = mgr.detect_changes(r2.run_id, updated_records)
        assert len(changes) == 1
        assert changes[0].change_type == ChangeType.UPDATED

    def test_detect_changes_no_change_is_skipped(
        self, mgr: SyncManager
    ) -> None:
        c = mgr.register_connector("nochange-c", SourceType.API)
        r1 = mgr.start_run(c.connector_id)
        records = [{"id": "x1", "data": "same"}]
        mgr.detect_changes(r1.run_id, records)
        mgr.complete_run(r1.run_id)

        r2 = mgr.start_run(c.connector_id)
        # Same records again
        changes = mgr.detect_changes(r2.run_id, records)
        # UNCHANGED records are not recorded
        assert len(changes) == 0

    def test_detect_changes_custom_id_field(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("custom-id-c", SourceType.FILE)
        run = mgr.start_run(c.connector_id)
        records = [{"uuid": "abc-123", "label": "test"}]
        changes = mgr.detect_changes(run.run_id, records, id_field="uuid")
        assert len(changes) == 1
        assert changes[0].entity_id == "abc-123"

    def test_record_change_explicit(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("explicit-c", SourceType.CUSTOM)
        run = mgr.start_run(c.connector_id)
        change = mgr.record_change(
            run_id=run.run_id,
            connector_id=c.connector_id,
            entity_type="order",
            entity_id="ord-999",
            change_type=ChangeType.DELETED,
            before={"status": "active"},
            after={},
        )
        assert change.change_id
        assert change.change_type == ChangeType.DELETED
        assert change.entity_id == "ord-999"

    def test_get_changes_with_filters(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("filter-ch-c", SourceType.DATABASE)
        run = mgr.start_run(c.connector_id)
        records = [
            {"id": "a", "v": 1},
            {"id": "b", "v": 2},
        ]
        mgr.detect_changes(run.run_id, records)
        # All changes for this run
        all_changes = mgr.get_changes(run_id=run.run_id)
        assert len(all_changes) == 2
        # Filter by connector_id
        by_connector = mgr.get_changes(connector_id=c.connector_id)
        assert len(by_connector) == 2
        # Filter by change type
        created = mgr.get_changes(change_type=ChangeType.CREATED)
        assert all(ch.change_type == ChangeType.CREATED for ch in created)

    def test_change_dict_property(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("ch-dict-c", SourceType.API)
        run = mgr.start_run(c.connector_id)
        change = mgr.record_change(
            run.run_id, c.connector_id, "product", "p-1",
            ChangeType.CREATED, {}, {"name": "Widget"},
        )
        d = change.dict
        assert d["change_id"] == change.change_id
        assert d["change_type"] == "created"
        assert d["after"]["name"] == "Widget"

    # ------------------------------------------------------------------
    # Log
    # ------------------------------------------------------------------

    def test_log_entry_and_get(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("log-c", SourceType.WEBHOOK)
        run = mgr.start_run(c.connector_id)
        mgr.log_entry(c.connector_id, run.run_id, "info", "Sync started")
        mgr.log_entry(c.connector_id, run.run_id, "warning", "Slow response")
        entries = mgr.get_log(connector_id=c.connector_id)
        assert len(entries) == 2
        messages = {e.message for e in entries}
        assert "Sync started" in messages
        assert "Slow response" in messages

    def test_log_filter_by_run(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("log-run-c", SourceType.API)
        r1 = mgr.start_run(c.connector_id)
        mgr.complete_run(r1.run_id)
        r2 = mgr.start_run(c.connector_id)
        mgr.log_entry(c.connector_id, r1.run_id, "info", "Run 1 msg")
        mgr.log_entry(c.connector_id, r2.run_id, "info", "Run 2 msg")
        r1_logs = mgr.get_log(run_id=r1.run_id)
        assert len(r1_logs) == 1
        assert r1_logs[0].message == "Run 1 msg"

    def test_log_no_run_id(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("log-norun-c", SourceType.CUSTOM)
        mgr.log_entry(c.connector_id, None, "error", "Crash!")
        entries = mgr.get_log(connector_id=c.connector_id)
        assert len(entries) == 1
        assert entries[0].run_id is None

    def test_log_entry_dict_property(self, mgr: SyncManager) -> None:
        c = mgr.register_connector("log-dict-c", SourceType.FILE)
        mgr.log_entry(c.connector_id, None, "debug", "test")
        entries = mgr.get_log(connector_id=c.connector_id)
        d = entries[0].dict
        assert "log_id" in d
        assert d["level"] == "debug"
        assert d["message"] == "test"

    # ------------------------------------------------------------------
    # Full workflow integration
    # ------------------------------------------------------------------

    def test_full_sync_lifecycle(self, mgr: SyncManager) -> None:
        """End-to-end: register → start → detect → complete → verify state."""
        # 1. Register
        c = mgr.register_connector(
            "e2e-connector", SourceType.DATABASE,
            config={"table": "products"}
        )

        # 2. Start run
        run = mgr.start_run(c.connector_id, cursor_start="0")
        assert run.status == SyncStatus.RUNNING

        # 3. Detect changes (initial load)
        batch = [{"id": str(i), "sku": f"SKU-{i}", "price": i * 10}
                 for i in range(10)]
        changes = mgr.detect_changes(run.run_id, batch)
        assert len(changes) == 10
        assert all(ch.change_type == ChangeType.CREATED for ch in changes)

        # 4. Log progress
        mgr.log_entry(c.connector_id, run.run_id, "info",
                      f"Synced {len(batch)} records")

        # 5. Complete run
        final = mgr.complete_run(
            run.run_id, cursor_end="10",
            records_synced=10, records_failed=0
        )
        assert final.status == SyncStatus.COMPLETED

        # 6. Verify connector state
        conn = mgr.get_connector(c.connector_id)
        assert conn is not None
        assert conn.status == SyncStatus.IDLE
        assert conn.last_cursor == "10"

        # 7. Second run — detect updates
        run2 = mgr.start_run(c.connector_id, cursor_start="10")
        updated_batch = [{"id": "0", "sku": "SKU-0", "price": 999}]  # price changed
        changes2 = mgr.detect_changes(run2.run_id, updated_batch)
        assert len(changes2) == 1
        assert changes2[0].change_type == ChangeType.UPDATED

        mgr.complete_run(run2.run_id, cursor_end="11",
                         records_synced=1, records_failed=0)

        # 8. History check
        all_runs = mgr.list_runs(connector_id=c.connector_id)
        assert len(all_runs) == 2

        all_logs = mgr.get_log(connector_id=c.connector_id)
        assert len(all_logs) >= 1
