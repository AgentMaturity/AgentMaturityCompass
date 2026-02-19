from __future__ import annotations

"""Lightweight usage metering + billing ledger for AMC product runs.

The module keeps a small SQLite-backed ledger of billable usage events and offers
simple deterministic-cost estimates that can be surfaced through the product API.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5
import hashlib
import json
import sqlite3
import uuid

from dataclasses import asdict


_LEDGER_SCHEMA = """
CREATE TABLE IF NOT EXISTS usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    tenant_id TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    session_id TEXT,
    actor_id TEXT,
    started_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    tool_calls INTEGER NOT NULL DEFAULT 0,
    model_calls INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    browser_minutes REAL NOT NULL DEFAULT 0.0,
    billing_units REAL NOT NULL DEFAULT 0.0,
    cost_usd REAL NOT NULL DEFAULT 0.0,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_tenant_started
    ON usage_events(tenant_id, started_at);
CREATE INDEX IF NOT EXISTS idx_usage_workflow_started
    ON usage_events(workflow_id, started_at);
CREATE INDEX IF NOT EXISTS idx_usage_run
    ON usage_events(run_id);
"""


_USAGE_NAMESPACE = UUID("7f9b5f5e-5dcb-4f7d-bd3c-4f1e7ed3ffb7")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_dict(value: dict[str, Any] | None) -> dict[str, Any]:
    return dict(value or {})


def _canonical_json(value: dict[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":"))


@dataclass(frozen=True)
class UsageEventInput:
    """Input payload for recording a usage event."""

    tenant_id: str
    workflow_id: str
    run_id: str
    actor_id: str
    session_id: str | None = None
    started_at: datetime | None = None
    duration_ms: int = 0
    tool_calls: int = 0
    model_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    browser_minutes: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)
    idempotency_key: str | None = None


@dataclass(frozen=True)
class UsageEvent:
    """Stored usage event row as a typed dataclass."""

    event_id: str
    tenant_id: str
    workflow_id: str
    run_id: str
    actor_id: str
    session_id: str | None
    started_at: datetime
    duration_ms: int
    tool_calls: int
    model_calls: int
    input_tokens: int
    output_tokens: int
    browser_minutes: float
    billing_units: float
    cost_usd: float
    metadata: dict[str, Any]
    created_at: datetime

    @property
    def dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["started_at"] = self.started_at.isoformat()
        payload["created_at"] = self.created_at.isoformat()
        return payload


@dataclass(frozen=True)
class UsageBillingLine:
    """Aggregated billing bucket for a single workflow."""

    workflow_id: str
    total_events: int
    total_cost_usd: float
    total_billing_units: float
    total_duration_ms: int
    total_tool_calls: int
    total_model_calls: int


@dataclass(frozen=True)
class BillingInvoice:
    """Billing summary for one tenant over a date range."""

    tenant_id: str
    since_iso: str | None
    until_iso: str | None
    total_events: int
    total_cost_usd: float
    total_billing_units: float
    lines: list[UsageBillingLine] = field(default_factory=list)

    @property
    def invoice_id(self) -> str:
        """Deterministic invoice ID based on tenant and date range."""
        return str(uuid5(_USAGE_NAMESPACE, f"invoice:{self.tenant_id}:{self.since_iso}:{self.until_iso}"))


@dataclass(frozen=True)
class UsageRates:
    """Simple token/tool/time based unit-rate table."""

    run_unit: float = 0.02
    tool_call: float = 0.0015
    model_call: float = 0.0025
    input_token: float = 0.000002
    output_token: float = 0.000004
    browser_minute: float = 0.003


def _compute_cost(event: UsageEventInput, rates: UsageRates) -> tuple[float, float]:
    billing_units = (
        rates.run_unit
        + (event.tool_calls * rates.tool_call)
        + (event.model_calls * rates.model_call)
        + (event.input_tokens * rates.input_token)
        + (event.output_tokens * rates.output_token)
        + (event.browser_minutes * rates.browser_minute)
    )
    # The cost model is the same as billing units in this lightweight version
    # to keep predictable, easy-to-audit pricing for product experiments.
    return billing_units, round(billing_units, 6)


def _event_id(event: UsageEventInput) -> str:
    if event.idempotency_key:
        base = f"metering-idempotency:{event.idempotency_key}"
    else:
        canonical = {
            "tenant_id": event.tenant_id,
            "workflow_id": event.workflow_id,
            "run_id": event.run_id,
            "actor_id": event.actor_id,
            "session_id": event.session_id,
            "started_at": (event.started_at or _utc_now()).replace(microsecond=0).isoformat(),
            "duration_ms": event.duration_ms,
            "tool_calls": event.tool_calls,
            "model_calls": event.model_calls,
            "input_tokens": event.input_tokens,
            "output_tokens": event.output_tokens,
            "browser_minutes": round(event.browser_minutes, 6),
            "metadata": _canonical_json(_normalize_dict(event.metadata)),
        }
        base = _canonical_json(canonical)
    return str(uuid5(_USAGE_NAMESPACE, base))


class UsageMeteringLedger:
    """SQLite-backed usage ledger with deterministic IDs and simple billing math."""

    def __init__(
        self,
        db_path: str | Path = "amc_product_metering.db",
        rates: UsageRates | None = None,
    ) -> None:
        self.db_path = Path(db_path)
        self.rates = rates or UsageRates()
        self._bootstrap()

    def _bootstrap(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript(_LEDGER_SCHEMA)
            conn.commit()

    def record_event(self, event: UsageEventInput) -> UsageEvent:
        payload = _normalize_dict(event.metadata)
        started_at = (event.started_at or _utc_now()).astimezone(timezone.utc)
        deterministic_id = _event_id(
            UsageEventInput(
                tenant_id=event.tenant_id,
                workflow_id=event.workflow_id,
                run_id=event.run_id,
                actor_id=event.actor_id,
                session_id=event.session_id,
                started_at=started_at,
                duration_ms=event.duration_ms,
                tool_calls=event.tool_calls,
                model_calls=event.model_calls,
                input_tokens=event.input_tokens,
                output_tokens=event.output_tokens,
                browser_minutes=event.browser_minutes,
                metadata=payload,
                idempotency_key=event.idempotency_key,
            )
        )

        billing_units, cost_usd = _compute_cost(event, self.rates)
        created_at = _utc_now()

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO usage_events (
                    event_id, tenant_id, workflow_id, run_id, session_id, actor_id,
                    started_at, duration_ms, tool_calls, model_calls, input_tokens,
                    output_tokens, browser_minutes, billing_units, cost_usd,
                    metadata_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    deterministic_id,
                    event.tenant_id,
                    event.workflow_id,
                    event.run_id,
                    event.session_id,
                    event.actor_id,
                    started_at.isoformat(),
                    max(0, int(event.duration_ms)),
                    max(0, int(event.tool_calls)),
                    max(0, int(event.model_calls)),
                    max(0, int(event.input_tokens)),
                    max(0, int(event.output_tokens)),
                    round(max(0.0, float(event.browser_minutes)), 6),
                    billing_units,
                    cost_usd,
                    _canonical_json(payload),
                    created_at.isoformat(),
                ),
            )
            # If a duplicate came in via the same deterministic id, fetch existing row.
            cur = conn.execute(
                "SELECT event_id, tenant_id, workflow_id, run_id, session_id, actor_id,\n"
                "       started_at, duration_ms, tool_calls, model_calls, input_tokens,\n"
                "       output_tokens, browser_minutes, billing_units, cost_usd,\n"
                "       metadata_json, created_at\n"
                "FROM usage_events WHERE event_id = ?",
                (deterministic_id,),
            )
            row = cur.fetchone()
            conn.commit()

        return self._row_to_event(row)

    def query_events(
        self,
        *,
        tenant_id: str | None = None,
        workflow_id: str | None = None,
        run_id: str | None = None,
        session_id: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: int = 100,
    ) -> list[UsageEvent]:
        clauses = ["1=1"]
        params: list[Any] = []

        if tenant_id:
            clauses.append("tenant_id = ?")
            params.append(tenant_id)
        if workflow_id:
            clauses.append("workflow_id = ?")
            params.append(workflow_id)
        if run_id:
            clauses.append("run_id = ?")
            params.append(run_id)
        if session_id:
            clauses.append("session_id = ?")
            params.append(session_id)
        if since:
            clauses.append("started_at >= ?")
            params.append(since.astimezone(timezone.utc).isoformat())
        if until:
            clauses.append("started_at <= ?")
            params.append(until.astimezone(timezone.utc).isoformat())

        params.append(max(1, min(limit, 5000)))

        query = f"""
            SELECT event_id, tenant_id, workflow_id, run_id, session_id, actor_id,
                   started_at, duration_ms, tool_calls, model_calls, input_tokens,
                   output_tokens, browser_minutes, billing_units, cost_usd,
                   metadata_json, created_at
            FROM usage_events
            WHERE {' AND '.join(clauses)}
            ORDER BY started_at DESC
            LIMIT ?
        """

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute(query, params)
            rows = cur.fetchall()

        return [self._row_to_event(row) for row in rows]

    def generate_invoice(
        self,
        tenant_id: str,
        since: datetime | None = None,
        until: datetime | None = None,
    ) -> BillingInvoice:
        events = self.query_events(tenant_id=tenant_id, since=since, until=until, limit=5000)

        by_workflow: dict[str, UsageBillingLine] = {}
        for event in events:
            acc = by_workflow.get(
                event.workflow_id,
                UsageBillingLine(
                    workflow_id=event.workflow_id,
                    total_events=0,
                    total_cost_usd=0.0,
                    total_billing_units=0.0,
                    total_duration_ms=0,
                    total_tool_calls=0,
                    total_model_calls=0,
                ),
            )

            by_workflow[event.workflow_id] = UsageBillingLine(
                workflow_id=event.workflow_id,
                total_events=acc.total_events + 1,
                total_cost_usd=round(acc.total_cost_usd + event.cost_usd, 6),
                total_billing_units=round(acc.total_billing_units + event.billing_units, 6),
                total_duration_ms=acc.total_duration_ms + event.duration_ms,
                total_tool_calls=acc.total_tool_calls + event.tool_calls,
                total_model_calls=acc.total_model_calls + event.model_calls,
            )

        total_cost = round(sum(line.total_cost_usd for line in by_workflow.values()), 6)
        total_units = round(sum(line.total_billing_units for line in by_workflow.values()), 6)
        lines = sorted(
            by_workflow.values(),
            key=lambda x: x.total_cost_usd,
            reverse=True,
        )

        return BillingInvoice(
            tenant_id=tenant_id,
            since_iso=since.isoformat() if since else None,
            until_iso=until.isoformat() if until else None,
            total_events=len(events),
            total_cost_usd=total_cost,
            total_billing_units=total_units,
            lines=lines,
        )

    def _row_to_event(self, row: sqlite3.Row | None | tuple[Any, ...]) -> UsageEvent:
        if row is None:
            raise ValueError("Usage event not found")

        if not isinstance(row, sqlite3.Row):
            payload = row
        else:
            payload = row

        return UsageEvent(
            event_id=payload[0],
            tenant_id=payload[1],
            workflow_id=payload[2],
            run_id=payload[3],
            session_id=payload[4],
            actor_id=payload[5],
            started_at=datetime.fromisoformat(payload[6]),
            duration_ms=payload[7],
            tool_calls=payload[8],
            model_calls=payload[9],
            input_tokens=payload[10],
            output_tokens=payload[11],
            browser_minutes=payload[12],
            billing_units=payload[13],
            cost_usd=payload[14],
            metadata=json.loads(payload[15]),
            created_at=datetime.fromisoformat(payload[16]),
        )


def make_deterministic_event_id(event: UsageEventInput) -> str:
    """Public helper for deterministic metering IDs."""
    return _event_id(event)


def hash_payload_for_audit(payload: dict[str, Any]) -> str:
    canonical = _canonical_json(_normalize_dict(payload)).encode()
    return hashlib.sha256(canonical).hexdigest()


# A tiny process singleton for direct API use.
_global_metering_ledger: UsageMeteringLedger | None = None


def get_metering_ledger(db_path: str | Path = "amc_product_metering.db") -> UsageMeteringLedger:
    global _global_metering_ledger
    if _global_metering_ledger is None or str(_global_metering_ledger.db_path) != str(db_path):
        _global_metering_ledger = UsageMeteringLedger(db_path=db_path)
    return _global_metering_ledger
