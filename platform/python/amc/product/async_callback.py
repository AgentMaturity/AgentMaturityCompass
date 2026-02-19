from __future__ import annotations

import json
import re
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.product.persistence import product_db_path

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class CallbackTrigger(str, Enum):
    WORKFLOW_COMPLETE = "workflow_complete"
    WORKFLOW_FAILED = "workflow_failed"
    STEP_COMPLETE = "step_complete"
    APPROVAL_REQUIRED = "approval_required"
    ERROR = "error"
    CUSTOM = "custom"


class CallbackStatus(str, Enum):
    PENDING = "pending"
    DELIVERING = "delivering"
    DELIVERED = "delivered"
    FAILED = "failed"
    RETRYING = "retrying"
    EXHAUSTED = "exhausted"


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------


class CallbackRegistration(BaseModel):
    callback_id: str
    name: str
    trigger: str  # CallbackTrigger value or custom string
    target_url: str  # HTTP endpoint to POST to
    headers: dict[str, str]
    payload_template: dict[str, Any]  # template with {{variable}} placeholders
    max_retries: int
    retry_delay_seconds: int
    timeout_seconds: int
    is_active: bool
    created_at: str
    metadata: dict[str, Any]


class CallbackRegisterRequest(BaseModel):
    name: str
    trigger: str = CallbackTrigger.CUSTOM.value
    target_url: str
    headers: dict[str, str] = Field(default_factory=dict)
    payload_template: dict[str, Any] = Field(default_factory=dict)
    max_retries: int = 3
    retry_delay_seconds: int = 30
    timeout_seconds: int = 10
    metadata: dict[str, Any] = Field(default_factory=dict)


class CallbackDelivery(BaseModel):
    delivery_id: str
    callback_id: str
    trigger: str
    status: str  # CallbackStatus value
    attempt_count: int
    max_retries: int
    payload_json: str
    response_status: int | None
    response_body: str
    error_message: str
    next_retry_at: str | None
    delivered_at: str | None
    created_at: str


class TriggerRequest(BaseModel):
    trigger: str
    context: dict[str, Any] = Field(default_factory=dict)
    callback_ids: list[str] = Field(default_factory=list)  # empty = all matching


class TriggerResult(BaseModel):
    triggered_count: int
    delivery_ids: list[str]
    skipped: list[str]


class RetryRequest(BaseModel):
    delivery_id: str


class CallbackStatusSummary(BaseModel):
    total_registrations: int
    active_registrations: int
    total_deliveries: int
    delivered: int
    failed: int
    pending: int
    exhausted: int


# ---------------------------------------------------------------------------
# Core Manager
# ---------------------------------------------------------------------------


class AsyncCallbackManager:
    """SQLite-backed async callback manager.

    Supports registering HTTP callbacks, triggering them on events,
    retrying on failure, and tracking delivery status.
    """

    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()
        logger.info("async_callback_manager.initialized", db_path=db_path)

    # ------------------------------------------------------------------
    # Schema
    # ------------------------------------------------------------------

    def _init_schema(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS callback_registrations (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                callback_id          TEXT UNIQUE NOT NULL,
                name                 TEXT NOT NULL,
                trigger              TEXT NOT NULL,
                target_url           TEXT NOT NULL,
                headers_json         TEXT NOT NULL DEFAULT '{}',
                payload_template_json TEXT NOT NULL DEFAULT '{}',
                max_retries          INTEGER NOT NULL DEFAULT 3,
                retry_delay_seconds  INTEGER NOT NULL DEFAULT 30,
                timeout_seconds      INTEGER NOT NULL DEFAULT 10,
                is_active            INTEGER NOT NULL DEFAULT 1,
                metadata_json        TEXT NOT NULL DEFAULT '{}',
                created_at           TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS callback_deliveries (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                delivery_id     TEXT UNIQUE NOT NULL,
                callback_id     TEXT NOT NULL,
                trigger         TEXT NOT NULL,
                status          TEXT NOT NULL DEFAULT 'pending',
                attempt_count   INTEGER NOT NULL DEFAULT 0,
                max_retries     INTEGER NOT NULL DEFAULT 3,
                payload_json    TEXT NOT NULL DEFAULT '{}',
                response_status INTEGER,
                response_body   TEXT NOT NULL DEFAULT '',
                error_message   TEXT NOT NULL DEFAULT '',
                next_retry_at   TEXT,
                delivered_at    TEXT,
                created_at      TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_cb_reg_trigger
                ON callback_registrations(trigger, is_active);

            CREATE INDEX IF NOT EXISTS idx_cb_del_status
                ON callback_deliveries(status, next_retry_at);

            CREATE INDEX IF NOT EXISTS idx_cb_del_callback_id
                ON callback_deliveries(callback_id);
            """
        )
        self._conn.commit()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _row_to_registration(self, row: sqlite3.Row) -> CallbackRegistration:
        return CallbackRegistration(
            callback_id=row["callback_id"],
            name=row["name"],
            trigger=row["trigger"],
            target_url=row["target_url"],
            headers=json.loads(row["headers_json"]),
            payload_template=json.loads(row["payload_template_json"]),
            max_retries=row["max_retries"],
            retry_delay_seconds=row["retry_delay_seconds"],
            timeout_seconds=row["timeout_seconds"],
            is_active=bool(row["is_active"]),
            created_at=row["created_at"],
            metadata=json.loads(row["metadata_json"]),
        )

    def _row_to_delivery(self, row: sqlite3.Row) -> CallbackDelivery:
        return CallbackDelivery(
            delivery_id=row["delivery_id"],
            callback_id=row["callback_id"],
            trigger=row["trigger"],
            status=row["status"],
            attempt_count=row["attempt_count"],
            max_retries=row["max_retries"],
            payload_json=row["payload_json"],
            response_status=row["response_status"],
            response_body=row["response_body"] or "",
            error_message=row["error_message"] or "",
            next_retry_at=row["next_retry_at"],
            delivered_at=row["delivered_at"],
            created_at=row["created_at"],
        )

    def _new_id(self, prefix: str) -> str:
        import uuid
        return f"{prefix}_{uuid.uuid4().hex[:12]}"

    # ------------------------------------------------------------------
    # Registration CRUD
    # ------------------------------------------------------------------

    def register(self, request: CallbackRegisterRequest) -> CallbackRegistration:
        """Register a new callback endpoint."""
        callback_id = self._new_id("cb")
        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """
            INSERT INTO callback_registrations
                (callback_id, name, trigger, target_url, headers_json,
                 payload_template_json, max_retries, retry_delay_seconds,
                 timeout_seconds, is_active, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                callback_id,
                request.name,
                request.trigger,
                request.target_url,
                json.dumps(request.headers),
                json.dumps(request.payload_template),
                request.max_retries,
                request.retry_delay_seconds,
                request.timeout_seconds,
                json.dumps(request.metadata),
                now,
            ),
        )
        self._conn.commit()
        reg = self.get_registration(callback_id)
        assert reg is not None
        logger.info(
            "callback.registered",
            callback_id=callback_id,
            name=request.name,
            trigger=request.trigger,
        )
        return reg

    def unregister(self, callback_id: str) -> bool:
        """Deactivate (soft-delete) a callback registration."""
        cur = self._conn.execute(
            "UPDATE callback_registrations SET is_active = 0 WHERE callback_id = ?",
            (callback_id,),
        )
        self._conn.commit()
        success = cur.rowcount > 0
        if success:
            logger.info("callback.unregistered", callback_id=callback_id)
        return success

    def get_registration(self, callback_id: str) -> CallbackRegistration | None:
        row = self._conn.execute(
            "SELECT * FROM callback_registrations WHERE callback_id = ?",
            (callback_id,),
        ).fetchone()
        return self._row_to_registration(row) if row else None

    def list_registrations(
        self,
        trigger: str | None = None,
        active_only: bool = True,
    ) -> list[CallbackRegistration]:
        clauses: list[str] = []
        params: list[Any] = []
        if active_only:
            clauses.append("is_active = 1")
        if trigger is not None:
            clauses.append("trigger = ?")
            params.append(trigger)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        rows = self._conn.execute(
            f"SELECT * FROM callback_registrations {where} ORDER BY created_at",
            params,
        ).fetchall()
        return [self._row_to_registration(r) for r in rows]

    # ------------------------------------------------------------------
    # Payload rendering
    # ------------------------------------------------------------------

    def _render_payload(self, template: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        """Replace {{key}} placeholders in all string values of template."""
        rendered: dict[str, Any] = {}
        for k, v in template.items():
            if isinstance(v, str):
                def replacer(m: re.Match) -> str:
                    key = m.group(1).strip()
                    val = context.get(key, m.group(0))
                    return str(val)
                rendered[k] = re.sub(r"\{\{(.+?)\}\}", replacer, v)
            elif isinstance(v, dict):
                rendered[k] = self._render_payload(v, context)
            elif isinstance(v, list):
                rendered[k] = [
                    self._render_payload({"_": item}, context)["_"]
                    if isinstance(item, (dict, str))
                    else item
                    for item in v
                ]
            else:
                rendered[k] = v
        return rendered

    # ------------------------------------------------------------------
    # Triggering
    # ------------------------------------------------------------------

    def trigger(self, request: TriggerRequest) -> TriggerResult:
        """Find matching active registrations, create delivery records, attempt HTTP POSTs."""
        registrations = self.list_registrations(trigger=request.trigger, active_only=True)

        # Filter to specific callback_ids if provided
        if request.callback_ids:
            id_set = set(request.callback_ids)
            selected = [r for r in registrations if r.callback_id in id_set]
            skipped = [r.callback_id for r in registrations if r.callback_id not in id_set]
        else:
            selected = registrations
            skipped = []

        delivery_ids: list[str] = []
        now = datetime.now(timezone.utc).isoformat()

        for reg in selected:
            payload = self._render_payload(reg.payload_template, request.context)
            if not payload:
                # Default minimal payload when template is empty
                payload = {"trigger": request.trigger, "context": request.context}

            delivery_id = self._new_id("dlv")
            self._conn.execute(
                """
                INSERT INTO callback_deliveries
                    (delivery_id, callback_id, trigger, status, attempt_count,
                     max_retries, payload_json, response_status, response_body,
                     error_message, next_retry_at, delivered_at, created_at)
                VALUES (?, ?, ?, 'pending', 0, ?, ?, NULL, '', '', NULL, NULL, ?)
                """,
                (
                    delivery_id,
                    reg.callback_id,
                    request.trigger,
                    reg.max_retries,
                    json.dumps(payload),
                    now,
                ),
            )
            self._conn.commit()
            delivery_ids.append(delivery_id)

            # Attempt delivery immediately
            self._attempt_delivery(delivery_id)

        logger.info(
            "callback.trigger",
            trigger=request.trigger,
            triggered_count=len(delivery_ids),
            skipped_count=len(skipped),
        )
        return TriggerResult(
            triggered_count=len(delivery_ids),
            delivery_ids=delivery_ids,
            skipped=skipped,
        )

    def _attempt_delivery(self, delivery_id: str) -> bool:
        """Perform the actual HTTP POST and update delivery status. Returns True on success."""
        row = self._conn.execute(
            "SELECT * FROM callback_deliveries WHERE delivery_id = ?",
            (delivery_id,),
        ).fetchone()
        if not row:
            logger.warning("callback.delivery_not_found", delivery_id=delivery_id)
            return False

        delivery = self._row_to_delivery(row)
        reg = self.get_registration(delivery.callback_id)
        if not reg:
            logger.warning(
                "callback.registration_not_found",
                callback_id=delivery.callback_id,
                delivery_id=delivery_id,
            )
            return False

        # Mark as delivering
        attempt_count = delivery.attempt_count + 1
        self._conn.execute(
            "UPDATE callback_deliveries SET status = 'delivering', attempt_count = ? WHERE delivery_id = ?",
            (attempt_count, delivery_id),
        )
        self._conn.commit()

        payload_bytes = delivery.payload_json.encode("utf-8")
        headers = {"Content-Type": "application/json", **reg.headers}
        req = urllib.request.Request(
            url=reg.target_url,
            data=payload_bytes,
            headers=headers,
            method="POST",
        )

        response_status: int | None = None
        response_body = ""
        error_message = ""
        success = False

        try:
            with urllib.request.urlopen(req, timeout=reg.timeout_seconds) as resp:
                response_status = resp.status
                response_body = resp.read(4096).decode("utf-8", errors="replace")
                success = 200 <= response_status < 300
        except urllib.error.HTTPError as exc:
            response_status = exc.code
            try:
                response_body = exc.read(4096).decode("utf-8", errors="replace")
            except Exception:
                response_body = ""
            error_message = str(exc)
        except Exception as exc:
            error_message = str(exc)

        now = datetime.now(timezone.utc)

        if success:
            self._conn.execute(
                """
                UPDATE callback_deliveries
                SET status = 'delivered',
                    response_status = ?,
                    response_body = ?,
                    error_message = '',
                    delivered_at = ?,
                    next_retry_at = NULL
                WHERE delivery_id = ?
                """,
                (response_status, response_body, now.isoformat(), delivery_id),
            )
            logger.info(
                "callback.delivered",
                delivery_id=delivery_id,
                callback_id=delivery.callback_id,
                attempt=attempt_count,
                status=response_status,
            )
        else:
            if attempt_count >= reg.max_retries:
                new_status = CallbackStatus.EXHAUSTED.value
                next_retry_at = None
            else:
                new_status = CallbackStatus.RETRYING.value
                next_retry_at = (
                    now + timedelta(seconds=reg.retry_delay_seconds)
                ).isoformat()

            self._conn.execute(
                """
                UPDATE callback_deliveries
                SET status = ?,
                    response_status = ?,
                    response_body = ?,
                    error_message = ?,
                    next_retry_at = ?
                WHERE delivery_id = ?
                """,
                (
                    new_status,
                    response_status,
                    response_body,
                    error_message,
                    next_retry_at,
                    delivery_id,
                ),
            )
            logger.warning(
                "callback.delivery_failed",
                delivery_id=delivery_id,
                callback_id=delivery.callback_id,
                attempt=attempt_count,
                status=new_status,
                error=error_message,
            )

        self._conn.commit()
        return success

    # ------------------------------------------------------------------
    # Delivery management
    # ------------------------------------------------------------------

    def get_delivery(self, delivery_id: str) -> CallbackDelivery | None:
        row = self._conn.execute(
            "SELECT * FROM callback_deliveries WHERE delivery_id = ?",
            (delivery_id,),
        ).fetchone()
        return self._row_to_delivery(row) if row else None

    def list_deliveries(
        self,
        callback_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[CallbackDelivery]:
        clauses: list[str] = []
        params: list[Any] = []
        if callback_id is not None:
            clauses.append("callback_id = ?")
            params.append(callback_id)
        if status is not None:
            clauses.append("status = ?")
            params.append(status)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        params.append(limit)
        rows = self._conn.execute(
            f"SELECT * FROM callback_deliveries {where} ORDER BY created_at DESC LIMIT ?",
            params,
        ).fetchall()
        return [self._row_to_delivery(r) for r in rows]

    def retry_delivery(self, request: RetryRequest) -> CallbackDelivery | None:
        """Manually retry a specific delivery."""
        delivery = self.get_delivery(request.delivery_id)
        if not delivery:
            return None
        # Reset status to pending and clear next_retry_at
        self._conn.execute(
            "UPDATE callback_deliveries SET status = 'pending', next_retry_at = NULL WHERE delivery_id = ?",
            (request.delivery_id,),
        )
        self._conn.commit()
        self._attempt_delivery(request.delivery_id)
        return self.get_delivery(request.delivery_id)

    def retry_pending(self) -> int:
        """Retry all deliveries where next_retry_at <= now and attempt_count < max_retries."""
        now = datetime.now(timezone.utc).isoformat()
        rows = self._conn.execute(
            """
            SELECT delivery_id FROM callback_deliveries
            WHERE status IN ('retrying', 'failed')
              AND next_retry_at IS NOT NULL
              AND next_retry_at <= ?
              AND attempt_count < max_retries
            """,
            (now,),
        ).fetchall()
        count = 0
        for row in rows:
            delivery_id = row["delivery_id"]
            logger.info("callback.auto_retry", delivery_id=delivery_id)
            self._attempt_delivery(delivery_id)
            count += 1
        return count

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_status_summary(self) -> CallbackStatusSummary:
        reg_row = self._conn.execute(
            "SELECT COUNT(*) AS total, SUM(is_active) AS active FROM callback_registrations"
        ).fetchone()

        del_row = self._conn.execute(
            """
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
                SUM(CASE WHEN status IN ('failed', 'retrying') THEN 1 ELSE 0 END) AS failed,
                SUM(CASE WHEN status IN ('pending', 'delivering') THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN status = 'exhausted' THEN 1 ELSE 0 END) AS exhausted
            FROM callback_deliveries
            """
        ).fetchone()

        return CallbackStatusSummary(
            total_registrations=reg_row["total"] or 0,
            active_registrations=reg_row["active"] or 0,
            total_deliveries=del_row["total"] or 0,
            delivered=del_row["delivered"] or 0,
            failed=del_row["failed"] or 0,
            pending=del_row["pending"] or 0,
            exhausted=del_row["exhausted"] or 0,
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_instance: AsyncCallbackManager | None = None


def get_async_callback_manager() -> AsyncCallbackManager:
    global _instance
    if _instance is None:
        db_path = str(product_db_path("async_callback.db"))
        _instance = AsyncCallbackManager(db_path)
    return _instance


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

__all__ = [
    "CallbackTrigger",
    "CallbackStatus",
    "CallbackRegistration",
    "CallbackRegisterRequest",
    "CallbackDelivery",
    "TriggerRequest",
    "TriggerResult",
    "RetryRequest",
    "CallbackStatusSummary",
    "AsyncCallbackManager",
    "get_async_callback_manager",
]
