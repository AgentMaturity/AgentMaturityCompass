"""
AMC Vault — V10: Undo Layer / Trash Can
========================================

A reversible-action framework for agent operations:

* Deletes become soft-deletes (moved to trash, not destroyed).
* Overwrites keep versioned snapshots.
* Messages and other resources can be recalled / rolled back.

All state is stored in SQLite so the undo history survives process restarts.

Usage
-----

.. code-block:: python

    from amc.vault.v10_undo_layer import UndoLayer, UndoConfig

    undo = UndoLayer(config=UndoConfig(retention_days=7))

    # Snapshot before updating a resource
    version = undo.snapshot_before(
        resource_type="document",
        resource_id="doc-123",
        data={"title": "Old Title", "body": "Old content"},
        operation="update",
        actor="agent-1",
    )

    # ... perform the update ...

    # Roll back to the snapshot
    result = undo.rollback(version.version_id)
    # result.success == True

    # Soft-delete instead of hard-delete
    trash_entry = undo.soft_delete(
        resource_type="document",
        resource_id="doc-456",
        data={"title": "To Be Deleted"},
        actor="agent-1",
    )

    # Restore from trash
    restored = undo.restore_from_trash(trash_entry.entry_id)
    # restored.restored == True
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Generator, Literal

import structlog
from pydantic import BaseModel, Field

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class UndoConfig(BaseModel):
    """Configuration for the UndoLayer."""

    retention_days: int = 30
    max_versions_per_resource: int = 10
    auto_expire: bool = True


class ResourceVersion(BaseModel):
    """A point-in-time snapshot of a resource state."""

    version_id: str
    resource_type: str
    resource_id: str
    operation: Literal["create", "update", "delete", "send"]
    snapshot_data: str  # JSON string
    created_by: str
    created_at: datetime
    expired: bool = False


class RollbackResult(BaseModel):
    """Result of a rollback operation."""

    version_id: str
    resource_id: str
    rolled_back_to: str  # ISO timestamp of the version restored
    success: bool
    rollback_at: datetime


class TrashEntry(BaseModel):
    """A soft-deleted resource entry sitting in the trash can."""

    entry_id: str
    resource_type: str
    resource_id: str
    original_data: str  # JSON string
    deleted_at: datetime
    expires_at: datetime
    restored: bool = False


# ---------------------------------------------------------------------------
# DDL
# ---------------------------------------------------------------------------

_DDL = """
CREATE TABLE IF NOT EXISTS resource_versions (
    version_id      TEXT PRIMARY KEY,
    resource_type   TEXT NOT NULL,
    resource_id     TEXT NOT NULL,
    operation       TEXT NOT NULL,
    snapshot_data   TEXT NOT NULL,
    created_by      TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    expired         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rv_resource ON resource_versions(resource_type, resource_id);

CREATE TABLE IF NOT EXISTS trash_entries (
    entry_id        TEXT PRIMARY KEY,
    resource_type   TEXT NOT NULL,
    resource_id     TEXT NOT NULL,
    original_data   TEXT NOT NULL,
    deleted_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL,
    restored        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_te_resource_type ON trash_entries(resource_type);
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------

class UndoLayer:
    """
    Reversible action framework providing snapshot, rollback, and trash-can
    semantics for agent resources.

    Parameters
    ----------
    config : UndoConfig
        Retention and versioning policy.
    db_path : str | Path
        Path to the SQLite database.  Defaults to ``:memory:``.
    """

    def __init__(
        self,
        config: UndoConfig | None = None,
        db_path: str | Path = ":memory:",
    ) -> None:
        self.config = config or UndoConfig()
        self._db_path = str(db_path)
        self._init_db()
        logger.info(
            "UndoLayer ready",
            retention_days=self.config.retention_days,
            max_versions=self.config.max_versions_per_resource,
        )

    # ------------------------------------------------------------------
    # DB
    # ------------------------------------------------------------------

    @contextmanager
    def _conn(self) -> Generator[sqlite3.Connection, None, None]:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self) -> None:
        with self._conn() as conn:
            conn.executescript(_DDL)

    def _row_to_version(self, row: sqlite3.Row) -> ResourceVersion:
        return ResourceVersion(
            version_id=row["version_id"],
            resource_type=row["resource_type"],
            resource_id=row["resource_id"],
            operation=row["operation"],
            snapshot_data=row["snapshot_data"],
            created_by=row["created_by"],
            created_at=datetime.fromisoformat(row["created_at"]),
            expired=bool(row["expired"]),
        )

    def _row_to_trash(self, row: sqlite3.Row) -> TrashEntry:
        return TrashEntry(
            entry_id=row["entry_id"],
            resource_type=row["resource_type"],
            resource_id=row["resource_id"],
            original_data=row["original_data"],
            deleted_at=datetime.fromisoformat(row["deleted_at"]),
            expires_at=datetime.fromisoformat(row["expires_at"]),
            restored=bool(row["restored"]),
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def snapshot_before(
        self,
        resource_type: str,
        resource_id: str,
        data: dict,
        operation: str,
        actor: str,
    ) -> ResourceVersion:
        """
        Save a snapshot of *data* before an operation is performed.

        If the maximum number of versions for this resource has been reached
        the oldest non-expired version is expired to keep the table tidy.

        Parameters
        ----------
        resource_type:
            Class of resource (e.g. ``"document"``, ``"message"``).
        resource_id:
            Unique identifier for the resource instance.
        data:
            Current state of the resource (will be JSON-serialised).
        operation:
            The operation about to be performed (``"create"``, ``"update"``,
            ``"delete"``, or ``"send"``).
        actor:
            Identity of the agent or user performing the action.

        Returns
        -------
        ResourceVersion
            The newly created version snapshot.
        """
        version = ResourceVersion(
            version_id=str(uuid.uuid4()),
            resource_type=resource_type,
            resource_id=resource_id,
            operation=operation,  # type: ignore[arg-type]
            snapshot_data=json.dumps(data),
            created_by=actor,
            created_at=_utcnow(),
            expired=False,
        )
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO resource_versions
                    (version_id, resource_type, resource_id, operation,
                     snapshot_data, created_by, created_at, expired)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    version.version_id,
                    version.resource_type,
                    version.resource_id,
                    version.operation,
                    version.snapshot_data,
                    version.created_by,
                    version.created_at.isoformat(),
                    int(version.expired),
                ),
            )

        # Enforce max_versions_per_resource — expire oldest if needed
        self._enforce_version_limit(resource_type, resource_id)
        logger.debug(
            "Snapshot saved",
            version_id=version.version_id,
            resource_id=resource_id,
            operation=operation,
        )
        return version

    def soft_delete(
        self,
        resource_type: str,
        resource_id: str,
        data: dict,
        actor: str,
    ) -> TrashEntry:
        """
        Move a resource to the trash instead of deleting it permanently.

        Parameters
        ----------
        resource_type, resource_id, data, actor:
            Describe the resource being deleted.

        Returns
        -------
        TrashEntry
            The newly created trash record.
        """
        now = _utcnow()
        expires_at = now + timedelta(days=self.config.retention_days)
        entry = TrashEntry(
            entry_id=str(uuid.uuid4()),
            resource_type=resource_type,
            resource_id=resource_id,
            original_data=json.dumps(data),
            deleted_at=now,
            expires_at=expires_at,
            restored=False,
        )
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO trash_entries
                    (entry_id, resource_type, resource_id, original_data,
                     deleted_at, expires_at, restored)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    entry.entry_id,
                    entry.resource_type,
                    entry.resource_id,
                    entry.original_data,
                    entry.deleted_at.isoformat(),
                    entry.expires_at.isoformat(),
                    int(entry.restored),
                ),
            )
        # Also snapshot the delete operation
        self.snapshot_before(resource_type, resource_id, data, "delete", actor)
        logger.info(
            "Resource soft-deleted",
            entry_id=entry.entry_id,
            resource_id=resource_id,
            expires_at=expires_at.isoformat(),
        )
        return entry

    def rollback(self, version_id: str) -> RollbackResult:
        """
        Roll back a resource to the state captured in *version_id*.

        The snapshot data is returned inside :class:`RollbackResult` so the
        caller can apply it to the actual storage layer.

        Parameters
        ----------
        version_id:
            The :attr:`ResourceVersion.version_id` to restore.

        Returns
        -------
        RollbackResult
            Indicates success/failure and the timestamp of the restored version.
        """
        now = _utcnow()
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM resource_versions WHERE version_id = ? AND expired = 0 LIMIT 1",
                (version_id,),
            ).fetchone()

        if row is None:
            logger.warning("Rollback failed — version not found", version_id=version_id)
            return RollbackResult(
                version_id=version_id,
                resource_id="unknown",
                rolled_back_to="",
                success=False,
                rollback_at=now,
            )

        version = self._row_to_version(row)
        logger.info(
            "Rollback succeeded",
            version_id=version_id,
            resource_id=version.resource_id,
            created_at=version.created_at.isoformat(),
        )
        return RollbackResult(
            version_id=version_id,
            resource_id=version.resource_id,
            rolled_back_to=version.created_at.isoformat(),
            success=True,
            rollback_at=now,
        )

    def restore_from_trash(self, entry_id: str) -> TrashEntry:
        """
        Mark a trash entry as restored.

        Parameters
        ----------
        entry_id:
            The :attr:`TrashEntry.entry_id` to restore.

        Returns
        -------
        TrashEntry
            The updated trash entry with ``restored=True``.

        Raises
        ------
        KeyError
            If the *entry_id* does not exist.
        """
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM trash_entries WHERE entry_id = ? LIMIT 1", (entry_id,)
            ).fetchone()
            if row is None:
                raise KeyError(f"Trash entry not found: {entry_id}")
            conn.execute(
                "UPDATE trash_entries SET restored = 1 WHERE entry_id = ?", (entry_id,)
            )
        entry = self._row_to_trash(row)
        entry = entry.model_copy(update={"restored": True})
        logger.info("Trash entry restored", entry_id=entry_id, resource_id=entry.resource_id)
        return entry

    def get_versions(
        self,
        resource_type: str,
        resource_id: str,
    ) -> list[ResourceVersion]:
        """
        Return all non-expired version snapshots for a resource (newest first).

        Parameters
        ----------
        resource_type, resource_id:
            Identify the resource.

        Returns
        -------
        list[ResourceVersion]
        """
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM resource_versions "
                "WHERE resource_type = ? AND resource_id = ? AND expired = 0 "
                "ORDER BY created_at DESC",
                (resource_type, resource_id),
            ).fetchall()
        return [self._row_to_version(row) for row in rows]

    def get_trash(
        self,
        resource_type: str | None = None,
    ) -> list[TrashEntry]:
        """
        Return all (non-expired, non-restored) trash entries.

        Parameters
        ----------
        resource_type:
            Optional filter.  When ``None``, all types are returned.

        Returns
        -------
        list[TrashEntry]
        """
        now = _utcnow().isoformat()
        with self._conn() as conn:
            if resource_type:
                rows = conn.execute(
                    "SELECT * FROM trash_entries "
                    "WHERE resource_type = ? AND restored = 0 AND expires_at > ? "
                    "ORDER BY deleted_at DESC",
                    (resource_type, now),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM trash_entries "
                    "WHERE restored = 0 AND expires_at > ? "
                    "ORDER BY deleted_at DESC",
                    (now,),
                ).fetchall()
        return [self._row_to_trash(row) for row in rows]

    def expire_old_versions(self) -> int:
        """
        Mark version snapshots older than *retention_days* as expired.

        Returns
        -------
        int
            Number of versions marked as expired.
        """
        cutoff = (_utcnow() - timedelta(days=self.config.retention_days)).isoformat()
        with self._conn() as conn:
            cursor = conn.execute(
                "UPDATE resource_versions SET expired = 1 WHERE created_at < ? AND expired = 0",
                (cutoff,),
            )
        removed = cursor.rowcount
        logger.info("Old versions expired", count=removed, cutoff=cutoff)
        return removed

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _enforce_version_limit(self, resource_type: str, resource_id: str) -> None:
        """Expire oldest versions when the limit is exceeded."""
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT version_id FROM resource_versions "
                "WHERE resource_type = ? AND resource_id = ? AND expired = 0 "
                "ORDER BY created_at ASC",
                (resource_type, resource_id),
            ).fetchall()

        overflow = len(rows) - self.config.max_versions_per_resource
        if overflow > 0:
            ids_to_expire = [row["version_id"] for row in rows[:overflow]]
            placeholders = ", ".join("?" * len(ids_to_expire))
            with self._conn() as conn:
                conn.execute(
                    f"UPDATE resource_versions SET expired = 1 WHERE version_id IN ({placeholders})",
                    ids_to_expire,
                )
            logger.debug(
                "Enforced version limit",
                resource_id=resource_id,
                expired_count=overflow,
            )
