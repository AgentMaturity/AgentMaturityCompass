"""
AMC Enforce — E27: Temporal Execution Controls
===============================================

Purpose
-------
Prevents high-risk tool invocations outside of approved time windows,
blocking operations during off-hours, weekends, and public holidays.
Supports emergency override tokens for break-glass scenarios.

Architecture
------------
- TimeWindow    : named time window with days-of-week + hour range + timezone
- ToolSchedule  : glob pattern → allowed window names
- HolidayCalendar: named list of blocked dates
- TemporalController: evaluates check_tool() against the active configuration

Usage
-----

.. code-block:: python

    from datetime import datetime, timezone
    from amc.enforce.e27_temporal_controls import (
        TemporalController, TemporalConfig, TimeWindow, ToolSchedule, HolidayCalendar
    )

    config = TemporalConfig(
        windows=[TimeWindow(name="business", days_of_week=[0,1,2,3,4], start_hour=9, end_hour=17)],
        schedules=[ToolSchedule(tool_pattern="exec", allowed_windows=["business"])],
        calendars=[],
    )
    ctrl = TemporalController(config)
    decision = ctrl.check_tool("exec")
    print(decision.allowed, decision.reason)
"""

from __future__ import annotations

import fnmatch
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import structlog
from pydantic import BaseModel, Field, field_validator

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Default high-risk tools blocked outside business hours
# ---------------------------------------------------------------------------

DEFAULT_HIGH_RISK_TOOLS: set[str] = {
    "exec",
    "file_delete",
    "payment",
    "config_apply",
    "cron_add",
    "email_send_bulk",
}

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class TimeWindow(BaseModel):
    """A named time window defining when operations are permitted."""

    name: str = Field(description="Unique name for this time window")
    days_of_week: list[int] = Field(
        description="Allowed days of week: 0=Monday … 6=Sunday (ISO weekday - 1)"
    )
    start_hour: int = Field(
        ge=0, le=23, description="Window start hour in 24h format (inclusive)"
    )
    end_hour: int = Field(
        ge=0, le=24, description="Window end hour in 24h format (exclusive)"
    )
    timezone: str = Field(
        default="UTC",
        description="IANA timezone name for interpreting hours (e.g. 'America/New_York')",
    )

    @field_validator("days_of_week")
    @classmethod
    def validate_days(cls, v: list[int]) -> list[int]:
        """Validate that all day numbers are in [0, 6]."""
        for d in v:
            if d < 0 or d > 6:
                raise ValueError(f"Day of week must be 0–6, got {d}")
        return sorted(set(v))

    @field_validator("end_hour")
    @classmethod
    def validate_hour_range(cls, v: int, info: Any) -> int:
        """Validate end_hour > start_hour."""
        start = (info.data or {}).get("start_hour")
        if start is not None and v <= start:
            raise ValueError(f"end_hour ({v}) must be greater than start_hour ({start})")
        return v


class ToolSchedule(BaseModel):
    """Maps a tool name glob pattern to one or more permitted time windows."""

    tool_pattern: str = Field(
        description="Glob pattern matched against tool names (e.g. 'exec', 'email_*')"
    )
    allowed_windows: list[str] = Field(
        description="Names of TimeWindows during which this tool is permitted"
    )
    require_approval_outside: bool = Field(
        default=True,
        description="When True, requests outside allowed windows require human approval",
    )


class HolidayCalendar(BaseModel):
    """A named set of dates on which high-risk operations are blocked."""

    name: str = Field(description="Descriptive name for this holiday calendar")
    dates: list[str] = Field(
        description="List of blocked dates in YYYY-MM-DD format"
    )
    block_all_risky: bool = Field(
        default=True,
        description="When True, all DEFAULT_HIGH_RISK_TOOLS are blocked on these dates",
    )

    @field_validator("dates")
    @classmethod
    def validate_dates(cls, v: list[str]) -> list[str]:
        """Validate each date string is parseable as YYYY-MM-DD."""
        import re
        pattern = re.compile(r"^\d{4}-\d{2}-\d{2}$")
        for d in v:
            if not pattern.match(d):
                raise ValueError(f"Date '{d}' is not in YYYY-MM-DD format")
        return sorted(set(v))


class TemporalDecision(BaseModel):
    """Result of a temporal access check for a specific tool invocation."""

    tool_name: str = Field(description="The tool that was checked")
    allowed: bool = Field(description="Whether execution is permitted at this time")
    reason: str = Field(description="Human-readable explanation of the decision")
    window_name: str | None = Field(
        default=None,
        description="Name of the matching time window (if allowed), else None",
    )
    checked_at: datetime = Field(
        description="UTC timestamp when this decision was made"
    )


class TemporalConfig(BaseModel):
    """Full temporal control configuration."""

    windows: list[TimeWindow] = Field(
        default_factory=list,
        description="Named time windows during which tools may be used",
    )
    schedules: list[ToolSchedule] = Field(
        default_factory=list,
        description="Tool-to-window schedule mappings",
    )
    calendars: list[HolidayCalendar] = Field(
        default_factory=list,
        description="Holiday/blocked-date calendars",
    )
    emergency_override_token: str | None = Field(
        default=None,
        description="Hashed token (SHA-256 hex) for emergency override; set to None to disable",
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _tz(name: str) -> ZoneInfo:
    """Resolve an IANA timezone name, falling back to UTC on error."""
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, KeyError):
        log.warning("unknown_timezone_falling_back_utc", timezone=name)
        return ZoneInfo("UTC")


def _localise(dt: datetime, tz: ZoneInfo) -> datetime:
    """Convert a UTC-aware datetime to the given timezone."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(tz)


def _in_window(window: TimeWindow, dt: datetime) -> bool:
    """Return True if *dt* (UTC) falls within the given TimeWindow."""
    local = _localise(dt, _tz(window.timezone))
    weekday = local.weekday()  # 0=Monday, 6=Sunday
    hour = local.hour
    return weekday in window.days_of_week and window.start_hour <= hour < window.end_hour


def _is_holiday_date(calendar: HolidayCalendar, dt: datetime) -> bool:
    """Return True if *dt* (UTC) falls on a date listed in the calendar."""
    date_str = dt.astimezone(timezone.utc).strftime("%Y-%m-%d")
    return date_str in calendar.dates


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------


class TemporalController:
    """
    Evaluates tool access requests against time windows, holiday calendars,
    and emergency override tokens.

    All datetime arguments default to ``datetime.now(timezone.utc)`` when
    not provided, enabling easy injection of test times.
    """

    def __init__(self, config: TemporalConfig | None = None) -> None:
        """
        Initialise the TemporalController.

        Args:
            config: Full temporal configuration.  Defaults to a standard
                    business-hours config blocking DEFAULT_HIGH_RISK_TOOLS.
        """
        self.config: TemporalConfig = config or _default_config()
        self._override_active: bool = False
        log.info(
            "temporal_controller_initialized",
            windows=[w.name for w in self.config.windows],
            calendars=[c.name for c in self.config.calendars],
            schedules=len(self.config.schedules),
        )

    def _find_matching_schedules(self, tool_name: str) -> list[ToolSchedule]:
        """Return all ToolSchedules whose glob pattern matches *tool_name*."""
        return [
            s for s in self.config.schedules if fnmatch.fnmatch(tool_name, s.tool_pattern)
        ]

    def _find_window(self, name: str) -> TimeWindow | None:
        """Look up a TimeWindow by name."""
        for w in self.config.windows:
            if w.name == name:
                return w
        return None

    def check_tool(
        self, tool_name: str, at: datetime | None = None
    ) -> TemporalDecision:
        """
        Check whether a tool may be invoked at the given time.

        Args:
            tool_name: The name of the tool being requested.
            at: The datetime to check against (defaults to now UTC).

        Returns:
            TemporalDecision with ``allowed`` True/False and a reason.
        """
        now = at or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        checked_at = now.astimezone(timezone.utc)

        # Emergency override bypasses all restrictions
        if self._override_active:
            log.warning("temporal_override_active", tool_name=tool_name)
            return TemporalDecision(
                tool_name=tool_name,
                allowed=True,
                reason="Emergency override is active; all tools permitted",
                window_name=None,
                checked_at=checked_at,
            )

        # Holiday check — if any calendar blocks risky tools today
        if tool_name in DEFAULT_HIGH_RISK_TOOLS or self._has_schedule(tool_name):
            for cal in self.config.calendars:
                if cal.block_all_risky and _is_holiday_date(cal, now):
                    log.warning(
                        "tool_blocked_holiday",
                        tool_name=tool_name,
                        calendar=cal.name,
                        date=now.strftime("%Y-%m-%d"),
                    )
                    return TemporalDecision(
                        tool_name=tool_name,
                        allowed=False,
                        reason=f"Blocked: date {now.strftime('%Y-%m-%d')} is a holiday in calendar '{cal.name}'",
                        window_name=None,
                        checked_at=checked_at,
                    )

        # Schedule check — find all matching schedules
        schedules = self._find_matching_schedules(tool_name)

        if not schedules:
            # No schedule → check default high-risk list
            if tool_name in DEFAULT_HIGH_RISK_TOOLS:
                # Check if any window named "business" (or any window) covers now
                matched = self._check_any_window(now)
                if matched:
                    return TemporalDecision(
                        tool_name=tool_name,
                        allowed=True,
                        reason=f"Tool '{tool_name}' permitted; within window '{matched}'",
                        window_name=matched,
                        checked_at=checked_at,
                    )
                return TemporalDecision(
                    tool_name=tool_name,
                    allowed=False,
                    reason=(
                        f"Tool '{tool_name}' is a default high-risk tool and no matching "
                        "time window is currently active"
                    ),
                    window_name=None,
                    checked_at=checked_at,
                )
            # Not high-risk and no schedule → allow
            return TemporalDecision(
                tool_name=tool_name,
                allowed=True,
                reason=f"Tool '{tool_name}' has no temporal restrictions",
                window_name=None,
                checked_at=checked_at,
            )

        # Check each schedule's allowed windows
        for schedule in schedules:
            for window_name in schedule.allowed_windows:
                window = self._find_window(window_name)
                if window is None:
                    log.warning("unknown_window_referenced", window_name=window_name)
                    continue
                if _in_window(window, now):
                    log.debug(
                        "tool_allowed_in_window",
                        tool_name=tool_name,
                        window=window_name,
                    )
                    return TemporalDecision(
                        tool_name=tool_name,
                        allowed=True,
                        reason=f"Tool '{tool_name}' permitted; within window '{window_name}'",
                        window_name=window_name,
                        checked_at=checked_at,
                    )

        # No window matched
        needs_approval = any(s.require_approval_outside for s in schedules)
        reason = (
            f"Tool '{tool_name}' is outside all permitted time windows"
            + (" (human approval required)" if needs_approval else "")
        )
        log.warning("tool_blocked_outside_window", tool_name=tool_name, at=now.isoformat())
        return TemporalDecision(
            tool_name=tool_name,
            allowed=False,
            reason=reason,
            window_name=None,
            checked_at=checked_at,
        )

    def _has_schedule(self, tool_name: str) -> bool:
        """Return True if the tool has at least one matching ToolSchedule."""
        return bool(self._find_matching_schedules(tool_name))

    def _check_any_window(self, now: datetime) -> str | None:
        """Return the name of the first active window, or None."""
        for window in self.config.windows:
            if _in_window(window, now):
                return window.name
        return None

    def is_holiday(self, at: datetime | None = None) -> bool:
        """
        Return True if the given datetime falls on a holiday in any configured calendar.

        Args:
            at: Datetime to check (defaults to now UTC).

        Returns:
            True if any calendar marks this date as a holiday.
        """
        now = at or datetime.now(timezone.utc)
        return any(_is_holiday_date(cal, now) for cal in self.config.calendars)

    def emergency_override(self, token: str) -> bool:
        """
        Activate emergency override using a plaintext token.

        The provided token is SHA-256 hashed and compared to the configured
        ``emergency_override_token`` (which should be stored pre-hashed).
        Override activation is logged at WARNING level for audit purposes.

        Args:
            token: Plaintext emergency override token.

        Returns:
            True if the token is valid and override was activated; False otherwise.
        """
        if self.config.emergency_override_token is None:
            log.error("emergency_override_no_token_configured")
            return False

        token_hash = hashlib.sha256(token.encode()).hexdigest()
        if not secrets.compare_digest(token_hash, self.config.emergency_override_token):
            log.warning("emergency_override_invalid_token")
            return False

        self._override_active = True
        log.warning("emergency_override_activated", token_hash_prefix=token_hash[:8])
        return True

    def deactivate_override(self) -> None:
        """
        Deactivate emergency override, returning to normal temporal controls.
        """
        self._override_active = False
        log.warning("emergency_override_deactivated")

    def get_next_allowed_window(
        self, tool_name: str, at: datetime | None = None
    ) -> datetime | None:
        """
        Find the next datetime when the given tool would be permitted.

        Searches up to 8 days into the future in 1-hour increments.
        Returns None if no window is found within that horizon.

        Args:
            tool_name: Tool to find the next window for.
            at: Starting datetime (defaults to now UTC).

        Returns:
            UTC datetime of the next permitted window, or None.
        """
        now = at or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        schedules = self._find_matching_schedules(tool_name)
        is_high_risk = tool_name in DEFAULT_HIGH_RISK_TOOLS

        if not schedules and not is_high_risk:
            # No restrictions — already allowed
            return now

        candidate = now + timedelta(hours=1)
        # Replace minutes/seconds to align to hour boundary
        candidate = candidate.replace(minute=0, second=0, microsecond=0)

        for _ in range(8 * 24):  # up to 8 days in 1-hour steps
            decision = self.check_tool(tool_name, at=candidate)
            if decision.allowed:
                return candidate
            candidate += timedelta(hours=1)

        log.warning("no_next_window_found", tool_name=tool_name)
        return None


# ---------------------------------------------------------------------------
# Default configuration factory
# ---------------------------------------------------------------------------


def _default_config() -> TemporalConfig:
    """
    Build a sensible default TemporalConfig: business hours Mon–Fri 09:00–17:00 UTC,
    blocking all DEFAULT_HIGH_RISK_TOOLS outside that window.
    """
    biz_window = TimeWindow(
        name="business_hours",
        days_of_week=[0, 1, 2, 3, 4],  # Mon–Fri
        start_hour=9,
        end_hour=17,
        timezone="UTC",
    )
    schedules = [
        ToolSchedule(
            tool_pattern=tool,
            allowed_windows=["business_hours"],
            require_approval_outside=True,
        )
        for tool in sorted(DEFAULT_HIGH_RISK_TOOLS)
    ]
    return TemporalConfig(windows=[biz_window], schedules=schedules, calendars=[])


# ---------------------------------------------------------------------------
# Module-level convenience functions
# ---------------------------------------------------------------------------


def check_tool(
    tool_name: str,
    at: datetime | None = None,
    config: TemporalConfig | None = None,
) -> TemporalDecision:
    """
    Convenience wrapper: check a tool against the default or provided config.

    Args:
        tool_name: Tool to check.
        at: Datetime to check at (defaults to now UTC).
        config: Optional TemporalConfig; defaults to business-hours config.

    Returns:
        TemporalDecision.
    """
    return TemporalController(config).check_tool(tool_name, at=at)


def make_override_token() -> tuple[str, str]:
    """
    Generate a random emergency override token and its SHA-256 hash.

    Returns:
        (plaintext_token, hashed_token) — store hashed_token in config,
        keep plaintext_token in a secure vault.
    """
    plaintext = secrets.token_urlsafe(32)
    hashed = hashlib.sha256(plaintext.encode()).hexdigest()
    return plaintext, hashed
