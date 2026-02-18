"""AMC Product — Event Router for Webhooks / Email / DB Triggers.

EventRouter, route rules, context enrichment, delivery log.
SQLite-backed.

API: /api/v1/product/events/*
"""

from __future__ import annotations

import json
import sqlite3
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import NAMESPACE_URL, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)


def _ev(e: Any) -> str:
    """Return the string value of an enum member (compatible with all Python versions)."""
    return e.value if hasattr(e, "value") else str(e)

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS event_routes (
    route_id            TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    event_type          TEXT NOT NULL,
    source_filter_json  TEXT,
    target_type         TEXT NOT NULL,
    target_config_json  TEXT,
    enrichment_json     TEXT,
    enabled             INTEGER NOT NULL DEFAULT 1,
    priority            INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_log (
    log_id          TEXT PRIMARY KEY,
    route_id        TEXT,
    event_type      TEXT NOT NULL,
    source          TEXT,
    payload_json    TEXT,
    enriched_json   TEXT,
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    error           TEXT,
    delivered_at    TEXT,
    created_at      TEXT NOT NULL,
    FOREIGN KEY (route_id) REFERENCES event_routes(route_id)
);

CREATE INDEX IF NOT EXISTS idx_event_routes_event_type ON event_routes(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_route_id ON event_log(route_id);
CREATE INDEX IF NOT EXISTS idx_event_log_status ON event_log(delivery_status);
"""

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class EventType(str, Enum):
    webhook = "webhook"
    email = "email"
    db_trigger = "db_trigger"
    schedule = "schedule"
    manual = "manual"


class TargetType(str, Enum):
    webhook = "webhook"
    email = "email"
    queue = "queue"
    function = "function"
    log = "log"


class DeliveryStatus(str, Enum):
    pending = "pending"
    delivered = "delivered"
    failed = "failed"
    skipped = "skipped"


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class RouteRule:
    route_id: str
    name: str
    event_type: EventType
    source_filter: dict[str, Any]
    target_type: TargetType
    target_config: dict[str, Any]
    enrichment: dict[str, Any]
    enabled: bool
    priority: int
    created_at: str = ""
    updated_at: str = ""

    def dict(self) -> dict[str, Any]:
        return {
            "route_id": self.route_id,
            "name": self.name,
            "event_type": self.event_type,
            "source_filter": self.source_filter,
            "target_type": self.target_type,
            "target_config": self.target_config,
            "enrichment": self.enrichment,
            "enabled": self.enabled,
            "priority": self.priority,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class EventPayload:
    event_type: EventType
    source: str
    data: dict[str, Any]

    def dict(self) -> dict[str, Any]:
        return {
            "event_type": self.event_type,
            "source": self.source,
            "data": self.data,
        }


@dataclass
class DeliveryRecord:
    log_id: str
    route_id: str | None
    event_type: EventType
    source: str | None
    payload_json: str | None
    enriched_json: str | None
    delivery_status: DeliveryStatus
    error: str | None
    delivered_at: str | None
    created_at: str

    def dict(self) -> dict[str, Any]:
        return {
            "log_id": self.log_id,
            "route_id": self.route_id,
            "event_type": self.event_type,
            "source": self.source,
            "payload_json": self.payload_json,
            "enriched_json": self.enriched_json,
            "delivery_status": self.delivery_status,
            "error": self.error,
            "delivered_at": self.delivered_at,
            "created_at": self.created_at,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_route_id(name: str, event_type: str, created_at: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"route:{name}:{event_type}:{created_at}"))


def _make_log_id(route_id: str | None, event_type: str, created_at: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"event_log:{route_id}:{event_type}:{created_at}"))


def _row_to_route(row: sqlite3.Row) -> RouteRule:
    return RouteRule(
        route_id=row["route_id"],
        name=row["name"],
        event_type=EventType(row["event_type"]),
        source_filter=json.loads(row["source_filter_json"]) if row["source_filter_json"] else {},
        target_type=TargetType(row["target_type"]),
        target_config=json.loads(row["target_config_json"]) if row["target_config_json"] else {},
        enrichment=json.loads(row["enrichment_json"]) if row["enrichment_json"] else {},
        enabled=bool(row["enabled"]),
        priority=row["priority"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_delivery(row: sqlite3.Row) -> DeliveryRecord:
    return DeliveryRecord(
        log_id=row["log_id"],
        route_id=row["route_id"],
        event_type=EventType(row["event_type"]),
        source=row["source"],
        payload_json=row["payload_json"],
        enriched_json=row["enriched_json"],
        delivery_status=DeliveryStatus(row["delivery_status"]),
        error=row["error"],
        delivered_at=row["delivered_at"],
        created_at=row["created_at"],
    )


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------


class EventRouter:
    """Event router: matches events to route rules and logs delivery."""

    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self) -> None:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                conn.executescript(_SCHEMA)
                conn.commit()
            finally:
                conn.close()
        log.info("event_router.db_init", db_path=self._db_path)

    # ------------------------------------------------------------------
    # Route CRUD
    # ------------------------------------------------------------------

    def create_route(
        self,
        name: str,
        event_type: EventType | str,
        source_filter: dict[str, Any] | None = None,
        target_type: TargetType | str = TargetType.log,
        target_config: dict[str, Any] | None = None,
        enrichment: dict[str, Any] | None = None,
        priority: int = 0,
    ) -> RouteRule:
        now = _now()
        route_id = _make_route_id(name, str(event_type), now)
        source_filter = source_filter or {}
        target_config = target_config or {}
        enrichment = enrichment or {}

        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute(
                    """
                    INSERT INTO event_routes
                      (route_id, name, event_type, source_filter_json, target_type,
                       target_config_json, enrichment_json, enabled, priority,
                       created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
                    """,
                    (
                        route_id,
                        name,
                        _ev(event_type),
                        json.dumps(source_filter),
                        _ev(target_type),
                        json.dumps(target_config),
                        json.dumps(enrichment),
                        priority,
                        now,
                        now,
                    ),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM event_routes WHERE route_id = ?", (route_id,)
                ).fetchone()
            finally:
                conn.close()

        record = _row_to_route(row)
        log.info("route.created", route_id=route_id, name=name, event_type=_ev(event_type))
        return record

    def get_route(self, route_id: str) -> RouteRule | None:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                row = conn.execute(
                    "SELECT * FROM event_routes WHERE route_id = ?", (route_id,)
                ).fetchone()
            finally:
                conn.close()
        return _row_to_route(row) if row else None

    def list_routes(
        self,
        event_type: EventType | str | None = None,
        enabled: bool | None = None,
    ) -> list[RouteRule]:
        clauses: list[str] = []
        params: list[Any] = []

        if event_type is not None:
            clauses.append("event_type = ?")
            params.append(_ev(event_type))
        if enabled is not None:
            clauses.append("enabled = ?")
            params.append(1 if enabled else 0)

        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        sql = f"SELECT * FROM event_routes {where} ORDER BY priority DESC, created_at ASC"

        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(sql, params).fetchall()
            finally:
                conn.close()
        return [_row_to_route(r) for r in rows]

    def update_route(self, route_id: str, **kwargs: Any) -> RouteRule:
        now = _now()
        allowed = {
            "name", "event_type", "source_filter", "target_type",
            "target_config", "enrichment", "enabled", "priority",
        }
        col_map = {
            "source_filter": "source_filter_json",
            "target_config": "target_config_json",
            "enrichment": "enrichment_json",
        }
        json_fields = {"source_filter", "target_config", "enrichment"}

        sets: list[str] = ["updated_at = ?"]
        params: list[Any] = [now]

        for key, val in kwargs.items():
            if key not in allowed:
                continue
            col = col_map.get(key, key)
            if key in json_fields:
                val = json.dumps(val)
            if key == "enabled":
                val = 1 if val else 0
            sets.append(f"{col} = ?")
            params.append(val)

        params.append(route_id)
        sql = f"UPDATE event_routes SET {', '.join(sets)} WHERE route_id = ?"

        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                conn.execute(sql, params)
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM event_routes WHERE route_id = ?", (route_id,)
                ).fetchone()
            finally:
                conn.close()

        if row is None:
            raise ValueError(f"Route not found: {route_id}")
        record = _row_to_route(row)
        log.info("route.updated", route_id=route_id, fields=list(kwargs.keys()))
        return record

    def delete_route(self, route_id: str) -> bool:
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                cursor = conn.execute(
                    "DELETE FROM event_routes WHERE route_id = ?", (route_id,)
                )
                conn.commit()
                deleted = cursor.rowcount > 0
            finally:
                conn.close()
        log.info("route.deleted", route_id=route_id, deleted=deleted)
        return deleted

    # ------------------------------------------------------------------
    # Routing / Delivery
    # ------------------------------------------------------------------

    def _match_routes(self, event: EventPayload) -> list[RouteRule]:
        """Return enabled routes matching this event's type and source filter."""
        routes = self.list_routes(event_type=event.event_type, enabled=True)
        matched: list[RouteRule] = []
        for route in routes:
            sf = route.source_filter
            if sf:
                # Simple key-value filter against event.source or event.data
                ok = all(
                    str(event.data.get(k)) == str(v) or str(event.source) == str(v)
                    for k, v in sf.items()
                )
                if not ok:
                    continue
            matched.append(route)
        return sorted(matched, key=lambda r: -r.priority)

    def enrich_context(
        self,
        payload: EventPayload,
        enrichment_rules: dict[str, Any],
    ) -> dict[str, Any]:
        """Merge enrichment_rules into payload data, returning enriched dict."""
        enriched = dict(payload.data)
        enriched.update(enrichment_rules)
        enriched["__event_type"] = payload.event_type
        enriched["__source"] = payload.source
        return enriched

    def route_event(self, event: EventPayload) -> list[DeliveryRecord]:
        """Match event to routes, enrich, and log delivery."""
        routes = self._match_routes(event)
        records: list[DeliveryRecord] = []

        if not routes:
            # Log as skipped
            now = _now()
            log_id = _make_log_id(None, str(event.event_type), now)
            with self._lock:
                conn = sqlite3.connect(self._db_path)
                conn.row_factory = sqlite3.Row
                try:
                    conn.execute(
                        """
                        INSERT INTO event_log
                          (log_id, route_id, event_type, source, payload_json,
                           enriched_json, delivery_status, error, delivered_at, created_at)
                        VALUES (?, NULL, ?, ?, ?, NULL, ?, NULL, NULL, ?)
                        """,
                        (
                            log_id,
                            _ev(event.event_type),
                            event.source,
                            json.dumps(event.data),
                            _ev(DeliveryStatus.skipped),
                            now,
                        ),
                    )
                    conn.commit()
                    row = conn.execute(
                        "SELECT * FROM event_log WHERE log_id = ?", (log_id,)
                    ).fetchone()
                finally:
                    conn.close()
            records.append(_row_to_delivery(row))
            log.info("event.no_routes", event_type=event.event_type, source=event.source)
            return records

        for route in routes:
            now = _now()
            log_id = _make_log_id(route.route_id, str(event.event_type), now)
            enriched = self.enrich_context(event, route.enrichment)

            # Simulate delivery — real impl would call webhook/email/queue/etc.
            try:
                status = DeliveryStatus.delivered
                delivered_at: str | None = now
                error: str | None = None
                log.info(
                    "event.delivered",
                    route_id=route.route_id,
                    target_type=route.target_type,
                    event_type=event.event_type,
                )
            except Exception as exc:
                status = DeliveryStatus.failed
                delivered_at = None
                error = str(exc)
                log.warning("event.delivery_failed", route_id=route.route_id, error=error)

            with self._lock:
                conn = sqlite3.connect(self._db_path)
                conn.row_factory = sqlite3.Row
                try:
                    conn.execute(
                        """
                        INSERT INTO event_log
                          (log_id, route_id, event_type, source, payload_json,
                           enriched_json, delivery_status, error, delivered_at, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            log_id,
                            route.route_id,
                            _ev(event.event_type),
                            event.source,
                            json.dumps(event.data),
                            json.dumps(enriched),
                            _ev(status),
                            error,
                            delivered_at,
                            now,
                        ),
                    )
                    conn.commit()
                    row = conn.execute(
                        "SELECT * FROM event_log WHERE log_id = ?", (log_id,)
                    ).fetchone()
                finally:
                    conn.close()

            records.append(_row_to_delivery(row))

        return records

    def get_delivery_log(
        self,
        route_id: str | None = None,
        status: DeliveryStatus | str | None = None,
        limit: int = 50,
    ) -> list[DeliveryRecord]:
        clauses: list[str] = []
        params: list[Any] = []

        if route_id is not None:
            clauses.append("route_id = ?")
            params.append(route_id)
        if status is not None:
            clauses.append("delivery_status = ?")
            params.append(_ev(status))

        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        sql = f"SELECT * FROM event_log {where} ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(sql, params).fetchall()
            finally:
                conn.close()
        return [_row_to_delivery(r) for r in rows]

    def retry_delivery(self, log_id: str) -> DeliveryRecord:
        """Re-attempt a failed delivery by route_id lookup."""
        # Fetch original log entry
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            try:
                row = conn.execute(
                    "SELECT * FROM event_log WHERE log_id = ?", (log_id,)
                ).fetchone()
            finally:
                conn.close()

        if row is None:
            raise ValueError(f"Delivery log not found: {log_id}")

        original = _row_to_delivery(row)
        payload_data = json.loads(original.payload_json) if original.payload_json else {}
        event = EventPayload(
            event_type=original.event_type,
            source=original.source or "",
            data=payload_data,
        )

        # Re-route (will create new log entry)
        results = self.route_event(event)
        result = results[0] if results else original

        # Mark original as delivered if retry succeeded
        if result.delivery_status == DeliveryStatus.delivered:
            now = _now()
            with self._lock:
                conn = sqlite3.connect(self._db_path)
                conn.row_factory = sqlite3.Row
                try:
                    conn.execute(
                        "UPDATE event_log SET delivery_status = ?, delivered_at = ? WHERE log_id = ?",
                        (DeliveryStatus.delivered, now, log_id),
                    )
                    conn.commit()
                finally:
                    conn.close()

        log.info("delivery.retried", log_id=log_id, new_status=result.delivery_status)
        return result


# ---------------------------------------------------------------------------
# Singleton / factory
# ---------------------------------------------------------------------------

_router_instance: EventRouter | None = None
_router_lock = threading.Lock()


def _get_router() -> EventRouter:
    global _router_instance
    with _router_lock:
        if _router_instance is None:
            db_path = str(product_db_path())
            _router_instance = EventRouter(db_path)
    return _router_instance


def reset_router(db_path: str) -> EventRouter:
    """Create a fresh router — used in tests for isolation."""
    global _router_instance
    with _router_lock:
        _router_instance = EventRouter(db_path)
    return _router_instance
