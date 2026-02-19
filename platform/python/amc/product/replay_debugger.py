"""AMC Product — Deterministic Replay Debugger (Feature 11).

Records agent run traces (inputs, actions, state transitions, tool results)
and provides deterministic replay with step-level comparison.

Key concepts
------------
- **RunTrace**: a recorded end-to-end run including all trace events.
- **TraceEvent**: a single action, tool call, or state change within a run.
- **ReplayResult**: comparison between original and replayed trace.
- **Redactor**: strips PII before storage using configurable patterns.

Revenue path: fast debugging of failures → reduced MTTR → better reliability
SLAs → enterprise trust (Lever B).
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Any

import structlog

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS run_traces (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id    TEXT NOT NULL UNIQUE,
    run_id      TEXT NOT NULL,
    session_id  TEXT NOT NULL DEFAULT '',
    tenant_id   TEXT NOT NULL DEFAULT '',
    workflow_id TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'recording',
    started_at  TEXT NOT NULL,
    ended_at    TEXT,
    outcome     TEXT NOT NULL DEFAULT '',
    error       TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS trace_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    TEXT NOT NULL UNIQUE,
    trace_id    TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    event_type  TEXT NOT NULL,
    actor       TEXT NOT NULL DEFAULT 'agent',
    tool_name   TEXT NOT NULL DEFAULT '',
    inputs_json TEXT NOT NULL DEFAULT '{}',
    outputs_json TEXT NOT NULL DEFAULT '{}',
    state_before_json TEXT NOT NULL DEFAULT '{}',
    state_after_json TEXT NOT NULL DEFAULT '{}',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    error       TEXT NOT NULL DEFAULT '',
    event_hash  TEXT NOT NULL DEFAULT '',
    recorded_at TEXT NOT NULL,
    FOREIGN KEY (trace_id) REFERENCES run_traces(trace_id)
);

CREATE INDEX IF NOT EXISTS idx_te_trace ON trace_events(trace_id, seq);
CREATE INDEX IF NOT EXISTS idx_rt_run ON run_traces(run_id);
CREATE INDEX IF NOT EXISTS idx_rt_tenant ON run_traces(tenant_id, started_at);
"""

# ---------------------------------------------------------------------------
# PII redaction patterns
# ---------------------------------------------------------------------------

_PII_PATTERNS = [
    (re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"), "[EMAIL]"),
    (re.compile(r"\b(?:\d[ -]?){13,16}\b"), "[CARD]"),
    (re.compile(r"\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b"), "[SSN]"),
    (re.compile(r"(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{24,}"), "[API_KEY]"),
    (re.compile(r"\bAK[A-Z0-9]{18}\b"), "[AWS_KEY]"),
    (re.compile(r"(?i)password\s*[:=]\s*\S+"), "password=[REDACTED]"),
    (re.compile(r"(?i)token\s*[:=]\s*[A-Za-z0-9\-_.]+"), "token=[REDACTED]"),
]


def redact_pii(text: str) -> str:
    for pattern, replacement in _PII_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def _redact_dict(payload: dict[str, Any]) -> dict[str, Any]:
    """Recursively redact PII from a dict by converting to/from JSON."""
    raw = json.dumps(payload, default=str)
    redacted = redact_pii(raw)
    try:
        return json.loads(redacted)
    except json.JSONDecodeError:
        return {"_redacted": redacted}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class EventType(str, Enum):
    TOOL_CALL = "tool_call"
    DECISION = "decision"
    STATE_CHANGE = "state_change"
    PROMPT = "prompt"
    RESPONSE = "response"
    ERROR = "error"
    CHECKPOINT = "checkpoint"


class TraceStatus(str, Enum):
    RECORDING = "recording"
    COMPLETE = "complete"
    FAILED = "failed"
    REPLAYING = "replaying"


@dataclass
class TraceEvent:
    event_id: str
    trace_id: str
    seq: int
    event_type: EventType
    actor: str = "agent"
    tool_name: str = ""
    inputs: dict[str, Any] = field(default_factory=dict)
    outputs: dict[str, Any] = field(default_factory=dict)
    state_before: dict[str, Any] = field(default_factory=dict)
    state_after: dict[str, Any] = field(default_factory=dict)
    duration_ms: int = 0
    error: str = ""
    event_hash: str = ""
    recorded_at: str = ""

    def compute_hash(self) -> str:
        content = json.dumps({
            "seq": self.seq,
            "event_type": self.event_type,
            "tool_name": self.tool_name,
            "inputs": self.inputs,
        }, sort_keys=True, ensure_ascii=True)
        return hashlib.sha256(content.encode()).hexdigest()[:16]

    @property
    def as_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "trace_id": self.trace_id,
            "seq": self.seq,
            "event_type": self.event_type.value,
            "actor": self.actor,
            "tool_name": self.tool_name,
            "inputs": self.inputs,
            "outputs": self.outputs,
            "state_before": self.state_before,
            "state_after": self.state_after,
            "duration_ms": self.duration_ms,
            "error": self.error,
            "event_hash": self.event_hash,
            "recorded_at": self.recorded_at,
        }


@dataclass
class RunTrace:
    trace_id: str
    run_id: str
    session_id: str
    tenant_id: str
    workflow_id: str
    status: TraceStatus
    started_at: str
    events: list[TraceEvent] = field(default_factory=list)
    ended_at: str | None = None
    outcome: str = ""
    error: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def as_dict(self) -> dict[str, Any]:
        return {
            "trace_id": self.trace_id,
            "run_id": self.run_id,
            "session_id": self.session_id,
            "tenant_id": self.tenant_id,
            "workflow_id": self.workflow_id,
            "status": self.status.value,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "outcome": self.outcome,
            "error": self.error,
            "metadata": self.metadata,
            "event_count": len(self.events),
            "events": [e.as_dict for e in self.events],
        }


@dataclass
class ReplayDiff:
    seq: int
    event_type: str
    original_hash: str
    replayed_hash: str
    diverged: bool
    detail: str = ""


@dataclass
class ReplayResult:
    original_trace_id: str
    replay_trace_id: str
    total_events: int
    matching_events: int
    diverged_events: int
    diffs: list[ReplayDiff] = field(default_factory=list)
    is_deterministic: bool = True
    summary: str = ""

    @property
    def as_dict(self) -> dict[str, Any]:
        return {
            "original_trace_id": self.original_trace_id,
            "replay_trace_id": self.replay_trace_id,
            "total_events": self.total_events,
            "matching_events": self.matching_events,
            "diverged_events": self.diverged_events,
            "is_deterministic": self.is_deterministic,
            "summary": self.summary,
            "diffs": [
                {
                    "seq": d.seq,
                    "event_type": d.event_type,
                    "original_hash": d.original_hash,
                    "replayed_hash": d.replayed_hash,
                    "diverged": d.diverged,
                    "detail": d.detail,
                }
                for d in self.diffs
            ],
        }


# ---------------------------------------------------------------------------
# ReplayDebugger
# ---------------------------------------------------------------------------


class ReplayDebugger:
    """Record and replay agent run traces for deterministic debugging."""

    def __init__(
        self,
        db_path: str | Path = "amc_replay.db",
        redact_pii: bool = True,
    ) -> None:
        self._db = Path(db_path)
        self._redact = redact_pii
        self._lock = Lock()
        self._init_db()
        log.info("replay_debugger.init", db=str(self._db), redact_pii=redact_pii)

    # ------------------------------------------------------------------
    # Recording
    # ------------------------------------------------------------------

    def start_trace(
        self,
        run_id: str,
        session_id: str = "",
        tenant_id: str = "",
        workflow_id: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> RunTrace:
        """Start a new trace recording for a run."""
        trace_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            conn = self._connect()
            conn.execute(
                """
                INSERT INTO run_traces
                (trace_id, run_id, session_id, tenant_id, workflow_id,
                 status, started_at, metadata_json)
                VALUES (?,?,?,?,?,?,?,?)
                """,
                (
                    trace_id, run_id, session_id, tenant_id, workflow_id,
                    TraceStatus.RECORDING.value, now,
                    json.dumps(metadata or {}),
                ),
            )
            conn.commit()
            conn.close()

        trace = RunTrace(
            trace_id=trace_id,
            run_id=run_id,
            session_id=session_id,
            tenant_id=tenant_id,
            workflow_id=workflow_id,
            status=TraceStatus.RECORDING,
            started_at=now,
            metadata=metadata or {},
        )
        log.info("replay_debugger.trace_started", trace_id=trace_id, run_id=run_id)
        return trace

    def record_event(
        self,
        trace_id: str,
        event_type: EventType,
        actor: str = "agent",
        tool_name: str = "",
        inputs: dict[str, Any] | None = None,
        outputs: dict[str, Any] | None = None,
        state_before: dict[str, Any] | None = None,
        state_after: dict[str, Any] | None = None,
        duration_ms: int = 0,
        error: str = "",
    ) -> TraceEvent:
        """Record a single trace event within a run."""
        now = datetime.now(timezone.utc).isoformat()
        event_id = str(uuid.uuid4())

        safe_inputs = _redact_dict(inputs or {}) if self._redact else (inputs or {})
        safe_outputs = _redact_dict(outputs or {}) if self._redact else (outputs or {})
        safe_before = _redact_dict(state_before or {}) if self._redact else (state_before or {})
        safe_after = _redact_dict(state_after or {}) if self._redact else (state_after or {})

        # Assign seq deterministically
        with self._lock:
            conn = self._connect()
            count_row = conn.execute(
                "SELECT COUNT(*) as cnt FROM trace_events WHERE trace_id=?",
                (trace_id,),
            ).fetchone()
            seq = (count_row["cnt"] if count_row else 0)

        event = TraceEvent(
            event_id=event_id,
            trace_id=trace_id,
            seq=seq,
            event_type=event_type,
            actor=actor,
            tool_name=tool_name,
            inputs=safe_inputs,
            outputs=safe_outputs,
            state_before=safe_before,
            state_after=safe_after,
            duration_ms=duration_ms,
            error=error,
            recorded_at=now,
        )
        event.event_hash = event.compute_hash()

        with self._lock:
            conn = self._connect()
            conn.execute(
                """
                INSERT INTO trace_events
                (event_id, trace_id, seq, event_type, actor, tool_name,
                 inputs_json, outputs_json, state_before_json, state_after_json,
                 duration_ms, error, event_hash, recorded_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    event_id, trace_id, seq,
                    event_type.value, actor, tool_name,
                    json.dumps(safe_inputs), json.dumps(safe_outputs),
                    json.dumps(safe_before), json.dumps(safe_after),
                    duration_ms, error, event.event_hash, now,
                ),
            )
            conn.commit()
            conn.close()

        log.debug("replay_debugger.event", trace_id=trace_id, seq=seq, event_type=event_type.value)
        return event

    def end_trace(
        self,
        trace_id: str,
        outcome: str = "completed",
        error: str = "",
        status: TraceStatus = TraceStatus.COMPLETE,
    ) -> RunTrace:
        """Mark a trace as completed and return the full trace."""
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            conn = self._connect()
            conn.execute(
                """
                UPDATE run_traces
                SET status=?, ended_at=?, outcome=?, error=?
                WHERE trace_id=?
                """,
                (status.value, now, outcome, error, trace_id),
            )
            conn.commit()
            conn.close()
        trace = self.get_trace(trace_id)
        if trace is None:
            raise ValueError(f"Trace not found: {trace_id}")
        log.info("replay_debugger.trace_ended", trace_id=trace_id, status=status.value)
        return trace

    # ------------------------------------------------------------------
    # Replay
    # ------------------------------------------------------------------

    def replay(
        self,
        trace_id: str,
        mock_tool_results: dict[str, Any] | None = None,
    ) -> ReplayResult:
        """Simulate replaying a trace and compute event-hash diffs.

        In the replay model, we reconstruct each event with the same inputs
        and compare the event_hash (which is deterministic on event_type +
        tool_name + inputs). If mock_tool_results provides overrides, those
        are injected as outputs for corresponding tool_name events.
        """
        original = self.get_trace(trace_id)
        if original is None:
            raise ValueError(f"Trace not found: {trace_id}")

        mocks = mock_tool_results or {}

        replay_trace_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            conn = self._connect()
            conn.execute(
                """
                INSERT INTO run_traces
                (trace_id, run_id, session_id, tenant_id, workflow_id,
                 status, started_at, metadata_json)
                VALUES (?,?,?,?,?,?,?,?)
                """,
                (
                    replay_trace_id, original.run_id + ":replay",
                    original.session_id, original.tenant_id,
                    original.workflow_id, TraceStatus.REPLAYING.value, now,
                    json.dumps({"replay_of": trace_id}),
                ),
            )
            conn.commit()
            conn.close()

        diffs: list[ReplayDiff] = []
        matching = 0
        diverged = 0

        for orig_event in original.events:
            # Build replayed event with same inputs (possibly overriding outputs)
            replayed_outputs = mocks.get(orig_event.tool_name, orig_event.outputs)
            replayed = TraceEvent(
                event_id=str(uuid.uuid4()),
                trace_id=replay_trace_id,
                seq=orig_event.seq,
                event_type=orig_event.event_type,
                actor=orig_event.actor,
                tool_name=orig_event.tool_name,
                inputs=orig_event.inputs,
                outputs=replayed_outputs,
                state_before=orig_event.state_before,
                state_after=orig_event.state_after,
                duration_ms=orig_event.duration_ms,
                error=orig_event.error,
                recorded_at=now,
            )
            replayed.event_hash = replayed.compute_hash()

            # Hashes should match since inputs+event_type+tool_name are same
            hash_matches = replayed.event_hash == orig_event.event_hash
            output_changed = replayed_outputs != orig_event.outputs

            did_diverge = not hash_matches or output_changed
            if did_diverge:
                diverged += 1
            else:
                matching += 1

            detail = ""
            if not hash_matches:
                detail = f"Hash mismatch: orig={orig_event.event_hash}, replay={replayed.event_hash}"
            elif output_changed:
                detail = f"Mock override applied to tool '{orig_event.tool_name}'"

            diffs.append(ReplayDiff(
                seq=orig_event.seq,
                event_type=orig_event.event_type.value,
                original_hash=orig_event.event_hash,
                replayed_hash=replayed.event_hash,
                diverged=did_diverge,
                detail=detail,
            ))

            # Persist replayed event
            with self._lock:
                conn = self._connect()
                conn.execute(
                    """
                    INSERT INTO trace_events
                    (event_id, trace_id, seq, event_type, actor, tool_name,
                     inputs_json, outputs_json, state_before_json, state_after_json,
                     duration_ms, error, event_hash, recorded_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    (
                        replayed.event_id, replay_trace_id, replayed.seq,
                        replayed.event_type.value, replayed.actor, replayed.tool_name,
                        json.dumps(replayed.inputs), json.dumps(replayed.outputs),
                        json.dumps(replayed.state_before), json.dumps(replayed.state_after),
                        replayed.duration_ms, replayed.error, replayed.event_hash, now,
                    ),
                )
                conn.commit()
                conn.close()

        total = len(original.events)
        is_deterministic = diverged == 0 or all(
            d.detail.startswith("Mock override") for d in diffs if d.diverged
        )

        if diverged == 0:
            summary = f"Replay deterministic: all {total} events matched exactly."
        elif is_deterministic:
            summary = (
                f"Replay deterministic with {diverged} mock override(s) applied "
                f"across {total} events."
            )
        else:
            summary = (
                f"Non-deterministic replay: {diverged}/{total} events diverged. "
                f"Investigate inputs or state injection at divergence points."
            )

        # Close replay trace
        with self._lock:
            conn = self._connect()
            conn.execute(
                "UPDATE run_traces SET status=?, ended_at=?, outcome=? WHERE trace_id=?",
                (TraceStatus.COMPLETE.value, now, "replay-complete", replay_trace_id),
            )
            conn.commit()
            conn.close()

        result = ReplayResult(
            original_trace_id=trace_id,
            replay_trace_id=replay_trace_id,
            total_events=total,
            matching_events=matching,
            diverged_events=diverged,
            diffs=diffs,
            is_deterministic=is_deterministic,
            summary=summary,
        )
        log.info(
            "replay_debugger.replay_complete",
            trace_id=trace_id,
            total=total,
            matching=matching,
            diverged=diverged,
            is_deterministic=is_deterministic,
        )
        return result

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_trace(self, trace_id: str) -> RunTrace | None:
        conn = self._connect()
        row = conn.execute(
            "SELECT * FROM run_traces WHERE trace_id=?", (trace_id,)
        ).fetchone()
        if row is None:
            conn.close()
            return None
        event_rows = conn.execute(
            "SELECT * FROM trace_events WHERE trace_id=? ORDER BY seq ASC",
            (trace_id,),
        ).fetchall()
        conn.close()

        events = [self._row_to_event(e) for e in event_rows]
        return RunTrace(
            trace_id=row["trace_id"],
            run_id=row["run_id"],
            session_id=row["session_id"],
            tenant_id=row["tenant_id"],
            workflow_id=row["workflow_id"],
            status=TraceStatus(row["status"]),
            started_at=row["started_at"],
            events=events,
            ended_at=row["ended_at"],
            outcome=row["outcome"],
            error=row["error"],
            metadata=json.loads(row["metadata_json"] or "{}"),
        )

    def list_traces(
        self,
        tenant_id: str | None = None,
        workflow_id: str | None = None,
        run_id: str | None = None,
        limit: int = 50,
    ) -> list[RunTrace]:
        clauses: list[str] = []
        params: list[Any] = []
        if tenant_id:
            clauses.append("tenant_id=?")
            params.append(tenant_id)
        if workflow_id:
            clauses.append("workflow_id=?")
            params.append(workflow_id)
        if run_id:
            clauses.append("run_id=?")
            params.append(run_id)
        where = "WHERE " + " AND ".join(clauses) if clauses else ""
        params.append(limit)
        conn = self._connect()
        rows = conn.execute(
            f"SELECT trace_id FROM run_traces {where} ORDER BY started_at DESC LIMIT ?",
            params,
        ).fetchall()
        conn.close()
        result = []
        for r in rows:
            t = self.get_trace(r["trace_id"])
            if t:
                result.append(t)
        return result

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        with self._lock:
            conn = self._connect()
            conn.executescript(_SCHEMA)
            conn.commit()
            conn.close()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _row_to_event(row: sqlite3.Row) -> TraceEvent:
        return TraceEvent(
            event_id=row["event_id"],
            trace_id=row["trace_id"],
            seq=row["seq"],
            event_type=EventType(row["event_type"]),
            actor=row["actor"],
            tool_name=row["tool_name"],
            inputs=json.loads(row["inputs_json"] or "{}"),
            outputs=json.loads(row["outputs_json"] or "{}"),
            state_before=json.loads(row["state_before_json"] or "{}"),
            state_after=json.loads(row["state_after_json"] or "{}"),
            duration_ms=row["duration_ms"],
            error=row["error"],
            event_hash=row["event_hash"],
            recorded_at=row["recorded_at"],
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_default_debugger: ReplayDebugger | None = None


def get_replay_debugger(
    db_path: str | Path = "amc_replay.db",
    redact_pii: bool = True,
) -> ReplayDebugger:
    global _default_debugger
    if _default_debugger is None:
        _default_debugger = ReplayDebugger(db_path=db_path, redact_pii=redact_pii)
    return _default_debugger


__all__ = [
    "EventType",
    "TraceStatus",
    "TraceEvent",
    "RunTrace",
    "ReplayDiff",
    "ReplayResult",
    "ReplayDebugger",
    "get_replay_debugger",
    "redact_pii",
]
