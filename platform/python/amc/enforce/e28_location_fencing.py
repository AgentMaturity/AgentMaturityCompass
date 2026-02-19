"""
AMC Enforce — E28: Network/Location Fencing
============================================

Purpose
-------
Restricts sensitive tool invocations to requests originating from approved
network ranges (CIDRs).  Automatically quarantines sessions that violate
fencing policies and persists all access checks and quarantine entries in
SQLite for audit and SIEM integration.

Architecture
------------
- NetworkFence    : named fence with CIDR ranges and optional ASN numbers
- FencingPolicy   : set of fences + high-risk tool list + violation behaviour
- LocationCheck   : result of a single IP+tool access check
- QuarantineEntry : a quarantined session record with expiry

Usage
-----

.. code-block:: python

    from amc.enforce.e28_location_fencing import LocationFenceEnforcer, FencingPolicy, NetworkFence

    policy = FencingPolicy(
        fences=[NetworkFence(name="corp", cidr_ranges=["10.0.0.0/8"], description="Corp network")],
        high_risk_tools=["exec", "payment"],
    )
    enforcer = LocationFenceEnforcer(policy)
    check = enforcer.check_request("10.1.2.3", "exec", "session-xyz")
    print(check.allowed, check.reason)
"""

from __future__ import annotations

import ipaddress
import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

import structlog
from pydantic import BaseModel, Field, field_validator

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class NetworkFence(BaseModel):
    """A named network boundary defined by one or more CIDR ranges."""

    name: str = Field(description="Unique name for this network fence")
    cidr_ranges: list[str] = Field(
        description="List of CIDR notation IP ranges (e.g. '10.0.0.0/8', '192.168.1.0/24')"
    )
    asn_numbers: list[int] = Field(
        default_factory=list,
        description="Optional list of Autonomous System Numbers (ASNs) for additional filtering",
    )
    description: str = Field(
        description="Human-readable description of this fence's purpose"
    )

    @field_validator("cidr_ranges")
    @classmethod
    def validate_cidrs(cls, v: list[str]) -> list[str]:
        """Validate that all CIDR strings are parseable by the ipaddress module."""
        for cidr in v:
            try:
                ipaddress.ip_network(cidr, strict=False)
            except ValueError as exc:
                raise ValueError(f"Invalid CIDR '{cidr}': {exc}") from exc
        return v


class FencingPolicy(BaseModel):
    """Policy controlling which fences protect which high-risk tools."""

    fences: list[NetworkFence] = Field(
        default_factory=list,
        description="All defined network fences",
    )
    high_risk_tools: list[str] = Field(
        default_factory=list,
        description="Tools that require the caller to be within a fence",
    )
    quarantine_on_violation: bool = Field(
        default=True,
        description="Automatically quarantine the session when a fence violation occurs",
    )
    alert_on_new_ip: bool = Field(
        default=True,
        description="Log a warning when an IP address is seen for the first time",
    )
    db_path: str = Field(
        default=":memory:",
        description="SQLite database path for check history and quarantine persistence",
    )


class LocationCheck(BaseModel):
    """Result of a single network/location access check."""

    check_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Unique identifier for this check record",
    )
    ip_address: str = Field(description="IP address of the requesting party")
    tool_name: str = Field(description="Tool being requested")
    allowed: bool = Field(description="Whether the request is permitted")
    fence_name: str | None = Field(
        default=None,
        description="Name of the matching fence (if allowed), else None",
    )
    reason: str = Field(description="Human-readable explanation of the decision")
    checked_at: datetime = Field(
        description="UTC timestamp when this check was performed"
    )


class QuarantineEntry(BaseModel):
    """A quarantine record for a session that violated fencing policy."""

    entry_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Unique quarantine record identifier",
    )
    ip_address: str = Field(description="IP address that triggered quarantine")
    session_id: str = Field(description="Session that was quarantined")
    reason: str = Field(description="Reason for quarantine")
    quarantined_at: datetime = Field(description="UTC timestamp when quarantine began")
    expires_at: datetime = Field(description="UTC timestamp when quarantine expires")


# ---------------------------------------------------------------------------
# SQLite schema
# ---------------------------------------------------------------------------

_DDL = """
CREATE TABLE IF NOT EXISTS location_checks (
    check_id    TEXT PRIMARY KEY,
    ip_address  TEXT NOT NULL,
    tool_name   TEXT NOT NULL,
    allowed     INTEGER NOT NULL,
    fence_name  TEXT,
    reason      TEXT NOT NULL,
    checked_at  TEXT NOT NULL,
    session_id  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lc_session   ON location_checks (session_id);
CREATE INDEX IF NOT EXISTS idx_lc_ip        ON location_checks (ip_address);
CREATE INDEX IF NOT EXISTS idx_lc_allowed   ON location_checks (allowed);

CREATE TABLE IF NOT EXISTS quarantine_entries (
    entry_id       TEXT PRIMARY KEY,
    ip_address     TEXT NOT NULL,
    session_id     TEXT NOT NULL,
    reason         TEXT NOT NULL,
    quarantined_at TEXT NOT NULL,
    expires_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_qe_session ON quarantine_entries (session_id);
CREATE INDEX IF NOT EXISTS idx_qe_ip      ON quarantine_entries (ip_address);

CREATE TABLE IF NOT EXISTS seen_ips (
    ip_address TEXT PRIMARY KEY,
    first_seen TEXT NOT NULL
);
"""

# ---------------------------------------------------------------------------
# CIDR matching helpers
# ---------------------------------------------------------------------------


def _ip_in_cidr(ip: str, cidr: str) -> bool:
    """Return True if *ip* is contained within the *cidr* network."""
    try:
        addr = ipaddress.ip_address(ip)
        net = ipaddress.ip_network(cidr, strict=False)
        return addr in net
    except ValueError:
        return False


def _ip_in_fence(ip: str, fence: NetworkFence) -> bool:
    """Return True if *ip* is within any of the fence's CIDR ranges."""
    return any(_ip_in_cidr(ip, cidr) for cidr in fence.cidr_ranges)


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------


class LocationFenceEnforcer:
    """
    Enforces network/location fencing policies for agent tool invocations.

    Persists every access check and quarantine entry to SQLite.  Thread-safe
    when using a file-based SQLite path with WAL mode.
    """

    def __init__(self, policy: FencingPolicy | None = None) -> None:
        """
        Initialise the enforcer with the given fencing policy.

        Args:
            policy: FencingPolicy to enforce.  Defaults to an empty policy
                    (no fences, no high-risk tools).
        """
        self.policy: FencingPolicy = policy or FencingPolicy()
        self._db_path = self.policy.db_path
        self._init_db()
        log.info(
            "location_fence_enforcer_initialized",
            fences=[f.name for f in self.policy.fences],
            high_risk_tools=self.policy.high_risk_tools,
            quarantine_on_violation=self.policy.quarantine_on_violation,
            db_path=self._db_path,
        )

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        if self._db_path != ":memory:":
            conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(_DDL)

    def _persist_check(
        self, conn: sqlite3.Connection, check: LocationCheck, session_id: str
    ) -> None:
        conn.execute(
            """
            INSERT INTO location_checks
                (check_id, ip_address, tool_name, allowed, fence_name, reason, checked_at, session_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                check.check_id,
                check.ip_address,
                check.tool_name,
                1 if check.allowed else 0,
                check.fence_name,
                check.reason,
                check.checked_at.isoformat(),
                session_id,
            ),
        )

    def _persist_quarantine(
        self, conn: sqlite3.Connection, entry: QuarantineEntry
    ) -> None:
        conn.execute(
            """
            INSERT INTO quarantine_entries
                (entry_id, ip_address, session_id, reason, quarantined_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                entry.entry_id,
                entry.ip_address,
                entry.session_id,
                entry.reason,
                entry.quarantined_at.isoformat(),
                entry.expires_at.isoformat(),
            ),
        )

    def _check_new_ip(self, conn: sqlite3.Connection, ip: str) -> bool:
        """Return True if this IP has not been seen before (and record it)."""
        existing = conn.execute(
            "SELECT ip_address FROM seen_ips WHERE ip_address = ?", (ip,)
        ).fetchone()
        if existing is None:
            conn.execute(
                "INSERT INTO seen_ips (ip_address, first_seen) VALUES (?, ?)",
                (ip, datetime.now(timezone.utc).isoformat()),
            )
            return True
        return False

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def check_request(
        self, ip_address: str, tool_name: str, session_id: str
    ) -> LocationCheck:
        """
        Check whether a tool request from *ip_address* is permitted under the
        current fencing policy.

        If the tool is high-risk and the IP is outside all fences, the session
        is automatically quarantined (when ``quarantine_on_violation`` is True).

        Args:
            ip_address: The originating IP address of the request.
            tool_name: The tool being invoked.
            session_id: The session making the request.

        Returns:
            LocationCheck with ``allowed`` True/False and reason.
        """
        now = datetime.now(timezone.utc)

        with self._connect() as conn:
            # Alert on new IP
            is_new = self._check_new_ip(conn, ip_address)
            if is_new and self.policy.alert_on_new_ip:
                log.warning("new_ip_detected", ip_address=ip_address, session_id=session_id)

            # Check if session is quarantined
            if self._is_quarantined_conn(conn, session_id):
                check = LocationCheck(
                    ip_address=ip_address,
                    tool_name=tool_name,
                    allowed=False,
                    fence_name=None,
                    reason=f"Session '{session_id}' is quarantined; all tool invocations blocked",
                    checked_at=now,
                )
                self._persist_check(conn, check, session_id)
                conn.commit()
                log.warning(
                    "quarantined_session_blocked",
                    session_id=session_id,
                    ip_address=ip_address,
                    tool_name=tool_name,
                )
                return check

            # Low-risk tool — allow without fence check
            if tool_name not in self.policy.high_risk_tools:
                check = LocationCheck(
                    ip_address=ip_address,
                    tool_name=tool_name,
                    allowed=True,
                    fence_name=None,
                    reason=f"Tool '{tool_name}' is not a high-risk tool; no fence required",
                    checked_at=now,
                )
                self._persist_check(conn, check, session_id)
                conn.commit()
                return check

            # High-risk tool — must be within a fence
            for fence in self.policy.fences:
                if _ip_in_fence(ip_address, fence):
                    check = LocationCheck(
                        ip_address=ip_address,
                        tool_name=tool_name,
                        allowed=True,
                        fence_name=fence.name,
                        reason=(
                            f"IP '{ip_address}' is within fence '{fence.name}'; "
                            f"tool '{tool_name}' permitted"
                        ),
                        checked_at=now,
                    )
                    self._persist_check(conn, check, session_id)
                    conn.commit()
                    log.debug(
                        "fence_check_passed",
                        ip_address=ip_address,
                        fence=fence.name,
                        tool_name=tool_name,
                    )
                    return check

            # Outside all fences → violation
            reason = (
                f"IP '{ip_address}' is not within any approved network fence; "
                f"tool '{tool_name}' is high-risk and requires an approved network"
            )
            check = LocationCheck(
                ip_address=ip_address,
                tool_name=tool_name,
                allowed=False,
                fence_name=None,
                reason=reason,
                checked_at=now,
            )
            self._persist_check(conn, check, session_id)

            if self.policy.quarantine_on_violation:
                entry = QuarantineEntry(
                    ip_address=ip_address,
                    session_id=session_id,
                    reason=f"Fence violation: {reason}",
                    quarantined_at=now,
                    expires_at=now + timedelta(hours=24),
                )
                self._persist_quarantine(conn, entry)
                log.warning(
                    "session_quarantined",
                    session_id=session_id,
                    ip_address=ip_address,
                    tool_name=tool_name,
                )

            conn.commit()
            log.warning(
                "fence_check_failed",
                ip_address=ip_address,
                tool_name=tool_name,
                session_id=session_id,
            )
            return check

    def is_ip_in_fence(self, ip_address: str, fence_name: str) -> bool:
        """
        Check whether *ip_address* is within the named fence's CIDR ranges.

        Args:
            ip_address: The IP address to test.
            fence_name: The name of the fence to check against.

        Returns:
            True if the IP is within the fence; False if not or if the fence
            does not exist.
        """
        for fence in self.policy.fences:
            if fence.name == fence_name:
                result = _ip_in_fence(ip_address, fence)
                log.debug(
                    "ip_in_fence_check",
                    ip_address=ip_address,
                    fence_name=fence_name,
                    result=result,
                )
                return result
        log.warning("fence_not_found", fence_name=fence_name)
        return False

    def quarantine_session(
        self,
        session_id: str,
        ip_address: str,
        reason: str,
        duration_hours: int = 24,
    ) -> QuarantineEntry:
        """
        Manually quarantine a session.

        Args:
            session_id: The session to quarantine.
            ip_address: IP address associated with the session.
            reason: Human-readable reason for quarantine.
            duration_hours: How long the quarantine should last (default 24h).

        Returns:
            The created QuarantineEntry.
        """
        now = datetime.now(timezone.utc)
        entry = QuarantineEntry(
            ip_address=ip_address,
            session_id=session_id,
            reason=reason,
            quarantined_at=now,
            expires_at=now + timedelta(hours=duration_hours),
        )
        with self._connect() as conn:
            self._persist_quarantine(conn, entry)
            conn.commit()

        log.warning(
            "manual_quarantine",
            session_id=session_id,
            ip_address=ip_address,
            duration_hours=duration_hours,
            reason=reason,
        )
        return entry

    def _is_quarantined_conn(
        self, conn: sqlite3.Connection, session_id: str
    ) -> bool:
        """Internal: check quarantine status using an existing connection."""
        now = datetime.now(timezone.utc).isoformat()
        row = conn.execute(
            """
            SELECT entry_id FROM quarantine_entries
            WHERE session_id = ? AND expires_at > ?
            LIMIT 1
            """,
            (session_id, now),
        ).fetchone()
        return row is not None

    def is_quarantined(self, session_id: str) -> bool:
        """
        Return True if *session_id* is currently under an active quarantine.

        A quarantine is active when there is at least one non-expired entry
        for the session.

        Args:
            session_id: The session to check.

        Returns:
            True if quarantined, False otherwise.
        """
        with self._connect() as conn:
            return self._is_quarantined_conn(conn, session_id)

    def get_recent_violations(self, limit: int = 50) -> list[LocationCheck]:
        """
        Retrieve the most recent failed (blocked) location checks from the
        SQLite store.

        Args:
            limit: Maximum number of records to return (default 50).

        Returns:
            List of LocationCheck objects, most recent first.
        """
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT check_id, ip_address, tool_name, allowed, fence_name, reason,
                       checked_at, session_id
                FROM location_checks
                WHERE allowed = 0
                ORDER BY checked_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

        results: list[LocationCheck] = []
        for row in rows:
            results.append(
                LocationCheck(
                    check_id=row["check_id"],
                    ip_address=row["ip_address"],
                    tool_name=row["tool_name"],
                    allowed=bool(row["allowed"]),
                    fence_name=row["fence_name"],
                    reason=row["reason"],
                    checked_at=datetime.fromisoformat(row["checked_at"]),
                )
            )
        return results

    def lift_quarantine(self, session_id: str) -> int:
        """
        Lift all active quarantine entries for a session.

        Args:
            session_id: The session to release from quarantine.

        Returns:
            Number of quarantine entries that were removed.
        """
        with self._connect() as conn:
            cursor = conn.execute(
                "DELETE FROM quarantine_entries WHERE session_id = ?",
                (session_id,),
            )
            conn.commit()
        count = cursor.rowcount
        log.info("quarantine_lifted", session_id=session_id, entries_removed=count)
        return count


# ---------------------------------------------------------------------------
# Module-level convenience functions
# ---------------------------------------------------------------------------


def check_request(
    ip_address: str,
    tool_name: str,
    session_id: str,
    policy: FencingPolicy | None = None,
) -> LocationCheck:
    """
    Convenience wrapper: perform a single fence check with default or provided policy.

    Args:
        ip_address: Originating IP address.
        tool_name: Tool being requested.
        session_id: Session making the request.
        policy: Optional FencingPolicy; defaults to empty policy.

    Returns:
        LocationCheck result.
    """
    return LocationFenceEnforcer(policy).check_request(ip_address, tool_name, session_id)


def is_ip_in_fence(
    ip_address: str,
    fence_name: str,
    policy: FencingPolicy | None = None,
) -> bool:
    """
    Convenience wrapper: check if an IP is within a named fence.

    Args:
        ip_address: IP to check.
        fence_name: Fence to look up.
        policy: Optional FencingPolicy.

    Returns:
        True if the IP is within the fence.
    """
    return LocationFenceEnforcer(policy).is_ip_in_fence(ip_address, fence_name)
