"""Human escalation routing queue for orchestration touchpoints.

The escalation module models lightweight human handoff cases and simple
routing rules based on case metadata. Tickets keep a small immutable handoff
history used to audit cross-team transitions.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from amc.product.persistence import product_db_path


TicketSeverity = Literal["low", "medium", "high", "critical"]
TicketState = Literal["open", "in_progress", "handoff", "resolved", "closed"]


class HandoffRecord(BaseModel):
    """An immutable handoff event between teams."""

    occurred_at: datetime
    from_team: str
    to_team: str
    reason: str


class EscalationTicket(BaseModel):
    """Single escalated item waiting for human handling."""

    id: str
    source: str
    summary: str
    severity: TicketSeverity
    category: str
    state: TicketState = "open"
    route_team: str
    assigned_to: str | None = None
    created_at: datetime
    updated_at: datetime
    handoff_count: int = 0
    handoffs: list[HandoffRecord] = Field(default_factory=list)


class EscalationQueue:
    """Minimal human escalation queue with handoff support."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = product_db_path(db_path)
        self._tickets: dict[str, EscalationTicket] = {}
        self._seq = 0
        self._lock = threading.Lock()

        db_path_str = str(self._db_path)
        if db_path_str != ":memory:":
            self._db_path.parent.mkdir(parents=True, exist_ok=True)

        self._conn = sqlite3.connect(db_path_str, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._conn:
            self._migrate_schema()
        self._reload_from_db()

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    def _migrate_schema(self) -> None:
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS escalation_tickets (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                summary TEXT NOT NULL,
                severity TEXT NOT NULL,
                category TEXT NOT NULL,
                state TEXT NOT NULL,
                route_team TEXT NOT NULL,
                assigned_to TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                handoff_count INTEGER NOT NULL DEFAULT 0,
                handoffs_json TEXT NOT NULL DEFAULT '[]',
                updated_ts TEXT NOT NULL
            )
            """
        )
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_escalation_tickets_state ON escalation_tickets (state)"
        )
        self._conn.commit()

    def _reload_from_db(self) -> None:
        self._tickets.clear()
        rows = self._conn.execute(
            """
            SELECT id, source, summary, severity, category, state, route_team,
                   assigned_to, created_at, updated_at, handoff_count, handoffs_json
            FROM escalation_tickets
            ORDER BY created_at, id
            """
        ).fetchall()

        max_seq = 0
        for row in rows:
            ticket = EscalationTicket(
                id=row["id"],
                source=row["source"],
                summary=row["summary"],
                severity=row["severity"],
                category=row["category"],
                state=row["state"],
                route_team=row["route_team"],
                assigned_to=row["assigned_to"],
                created_at=datetime.fromisoformat(row["created_at"]),
                updated_at=datetime.fromisoformat(row["updated_at"]),
                handoff_count=row["handoff_count"],
                handoffs=[
                    HandoffRecord(
                        occurred_at=datetime.fromisoformat(item["occurred_at"]),
                        from_team=item["from_team"],
                        to_team=item["to_team"],
                        reason=item["reason"],
                    )
                    for item in json.loads(row["handoffs_json"])
                ],
            )
            self._tickets[ticket.id] = ticket

            if ticket.id.startswith("esc-"):
                try:
                    seq = int(ticket.id[4:])
                    max_seq = max(max_seq, seq)
                except ValueError:
                    continue
        self._seq = max_seq

    @staticmethod
    def _serialize_ticket(ticket: EscalationTicket) -> tuple[Any, ...]:
        return (
            ticket.id,
            ticket.source,
            ticket.summary,
            ticket.severity,
            ticket.category,
            ticket.state,
            ticket.route_team,
            ticket.assigned_to,
            ticket.created_at.isoformat(),
            ticket.updated_at.isoformat(),
            ticket.handoff_count,
            json.dumps(
                [
                    {
                        "occurred_at": handoff.occurred_at.isoformat(),
                        "from_team": handoff.from_team,
                        "to_team": handoff.to_team,
                        "reason": handoff.reason,
                    }
                    for handoff in ticket.handoffs
                ],
                sort_keys=True,
                separators=(",", ":"),
            ),
            ticket.updated_at.isoformat(),
        )

    def _persist_ticket(self, ticket: EscalationTicket) -> None:
        self._conn.execute(
            """
            INSERT INTO escalation_tickets (
                id, source, summary, severity, category, state, route_team,
                assigned_to, created_at, updated_at, handoff_count, handoffs_json, updated_ts
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                source = excluded.source,
                summary = excluded.summary,
                severity = excluded.severity,
                category = excluded.category,
                state = excluded.state,
                route_team = excluded.route_team,
                assigned_to = excluded.assigned_to,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                handoff_count = excluded.handoff_count,
                handoffs_json = excluded.handoffs_json,
                updated_ts = excluded.updated_ts
            """,
            self._serialize_ticket(ticket),
        )
        self._conn.commit()

    def _route_team(self, *, category: str, severity: TicketSeverity) -> str:
        if severity == "critical":
            return "incident-response"

        normalized = (category or "").strip().lower()
        if normalized == "security":
            return "security"
        if normalized in {"billing", "finance"}:
            return "finance"
        if normalized in {"legal", "compliance"}:
            return "legal"
        if severity == "high":
            return "operations"
        return "customer-support"

    def _new_id(self) -> str:
        self._seq += 1
        return f"esc-{self._seq:04d}"

    def submit(
        self,
        *,
        source: str,
        summary: str,
        category: str,
        severity: TicketSeverity = "medium",
    ) -> EscalationTicket:
        with self._lock:
            now = self._now()
            route_team = self._route_team(category=category, severity=severity)
            ticket = EscalationTicket(
                id=self._new_id(),
                source=source,
                summary=summary,
                severity=severity,
                category=category,
                route_team=route_team,
                created_at=now,
                updated_at=now,
            )
            self._tickets[ticket.id] = ticket
            self._persist_ticket(ticket)
            return ticket

    def list_tickets(self, state: TicketState | None = None) -> list[EscalationTicket]:
        tickets = list(self._tickets.values())
        if state is not None:
            tickets = [t for t in tickets if t.state == state]
        return sorted(tickets, key=lambda t: (t.created_at, t.id))

    def get(self, ticket_id: str) -> EscalationTicket | None:
        return self._tickets.get(ticket_id)

    def claim(self, ticket_id: str, *, agent: str) -> EscalationTicket:
        with self._lock:
            ticket = self._tickets.get(ticket_id)
            if ticket is None:
                raise KeyError("ticket not found")

            if ticket.state not in {"open", "handoff"}:
                raise ValueError("ticket is not available for claim")

            ticket.state = "in_progress"
            ticket.assigned_to = agent
            ticket.updated_at = self._now()
            self._persist_ticket(ticket)
            return ticket

    def handoff(
        self,
        ticket_id: str,
        *,
        to_team: str,
        reason: str,
        from_team: str | None = None,
    ) -> EscalationTicket:
        with self._lock:
            ticket = self._tickets.get(ticket_id)
            if ticket is None:
                raise KeyError("ticket not found")

            current_team = from_team or ticket.route_team
            if current_team != ticket.route_team:
                raise ValueError("ticket is no longer assigned to the requested team")

            ticket.handoffs.append(
                HandoffRecord(
                    occurred_at=self._now(),
                    from_team=ticket.route_team,
                    to_team=to_team,
                    reason=reason,
                )
            )
            ticket.route_team = to_team
            ticket.assigned_to = None
            ticket.handoff_count += 1
            ticket.state = "handoff"
            ticket.updated_at = self._now()
            self._persist_ticket(ticket)
            return ticket

    def resolve(self, ticket_id: str) -> EscalationTicket:
        with self._lock:
            ticket = self._tickets.get(ticket_id)
            if ticket is None:
                raise KeyError("ticket not found")

            ticket.state = "resolved"
            ticket.assigned_to = None
            ticket.updated_at = self._now()
            self._persist_ticket(ticket)
            return ticket

    def clear(self) -> None:
        with self._lock:
            self._tickets.clear()
            self._conn.execute("DELETE FROM escalation_tickets")
            self._conn.commit()
            self._seq = 0


class EscalationSummary(BaseModel):
    total: int
    open: int
    in_progress: int
    handoff: int
    resolved: int
    closed: int
    handoff_total: int


# Singleton used by API routes.
_QUEUE = EscalationQueue()


def get_queue() -> EscalationQueue:
    return _QUEUE


def reset_queue() -> None:
    _QUEUE.clear()


def route_ticket(category: str, severity: TicketSeverity) -> str:
    """Pure routing helper for tests and API-level rule checks."""
    return _QUEUE._route_team(category=category, severity=severity)


def escalation_summary(queue: EscalationQueue | None = None) -> EscalationSummary:
    q = queue or _QUEUE
    states = {"open": 0, "in_progress": 0, "handoff": 0, "resolved": 0, "closed": 0}
    handoff_total = 0

    for ticket in q.list_tickets():
        states[ticket.state] += 1
        handoff_total += ticket.handoff_count

    return EscalationSummary(
        total=sum(states.values()),
        open=states["open"],
        in_progress=states["in_progress"],
        handoff=states["handoff"],
        resolved=states["resolved"],
        closed=states["closed"],
        handoff_total=handoff_total,
    )
