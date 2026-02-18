"""AMC Product — Incremental Sync Connectors.

Delta sync, change detection, connector registry, sync log.

API: /api/v1/product/sync/*
"""
from __future__ import annotations

import hashlib
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

_NAMESPACE = UUID("b5c6d7e8-f9a0-1234-bcde-f01234567890")

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sync_connectors (
    connector_id    TEXT NOT NULL PRIMARY KEY,
    name            TEXT NOT NULL,
    source_type     TEXT NOT NULL,
    config_json     TEXT NOT NULL DEFAULT '{}',
    last_sync_at    TEXT,
    last_cursor     TEXT,
    status          TEXT NOT NULL DEFAULT 'idle',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sc_status ON sync_connectors(status);
CREATE INDEX IF NOT EXISTS idx_sc_source_type ON sync_connectors(source_type);

CREATE TABLE IF NOT EXISTS sync_runs (
    run_id          TEXT NOT NULL PRIMARY KEY,
    connector_id    TEXT NOT NULL,
    started_at      TEXT NOT NULL,
    completed_at    TEXT,
    status          TEXT NOT NULL DEFAULT 'running',
    records_synced  INTEGER NOT NULL DEFAULT 0,
    records_failed  INTEGER NOT NULL DEFAULT 0,
    cursor_start    TEXT,
    cursor_end      TEXT,
    error           TEXT,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (connector_id) REFERENCES sync_connectors(connector_id)
);
CREATE INDEX IF NOT EXISTS idx_sr_connector_status
    ON sync_runs(connector_id, status, started_at DESC);

CREATE TABLE IF NOT EXISTS sync_changes (
    change_id       TEXT NOT NULL PRIMARY KEY,
    run_id          TEXT NOT NULL,
    connector_id    TEXT NOT NULL,
    entity_type     TEXT NOT NULL DEFAULT '',
    entity_id       TEXT NOT NULL,
    change_type     TEXT NOT NULL,
    before_json     TEXT NOT NULL DEFAULT '{}',
    after_json      TEXT NOT NULL DEFAULT '{}',
    detected_at     TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES sync_runs(run_id)
);
CREATE INDEX IF NOT EXISTS idx_sch_run ON sync_changes(run_id, change_type);
CREATE INDEX IF NOT EXISTS idx_sch_connector ON sync_changes(connector_id, detected_at DESC);

CREATE TABLE IF NOT EXISTS sync_log (
    log_id          TEXT NOT NULL PRIMARY KEY,
    connector_id    TEXT NOT NULL,
    run_id          TEXT,
    level           TEXT NOT NULL DEFAULT 'info',
    message         TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL,
    FOREIGN KEY (connector_id) REFERENCES sync_connectors(connector_id)
);
CREATE INDEX IF NOT EXISTS idx_sl_connector ON sync_log(connector_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sl_run ON sync_log(run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS _sync_hashes (
    connector_id    TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    hash            TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    PRIMARY KEY (connector_id, entity_id)
);
"""


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class SyncStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"


class ChangeType(str, Enum):
    CREATED = "created"
    UPDATED = "updated"
    DELETED = "deleted"
    UNCHANGED = "unchanged"


class SourceType(str, Enum):
    DATABASE = "database"
    API = "api"
    FILE = "file"
    WEBHOOK = "webhook"
    CUSTOM = "custom"


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class SyncConnector:
    connector_id: str
    name: str
    source_type: SourceType
    config: dict[str, Any]
    last_sync_at: str | None
    last_cursor: str | None
    status: SyncStatus
    metadata: dict[str, Any]
    created_at: str
    updated_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "connector_id": self.connector_id,
            "name": self.name,
            "source_type": self.source_type.value,
            "config": self.config,
            "last_sync_at": self.last_sync_at,
            "last_cursor": self.last_cursor,
            "status": self.status.value,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class SyncRun:
    run_id: str
    connector_id: str
    started_at: str
    completed_at: str | None
    status: SyncStatus
    records_synced: int
    records_failed: int
    cursor_start: str | None
    cursor_end: str | None
    error: str | None
    metadata: dict[str, Any]

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "connector_id": self.connector_id,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "status": self.status.value,
            "records_synced": self.records_synced,
            "records_failed": self.records_failed,
            "cursor_start": self.cursor_start,
            "cursor_end": self.cursor_end,
            "error": self.error,
            "metadata": self.metadata,
        }


@dataclass
class SyncChange:
    change_id: str
    run_id: str
    connector_id: str
    entity_type: str
    entity_id: str
    change_type: ChangeType
    before: dict[str, Any]
    after: dict[str, Any]
    detected_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "change_id": self.change_id,
            "run_id": self.run_id,
            "connector_id": self.connector_id,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "change_type": self.change_type.value,
            "before": self.before,
            "after": self.after,
            "detected_at": self.detected_at,
        }


@dataclass
class SyncLogEntry:
    log_id: str
    connector_id: str
    run_id: str | None
    level: str
    message: str
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "log_id": self.log_id,
            "connector_id": self.connector_id,
            "run_id": self.run_id,
            "level": self.level,
            "message": self.message,
            "created_at": self.created_at,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connector_id(name: str, source_type: str) -> str:
    return str(uuid5(_NAMESPACE, f"connector:{name}:{source_type}"))


def _run_id(connector_id: str, ts: str) -> str:
    return str(uuid5(_NAMESPACE, f"run:{connector_id}:{ts}"))


def _change_id(run_id: str, entity_id: str, change_type: str) -> str:
    return str(uuid5(_NAMESPACE, f"change:{run_id}:{entity_id}:{change_type}"))


def _log_id(connector_id: str, ts: str, message: str) -> str:
    return str(uuid5(_NAMESPACE, f"log:{connector_id}:{ts}:{message[:64]}"))


def _record_hash(record: dict[str, Any]) -> str:
    """Stable SHA-256 hash of a record dict for delta detection."""
    canonical = json.dumps(record, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _row_to_connector(row: sqlite3.Row) -> SyncConnector:
    return SyncConnector(
        connector_id=row["connector_id"],
        name=row["name"],
        source_type=SourceType(row["source_type"]),
        config=json.loads(row["config_json"] or "{}"),
        last_sync_at=row["last_sync_at"],
        last_cursor=row["last_cursor"],
        status=SyncStatus(row["status"]),
        metadata=json.loads(row["metadata_json"] or "{}"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_run(row: sqlite3.Row) -> SyncRun:
    return SyncRun(
        run_id=row["run_id"],
        connector_id=row["connector_id"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
        status=SyncStatus(row["status"]),
        records_synced=row["records_synced"],
        records_failed=row["records_failed"],
        cursor_start=row["cursor_start"],
        cursor_end=row["cursor_end"],
        error=row["error"],
        metadata=json.loads(row["metadata_json"] or "{}"),
    )


def _row_to_change(row: sqlite3.Row) -> SyncChange:
    return SyncChange(
        change_id=row["change_id"],
        run_id=row["run_id"],
        connector_id=row["connector_id"],
        entity_type=row["entity_type"],
        entity_id=row["entity_id"],
        change_type=ChangeType(row["change_type"]),
        before=json.loads(row["before_json"] or "{}"),
        after=json.loads(row["after_json"] or "{}"),
        detected_at=row["detected_at"],
    )


def _row_to_log(row: sqlite3.Row) -> SyncLogEntry:
    return SyncLogEntry(
        log_id=row["log_id"],
        connector_id=row["connector_id"],
        run_id=row["run_id"],
        level=row["level"],
        message=row["message"],
        created_at=row["created_at"],
    )


# ---------------------------------------------------------------------------
# SyncManager
# ---------------------------------------------------------------------------


class SyncManager:
    """Thread-safe incremental sync connector manager with delta detection."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path: Path = product_db_path(db_path)
        self._lock = Lock()
        self._init_db()
        log.info("sync_manager.init", db=str(self._db_path))

    # ------------------------------------------------------------------
    # Connector CRUD
    # ------------------------------------------------------------------

    def register_connector(
        self,
        name: str,
        source_type: SourceType,
        config: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> SyncConnector:
        now = _utc_now()
        connector_id = _connector_id(name, source_type.value)
        cfg = config or {}
        meta = metadata or {}
        with self._lock:
            conn = self._connect()
            conn.execute(
                """INSERT OR REPLACE INTO sync_connectors
                   (connector_id, name, source_type, config_json,
                    last_sync_at, last_cursor, status, metadata_json,
                    created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (connector_id, name, source_type.value, json.dumps(cfg),
                 None, None, SyncStatus.IDLE.value, json.dumps(meta), now, now),
            )
            conn.commit()
            conn.close()
        connector = SyncConnector(
            connector_id=connector_id, name=name, source_type=source_type,
            config=cfg, last_sync_at=None, last_cursor=None,
            status=SyncStatus.IDLE, metadata=meta,
            created_at=now, updated_at=now,
        )
        log.info("sync_manager.connector_registered",
                 connector_id=connector_id, name=name)
        return connector

    def get_connector(self, connector_id: str) -> SyncConnector | None:
        conn = self._connect()
        row = conn.execute(
            "SELECT * FROM sync_connectors WHERE connector_id=?", (connector_id,)
        ).fetchone()
        conn.close()
        return _row_to_connector(row) if row else None

    def list_connectors(
        self, status: SyncStatus | None = None
    ) -> list[SyncConnector]:
        conn = self._connect()
        if status:
            rows = conn.execute(
                "SELECT * FROM sync_connectors WHERE status=? ORDER BY created_at DESC",
                (status.value,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM sync_connectors ORDER BY created_at DESC"
            ).fetchall()
        conn.close()
        return [_row_to_connector(r) for r in rows]

    def update_connector(
        self, connector_id: str, **kwargs: Any
    ) -> SyncConnector:
        """Update mutable connector fields: name, config, status, metadata, last_cursor."""
        allowed = {"name", "config", "status", "metadata", "last_cursor", "last_sync_at"}
        now = _utc_now()
        with self._lock:
            conn = self._connect()
            for key, value in kwargs.items():
                if key not in allowed:
                    continue
                col = key
                if key == "config":
                    col = "config_json"
                    value = json.dumps(value)
                elif key == "metadata":
                    col = "metadata_json"
                    value = json.dumps(value)
                conn.execute(
                    f"UPDATE sync_connectors SET {col}=?, updated_at=? WHERE connector_id=?",
                    (value, now, connector_id),
                )
            conn.commit()
            conn.close()
        result = self.get_connector(connector_id)
        if result is None:
            raise ValueError(f"Connector not found: {connector_id}")
        return result

    def delete_connector(self, connector_id: str) -> bool:
        with self._lock:
            conn = self._connect()
            cursor = conn.execute(
                "DELETE FROM sync_connectors WHERE connector_id=?", (connector_id,)
            )
            conn.commit()
            affected = cursor.rowcount
            conn.close()
        log.info("sync_manager.connector_deleted",
                 connector_id=connector_id, deleted=affected > 0)
        return affected > 0

    # ------------------------------------------------------------------
    # Run management
    # ------------------------------------------------------------------

    def start_run(
        self,
        connector_id: str,
        cursor_start: str | None = None,
    ) -> SyncRun:
        """Create a new sync run and mark the connector as running."""
        now = _utc_now()
        run_id = _run_id(connector_id, now)
        with self._lock:
            conn = self._connect()
            conn.execute(
                """INSERT INTO sync_runs
                   (run_id, connector_id, started_at, completed_at, status,
                    records_synced, records_failed, cursor_start, cursor_end,
                    error, metadata_json)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (run_id, connector_id, now, None, SyncStatus.RUNNING.value,
                 0, 0, cursor_start, None, None, "{}"),
            )
            conn.execute(
                "UPDATE sync_connectors SET status=?, updated_at=? WHERE connector_id=?",
                (SyncStatus.RUNNING.value, now, connector_id),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM sync_runs WHERE run_id=?", (run_id,)
            ).fetchone()
            conn.close()
        log.info("sync_manager.run_started",
                 run_id=run_id, connector_id=connector_id)
        return _row_to_run(row)

    def detect_changes(
        self,
        run_id: str,
        records: list[dict[str, Any]],
        id_field: str = "id",
    ) -> list[SyncChange]:
        """Delta detection via hash comparison against stored hashes.

        For each record:
        - No previous hash → CREATED
        - Hash changed → UPDATED
        - Hash same → UNCHANGED
        Deleted records (in previous hash store but not in current records)
        must be detected separately via explicit delete signals.
        """
        conn_ro = self._connect()
        run_row = conn_ro.execute(
            "SELECT connector_id FROM sync_runs WHERE run_id=?", (run_id,)
        ).fetchone()
        conn_ro.close()
        if run_row is None:
            raise ValueError(f"Run not found: {run_id}")
        connector_id = run_row["connector_id"]

        changes: list[SyncChange] = []
        for record in records:
            entity_id = str(record.get(id_field, ""))
            if not entity_id:
                continue
            new_hash = _record_hash(record)
            entity_type = record.get("__type__", "record")

            conn = self._connect()
            prev_row = conn.execute(
                "SELECT hash FROM _sync_hashes WHERE connector_id=? AND entity_id=?",
                (connector_id, entity_id),
            ).fetchone()
            conn.close()

            if prev_row is None:
                change_type = ChangeType.CREATED
                before: dict[str, Any] = {}
                after = record
            elif prev_row["hash"] != new_hash:
                change_type = ChangeType.UPDATED
                before = {}  # Previous snapshot not stored; hash only
                after = record
            else:
                change_type = ChangeType.UNCHANGED
                before = {}
                after = record

            if change_type != ChangeType.UNCHANGED:
                change = self.record_change(
                    run_id=run_id,
                    connector_id=connector_id,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    change_type=change_type,
                    before=before,
                    after=after,
                )
                changes.append(change)

            # Update hash store
            now = _utc_now()
            with self._lock:
                conn = self._connect()
                conn.execute(
                    """INSERT INTO _sync_hashes (connector_id, entity_id, hash, updated_at)
                       VALUES (?,?,?,?)
                       ON CONFLICT(connector_id, entity_id)
                       DO UPDATE SET hash=excluded.hash, updated_at=excluded.updated_at""",
                    (connector_id, entity_id, new_hash, now),
                )
                conn.commit()
                conn.close()

        log.info("sync_manager.detect_changes.done",
                 run_id=run_id, total=len(records), changes=len(changes))
        return changes

    def record_change(
        self,
        run_id: str,
        connector_id: str,
        entity_type: str,
        entity_id: str,
        change_type: ChangeType,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
    ) -> SyncChange:
        now = _utc_now()
        change_id = _change_id(run_id, entity_id, change_type.value)
        bef = before or {}
        aft = after or {}
        with self._lock:
            conn = self._connect()
            conn.execute(
                """INSERT OR REPLACE INTO sync_changes
                   (change_id, run_id, connector_id, entity_type, entity_id,
                    change_type, before_json, after_json, detected_at)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (change_id, run_id, connector_id, entity_type, entity_id,
                 change_type.value, json.dumps(bef), json.dumps(aft), now),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM sync_changes WHERE change_id=?", (change_id,)
            ).fetchone()
            conn.close()
        return _row_to_change(row)

    def complete_run(
        self,
        run_id: str,
        cursor_end: str | None = None,
        records_synced: int = 0,
        records_failed: int = 0,
    ) -> SyncRun:
        now = _utc_now()
        with self._lock:
            conn = self._connect()
            run_row = conn.execute(
                "SELECT connector_id FROM sync_runs WHERE run_id=?", (run_id,)
            ).fetchone()
            if run_row is None:
                conn.close()
                raise ValueError(f"Run not found: {run_id}")
            connector_id = run_row["connector_id"]
            conn.execute(
                """UPDATE sync_runs
                   SET status=?, completed_at=?, records_synced=?,
                       records_failed=?, cursor_end=?
                   WHERE run_id=?""",
                (SyncStatus.COMPLETED.value, now, records_synced,
                 records_failed, cursor_end, run_id),
            )
            conn.execute(
                """UPDATE sync_connectors
                   SET status=?, last_sync_at=?, last_cursor=?, updated_at=?
                   WHERE connector_id=?""",
                (SyncStatus.IDLE.value, now, cursor_end, now, connector_id),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM sync_runs WHERE run_id=?", (run_id,)
            ).fetchone()
            conn.close()
        log.info("sync_manager.run_completed", run_id=run_id,
                 records_synced=records_synced, records_failed=records_failed)
        return _row_to_run(row)

    def fail_run(self, run_id: str, error: str = "") -> SyncRun:
        now = _utc_now()
        with self._lock:
            conn = self._connect()
            run_row = conn.execute(
                "SELECT connector_id FROM sync_runs WHERE run_id=?", (run_id,)
            ).fetchone()
            if run_row is None:
                conn.close()
                raise ValueError(f"Run not found: {run_id}")
            connector_id = run_row["connector_id"]
            conn.execute(
                """UPDATE sync_runs
                   SET status=?, completed_at=?, error=?
                   WHERE run_id=?""",
                (SyncStatus.FAILED.value, now, error, run_id),
            )
            conn.execute(
                "UPDATE sync_connectors SET status=?, updated_at=? WHERE connector_id=?",
                (SyncStatus.FAILED.value, now, connector_id),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM sync_runs WHERE run_id=?", (run_id,)
            ).fetchone()
            conn.close()
        log.warning("sync_manager.run_failed", run_id=run_id, error=error)
        return _row_to_run(row)

    def get_run(self, run_id: str) -> SyncRun | None:
        conn = self._connect()
        row = conn.execute(
            "SELECT * FROM sync_runs WHERE run_id=?", (run_id,)
        ).fetchone()
        conn.close()
        return _row_to_run(row) if row else None

    def list_runs(
        self,
        connector_id: str | None = None,
        status: SyncStatus | None = None,
        limit: int = 20,
    ) -> list[SyncRun]:
        clauses: list[str] = []
        params: list[Any] = []
        if connector_id:
            clauses.append("connector_id=?")
            params.append(connector_id)
        if status:
            clauses.append("status=?")
            params.append(status.value)
        where = "WHERE " + " AND ".join(clauses) if clauses else ""
        params.append(limit)
        conn = self._connect()
        rows = conn.execute(
            f"SELECT * FROM sync_runs {where} ORDER BY started_at DESC LIMIT ?",
            params,
        ).fetchall()
        conn.close()
        return [_row_to_run(r) for r in rows]

    # ------------------------------------------------------------------
    # Change queries
    # ------------------------------------------------------------------

    def get_changes(
        self,
        run_id: str | None = None,
        connector_id: str | None = None,
        change_type: ChangeType | None = None,
        limit: int = 100,
    ) -> list[SyncChange]:
        clauses: list[str] = []
        params: list[Any] = []
        if run_id:
            clauses.append("run_id=?")
            params.append(run_id)
        if connector_id:
            clauses.append("connector_id=?")
            params.append(connector_id)
        if change_type:
            clauses.append("change_type=?")
            params.append(change_type.value)
        where = "WHERE " + " AND ".join(clauses) if clauses else ""
        params.append(limit)
        conn = self._connect()
        rows = conn.execute(
            f"SELECT * FROM sync_changes {where} ORDER BY detected_at DESC LIMIT ?",
            params,
        ).fetchall()
        conn.close()
        return [_row_to_change(r) for r in rows]

    # ------------------------------------------------------------------
    # Log
    # ------------------------------------------------------------------

    def log_entry(
        self,
        connector_id: str,
        run_id: str | None,
        level: str,
        message: str,
    ) -> None:
        now = _utc_now()
        log_id = _log_id(connector_id, now, message)
        with self._lock:
            conn = self._connect()
            conn.execute(
                """INSERT INTO sync_log
                   (log_id, connector_id, run_id, level, message, created_at)
                   VALUES (?,?,?,?,?,?)""",
                (log_id, connector_id, run_id, level, message, now),
            )
            conn.commit()
            conn.close()

    def get_log(
        self,
        connector_id: str | None = None,
        run_id: str | None = None,
        limit: int = 100,
    ) -> list[SyncLogEntry]:
        clauses: list[str] = []
        params: list[Any] = []
        if connector_id:
            clauses.append("connector_id=?")
            params.append(connector_id)
        if run_id:
            clauses.append("run_id=?")
            params.append(run_id)
        where = "WHERE " + " AND ".join(clauses) if clauses else ""
        params.append(limit)
        conn = self._connect()
        rows = conn.execute(
            f"SELECT * FROM sync_log {where} ORDER BY created_at DESC LIMIT ?",
            params,
        ).fetchall()
        conn.close()
        return [_row_to_log(r) for r in rows]

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
        conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn


# ---------------------------------------------------------------------------
# Module exports
# ---------------------------------------------------------------------------

__all__ = [
    "SyncStatus",
    "ChangeType",
    "SourceType",
    "SyncConnector",
    "SyncRun",
    "SyncChange",
    "SyncLogEntry",
    "SyncManager",
]


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

import threading as _threading

_sync_instance: SyncManager | None = None
_sync_lock = _threading.Lock()


def get_sync_manager() -> SyncManager:
    global _sync_instance
    if _sync_instance is None:
        with _sync_lock:
            if _sync_instance is None:
                _sync_instance = SyncManager()
    return _sync_instance


def reset_sync_manager(db_path: str | None = None) -> SyncManager:
    global _sync_instance
    with _sync_lock:
        _sync_instance = SyncManager(db_path=db_path)
    return _sync_instance
