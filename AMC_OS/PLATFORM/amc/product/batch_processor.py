"""AMC Product — Batch Processing Orchestrator.

Submit batches, track progress, parallel execution with concurrency limits,
results aggregation. SQLite-backed.

API: /api/v1/product/batch/*
"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import UUID, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_NS = UUID("c3d4e5f6-a7b8-9012-cdef-123456789012")

# ── Schema ────────────────────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS batches (
    batch_id            TEXT NOT NULL PRIMARY KEY,
    name                TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending',
    total_items         INTEGER NOT NULL DEFAULT 0,
    completed_items     INTEGER NOT NULL DEFAULT 0,
    failed_items        INTEGER NOT NULL DEFAULT 0,
    concurrency_limit   INTEGER NOT NULL DEFAULT 5,
    priority            INTEGER NOT NULL DEFAULT 0,
    metadata_json       TEXT NOT NULL DEFAULT '{}',
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    completed_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_batches_status   ON batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_priority ON batches(priority DESC);

CREATE TABLE IF NOT EXISTS batch_items (
    item_id         TEXT NOT NULL PRIMARY KEY,
    batch_id        TEXT NOT NULL REFERENCES batches(batch_id),
    seq             INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending',
    payload_json    TEXT NOT NULL DEFAULT '{}',
    result_json     TEXT,
    error           TEXT,
    started_at      TEXT,
    completed_at    TEXT,
    created_at      TEXT NOT NULL,
    retries         INTEGER NOT NULL DEFAULT 0,
    worker_id       TEXT
);
CREATE INDEX IF NOT EXISTS idx_batch_items_batch  ON batch_items(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_batch_items_status ON batch_items(status);
CREATE INDEX IF NOT EXISTS idx_batch_items_worker ON batch_items(worker_id);

CREATE TABLE IF NOT EXISTS batch_results (
    result_id       TEXT NOT NULL PRIMARY KEY,
    batch_id        TEXT NOT NULL REFERENCES batches(batch_id),
    aggregated_json TEXT NOT NULL DEFAULT '{}',
    stats_json      TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_batch_results_batch ON batch_results(batch_id);
"""


# ── Enums ─────────────────────────────────────────────────────────────────────


class BatchStatus(str, Enum):
    PENDING   = "pending"
    RUNNING   = "running"
    PAUSED    = "paused"
    COMPLETED = "completed"
    FAILED    = "failed"
    CANCELLED = "cancelled"


class ItemStatus(str, Enum):
    PENDING   = "pending"
    RUNNING   = "running"
    COMPLETED = "completed"
    FAILED    = "failed"
    SKIPPED   = "skipped"


# ── Dataclasses ───────────────────────────────────────────────────────────────


@dataclass
class Batch:
    batch_id:          str
    name:              str
    status:            BatchStatus
    total_items:       int
    completed_items:   int
    failed_items:      int
    concurrency_limit: int
    priority:          int
    metadata:          dict[str, Any]
    created_at:        str
    updated_at:        str
    completed_at:      str | None

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "batch_id":          self.batch_id,
            "name":              self.name,
            "status":            self.status.value,
            "total_items":       self.total_items,
            "completed_items":   self.completed_items,
            "failed_items":      self.failed_items,
            "concurrency_limit": self.concurrency_limit,
            "priority":          self.priority,
            "metadata":          self.metadata,
            "created_at":        self.created_at,
            "updated_at":        self.updated_at,
            "completed_at":      self.completed_at,
        }


@dataclass
class BatchItem:
    item_id:      str
    batch_id:     str
    seq:          int
    status:       ItemStatus
    payload:      dict[str, Any]
    result:       dict[str, Any] | None
    error:        str | None
    started_at:   str | None
    completed_at: str | None
    created_at:   str
    retries:      int
    worker_id:    str | None

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "item_id":      self.item_id,
            "batch_id":     self.batch_id,
            "seq":          self.seq,
            "status":       self.status.value,
            "payload":      self.payload,
            "result":       self.result,
            "error":        self.error,
            "started_at":   self.started_at,
            "completed_at": self.completed_at,
            "created_at":   self.created_at,
            "retries":      self.retries,
            "worker_id":    self.worker_id,
        }


@dataclass
class BatchResult:
    result_id:   str
    batch_id:    str
    aggregated:  dict[str, Any]
    stats:       dict[str, Any]
    created_at:  str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "result_id":  self.result_id,
            "batch_id":   self.batch_id,
            "aggregated": self.aggregated,
            "stats":      self.stats,
            "created_at": self.created_at,
        }


# ── Helpers ───────────────────────────────────────────────────────────────────


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_id(prefix: str, *parts: str) -> str:
    return str(uuid5(_NS, f"{prefix}:{':'.join(parts)}:{_now()}"))


def _row_to_batch(row: sqlite3.Row) -> Batch:
    return Batch(
        batch_id=row["batch_id"],
        name=row["name"],
        status=BatchStatus(row["status"]),
        total_items=row["total_items"],
        completed_items=row["completed_items"],
        failed_items=row["failed_items"],
        concurrency_limit=row["concurrency_limit"],
        priority=row["priority"],
        metadata=json.loads(row["metadata_json"] or "{}"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        completed_at=row["completed_at"],
    )


def _row_to_item(row: sqlite3.Row) -> BatchItem:
    return BatchItem(
        item_id=row["item_id"],
        batch_id=row["batch_id"],
        seq=row["seq"],
        status=ItemStatus(row["status"]),
        payload=json.loads(row["payload_json"] or "{}"),
        result=json.loads(row["result_json"]) if row["result_json"] else None,
        error=row["error"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
        created_at=row["created_at"],
        retries=row["retries"],
        worker_id=row["worker_id"],
    )


def _row_to_result(row: sqlite3.Row) -> BatchResult:
    return BatchResult(
        result_id=row["result_id"],
        batch_id=row["batch_id"],
        aggregated=json.loads(row["aggregated_json"] or "{}"),
        stats=json.loads(row["stats_json"] or "{}"),
        created_at=row["created_at"],
    )


# ── BatchProcessor ────────────────────────────────────────────────────────────


class BatchProcessor:
    """Batch processing orchestrator with SQLite persistence.

    Thread-safe via ``threading.Lock``.  Atomic item claiming is done with
    a single ``UPDATE … RETURNING`` pattern to avoid race conditions.
    """

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._lock    = Lock()
        self._db_path = product_db_path(db_path)
        self._init_db()

    # ── internals ─────────────────────────────────────────────────────────────

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_db(self) -> None:
        with self._lock:
            with self._connect() as conn:
                conn.executescript(_SCHEMA)

    def _update_batch_counts(self, batch_id: str, conn: sqlite3.Connection) -> None:
        """Private: recalculate and update completed/failed counts from items."""
        row = conn.execute(
            """SELECT
               SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done,
               SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END) AS fail,
               COUNT(*) AS total
               FROM batch_items WHERE batch_id = ?""",
            (batch_id,),
        ).fetchone()
        done  = row["done"]  or 0
        fail  = row["fail"]  or 0
        total = row["total"] or 0
        conn.execute(
            """UPDATE batches
               SET completed_items = ?, failed_items = ?, total_items = ?, updated_at = ?
               WHERE batch_id = ?""",
            (done, fail, total, _now(), batch_id),
        )

    def _fetch_batch(self, batch_id: str, conn: sqlite3.Connection) -> Batch | None:
        row = conn.execute(
            "SELECT * FROM batches WHERE batch_id = ?", (batch_id,)
        ).fetchone()
        return _row_to_batch(row) if row else None

    # ── Batch CRUD ────────────────────────────────────────────────────────────

    def create_batch(
        self,
        name: str,
        concurrency_limit: int = 5,
        priority: int = 0,
        metadata: dict[str, Any] | None = None,
    ) -> Batch:
        now  = _now()
        bid  = _make_id("batch", name)
        meta = metadata or {}
        batch = Batch(
            batch_id=bid,
            name=name,
            status=BatchStatus.PENDING,
            total_items=0,
            completed_items=0,
            failed_items=0,
            concurrency_limit=concurrency_limit,
            priority=priority,
            metadata=meta,
            created_at=now,
            updated_at=now,
            completed_at=None,
        )
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """INSERT INTO batches
                       (batch_id, name, status, total_items, completed_items, failed_items,
                        concurrency_limit, priority, metadata_json, created_at, updated_at,
                        completed_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (bid, name, BatchStatus.PENDING.value, 0, 0, 0,
                     concurrency_limit, priority, json.dumps(meta), now, now, None),
                )
        log.info("batch.created", batch_id=bid, name=name)
        return batch

    def get_batch(self, batch_id: str) -> Batch | None:
        with self._lock:
            with self._connect() as conn:
                return self._fetch_batch(batch_id, conn)

    def list_batches(
        self, status: BatchStatus | str | None = None, limit: int = 50
    ) -> list[Batch]:
        params: list[Any] = []
        where = ""
        if status is not None:
            sv = status.value if isinstance(status, BatchStatus) else status
            where = "WHERE status = ?"
            params.append(sv)
        params.append(limit)
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(
                    f"""SELECT * FROM batches {where}
                        ORDER BY priority DESC, created_at DESC LIMIT ?""",
                    params,
                ).fetchall()
        return [_row_to_batch(r) for r in rows]

    # ── Item CRUD ─────────────────────────────────────────────────────────────

    def add_item(
        self,
        batch_id: str,
        payload: dict[str, Any],
        seq: int | None = None,
    ) -> BatchItem:
        now = _now()
        iid = _make_id("item", batch_id, str(seq or 0))
        with self._lock:
            with self._connect() as conn:
                if seq is None:
                    row = conn.execute(
                        "SELECT COALESCE(MAX(seq),0)+1 AS next_seq FROM batch_items WHERE batch_id = ?",
                        (batch_id,),
                    ).fetchone()
                    seq = row["next_seq"]
                conn.execute(
                    """INSERT INTO batch_items
                       (item_id, batch_id, seq, status, payload_json,
                        result_json, error, started_at, completed_at,
                        created_at, retries, worker_id)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (iid, batch_id, seq, ItemStatus.PENDING.value,
                     json.dumps(payload), None, None, None, None, now, 0, None),
                )
                self._update_batch_counts(batch_id, conn)
                row2 = conn.execute(
                    "SELECT * FROM batch_items WHERE item_id = ?", (iid,)
                ).fetchone()
        return _row_to_item(row2)

    def add_items(
        self, batch_id: str, payloads: list[dict[str, Any]]
    ) -> list[BatchItem]:
        """Bulk insert items into a batch."""
        now = _now()
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT COALESCE(MAX(seq),0) AS max_seq FROM batch_items WHERE batch_id = ?",
                    (batch_id,),
                ).fetchone()
                base_seq = (row["max_seq"] or 0) + 1
                records: list[tuple] = []
                item_ids: list[str] = []
                for i, payload in enumerate(payloads):
                    seq = base_seq + i
                    iid = _make_id("item", batch_id, str(seq))
                    item_ids.append(iid)
                    records.append((
                        iid, batch_id, seq, ItemStatus.PENDING.value,
                        json.dumps(payload), None, None, None, None, now, 0, None,
                    ))
                conn.executemany(
                    """INSERT INTO batch_items
                       (item_id, batch_id, seq, status, payload_json,
                        result_json, error, started_at, completed_at,
                        created_at, retries, worker_id)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                    records,
                )
                self._update_batch_counts(batch_id, conn)
                placeholders = ",".join("?" * len(item_ids))
                rows = conn.execute(
                    f"SELECT * FROM batch_items WHERE item_id IN ({placeholders})"
                    " ORDER BY seq ASC",
                    item_ids,
                ).fetchall()
        log.info("batch.items.bulk_added", batch_id=batch_id, count=len(payloads))
        return [_row_to_item(r) for r in rows]

    def get_item(self, item_id: str) -> BatchItem | None:
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT * FROM batch_items WHERE item_id = ?", (item_id,)
                ).fetchone()
        return _row_to_item(row) if row else None

    def get_items(
        self, batch_id: str, status: ItemStatus | str | None = None
    ) -> list[BatchItem]:
        params: list[Any] = [batch_id]
        where = "WHERE batch_id = ?"
        if status is not None:
            sv = status.value if isinstance(status, ItemStatus) else status
            where += " AND status = ?"
            params.append(sv)
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(
                    f"SELECT * FROM batch_items {where} ORDER BY seq ASC", params
                ).fetchall()
        return [_row_to_item(r) for r in rows]

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def start_batch(self, batch_id: str) -> Batch:
        now = _now()
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE batches SET status = ?, updated_at = ? WHERE batch_id = ?",
                    (BatchStatus.RUNNING.value, now, batch_id),
                )
                batch = self._fetch_batch(batch_id, conn)
        if not batch:
            raise ValueError(f"Batch not found: {batch_id}")
        log.info("batch.started", batch_id=batch_id)
        return batch

    def claim_items(
        self, batch_id: str, worker_id: str, count: int = 1
    ) -> list[BatchItem]:
        """Atomically claim up to `count` pending items for a worker."""
        now = _now()
        with self._lock:
            with self._connect() as conn:
                # Get candidate pending items
                rows = conn.execute(
                    """SELECT item_id FROM batch_items
                       WHERE batch_id = ? AND status = ?
                       ORDER BY seq ASC LIMIT ?""",
                    (batch_id, ItemStatus.PENDING.value, count),
                ).fetchall()
                claimed_ids = [r["item_id"] for r in rows]
                if not claimed_ids:
                    return []
                placeholders = ",".join("?" * len(claimed_ids))
                conn.execute(
                    f"""UPDATE batch_items
                        SET status = ?, worker_id = ?, started_at = ?
                        WHERE item_id IN ({placeholders})""",
                    [ItemStatus.RUNNING.value, worker_id, now] + claimed_ids,
                )
                result_rows = conn.execute(
                    f"SELECT * FROM batch_items WHERE item_id IN ({placeholders})",
                    claimed_ids,
                ).fetchall()
        log.info("batch.items.claimed", batch_id=batch_id, worker_id=worker_id,
                 count=len(claimed_ids))
        return [_row_to_item(r) for r in result_rows]

    def complete_item(self, item_id: str, result: dict[str, Any]) -> BatchItem:
        now = _now()
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT batch_id FROM batch_items WHERE item_id = ?", (item_id,)
                ).fetchone()
                if not row:
                    raise ValueError(f"Item not found: {item_id}")
                batch_id = row["batch_id"]
                conn.execute(
                    """UPDATE batch_items
                       SET status = ?, result_json = ?, completed_at = ?, error = NULL
                       WHERE item_id = ?""",
                    (ItemStatus.COMPLETED.value, json.dumps(result), now, item_id),
                )
                self._update_batch_counts(batch_id, conn)
                # Auto-complete the batch if all items done
                self._maybe_complete_batch(batch_id, conn)
                row2 = conn.execute(
                    "SELECT * FROM batch_items WHERE item_id = ?", (item_id,)
                ).fetchone()
        return _row_to_item(row2)

    def fail_item(self, item_id: str, error: str, retry: bool = False) -> BatchItem:
        now = _now()
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT batch_id, retries FROM batch_items WHERE item_id = ?",
                    (item_id,),
                ).fetchone()
                if not row:
                    raise ValueError(f"Item not found: {item_id}")
                batch_id = row["batch_id"]
                new_retries = row["retries"] + 1
                if retry:
                    conn.execute(
                        """UPDATE batch_items
                           SET status = ?, error = ?, retries = ?, started_at = NULL,
                               worker_id = NULL
                           WHERE item_id = ?""",
                        (ItemStatus.PENDING.value, error, new_retries, item_id),
                    )
                else:
                    conn.execute(
                        """UPDATE batch_items
                           SET status = ?, error = ?, retries = ?, completed_at = ?
                           WHERE item_id = ?""",
                        (ItemStatus.FAILED.value, error, new_retries, now, item_id),
                    )
                self._update_batch_counts(batch_id, conn)
                self._maybe_complete_batch(batch_id, conn)
                row2 = conn.execute(
                    "SELECT * FROM batch_items WHERE item_id = ?", (item_id,)
                ).fetchone()
        return _row_to_item(row2)

    def _maybe_complete_batch(self, batch_id: str, conn: sqlite3.Connection) -> None:
        """If all items are terminal, mark batch completed or failed."""
        row = conn.execute(
            """SELECT
               SUM(CASE WHEN status IN ('pending','running') THEN 1 ELSE 0 END) AS active,
               SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
               COUNT(*) AS total
               FROM batch_items WHERE batch_id = ?""",
            (batch_id,),
        ).fetchone()
        if row["total"] == 0 or (row["active"] or 0) > 0:
            return
        batch_row = conn.execute(
            "SELECT status FROM batches WHERE batch_id = ?", (batch_id,)
        ).fetchone()
        if not batch_row or batch_row["status"] not in (
            BatchStatus.RUNNING.value, BatchStatus.PAUSED.value
        ):
            return
        now          = _now()
        final_status = BatchStatus.FAILED if (row["failed"] or 0) > 0 else BatchStatus.COMPLETED
        conn.execute(
            "UPDATE batches SET status = ?, completed_at = ?, updated_at = ? WHERE batch_id = ?",
            (final_status.value, now, now, batch_id),
        )
        log.info("batch.auto_completed", batch_id=batch_id, status=final_status.value)

    def pause_batch(self, batch_id: str) -> Batch:
        now = _now()
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE batches SET status = ?, updated_at = ? WHERE batch_id = ?",
                    (BatchStatus.PAUSED.value, now, batch_id),
                )
                batch = self._fetch_batch(batch_id, conn)
        if not batch:
            raise ValueError(f"Batch not found: {batch_id}")
        log.info("batch.paused", batch_id=batch_id)
        return batch

    def resume_batch(self, batch_id: str) -> Batch:
        now = _now()
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE batches SET status = ?, updated_at = ? WHERE batch_id = ?",
                    (BatchStatus.RUNNING.value, now, batch_id),
                )
                batch = self._fetch_batch(batch_id, conn)
        if not batch:
            raise ValueError(f"Batch not found: {batch_id}")
        log.info("batch.resumed", batch_id=batch_id)
        return batch

    def cancel_batch(self, batch_id: str) -> Batch:
        now = _now()
        with self._lock:
            with self._connect() as conn:
                # Mark all pending/running items as skipped
                conn.execute(
                    """UPDATE batch_items
                       SET status = ?, completed_at = ?
                       WHERE batch_id = ? AND status IN (?,?)""",
                    (ItemStatus.SKIPPED.value, now, batch_id,
                     ItemStatus.PENDING.value, ItemStatus.RUNNING.value),
                )
                conn.execute(
                    "UPDATE batches SET status = ?, updated_at = ?, completed_at = ? WHERE batch_id = ?",
                    (BatchStatus.CANCELLED.value, now, now, batch_id),
                )
                batch = self._fetch_batch(batch_id, conn)
        if not batch:
            raise ValueError(f"Batch not found: {batch_id}")
        log.info("batch.cancelled", batch_id=batch_id)
        return batch

    # ── Results & Progress ────────────────────────────────────────────────────

    def aggregate_results(self, batch_id: str) -> BatchResult:
        """Collect all completed item results and compute aggregate stats."""
        items = self.get_items(batch_id)
        completed = [i for i in items if i.status == ItemStatus.COMPLETED]
        failed    = [i for i in items if i.status == ItemStatus.FAILED]
        skipped   = [i for i in items if i.status == ItemStatus.SKIPPED]

        aggregated: dict[str, Any] = {
            "results": [i.result for i in completed if i.result is not None],
            "errors":  [{"item_id": i.item_id, "error": i.error} for i in failed],
        }
        stats: dict[str, Any] = {
            "total":     len(items),
            "completed": len(completed),
            "failed":    len(failed),
            "skipped":   len(skipped),
            "pending":   sum(1 for i in items if i.status == ItemStatus.PENDING),
            "running":   sum(1 for i in items if i.status == ItemStatus.RUNNING),
            "success_rate": (
                round(len(completed) / len(items), 4) if items else 0.0
            ),
        }

        now = _now()
        rid = _make_id("result", batch_id)
        result = BatchResult(
            result_id=rid,
            batch_id=batch_id,
            aggregated=aggregated,
            stats=stats,
            created_at=now,
        )
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """INSERT INTO batch_results
                       (result_id, batch_id, aggregated_json, stats_json, created_at)
                       VALUES (?,?,?,?,?)""",
                    (rid, batch_id, json.dumps(aggregated), json.dumps(stats), now),
                )
        log.info("batch.results.aggregated", batch_id=batch_id, stats=stats)
        return result

    def get_progress(self, batch_id: str) -> dict[str, Any]:
        """Return live progress metrics."""
        batch = self.get_batch(batch_id)
        if not batch:
            raise ValueError(f"Batch not found: {batch_id}")

        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    """SELECT
                       SUM(CASE WHEN status='pending'   THEN 1 ELSE 0 END) AS pending,
                       SUM(CASE WHEN status='running'   THEN 1 ELSE 0 END) AS running,
                       SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
                       SUM(CASE WHEN status='failed'    THEN 1 ELSE 0 END) AS failed,
                       COUNT(*) AS total
                       FROM batch_items WHERE batch_id = ?""",
                    (batch_id,),
                ).fetchone()
                # ETA: estimate seconds from avg completion time
                timing = conn.execute(
                    """SELECT AVG(
                           (JULIANDAY(completed_at) - JULIANDAY(started_at)) * 86400
                       ) AS avg_seconds
                       FROM batch_items
                       WHERE batch_id = ? AND status = 'completed'
                         AND started_at IS NOT NULL AND completed_at IS NOT NULL""",
                    (batch_id,),
                ).fetchone()

        total     = row["total"] or 0
        completed = row["completed"] or 0
        failed    = row["failed"] or 0
        pending   = row["pending"] or 0
        running   = row["running"] or 0
        pct       = round((completed + failed) / total * 100, 2) if total else 0.0

        avg_s = timing["avg_seconds"] if timing and timing["avg_seconds"] else None
        eta_s: float | None = None
        if avg_s and pending > 0 and batch.concurrency_limit > 0:
            workers = min(batch.concurrency_limit, max(running, 1))
            eta_s   = round((pending / workers) * avg_s, 1)

        return {
            "batch_id":    batch_id,
            "total":       total,
            "completed":   completed,
            "failed":      failed,
            "pending":     pending,
            "running":     running,
            "pct_complete": pct,
            "eta_s":       eta_s,
        }

    def get_result(self, batch_id: str) -> BatchResult | None:
        """Return most recent aggregated result for a batch."""
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    """SELECT * FROM batch_results WHERE batch_id = ?
                       ORDER BY created_at DESC LIMIT 1""",
                    (batch_id,),
                ).fetchone()
        return _row_to_result(row) if row else None


__all__ = [
    "BatchStatus",
    "ItemStatus",
    "Batch",
    "BatchItem",
    "BatchResult",
    "BatchProcessor",
]


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

import threading as _threading

_bp_instance: BatchProcessor | None = None
_bp_lock = _threading.Lock()


def get_batch_processor() -> BatchProcessor:
    global _bp_instance
    if _bp_instance is None:
        with _bp_lock:
            if _bp_instance is None:
                _bp_instance = BatchProcessor()
    return _bp_instance


def reset_batch_processor(db_path: str | None = None) -> BatchProcessor:
    global _bp_instance
    with _bp_lock:
        _bp_instance = BatchProcessor(db_path=db_path)
    return _bp_instance
