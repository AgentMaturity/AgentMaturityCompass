"""
AMC Enforce E29 — Idempotency Shield
=====================================

Prevents duplicate actions (charges, emails, cancellations) when agents
retry or loop.  A deterministic key is derived from workflow/action/params;
subsequent calls with the same key are short-circuited and return the cached
ExecutionRecord instead of re-running.

Usage::

    from amc.enforce.e29_idempotency import IdempotencyShield, IdempotencyConfig

    shield = IdempotencyShield(db_path=":memory:")

    key = shield.generate_key("wf-001", "charge_card", {"amount": 99, "card": "tok_x"})
    can_proceed, existing = shield.check_and_lock(key, "wf-001", "charge_card")

    if can_proceed:
        result = do_real_work()
        record = shield.mark_completed(key, result)
    else:
        record = existing  # already done — safe to return

"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import structlog
from pydantic import BaseModel, Field

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class IdempotencyKey(BaseModel):
    """Represents a tracked idempotency key entry."""

    key: str
    workflow_id: str
    action_type: str
    created_at: datetime
    expires_at: datetime
    status: Literal["pending", "completed", "failed"]


class IdempotencyConfig(BaseModel):
    """Configuration for the IdempotencyShield."""

    default_ttl_seconds: int = 86400
    max_retries: int = 3
    key_prefix: str = "amc"


class ExecutionRecord(BaseModel):
    """Record of a single execution attempt."""

    idempotency_key: str
    attempt_number: int
    result_hash: str | None
    executed_at: datetime
    success: bool


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------


class IdempotencyShield:
    """
    SQLite-backed idempotency shield for agent workflows.

    All public methods are thread-safe at the SQLite WAL level.
    """

    def __init__(
        self,
        config: IdempotencyConfig | None = None,
        db_path: str = "idempotency.db",
    ) -> None:
        """
        Initialise the shield.

        Args:
            config: Optional :class:`IdempotencyConfig`.  Defaults are used
                    when *None*.
            db_path: Path to the SQLite database file.  Use ``":memory:"``
                     for ephemeral/test usage.
        """
        self.config = config or IdempotencyConfig()
        self._db_path = db_path
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._bootstrap()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _bootstrap(self) -> None:
        """Create tables if they don't exist."""
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS idempotency_keys (
                key          TEXT PRIMARY KEY,
                workflow_id  TEXT NOT NULL,
                action_type  TEXT NOT NULL,
                created_at   TEXT NOT NULL,
                expires_at   TEXT NOT NULL,
                status       TEXT NOT NULL DEFAULT 'pending'
            );

            CREATE TABLE IF NOT EXISTS execution_records (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                idempotency_key TEXT NOT NULL,
                attempt_number  INTEGER NOT NULL,
                result_hash     TEXT,
                executed_at     TEXT NOT NULL,
                success         INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (idempotency_key) REFERENCES idempotency_keys(key)
            );
            """
        )
        self._conn.commit()

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _parse_dt(value: str) -> datetime:
        return datetime.fromisoformat(value)

    def _row_to_record(self, row: tuple) -> ExecutionRecord:
        _, key, attempt, result_hash, executed_at, success = row
        return ExecutionRecord(
            idempotency_key=key,
            attempt_number=attempt,
            result_hash=result_hash,
            executed_at=self._parse_dt(executed_at),
            success=bool(success),
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_key(
        self, workflow_id: str, action_type: str, params: dict[str, Any]
    ) -> str:
        """
        Create a deterministic idempotency key from the given parameters.

        The key is a hex SHA-256 digest of the canonical JSON representation
        of *params*, prefixed with ``<key_prefix>:<workflow_id>:<action_type>:``.

        Args:
            workflow_id: Identifier for the owning workflow.
            action_type: The action being guarded (e.g. ``"charge_card"``).
            params: Arbitrary dict of action parameters.

        Returns:
            A stable string key.
        """
        canonical = json.dumps(params, sort_keys=True, ensure_ascii=True)
        digest = hashlib.sha256(canonical.encode()).hexdigest()
        return f"{self.config.key_prefix}:{workflow_id}:{action_type}:{digest}"

    def check_and_lock(
        self,
        key: str,
        workflow_id: str,
        action_type: str,
    ) -> tuple[bool, ExecutionRecord | None]:
        """
        Atomically check the key status and, if fresh, insert a *pending* lock.

        Returns:
            ``(True, None)`` — key is new or expired; caller may proceed.
            ``(False, record)`` — key already completed; caller must NOT re-execute.

        Side-effects:
            * Inserts a new ``idempotency_keys`` row (status=*pending*) and a
              corresponding ``execution_records`` row when returning ``True``.
        """
        now = self._now()

        # Fetch existing key row (if any)
        cur = self._conn.execute(
            "SELECT key, workflow_id, action_type, created_at, expires_at, status "
            "FROM idempotency_keys WHERE key = ?",
            (key,),
        )
        row = cur.fetchone()

        if row is not None:
            _, _, _, created_at_s, expires_at_s, status = row
            expires_at = self._parse_dt(expires_at_s)

            if status == "completed" and expires_at > now:
                # Retrieve the latest successful execution record
                rec_cur = self._conn.execute(
                    "SELECT * FROM execution_records "
                    "WHERE idempotency_key = ? AND success = 1 "
                    "ORDER BY attempt_number DESC LIMIT 1",
                    (key,),
                )
                rec_row = rec_cur.fetchone()
                if rec_row:
                    record = self._row_to_record(rec_row)
                    logger.info(
                        "idempotency.blocked",
                        key=key,
                        status=status,
                    )
                    return False, record

            if status == "pending" and expires_at > now:
                # In-flight — also block (prevents concurrent re-entry)
                logger.warning("idempotency.in_flight", key=key)
                return False, None

            if expires_at <= now:
                # Expired key — delete and allow re-execution
                self._conn.execute(
                    "DELETE FROM idempotency_keys WHERE key = ?", (key,)
                )
                self._conn.execute(
                    "DELETE FROM execution_records WHERE idempotency_key = ?", (key,)
                )
                self._conn.commit()
                logger.info("idempotency.expired_cleared", key=key)
                row = None  # fall through to insert

        # Determine attempt number
        attempt_cur = self._conn.execute(
            "SELECT COUNT(*) FROM execution_records WHERE idempotency_key = ?",
            (key,),
        )
        attempt_count = (attempt_cur.fetchone() or (0,))[0]
        attempt_number = attempt_count + 1

        expires_at = now + timedelta(seconds=self.config.default_ttl_seconds)

        if row is None:
            self._conn.execute(
                "INSERT INTO idempotency_keys "
                "(key, workflow_id, action_type, created_at, expires_at, status) "
                "VALUES (?, ?, ?, ?, ?, 'pending')",
                (
                    key,
                    workflow_id,
                    action_type,
                    now.isoformat(),
                    expires_at.isoformat(),
                ),
            )
        else:
            # Update status back to pending (was failed before, retrying)
            self._conn.execute(
                "UPDATE idempotency_keys SET status = 'pending', expires_at = ? WHERE key = ?",
                (expires_at.isoformat(), key),
            )

        self._conn.execute(
            "INSERT INTO execution_records "
            "(idempotency_key, attempt_number, result_hash, executed_at, success) "
            "VALUES (?, ?, NULL, ?, 0)",
            (key, attempt_number, now.isoformat()),
        )
        self._conn.commit()

        logger.info(
            "idempotency.locked",
            key=key,
            attempt=attempt_number,
        )
        return True, None

    def mark_completed(self, key: str, result: dict[str, Any]) -> ExecutionRecord:
        """
        Mark a pending key as *completed* and store a hash of the result.

        Args:
            key: The idempotency key previously locked via :meth:`check_and_lock`.
            result: The action result dict (hashed for audit; not stored in full).

        Returns:
            The updated :class:`ExecutionRecord`.
        """
        result_hash = hashlib.sha256(
            json.dumps(result, sort_keys=True).encode()
        ).hexdigest()
        now = self._now()

        self._conn.execute(
            "UPDATE idempotency_keys SET status = 'completed' WHERE key = ?",
            (key,),
        )
        # SQLite does not support ORDER BY/LIMIT in UPDATE without special flags;
        # use a subquery to target the latest pending record.
        self._conn.execute(
            "UPDATE execution_records SET success = 1, result_hash = ?, executed_at = ? "
            "WHERE id = ("
            "  SELECT id FROM execution_records "
            "  WHERE idempotency_key = ? AND success = 0 "
            "  ORDER BY attempt_number DESC LIMIT 1"
            ")",
            (result_hash, now.isoformat(), key),
        )
        self._conn.commit()

        cur = self._conn.execute(
            "SELECT * FROM execution_records WHERE idempotency_key = ? AND success = 1 "
            "ORDER BY attempt_number DESC LIMIT 1",
            (key,),
        )
        row = cur.fetchone()
        record = self._row_to_record(row)
        logger.info("idempotency.completed", key=key, result_hash=result_hash)
        return record

    def mark_failed(self, key: str, error: str) -> ExecutionRecord:
        """
        Mark a pending key as *failed*.

        Args:
            key: The idempotency key to fail.
            error: Human-readable error description.

        Returns:
            The latest :class:`ExecutionRecord` for this key.
        """
        now = self._now()
        error_hash = hashlib.sha256(error.encode()).hexdigest()

        self._conn.execute(
            "UPDATE idempotency_keys SET status = 'failed' WHERE key = ?",
            (key,),
        )
        # SQLite does not support ORDER BY/LIMIT in UPDATE without special flags;
        # use a subquery to target the latest pending record.
        self._conn.execute(
            "UPDATE execution_records SET success = 0, result_hash = ?, executed_at = ? "
            "WHERE id = ("
            "  SELECT id FROM execution_records "
            "  WHERE idempotency_key = ? AND success = 0 "
            "  ORDER BY attempt_number DESC LIMIT 1"
            ")",
            (error_hash, now.isoformat(), key),
        )
        self._conn.commit()

        cur = self._conn.execute(
            "SELECT * FROM execution_records WHERE idempotency_key = ? "
            "ORDER BY attempt_number DESC LIMIT 1",
            (key,),
        )
        row = cur.fetchone()
        record = self._row_to_record(row)
        logger.warning("idempotency.failed", key=key, error=error)
        return record

    def cleanup_expired(self) -> int:
        """
        Delete all expired idempotency keys and their execution records.

        Returns:
            Number of key rows deleted.
        """
        now = self._now()
        cur = self._conn.execute(
            "SELECT key FROM idempotency_keys WHERE expires_at <= ?",
            (now.isoformat(),),
        )
        expired_keys = [r[0] for r in cur.fetchall()]

        if not expired_keys:
            return 0

        placeholders = ",".join("?" * len(expired_keys))
        self._conn.execute(
            f"DELETE FROM execution_records WHERE idempotency_key IN ({placeholders})",
            expired_keys,
        )
        self._conn.execute(
            f"DELETE FROM idempotency_keys WHERE key IN ({placeholders})",
            expired_keys,
        )
        self._conn.commit()

        logger.info("idempotency.cleanup", deleted=len(expired_keys))
        return len(expired_keys)
