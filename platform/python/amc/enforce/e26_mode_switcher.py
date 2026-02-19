"""
AMC Enforce — E26: Risk-Based Mode Switcher
===========================================

Purpose
-------
Automatically switches an agent session into progressively stricter execution
modes when risk signals are detected.  Maintains per-session mode state and
full switch history in SQLite for auditability.

Modes
-----
- SAFE     : read-only tools only; no exec, no browser nav, no outbound messages
- STANDARD : normal tools with allowlists; messaging with templates
- ADMIN    : full tools; destructive actions require human approval

Usage
-----

.. code-block:: python

    from amc.enforce.e26_mode_switcher import ModeSwitcher, ModeConfig, RiskSignal, AgentMode

    switcher = ModeSwitcher(ModeConfig(default_mode=AgentMode.STANDARD))
    signal = RiskSignal(signal_type="injection_detected", severity=0.9, source="content_scanner", detail="prompt injection pattern found")
    event = switcher.evaluate_signals([signal], session_id="sess-abc")
    if event:
        print(f"Mode switched: {event.from_mode} -> {event.to_mode}")
"""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class AgentMode(str, Enum):
    """Execution mode tiers for agent sessions."""

    SAFE = "SAFE"
    STANDARD = "STANDARD"
    ADMIN = "ADMIN"


# Numeric ordering for comparison (higher = more permissive)
_MODE_LEVEL: dict[AgentMode, int] = {
    AgentMode.SAFE: 0,
    AgentMode.STANDARD: 1,
    AgentMode.ADMIN: 2,
}

# Tool sets per mode — SAFE is the minimum capability set
_SAFE_TOOLS: set[str] = {
    "read_file",
    "list_files",
    "search",
    "get_status",
    "list_sessions",
    "view_logs",
    "query_db_readonly",
}

_STANDARD_TOOLS: set[str] = _SAFE_TOOLS | {
    "write_file",
    "send_message_template",
    "browser_navigate_allowlisted",
    "browser_screenshot",
    "http_get",
    "http_post_allowlisted",
    "query_db",
    "run_query",
    "create_session",
    "list_tools",
}

_ADMIN_TOOLS: set[str] = _STANDARD_TOOLS | {
    "exec",
    "browser_navigate",
    "browser_download",
    "send_message",
    "send_email",
    "config_apply",
    "gateway_restart",
    "gateway_config",
    "cron_add",
    "file_delete",
    "payment",
    "create_api_key",
    "revoke_session",
    "admin_query",
}

_MODE_TOOLS: dict[AgentMode, set[str]] = {
    AgentMode.SAFE: _SAFE_TOOLS,
    AgentMode.STANDARD: _STANDARD_TOOLS,
    AgentMode.ADMIN: _ADMIN_TOOLS,
}

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class ModeConfig(BaseModel):
    """Configuration for the ModeSwitcher."""

    default_mode: AgentMode = Field(
        default=AgentMode.STANDARD,
        description="The initial mode assigned to new sessions",
    )
    auto_downgrade: bool = Field(
        default=True,
        description="Automatically downgrade mode when risk signals exceed thresholds",
    )
    require_approval_for_upgrade: bool = Field(
        default=True,
        description="Require human approval when a session requests a mode upgrade",
    )
    db_path: str = Field(
        default=":memory:",
        description="SQLite database path for mode state and switch history persistence",
    )


class RiskSignal(BaseModel):
    """A single risk signal emitted by a detection component."""

    signal_type: str = Field(
        description="Type identifier for the signal (e.g. 'injection_detected')"
    )
    severity: float = Field(
        ge=0.0,
        le=1.0,
        description="Signal severity from 0.0 (negligible) to 1.0 (critical)",
    )
    source: str = Field(description="Component or module that generated this signal")
    detail: str = Field(description="Human-readable description of the detected issue")


class ModeSwitchEvent(BaseModel):
    """Records a single mode transition for a session."""

    event_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Unique event identifier",
    )
    from_mode: AgentMode = Field(description="Mode before the switch")
    to_mode: AgentMode = Field(description="Mode after the switch")
    reason: str = Field(description="Explanation of why the switch occurred")
    signals: list[RiskSignal] = Field(
        default_factory=list,
        description="Risk signals that triggered this switch",
    )
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC timestamp of the switch",
    )
    session_id: str = Field(description="Session affected by this switch")


class ModeState(BaseModel):
    """Current mode state for a session, including full switch history."""

    current_mode: AgentMode = Field(description="Current execution mode")
    session_id: str = Field(description="Session identifier")
    switch_history: list[ModeSwitchEvent] = Field(
        default_factory=list,
        description="Ordered list of all mode switch events for this session",
    )


# ---------------------------------------------------------------------------
# Downgrade trigger rules
# ---------------------------------------------------------------------------

# signal_type -> (threshold, target_mode)
# threshold: minimum severity that triggers the downgrade; 0.0 means any severity
_DOWNGRADE_RULES: dict[str, tuple[float, AgentMode]] = {
    "injection_detected": (0.0, AgentMode.SAFE),
    "unknown_sender": (0.7, AgentMode.SAFE),
    "new_domain": (0.5, AgentMode.SAFE),
    "suspicious_content": (0.6, AgentMode.SAFE),
}


def _evaluate_downgrade(signals: list[RiskSignal]) -> tuple[AgentMode | None, list[RiskSignal], str]:
    """
    Determine whether any risk signal should trigger a downgrade.

    Returns:
        Tuple of (target_mode or None, triggering_signals, reason_string).
    """
    triggered: list[RiskSignal] = []
    target: AgentMode | None = None

    for signal in signals:
        rule = _DOWNGRADE_RULES.get(signal.signal_type)
        if rule is None:
            continue
        threshold, mode = rule
        if signal.severity >= threshold:
            triggered.append(signal)
            # Always pick the most restrictive target
            if target is None or _MODE_LEVEL[mode] < _MODE_LEVEL[target]:
                target = mode

    if target is None or not triggered:
        return None, [], ""

    types = ", ".join(sorted({s.signal_type for s in triggered}))
    reason = f"Automatic downgrade triggered by risk signals: {types}"
    return target, triggered, reason


# ---------------------------------------------------------------------------
# SQLite schema
# ---------------------------------------------------------------------------

_DDL = """
CREATE TABLE IF NOT EXISTS mode_state (
    session_id   TEXT PRIMARY KEY,
    current_mode TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mode_switch_events (
    event_id    TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    from_mode   TEXT NOT NULL,
    to_mode     TEXT NOT NULL,
    reason      TEXT NOT NULL,
    signals_json TEXT NOT NULL,
    timestamp   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mse_session ON mode_switch_events (session_id);
"""

# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------


class ModeSwitcher:
    """
    Risk-based agent mode switcher with SQLite-backed state persistence.

    Thread-safety: Each method opens its own connection; safe for use in
    multi-threaded environments when using file-based SQLite (WAL mode).
    """

    def __init__(self, config: ModeConfig | None = None) -> None:
        """
        Initialise the ModeSwitcher.

        Args:
            config: ModeConfig controlling default mode, downgrade behaviour,
                    and database path.
        """
        self.config: ModeConfig = config or ModeConfig()
        self._db_path = self.config.db_path
        self._init_db()
        log.info(
            "mode_switcher_initialized",
            default_mode=self.config.default_mode,
            auto_downgrade=self.config.auto_downgrade,
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

    def _upsert_mode(
        self, conn: sqlite3.Connection, session_id: str, mode: AgentMode
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """
            INSERT INTO mode_state (session_id, current_mode, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                current_mode = excluded.current_mode,
                updated_at   = excluded.updated_at
            """,
            (session_id, mode.value, now),
        )

    def _persist_event(self, conn: sqlite3.Connection, event: ModeSwitchEvent) -> None:
        import json as _json

        conn.execute(
            """
            INSERT INTO mode_switch_events
                (event_id, session_id, from_mode, to_mode, reason, signals_json, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.event_id,
                event.session_id,
                event.from_mode.value,
                event.to_mode.value,
                event.reason,
                _json.dumps([s.model_dump() for s in event.signals]),
                event.timestamp.isoformat(),
            ),
        )

    def _load_events(
        self, conn: sqlite3.Connection, session_id: str
    ) -> list[ModeSwitchEvent]:
        import json as _json

        rows = conn.execute(
            "SELECT * FROM mode_switch_events WHERE session_id = ? ORDER BY timestamp",
            (session_id,),
        ).fetchall()
        events = []
        for row in rows:
            signals_raw = _json.loads(row["signals_json"])
            events.append(
                ModeSwitchEvent(
                    event_id=row["event_id"],
                    session_id=row["session_id"],
                    from_mode=AgentMode(row["from_mode"]),
                    to_mode=AgentMode(row["to_mode"]),
                    reason=row["reason"],
                    signals=[RiskSignal(**s) for s in signals_raw],
                    timestamp=datetime.fromisoformat(row["timestamp"]),
                )
            )
        return events

    def _current_mode(
        self, conn: sqlite3.Connection, session_id: str
    ) -> AgentMode:
        row = conn.execute(
            "SELECT current_mode FROM mode_state WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        if row is None:
            # First access — initialise with default
            self._upsert_mode(conn, session_id, self.config.default_mode)
            return self.config.default_mode
        return AgentMode(row["current_mode"])

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def evaluate_signals(
        self, signals: list[RiskSignal], session_id: str
    ) -> ModeSwitchEvent | None:
        """
        Evaluate a batch of risk signals for a session and apply any required
        automatic mode downgrade.

        Args:
            signals: List of risk signals from detection components.
            session_id: The session to evaluate.

        Returns:
            A ModeSwitchEvent if the mode was changed, else None.
        """
        if not self.config.auto_downgrade:
            log.debug("auto_downgrade_disabled", session_id=session_id)
            return None

        target_mode, triggered, reason = _evaluate_downgrade(signals)
        if target_mode is None:
            log.debug(
                "no_downgrade_triggered",
                session_id=session_id,
                signal_count=len(signals),
            )
            return None

        with self._connect() as conn:
            current = self._current_mode(conn, session_id)
            if _MODE_LEVEL[target_mode] >= _MODE_LEVEL[current]:
                log.debug(
                    "downgrade_not_needed",
                    session_id=session_id,
                    current=current,
                    target=target_mode,
                )
                return None

            event = ModeSwitchEvent(
                from_mode=current,
                to_mode=target_mode,
                reason=reason,
                signals=triggered,
                session_id=session_id,
            )
            self._upsert_mode(conn, session_id, target_mode)
            self._persist_event(conn, event)
            conn.commit()

        log.warning(
            "mode_downgraded",
            session_id=session_id,
            from_mode=current.value,
            to_mode=target_mode.value,
            reason=reason,
        )
        return event

    def get_allowed_tools(self, mode: AgentMode) -> set[str]:
        """
        Return the set of allowed tool names for the given execution mode.

        Args:
            mode: The agent execution mode.

        Returns:
            Set of tool name strings permitted in that mode.
        """
        return set(_MODE_TOOLS[mode])

    def request_upgrade(
        self, session_id: str, target_mode: AgentMode, reason: str
    ) -> bool:
        """
        Request an upgrade to a higher execution mode.

        When ``require_approval_for_upgrade`` is True the upgrade is denied
        (returns False) unless the session is already at or above the requested
        mode.  Set to False to auto-approve upgrades (e.g., in test environments).

        Args:
            session_id: The session requesting the upgrade.
            target_mode: The desired target mode.
            reason: Human-readable justification for the upgrade.

        Returns:
            True if the upgrade was granted; False otherwise.
        """
        with self._connect() as conn:
            current = self._current_mode(conn, session_id)

            if _MODE_LEVEL[target_mode] <= _MODE_LEVEL[current]:
                log.info(
                    "upgrade_not_needed",
                    session_id=session_id,
                    current=current,
                    target=target_mode,
                )
                return True

            if self.config.require_approval_for_upgrade:
                log.warning(
                    "upgrade_denied_requires_approval",
                    session_id=session_id,
                    current=current,
                    target=target_mode,
                    reason=reason,
                )
                return False

            # Auto-approve
            event = ModeSwitchEvent(
                from_mode=current,
                to_mode=target_mode,
                reason=f"Approved upgrade (auto): {reason}",
                signals=[],
                session_id=session_id,
            )
            self._upsert_mode(conn, session_id, target_mode)
            self._persist_event(conn, event)
            conn.commit()

        log.info(
            "mode_upgraded",
            session_id=session_id,
            from_mode=current.value,
            to_mode=target_mode.value,
        )
        return True

    def get_state(self, session_id: str) -> ModeState:
        """
        Retrieve the current mode state and full switch history for a session.

        Args:
            session_id: The session identifier.

        Returns:
            ModeState with current mode and ordered switch history.
        """
        with self._connect() as conn:
            current = self._current_mode(conn, session_id)
            history = self._load_events(conn, session_id)

        return ModeState(
            current_mode=current,
            session_id=session_id,
            switch_history=history,
        )

    def reset_session(self, session_id: str) -> None:
        """
        Reset a session to the configured default mode.  Useful when a session
        is re-authenticated or a security incident has been resolved.

        Args:
            session_id: The session to reset.
        """
        with self._connect() as conn:
            current = self._current_mode(conn, session_id)
            if current == self.config.default_mode:
                return
            event = ModeSwitchEvent(
                from_mode=current,
                to_mode=self.config.default_mode,
                reason="Manual session reset to default mode",
                signals=[],
                session_id=session_id,
            )
            self._upsert_mode(conn, session_id, self.config.default_mode)
            self._persist_event(conn, event)
            conn.commit()
        log.info("session_reset", session_id=session_id, mode=self.config.default_mode)


# ---------------------------------------------------------------------------
# Module-level convenience functions
# ---------------------------------------------------------------------------


def evaluate_signals(
    signals: list[RiskSignal],
    session_id: str,
    config: ModeConfig | None = None,
) -> ModeSwitchEvent | None:
    """
    Convenience wrapper: evaluate signals with a transient (in-memory) ModeSwitcher.

    For production use, instantiate ModeSwitcher once with a file-based db_path.
    """
    return ModeSwitcher(config).evaluate_signals(signals, session_id)


def get_allowed_tools(mode: AgentMode) -> set[str]:
    """Return the allowed tool set for *mode* without instantiating a ModeSwitcher."""
    return set(_MODE_TOOLS[mode])
