"""Tool Call Rate Limiter — Wave-2 Tool Intelligence.

Per-tool, per-tenant rate limiting with:
  - Token bucket algorithm (configurable capacity + refill rate)
  - Burst allowance
  - Queue depth tracking
  - Next-available-window calculation
  - Backpressure signalling for agent planner

SQLite-backed for cross-process consistency and audit.
"""
from __future__ import annotations

import json
import math
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS rate_limit_policies (
    policy_id           TEXT PRIMARY KEY,
    tool_name           TEXT NOT NULL,
    tenant_id           TEXT NOT NULL DEFAULT '',
    calls_per_minute    INTEGER NOT NULL DEFAULT 60,
    calls_per_hour      INTEGER NOT NULL DEFAULT 1000,
    burst_capacity      INTEGER NOT NULL DEFAULT 10,
    queue_max_depth     INTEGER NOT NULL DEFAULT 50,
    active              INTEGER NOT NULL DEFAULT 1,
    metadata_json       TEXT NOT NULL DEFAULT '{}',
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    UNIQUE(tool_name, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_rl_policy_tool ON rate_limit_policies(tool_name);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    bucket_id           TEXT PRIMARY KEY,
    policy_id           TEXT NOT NULL UNIQUE,
    tool_name           TEXT NOT NULL,
    tenant_id           TEXT NOT NULL DEFAULT '',
    tokens              REAL NOT NULL DEFAULT 0.0,
    last_refill_at      TEXT NOT NULL,
    total_calls         INTEGER NOT NULL DEFAULT 0,
    total_allowed       INTEGER NOT NULL DEFAULT 0,
    total_denied        INTEGER NOT NULL DEFAULT 0,
    queue_depth         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rl_bucket_policy ON rate_limit_buckets(policy_id);

CREATE TABLE IF NOT EXISTS rate_limit_events (
    event_id            TEXT PRIMARY KEY,
    policy_id           TEXT NOT NULL,
    tool_name           TEXT NOT NULL,
    tenant_id           TEXT NOT NULL DEFAULT '',
    allowed             INTEGER NOT NULL DEFAULT 1,
    tokens_before       REAL NOT NULL DEFAULT 0.0,
    tokens_after        REAL NOT NULL DEFAULT 0.0,
    wait_ms             INTEGER NOT NULL DEFAULT 0,
    session_id          TEXT NOT NULL DEFAULT '',
    metadata_json       TEXT NOT NULL DEFAULT '{}',
    created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rl_events_policy ON rate_limit_events(policy_id);
CREATE INDEX IF NOT EXISTS idx_rl_events_created ON rate_limit_events(created_at);
"""

_UTC = timezone.utc


def _now_iso() -> str:
    return datetime.now(_UTC).isoformat()


def _parse_dt(iso: str) -> datetime:
    return datetime.fromisoformat(iso)


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class RateLimitPolicy:
    policy_id: str
    tool_name: str
    tenant_id: str
    calls_per_minute: int
    calls_per_hour: int
    burst_capacity: int
    queue_max_depth: int
    active: bool
    metadata: dict[str, Any]
    created_at: str
    updated_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "policy_id": self.policy_id,
            "tool_name": self.tool_name,
            "tenant_id": self.tenant_id,
            "calls_per_minute": self.calls_per_minute,
            "calls_per_hour": self.calls_per_hour,
            "burst_capacity": self.burst_capacity,
            "queue_max_depth": self.queue_max_depth,
            "active": self.active,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class RateLimitBucket:
    bucket_id: str
    policy_id: str
    tool_name: str
    tenant_id: str
    tokens: float
    last_refill_at: str
    total_calls: int
    total_allowed: int
    total_denied: int
    queue_depth: int

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "bucket_id": self.bucket_id,
            "policy_id": self.policy_id,
            "tool_name": self.tool_name,
            "tenant_id": self.tenant_id,
            "tokens": round(self.tokens, 4),
            "last_refill_at": self.last_refill_at,
            "total_calls": self.total_calls,
            "total_allowed": self.total_allowed,
            "total_denied": self.total_denied,
            "queue_depth": self.queue_depth,
        }


@dataclass
class RateLimitDecision:
    tool_name: str
    tenant_id: str
    allowed: bool
    tokens_remaining: float
    wait_ms: int               # 0 = no wait; >0 = retry after this many ms
    next_window_iso: str       # ISO timestamp when next token available
    queue_depth: int
    policy_id: str | None
    reason: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "tool_name": self.tool_name,
            "tenant_id": self.tenant_id,
            "allowed": self.allowed,
            "tokens_remaining": round(self.tokens_remaining, 4),
            "wait_ms": self.wait_ms,
            "next_window_iso": self.next_window_iso,
            "queue_depth": self.queue_depth,
            "policy_id": self.policy_id,
            "reason": self.reason,
        }


@dataclass
class RateLimitEvent:
    event_id: str
    policy_id: str
    tool_name: str
    tenant_id: str
    allowed: bool
    tokens_before: float
    tokens_after: float
    wait_ms: int
    session_id: str
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "policy_id": self.policy_id,
            "tool_name": self.tool_name,
            "tenant_id": self.tenant_id,
            "allowed": self.allowed,
            "tokens_before": round(self.tokens_before, 4),
            "tokens_after": round(self.tokens_after, 4),
            "wait_ms": self.wait_ms,
            "session_id": self.session_id,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


# ---------------------------------------------------------------------------
# Token bucket logic
# ---------------------------------------------------------------------------


def _refill(
    tokens: float,
    last_refill_iso: str,
    policy: RateLimitPolicy,
) -> tuple[float, str]:
    """Refill bucket tokens based on elapsed time. Returns (new_tokens, new_last_refill)."""
    now = datetime.now(_UTC)
    last = _parse_dt(last_refill_iso)
    elapsed_seconds = (now - last).total_seconds()
    if elapsed_seconds <= 0:
        return tokens, last_refill_iso

    # Refill rate = calls_per_minute / 60 tokens per second
    refill_rate = policy.calls_per_minute / 60.0
    new_tokens = min(
        float(policy.burst_capacity),
        tokens + elapsed_seconds * refill_rate,
    )
    return new_tokens, now.isoformat()


def _wait_ms_for_token(tokens: float, policy: RateLimitPolicy) -> int:
    """Estimate ms until one token is available."""
    if tokens >= 1.0:
        return 0
    deficit = 1.0 - tokens
    refill_rate = policy.calls_per_minute / 60.0  # tokens/sec
    if refill_rate <= 0:
        return 999_999
    wait_sec = deficit / refill_rate
    return int(math.ceil(wait_sec * 1000))


# ---------------------------------------------------------------------------
# Core limiter
# ---------------------------------------------------------------------------


class ToolRateLimiter:
    """Per-tool, per-tenant token-bucket rate limiter. SQLite-backed."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(product_db_path(db_path))
        self._conn = self._init_db()

    def _init_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.executescript(_SCHEMA_SQL)
        conn.commit()
        return conn

    # ── Policy management ─────────────────────────────────────────────────

    def set_policy(
        self,
        tool_name: str,
        calls_per_minute: int = 60,
        calls_per_hour: int = 1000,
        burst_capacity: int = 10,
        queue_max_depth: int = 50,
        tenant_id: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> RateLimitPolicy:
        """Create or update a rate limit policy for a tool."""
        now = _now_iso()
        existing = self._conn.execute(
            "SELECT policy_id FROM rate_limit_policies WHERE tool_name=? AND tenant_id=?",
            (tool_name, tenant_id),
        ).fetchone()

        if existing:
            policy_id = existing["policy_id"]
            self._conn.execute(
                """UPDATE rate_limit_policies
                   SET calls_per_minute=?,calls_per_hour=?,burst_capacity=?,
                       queue_max_depth=?,active=1,metadata_json=?,updated_at=?
                   WHERE policy_id=?""",
                (
                    calls_per_minute, calls_per_hour, burst_capacity,
                    queue_max_depth, json.dumps(metadata or {}), now, policy_id,
                ),
            )
        else:
            policy_id = str(uuid.uuid4())
            self._conn.execute(
                """INSERT INTO rate_limit_policies
                   (policy_id,tool_name,tenant_id,calls_per_minute,calls_per_hour,
                    burst_capacity,queue_max_depth,active,metadata_json,created_at,updated_at)
                   VALUES (?,?,?,?,?,?,?,1,?,?,?)""",
                (
                    policy_id, tool_name, tenant_id,
                    calls_per_minute, calls_per_hour, burst_capacity,
                    queue_max_depth, json.dumps(metadata or {}), now, now,
                ),
            )
            # Create initial bucket
            bucket_id = str(uuid.uuid4())
            self._conn.execute(
                """INSERT INTO rate_limit_buckets
                   (bucket_id,policy_id,tool_name,tenant_id,tokens,last_refill_at,
                    total_calls,total_allowed,total_denied,queue_depth)
                   VALUES (?,?,?,?,?,?,0,0,0,0)""",
                (bucket_id, policy_id, tool_name, tenant_id, float(burst_capacity), now),
            )
        self._conn.commit()

        return RateLimitPolicy(
            policy_id=policy_id, tool_name=tool_name, tenant_id=tenant_id,
            calls_per_minute=calls_per_minute, calls_per_hour=calls_per_hour,
            burst_capacity=burst_capacity, queue_max_depth=queue_max_depth,
            active=True, metadata=metadata or {}, created_at=now, updated_at=now,
        )

    def get_policy(self, tool_name: str, tenant_id: str = "") -> RateLimitPolicy | None:
        row = self._conn.execute(
            "SELECT * FROM rate_limit_policies WHERE tool_name=? AND tenant_id=? AND active=1",
            (tool_name, tenant_id),
        ).fetchone()
        return self._row_to_policy(row) if row else None

    def list_policies(self, tenant_id: str | None = None, active_only: bool = True) -> list[RateLimitPolicy]:
        q = "SELECT * FROM rate_limit_policies WHERE 1=1"
        params: list[Any] = []
        if tenant_id is not None:
            q += " AND tenant_id=?"; params.append(tenant_id)
        if active_only:
            q += " AND active=1"
        q += " ORDER BY tool_name"
        return [self._row_to_policy(r) for r in self._conn.execute(q, params).fetchall()]

    def deactivate_policy(self, policy_id: str) -> bool:
        now = _now_iso()
        cur = self._conn.execute(
            "UPDATE rate_limit_policies SET active=0, updated_at=? WHERE policy_id=?",
            (now, policy_id),
        )
        self._conn.commit()
        return cur.rowcount > 0

    # ── Rate check ────────────────────────────────────────────────────────

    def check_and_consume(
        self,
        tool_name: str,
        tenant_id: str = "",
        session_id: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> RateLimitDecision:
        """Attempt to consume one token. Returns decision with wait_ms if denied."""
        policy = self.get_policy(tool_name, tenant_id)
        if not policy:
            # No policy = unlimited
            return RateLimitDecision(
                tool_name=tool_name, tenant_id=tenant_id,
                allowed=True, tokens_remaining=999.0, wait_ms=0,
                next_window_iso=_now_iso(), queue_depth=0,
                policy_id=None, reason="No rate limit policy configured",
            )

        bucket_row = self._conn.execute(
            "SELECT * FROM rate_limit_buckets WHERE policy_id=?", (policy.policy_id,)
        ).fetchone()

        if not bucket_row:
            return RateLimitDecision(
                tool_name=tool_name, tenant_id=tenant_id,
                allowed=False, tokens_remaining=0.0, wait_ms=1000,
                next_window_iso=_now_iso(), queue_depth=0,
                policy_id=policy.policy_id, reason="Bucket not initialized",
            )

        # Refill
        tokens, new_refill = _refill(bucket_row["tokens"], bucket_row["last_refill_at"], policy)
        tokens_before = tokens

        allowed = tokens >= 1.0
        wait_ms = 0
        next_window_iso = _now_iso()

        if allowed:
            tokens -= 1.0
            tokens_after = tokens
        else:
            wait_ms = _wait_ms_for_token(tokens, policy)
            tokens_after = tokens
            next_window_iso = (
                datetime.now(_UTC) + timedelta(milliseconds=wait_ms)
            ).isoformat()

        # Update bucket
        queue_depth = bucket_row["queue_depth"]
        if not allowed and queue_depth < policy.queue_max_depth:
            queue_depth += 1
        elif allowed and queue_depth > 0:
            queue_depth = max(0, queue_depth - 1)

        self._conn.execute(
            """UPDATE rate_limit_buckets
               SET tokens=?,last_refill_at=?,total_calls=total_calls+1,
                   total_allowed=total_allowed+?,total_denied=total_denied+?,
                   queue_depth=?
               WHERE policy_id=?""",
            (
                tokens_after, new_refill,
                1 if allowed else 0, 0 if allowed else 1,
                queue_depth, policy.policy_id,
            ),
        )

        # Log event
        event_id = str(uuid.uuid4())
        self._conn.execute(
            """INSERT INTO rate_limit_events
               (event_id,policy_id,tool_name,tenant_id,allowed,
                tokens_before,tokens_after,wait_ms,session_id,metadata_json,created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                event_id, policy.policy_id, tool_name, tenant_id,
                1 if allowed else 0,
                tokens_before, tokens_after, wait_ms,
                session_id, json.dumps(metadata or {}), _now_iso(),
            ),
        )
        self._conn.commit()

        return RateLimitDecision(
            tool_name=tool_name, tenant_id=tenant_id,
            allowed=allowed, tokens_remaining=tokens_after,
            wait_ms=wait_ms, next_window_iso=next_window_iso,
            queue_depth=queue_depth, policy_id=policy.policy_id,
            reason="Allowed" if allowed else f"Rate limit exceeded. Retry in {wait_ms}ms",
        )

    def get_bucket(self, tool_name: str, tenant_id: str = "") -> RateLimitBucket | None:
        """Get current bucket state for a tool."""
        policy = self.get_policy(tool_name, tenant_id)
        if not policy:
            return None
        row = self._conn.execute(
            "SELECT * FROM rate_limit_buckets WHERE policy_id=?", (policy.policy_id,)
        ).fetchone()
        if not row:
            return None
        return RateLimitBucket(
            bucket_id=row["bucket_id"], policy_id=row["policy_id"],
            tool_name=row["tool_name"], tenant_id=row["tenant_id"],
            tokens=row["tokens"], last_refill_at=row["last_refill_at"],
            total_calls=row["total_calls"], total_allowed=row["total_allowed"],
            total_denied=row["total_denied"], queue_depth=row["queue_depth"],
        )

    def list_events(
        self,
        tool_name: str | None = None,
        tenant_id: str | None = None,
        allowed_only: bool | None = None,
        limit: int = 200,
    ) -> list[RateLimitEvent]:
        q = "SELECT * FROM rate_limit_events WHERE 1=1"
        params: list[Any] = []
        if tool_name:
            q += " AND tool_name=?"; params.append(tool_name)
        if tenant_id:
            q += " AND tenant_id=?"; params.append(tenant_id)
        if allowed_only is True:
            q += " AND allowed=1"
        elif allowed_only is False:
            q += " AND allowed=0"
        q += " ORDER BY created_at DESC LIMIT ?"; params.append(limit)
        return [
            RateLimitEvent(
                event_id=r["event_id"], policy_id=r["policy_id"],
                tool_name=r["tool_name"], tenant_id=r["tenant_id"],
                allowed=bool(r["allowed"]), tokens_before=r["tokens_before"],
                tokens_after=r["tokens_after"], wait_ms=r["wait_ms"],
                session_id=r["session_id"], metadata=json.loads(r["metadata_json"]),
                created_at=r["created_at"],
            )
            for r in self._conn.execute(q, params).fetchall()
        ]

    def stats(self, tool_name: str | None = None, tenant_id: str | None = None) -> dict[str, Any]:
        """Summary stats for rate limit usage."""
        q = "SELECT allowed, COUNT(*) as cnt FROM rate_limit_events WHERE 1=1"
        params: list[Any] = []
        if tool_name:
            q += " AND tool_name=?"; params.append(tool_name)
        if tenant_id:
            q += " AND tenant_id=?"; params.append(tenant_id)
        q += " GROUP BY allowed"
        rows = self._conn.execute(q, params).fetchall()
        allowed = denied = 0
        for r in rows:
            if r["allowed"]:
                allowed = r["cnt"]
            else:
                denied = r["cnt"]
        total = allowed + denied
        return {
            "total_requests": total,
            "allowed": allowed,
            "denied": denied,
            "denial_rate": round(denied / max(total, 1), 4),
        }

    # ------------------------------------------------------------------
    # Private
    # ------------------------------------------------------------------

    @staticmethod
    def _row_to_policy(row: sqlite3.Row) -> RateLimitPolicy:
        return RateLimitPolicy(
            policy_id=row["policy_id"], tool_name=row["tool_name"],
            tenant_id=row["tenant_id"], calls_per_minute=row["calls_per_minute"],
            calls_per_hour=row["calls_per_hour"], burst_capacity=row["burst_capacity"],
            queue_max_depth=row["queue_max_depth"], active=bool(row["active"]),
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"], updated_at=row["updated_at"],
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_limiter: ToolRateLimiter | None = None


def get_tool_rate_limiter(db_path: str | Path | None = None) -> ToolRateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = ToolRateLimiter(db_path=db_path)
    return _limiter


__all__ = [
    "RateLimitPolicy",
    "RateLimitBucket",
    "RateLimitDecision",
    "RateLimitEvent",
    "ToolRateLimiter",
    "get_tool_rate_limiter",
]
