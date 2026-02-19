"""
AMC Vault — V5: Memory TTL and Purpose Limitation Manager
========================================================

Purpose
-------
Short-lived memory storage with purpose tagging, retention policies and strict
class-based access checks.

Usage
-----

.. code-block:: python

    from amc.vault.v5_memory_ttl import MemoryTTLManager

    mgr = MemoryTTLManager(db_path="/tmp/amc_memory.db")
    mgr.set_session_policy("finance_agent", "finance_agent")

    rec = mgr.store(
        key="invoice::2026-001",
        value={"vendor": "acme", "amount": 1200},
        purpose_tag="finance-review",
        ttl_seconds=3600,
        data_class="financial",
        owner_session="finance_agent",
    )

    # retrieve returns hash-only metadata (raw value remains in caller memory only)
    hit = mgr.retrieve("invoice::2026-001", requesting_session="finance_agent")
    print(hit.value_hash)
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal

import structlog
from pydantic import BaseModel, Field, field_validator

log = structlog.get_logger(__name__)

DataClass = Literal["operational", "personal", "financial", "support", "pii"]

_SCHEMA = """
CREATE TABLE IF NOT EXISTS memory_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    value_hash TEXT NOT NULL,
    purpose_tag TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    owner_session TEXT NOT NULL,
    data_class TEXT NOT NULL,
    UNIQUE(key, owner_session)
);
CREATE INDEX IF NOT EXISTS idx_memory_records_owner ON memory_records(owner_session);
CREATE INDEX IF NOT EXISTS idx_memory_records_expires ON memory_records(expires_at);
CREATE INDEX IF NOT EXISTS idx_memory_records_class ON memory_records(data_class);

CREATE TABLE IF NOT EXISTS memory_expiry_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    owner_session TEXT NOT NULL,
    value_hash TEXT NOT NULL,
    data_class TEXT NOT NULL,
    expired_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_session_policies (
    session_id TEXT PRIMARY KEY,
    policy_name TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


class MemoryRecord(BaseModel):
    """Returned when a memory record is successfully retrieved."""

    key: str
    value_hash: str
    purpose_tag: str
    created_at: datetime
    expires_at: datetime
    owner_session: str
    data_class: DataClass

    @field_validator("value_hash")
    @classmethod
    def _normalize_value_hash(cls, value: str) -> str:
        if len(value) != 64:
            raise ValueError("value_hash must be 64 hex chars")
        return value.lower()


class MemoryTTLPolicy(BaseModel):
    """Session policy profile."""

    policy_name: str
    operational_ttl_days: int
    pii_allowed: bool = True
    allow_all_classes: bool = True


class DeletionEvent(BaseModel):
    """Structured deletion record for audit/GDPR evidence."""

    key: str
    owner_session: str
    value_hash: str
    data_class: DataClass
    recorded_at: datetime
    expires_at: datetime


class MemoryTTLManager:
    """SQLite-backed TTL manager with purpose and class restrictions."""

    DEFAULT_NO_STORE_ZONES = [
        r"ssn",
        r"password",
        r"passcode",
        r"raw_key",
        r"secret_key",
        r"api_secret",
        r"credit_card",
        r"bank_account",
    ]

    POLICY_TEMPLATES: dict[str, MemoryTTLPolicy] = {
        "support_agent": MemoryTTLPolicy(policy_name="support_agent", operational_ttl_days=30, pii_allowed=False),
        "finance_agent": MemoryTTLPolicy(policy_name="finance_agent", operational_ttl_days=7, pii_allowed=True),
        "personal_agent": MemoryTTLPolicy(policy_name="personal_agent", operational_ttl_days=90, pii_allowed=True),
    }

    def __init__(
        self,
        db_path: str | Path = "/tmp/amc_memory_ttl.db",
        *,
        policy_templates: dict[str, MemoryTTLPolicy] | None = None,
        no_store_zones: list[str] | None = None,
        default_template: str = "support_agent",
    ) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        merged = dict(self.POLICY_TEMPLATES)
        if policy_templates:
            merged.update(policy_templates)
        self.policy_templates = merged
        self.default_template = default_template

        self.no_store_patterns = [re.compile(p, re.I) for p in (no_store_zones or self.DEFAULT_NO_STORE_ZONES)]
        self._init_schema()

    # public ----------------------------------------------------------

    def set_session_policy(self, session_id: str, policy_name: str) -> None:
        """Attach a policy profile to session_id."""
        if policy_name not in self.policy_templates:
            raise ValueError(f"Unknown policy template: {policy_name}")
        now = datetime.now(timezone.utc).isoformat()
        with self._tx() as cur:
            cur.execute(
                "INSERT OR REPLACE INTO memory_session_policies (session_id, policy_name, updated_at) VALUES (?, ?, ?)",
                (session_id, policy_name, now),
            )

    def store(
        self,
        *,
        key: str,
        value: Any,
        purpose_tag: str,
        ttl_seconds: int,
        data_class: DataClass,
        owner_session: str,
    ) -> MemoryRecord:
        """Store a value hash for exactly ``ttl_seconds`` or profile default."""
        self._assert_store_allowed(key, data_class, owner_session)

        policy = self._get_policy(owner_session)
        effective_ttl = ttl_seconds
        if effective_ttl <= 0:
            effective_ttl = self._default_ttl_seconds(policy, data_class)

        if effective_ttl <= 0:
            raise ValueError("TTL must be positive after policy fallback")

        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=effective_ttl)
        serial = json.dumps(value, sort_keys=True, default=str)
        value_hash = hashlib.sha256(serial.encode("utf-8")).hexdigest()

        with self._tx() as cur:
            cur.execute(
                """
                INSERT INTO memory_records
                (key, value_hash, purpose_tag, created_at, expires_at, owner_session, data_class)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(key, owner_session) DO UPDATE SET
                    value_hash = excluded.value_hash,
                    purpose_tag = excluded.purpose_tag,
                    created_at = excluded.created_at,
                    expires_at = excluded.expires_at,
                    data_class = excluded.data_class
                """,
                (
                    key,
                    value_hash,
                    purpose_tag,
                    now.isoformat(),
                    expires_at.isoformat(),
                    owner_session,
                    data_class,
                ),
            )

        log.info(
            "memory_ttl.store",
            key=key,
            owner_session=owner_session,
            data_class=data_class,
            ttl_seconds=effective_ttl,
        )

        return MemoryRecord(
            key=key,
            value_hash=value_hash,
            purpose_tag=purpose_tag,
            created_at=now,
            expires_at=expires_at,
            owner_session=owner_session,
            data_class=data_class,
        )

    def retrieve(self, key: str, requesting_session: str) -> MemoryRecord | None:
        """Return stored metadata only if session is authorized and unexpired."""
        with self._tx() as cur:
            row = cur.execute(
                "SELECT key, value_hash, purpose_tag, created_at, expires_at, owner_session, data_class FROM memory_records WHERE key = ?",
                (key,),
            ).fetchone()

        if not row:
            return None

        record = MemoryRecord(
            key=row[0],
            value_hash=row[1],
            purpose_tag=row[2],
            created_at=datetime.fromisoformat(row[3]),
            expires_at=datetime.fromisoformat(row[4]),
            owner_session=row[5],
            data_class=row[6],
        )

        if datetime.now(timezone.utc) > record.expires_at:
            return None

        self._assert_access(requesting_session, record)
        return record

    def expire_due(self) -> list[str]:
        """Delete and log all expired records. Returns expired keys."""
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        expired: list[tuple[str, str, str, str, datetime]] = []

        with self._tx() as cur:
            for row in cur.execute("SELECT key, owner_session, value_hash, data_class, expires_at FROM memory_records WHERE expires_at <= ?", (now_iso,)):
                key, owner_session, value_hash, data_class, expires_at = row
                expired.append((key, owner_session, value_hash, data_class, datetime.fromisoformat(expires_at)))

            cur.execute("DELETE FROM memory_records WHERE expires_at <= ?", (now_iso,))

            for key, owner_session, value_hash, data_class, expires_at in expired:
                cur.execute(
                    "INSERT INTO memory_expiry_log (key, owner_session, value_hash, data_class, expired_at, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        key,
                        owner_session,
                        value_hash,
                        data_class,
                        expires_at.isoformat(),
                        now_iso,
                    ),
                )

        return [k for k, *_ in expired]

    def delete(self, key: str, owner_session: str) -> bool:
        """Delete a record explicitly and log deletion event."""
        now = datetime.now(timezone.utc)
        with self._tx() as cur:
            row = cur.execute(
                "SELECT key, owner_session, value_hash, data_class, expires_at FROM memory_records WHERE key = ? AND owner_session = ?",
                (key, owner_session),
            ).fetchone()
            if not row:
                return False

            cur.execute("DELETE FROM memory_records WHERE key = ? AND owner_session = ?", (key, owner_session))
            cur.execute(
                "INSERT INTO memory_expiry_log (key, owner_session, value_hash, data_class, expired_at, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
                (row[0], row[1], row[2], row[3], row[4], now.isoformat()),
            )

        return True

    def list_all(self, session_id: str | None = None) -> list[MemoryRecord]:
        """List active records (raw values are never included)."""
        with self._tx() as cur:
            if session_id:
                rows = cur.execute(
                    "SELECT key, value_hash, purpose_tag, created_at, expires_at, owner_session, data_class FROM memory_records WHERE owner_session = ? ORDER BY expires_at",
                    (session_id,),
                ).fetchall()
            else:
                rows = cur.execute(
                    "SELECT key, value_hash, purpose_tag, created_at, expires_at, owner_session, data_class FROM memory_records ORDER BY expires_at",
                ).fetchall()

        out: list[MemoryRecord] = []
        now = datetime.now(timezone.utc)
        for row in rows:
            exp = datetime.fromisoformat(row[4])
            if exp <= now:
                continue
            out.append(
                MemoryRecord(
                    key=row[0],
                    value_hash=row[1],
                    purpose_tag=row[2],
                    created_at=datetime.fromisoformat(row[3]),
                    expires_at=exp,
                    owner_session=row[5],
                    data_class=row[6],
                )
            )
        return out

    def audit_report(self, *, approaching_hours: int = 24) -> dict[str, Any]:
        """Summary view by class and records nearing expiry."""
        now = datetime.now(timezone.utc)
        horizon = now + timedelta(hours=approaching_hours)

        with self._tx() as cur:
            counts = cur.execute("SELECT data_class, COUNT(*) FROM memory_records GROUP BY data_class").fetchall()
            expiring = cur.execute(
                "SELECT key, data_class, expires_at FROM memory_records WHERE expires_at <= ? ORDER BY expires_at",
                (horizon.isoformat(),),
            ).fetchall()
            expiry_events = cur.execute(
                "SELECT key, owner_session, value_hash, data_class, recorded_at FROM memory_expiry_log ORDER BY recorded_at DESC LIMIT 25"
            ).fetchall()

        return {
            "by_data_class": {cls: cnt for cls, cnt in counts},
            "approaching_expiry": [
                {"key": k, "data_class": d, "expires_at": e}
                for k, d, e in expiring
            ],
            "approaching_expiry_hours": approaching_hours,
            "recent_deletion_events": [
                {
                    "key": r[0],
                    "owner_session": r[1],
                    "value_hash": r[2],
                    "data_class": r[3],
                    "recorded_at": r[4],
                }
                for r in expiry_events
            ],
            "total_active": len(self.list_all()),
        }

    # internal --------------------------------------------------------

    @contextmanager
    def _tx(self):
        conn = sqlite3.connect(self.db_path)
        try:
            cur = conn.cursor()
            yield cur
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._tx() as cur:
            cur.executescript(_SCHEMA)

    def _get_policy(self, session_id: str) -> MemoryTTLPolicy:
        with self._tx() as cur:
            row = cur.execute("SELECT policy_name FROM memory_session_policies WHERE session_id = ?", (session_id,)).fetchone()

        policy_name = row[0] if row else self.default_template
        policy = self.policy_templates.get(policy_name)
        if policy is None:
            log.warning("memory_ttl.unknown_policy", session_id=session_id, policy_name=policy_name)
            policy = self.POLICY_TEMPLATES[self.default_template]
        return policy

    def _assert_store_allowed(self, key: str, data_class: DataClass, owner_session: str) -> None:
        for pattern in self.no_store_patterns:
            if pattern.search(key):
                raise ValueError(f"Field '{key}' is blocked by no-store policy")

        policy = self._get_policy(owner_session)
        if data_class == "pii" and not policy.pii_allowed:
            raise PermissionError("Store denied: PII not allowed for requesting session policy")

    def _assert_access(self, requesting_session: str, record: MemoryRecord) -> None:
        if requesting_session == record.owner_session:
            return

        policy = self._get_policy(requesting_session)

        if record.data_class == "pii" and not policy.pii_allowed:
            raise PermissionError("PII access denied for requesting_session")

        # Example hardening: support role cannot access personal records.
        if policy.policy_name == "support_agent" and record.data_class == "personal":
            raise PermissionError("Support profile cannot read personal memory")

        if not policy.allow_all_classes:
            raise PermissionError(f"Policy denies class '{record.data_class}' for session '{requesting_session}'")

    def _default_ttl_seconds(self, policy: MemoryTTLPolicy, data_class: DataClass) -> int:
        # Template is class-aware only for the operational default.
        if data_class == "operational":
            return policy.operational_ttl_days * 24 * 3600

        # default fallbacks
        if data_class == "financial":
            return 7 * 24 * 3600
        if data_class == "personal":
            return 90 * 24 * 3600
        if data_class == "support":
            return 30 * 24 * 3600
        # pii inherits strict controls
        return 7 * 24 * 3600


MemoryRecord.model_rebuild()
DeletionEvent.model_rebuild()
MemoryTTLPolicy.model_rebuild()
