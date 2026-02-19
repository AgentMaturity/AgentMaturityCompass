"""
AMC Enforce — E5: Budget/Circuit Breaker

Controls per-session resource budgets for runaway tool sessions with a simple
state machine:

CLOSED -> OPEN -> HALF_OPEN

- CLOSED: normal operation, metrics are accumulated.
- OPEN: budgets exceeded; execution is blocked until cooldown passes.
- HALF_OPEN: limited probe mode after cooldown. If probes pass, return to
  CLOSED; if they fail, return to OPEN.

Safe checkpointing is performed before kill events so operations can resume from
known-good state.

Usage:
    breaker = CircuitBreaker()
    decision = breaker.evaluate(
        session_id="s1",
        token_delta=120,
        tool_call_delta=1,
        browser_depth_delta=2,
        session_state={"task": "draft-article", "phase": "analysis"},
    )

    if decision.hard_killed:
        checkpoint = decision.checkpoint
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

import structlog
from pydantic import BaseModel, Field

from amc.core.models import AMCRequest

log = structlog.get_logger(__name__)


class CircuitState(str):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class SessionBudget(BaseModel):
    """Per-session budget limits."""

    token_budget: int = Field(gt=0, default=20_000)
    tool_call_count: int = Field(gt=0, default=200)
    elapsed_seconds: int = Field(gt=0, default=3_600)
    browser_depth: int = Field(gt=0, default=4)


class CircuitStateModel(BaseModel):
    session_id: str
    state: str
    token_used: int = 0
    tool_calls: int = 0
    browser_depth: int = 0
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    state_entered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    safe_mode: bool = False
    open_since: datetime | None = None
    probe_successes: int = 0
    probe_failures: int = 0


class SessionCheckpoint(BaseModel):
    """Persistable snapshot that can be restored after a session is halted."""

    session_id: str
    checkpointed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    token_used: int
    tool_calls: int
    browser_depth: int
    safe_mode: bool
    elapsed_seconds: int
    state: str
    context: dict[str, Any] = Field(default_factory=dict)
    note: str | None = None


class BillingEvent(BaseModel):
    """Simple billing hook payload."""

    session_id: str
    token_cost: int
    total_token_cost: int
    event: str
    billed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    context: dict[str, Any] = Field(default_factory=dict)


class CircuitDecision(BaseModel):
    """Return value for `evaluate`. """

    allowed: bool
    state: str
    reason: str
    safe_mode: bool = False
    hard_killed: bool = False
    remaining: dict[str, int] = Field(default_factory=dict)
    checkpoint: SessionCheckpoint | None = None
    billing_event: BillingEvent | None = None


@dataclass
class StateTransition:
    from_state: str
    to_state: str
    reason: str


_SCHEMA = """
CREATE TABLE IF NOT EXISTS circuit_states (
    session_id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    token_used INTEGER NOT NULL DEFAULT 0,
    tool_calls INTEGER NOT NULL DEFAULT 0,
    browser_depth INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    state_entered_at TEXT NOT NULL,
    safe_mode INTEGER NOT NULL DEFAULT 0,
    open_since TEXT,
    probe_successes INTEGER NOT NULL DEFAULT 0,
    probe_failures INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS session_checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    checkpoint_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS circuit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


class CircuitBreaker:
    """Budget enforcement engine with SQLite persistence and circuit-state transitions."""

    def __init__(
        self,
        budgets: SessionBudget | None = None,
        db_path: str | Path = "amc_circuit_breaker.db",
        open_cooldown_seconds: int = 300,
        half_open_probe_limit: int = 2,
        half_open_recovery_threshold: int = 2,
        billing_hook: Callable[[BillingEvent], None] | None = None,
    ) -> None:
        self.budgets = budgets or SessionBudget()
        self.db_path = Path(db_path)
        self.open_cooldown_seconds = open_cooldown_seconds
        self.half_open_probe_limit = half_open_probe_limit
        self.half_open_recovery_threshold = half_open_recovery_threshold
        self._billing_hook = billing_hook
        self._db = sqlite3.connect(self.db_path)
        self._db.row_factory = sqlite3.Row
        self._db.executescript(_SCHEMA)
        self._db.commit()

    def close(self) -> None:
        self._db.close()

    def _load_state(self, session_id: str) -> CircuitStateModel:
        row = self._db.execute(
            "SELECT * FROM circuit_states WHERE session_id = ?", (session_id,)
        ).fetchone()
        if row is None:
            return CircuitStateModel(session_id=session_id, state=CircuitState.CLOSED)
        return CircuitStateModel(
            session_id=row["session_id"],
            state=row["state"],
            token_used=row["token_used"],
            tool_calls=row["tool_calls"],
            browser_depth=row["browser_depth"],
            started_at=datetime.fromisoformat(row["started_at"]),
            state_entered_at=datetime.fromisoformat(row["state_entered_at"]),
            safe_mode=bool(row["safe_mode"]),
            open_since=datetime.fromisoformat(row["open_since"]) if row["open_since"] else None,
            probe_successes=row["probe_successes"],
            probe_failures=row["probe_failures"],
        )

    def _save_state(self, state: CircuitStateModel) -> None:
        self._db.execute(
            """INSERT INTO circuit_states
             (session_id, state, token_used, tool_calls, browser_depth, started_at,
              state_entered_at, safe_mode, open_since, probe_successes, probe_failures)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(session_id) DO UPDATE SET
              state=excluded.state,
              token_used=excluded.token_used,
              tool_calls=excluded.tool_calls,
              browser_depth=excluded.browser_depth,
              started_at=excluded.started_at,
              state_entered_at=excluded.state_entered_at,
              safe_mode=excluded.safe_mode,
              open_since=excluded.open_since,
              probe_successes=excluded.probe_successes,
              probe_failures=excluded.probe_failures""",
            (
                state.session_id,
                state.state,
                state.token_used,
                state.tool_calls,
                state.browser_depth,
                state.started_at.isoformat(),
                state.state_entered_at.isoformat(),
                int(state.safe_mode),
                state.open_since.isoformat() if state.open_since else None,
                state.probe_successes,
                state.probe_failures,
            ),
        )
        self._db.commit()

    def _save_event(self, session_id: str, event_type: str, payload: dict[str, Any]) -> None:
        self._db.execute(
            """INSERT INTO circuit_events (session_id, event_type, payload_json, created_at)
             VALUES (?, ?, ?, ?)""",
            (session_id, event_type, json.dumps(payload, default=str), datetime.now(timezone.utc).isoformat()),
        )
        self._db.commit()

    def _checkpoint(self, state: CircuitStateModel, context: dict[str, Any] | None, note: str | None = None) -> SessionCheckpoint:
        started = datetime.now(timezone.utc)
        elapsed = int((started - state.started_at).total_seconds())
        ck = SessionCheckpoint(
            session_id=state.session_id,
            token_used=state.token_used,
            tool_calls=state.tool_calls,
            browser_depth=state.browser_depth,
            safe_mode=state.safe_mode,
            elapsed_seconds=elapsed,
            state=state.state,
            context=context or {},
            note=note,
        )
        self._db.execute(
            """INSERT INTO session_checkpoints (session_id, checkpoint_json, created_at)
             VALUES (?, ?, ?)""",
            (state.session_id, ck.model_dump_json(), datetime.now(timezone.utc).isoformat()),
        )
        self._db.commit()
        self._save_event(state.session_id, "checkpoint", ck.model_dump())
        log.warning("circuit.checkpoint", session_id=state.session_id, note=note)
        return ck

    def _emit_billing(self, session_id: str, total_tokens: int, context: dict[str, Any] | None) -> None:
        event = BillingEvent(
            session_id=session_id,
            token_cost=total_tokens,
            total_token_cost=total_tokens,
            event="token_budget_update",
            context=context or {},
        )
        if self._billing_hook:
            try:
                self._billing_hook(event)
            except Exception:
                log.exception("billing.hook_failed", session_id=session_id)
        self._save_event(session_id, "billing", event.model_dump())

    @staticmethod
    def _safe_mode_state(ratio: float) -> bool:
        return ratio >= 0.80

    def _limit_reached(self, state: CircuitStateModel) -> tuple[bool, dict[str, int]]:
        remaining = {
            "token": max(self.budgets.token_budget - state.token_used, 0),
            "tool_call": max(self.budgets.tool_call_count - state.tool_calls, 0),
            "browser_depth": max(self.budgets.browser_depth - state.browser_depth, 0),
        }
        elapsed = int((datetime.now(timezone.utc) - state.started_at).total_seconds())
        remaining["elapsed"] = max(self.budgets.elapsed_seconds - elapsed, 0)

        hit = any(v <= 0 for k, v in {
            "token": self.budgets.token_budget - state.token_used,
            "tool_call": self.budgets.tool_call_count - state.tool_calls,
            "browser_depth": self.budgets.browser_depth - state.browser_depth,
            "elapsed": self.budgets.elapsed_seconds - elapsed,
        }.items())
        return hit, remaining

    def _evaluate_for_limit(self, state: CircuitStateModel) -> tuple[bool, float]:
        now = datetime.now(timezone.utc)
        elapsed = int((now - state.started_at).total_seconds())
        ratios = [
            state.token_used / max(self.budgets.token_budget, 1),
            state.tool_calls / max(self.budgets.tool_call_count, 1),
            state.browser_depth / max(self.budgets.browser_depth, 1),
            elapsed / max(self.budgets.elapsed_seconds, 1),
        ]
        return any(r >= 1.0 for r in ratios), max(ratios)

    def evaluate(
        self,
        session_id: str,
        *,
        token_delta: int = 0,
        tool_call_delta: int = 1,
        browser_depth_delta: int = 0,
        request: AMCRequest | None = None,
        session_state: dict[str, Any] | None = None,
    ) -> CircuitDecision:
        """Evaluate a session update and return whether operation should proceed."""
        state = self._load_state(session_id)
        now = datetime.now(timezone.utc)

        # Always enforce elapsed updates in CLOSED/HALF_OPEN before gating.
        if token_delta:
            state.token_used += max(token_delta, 0)
            self._emit_billing(session_id, state.token_used, session_state)

        if tool_call_delta:
            state.tool_calls += max(tool_call_delta, 0)
        if browser_depth_delta:
            state.browser_depth = max(state.browser_depth, browser_depth_delta)

        # Auto downgrade when near limit.
        ratio = max(
            state.token_used / max(self.budgets.token_budget, 1),
            state.tool_calls / max(self.budgets.tool_call_count, 1),
            state.browser_depth / max(self.budgets.browser_depth, 1),
            (now - state.started_at).total_seconds() / max(self.budgets.elapsed_seconds, 1),
        )
        state.safe_mode = self._safe_mode_state(ratio)

        # Evaluate state machine transitions.
        if state.state == CircuitState.CLOSED:
            limit_hit, _ = self._evaluate_for_limit(state)
            if limit_hit:
                state.state = CircuitState.OPEN
                state.state_entered_at = now
                state.open_since = now
                checkpoint = self._checkpoint(
                    state,
                    context={"reason": "limit_exceeded", "request_id": request.request_id if request else None},
                    note="limit exceeded in CLOSED state",
                )
                self._save_state(state)
                return CircuitDecision(
                    allowed=False,
                    state=state.state,
                    reason="Budget limit reached; circuit opened",
                    safe_mode=True,
                    hard_killed=True,
                    checkpoint=checkpoint,
                    remaining={
                        "token": max(self.budgets.token_budget - state.token_used, 0),
                        "tool_call": max(self.budgets.tool_call_count - state.tool_calls, 0),
                        "browser_depth": max(self.budgets.browser_depth - state.browser_depth, 0),
                        "elapsed": max(self.budgets.elapsed_seconds - int((now - state.started_at).total_seconds()), 0),
                    },
                    billing_event=BillingEvent(
                        session_id=session_id,
                        token_cost=token_delta,
                        total_token_cost=state.token_used,
                        event="circuit_opened",
                        context=session_state or {},
                    ),
                )

        elif state.state == CircuitState.OPEN:
            cooldown_expired = state.open_since and (now - state.open_since).total_seconds() >= self.open_cooldown_seconds
            if cooldown_expired:
                state.state = CircuitState.HALF_OPEN
                state.state_entered_at = now
                state.probe_successes = 0
                state.probe_failures = 0
                self._save_state(state)
                self._save_event(session_id, "state_transition", {
                    "from": CircuitState.OPEN,
                    "to": CircuitState.HALF_OPEN,
                    "reason": "cooldown_elapsed",
                })
            else:
                self._save_state(state)
                return CircuitDecision(
                    allowed=False,
                    state=state.state,
                    reason="Circuit is OPEN (cooldown active)",
                    safe_mode=True,
                    remaining={
                        "token": max(self.budgets.token_budget - state.token_used, 0),
                        "tool_call": max(self.budgets.tool_call_count - state.tool_calls, 0),
                        "browser_depth": max(self.budgets.browser_depth - state.browser_depth, 0),
                        "elapsed": max(self.budgets.elapsed_seconds - int((now - state.started_at).total_seconds()), 0),
                    },
                    billing_event=None,
                )

        if state.state == CircuitState.HALF_OPEN:
            # In probe mode, allow a limited number of calls then evaluate safety.
            if state.tool_calls % max(self.half_open_probe_limit, 1) == 0 and state.tool_calls > 0:
                state.probe_successes += 1
                if state.probe_successes >= self.half_open_recovery_threshold:
                    state.state = CircuitState.CLOSED
                    state.state_entered_at = now
                    state.open_since = None
                    state.probe_failures = 0
                    self._save_state(state)
                    self._save_event(session_id, "state_transition", {
                        "from": CircuitState.HALF_OPEN,
                        "to": CircuitState.CLOSED,
                        "reason": "half_open_probes_succeeded",
                    })
                    return CircuitDecision(
                        allowed=True,
                        state=state.state,
                        reason="Half-open probe completed; circuit closed",
                        safe_mode=state.safe_mode,
                    )
            limit_hit, _ = self._evaluate_for_limit(state)
            if limit_hit:
                state.probe_failures += 1
                state.state = CircuitState.OPEN
                state.state_entered_at = now
                state.open_since = now
                checkpoint = self._checkpoint(
                    state,
                    context={"reason": "half_open_limit_hit", "request_id": request.request_id if request else None},
                    note="Half-open probe triggered breach",
                )
                self._save_state(state)
                return CircuitDecision(
                    allowed=False,
                    state=state.state,
                    reason="Half-open probe breach; circuit reopened",
                    safe_mode=True,
                    hard_killed=True,
                    checkpoint=checkpoint,
                )

            # allow during probe
            self._save_state(state)
            return CircuitDecision(
                allowed=True,
                state=state.state,
                reason="Half-open probe allowed",
                safe_mode=state.safe_mode,
            )

        # CLOSED path with safe mode downgrade still allowed
        self._save_state(state)
        return CircuitDecision(
            allowed=True,
            state=state.state,
            reason="Session within budget",
            safe_mode=state.safe_mode,
            remaining={
                "token": max(self.budgets.token_budget - state.token_used, 0),
                "tool_call": max(self.budgets.tool_call_count - state.tool_calls, 0),
                "browser_depth": max(self.budgets.browser_depth - state.browser_depth, 0),
                "elapsed": max(self.budgets.elapsed_seconds - int((now - state.started_at).total_seconds()), 0),
            },
            billing_event=None,
        )
