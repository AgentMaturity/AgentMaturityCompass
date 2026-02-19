"""
AMC Enforce — E13: Sender Account-Takeover (ATO) Detection

Behavioral-baseline system that scores messages for signs of account
compromise: unusual timing, command pattern shifts, burst activity,
new device fingerprints.

Usage:
    detector = ATODetector("/tmp/ato.db")
    score = detector.score_message(
        sender_id="+1555000DEMO",
        message="run exec rm -rf /",
        context={"tools_requested": ["exec"], "hour": 3},
    )
    if score.recommended_action == "reauth":
        force_reauthentication(sender_id)
"""
from __future__ import annotations

import json
import math
import sqlite3
import time
from collections import Counter
from datetime import datetime, timezone
from enum import Enum
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.core.models import RiskLevel

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ATORiskLevel(str, Enum):
    SAFE = "safe"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RecommendedAction(str, Enum):
    ALLOW = "allow"
    STEPDOWN = "stepdown"       # read-only, no tools
    QUARANTINE = "quarantine"
    REAUTH = "reauth"


class ATORiskScore(BaseModel):
    """Result of ATO analysis for a single message."""
    sender_id: str
    score: int = Field(ge=0, le=100)
    risk_level: ATORiskLevel = ATORiskLevel.SAFE
    signals: list[str] = Field(default_factory=list)
    recommended_action: RecommendedAction = RecommendedAction.ALLOW
    baseline_messages: int = 0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Math helpers
# ---------------------------------------------------------------------------

def _cosine_similarity(a: dict[str, float], b: dict[str, float]) -> float:
    """Cosine similarity between two sparse vectors (dicts)."""
    keys = set(a) | set(b)
    if not keys:
        return 1.0
    dot = sum(a.get(k, 0.0) * b.get(k, 0.0) for k in keys)
    mag_a = math.sqrt(sum(v ** 2 for v in a.values())) or 1e-9
    mag_b = math.sqrt(sum(v ** 2 for v in b.values())) or 1e-9
    return dot / (mag_a * mag_b)


def _hour_stats(hours: list[int]) -> tuple[float, float]:
    """Mean and stddev of hour-of-day values (circular-aware simplified)."""
    if not hours:
        return 12.0, 12.0
    mean = sum(hours) / len(hours)
    if len(hours) < 2:
        return mean, 12.0
    variance = sum((h - mean) ** 2 for h in hours) / (len(hours) - 1)
    return mean, math.sqrt(variance)


# ---------------------------------------------------------------------------
# SQLite persistence
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS ato_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id TEXT NOT NULL,
    hour_of_day INTEGER NOT NULL,
    tools_json TEXT NOT NULL DEFAULT '[]',
    device_fp TEXT DEFAULT '',
    msg_length INTEGER DEFAULT 0,
    ts REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ato_sender ON ato_messages(sender_id);
"""

MIN_BASELINE = 10  # messages needed before meaningful scoring


class ATODetector:
    """
    Behavioral ATO detector with SQLite-backed baselines.

    Tracks per-sender: hour-of-day distribution, command/tool patterns,
    device fingerprints, message cadence.
    """

    def __init__(self, db_path: str = ":memory:") -> None:
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def score_message(
        self,
        sender_id: str,
        message: str,
        context: dict[str, Any] | None = None,
    ) -> ATORiskScore:
        """
        Score a message for ATO risk.

        Args:
            sender_id: Unique sender identifier.
            message: Raw message text.
            context: Optional dict with keys like 'tools_requested' (list[str]),
                     'hour' (int 0-23), 'device_fingerprint' (str).

        Returns:
            ATORiskScore with score 0-100 and recommended action.
        """
        ctx = context or {}
        hour = ctx.get("hour", datetime.now(timezone.utc).hour)
        tools: list[str] = ctx.get("tools_requested", [])
        device_fp: str = ctx.get("device_fingerprint", "")
        now = time.time()

        # Fetch baseline
        history = self._get_history(sender_id)
        baseline_count = len(history)

        # Record this message
        self._record(sender_id, hour, tools, device_fp, len(message), now)

        # Not enough data for meaningful scoring
        if baseline_count < MIN_BASELINE:
            return ATORiskScore(
                sender_id=sender_id,
                score=0,
                risk_level=ATORiskLevel.SAFE,
                signals=[f"Insufficient baseline ({baseline_count}/{MIN_BASELINE})"],
                recommended_action=RecommendedAction.ALLOW,
                baseline_messages=baseline_count,
            )

        signals: list[str] = []
        score = 0

        # --- Signal 1: Unusual hour of day ---
        past_hours = [r[0] for r in history]
        mean_h, std_h = _hour_stats(past_hours)
        std_h = max(std_h, 1.0)  # avoid div-by-zero
        z_score = abs(hour - mean_h) / std_h
        if z_score > 2.0:
            contrib = min(int(z_score * 10), 30)
            score += contrib
            signals.append(f"Unusual time-of-day: hour={hour}, z={z_score:.1f} (mean={mean_h:.1f}±{std_h:.1f})")

        # --- Signal 2: Command pattern change (cosine similarity) ---
        hist_tools: list[str] = []
        for r in history:
            try:
                hist_tools.extend(json.loads(r[1]))
            except (json.JSONDecodeError, TypeError):
                pass
        hist_vec = dict(Counter(hist_tools))
        curr_vec = dict(Counter(tools))
        # Normalize
        if hist_vec:
            total_h = sum(hist_vec.values())
            hist_norm = {k: v / total_h for k, v in hist_vec.items()}
        else:
            hist_norm = {}
        if curr_vec:
            total_c = sum(curr_vec.values())
            curr_norm = {k: v / total_c for k, v in curr_vec.items()}
        else:
            curr_norm = {}

        if curr_norm and hist_norm:
            sim = _cosine_similarity(hist_norm, curr_norm)
            if sim < 0.5:
                contrib = int((1.0 - sim) * 30)
                score += contrib
                signals.append(f"Command pattern divergence: cosine_sim={sim:.2f}")

        # --- Signal 3: New device fingerprint ---
        if device_fp:
            known_fps = {r[2] for r in history if r[2]}
            if known_fps and device_fp not in known_fps:
                score += 20
                signals.append(f"New device fingerprint: {device_fp[:16]}...")

        # --- Signal 4: Burst activity ---
        recent_cutoff = now - 60  # last 60 seconds
        recent_count = sum(1 for r in history if r[3] > recent_cutoff)
        if recent_count > 10:
            contrib = min((recent_count - 10) * 3, 25)
            score += contrib
            signals.append(f"Burst activity: {recent_count} messages in last 60s")

        score = min(score, 100)

        # Determine risk level and action
        if score >= 80:
            risk_level = ATORiskLevel.CRITICAL
            action = RecommendedAction.REAUTH
        elif score >= 60:
            risk_level = ATORiskLevel.HIGH
            action = RecommendedAction.QUARANTINE
        elif score >= 40:
            risk_level = ATORiskLevel.MEDIUM
            action = RecommendedAction.STEPDOWN
        elif score >= 20:
            risk_level = ATORiskLevel.LOW
            action = RecommendedAction.ALLOW
        else:
            risk_level = ATORiskLevel.SAFE
            action = RecommendedAction.ALLOW

        result = ATORiskScore(
            sender_id=sender_id,
            score=score,
            risk_level=risk_level,
            signals=signals,
            recommended_action=action,
            baseline_messages=baseline_count,
        )
        log.info("ato.scored", sender_id=sender_id, score=score,
                 action=action.value, signals_count=len(signals))
        return result

    # -----------------------------------------------------------------------
    # Internal
    # -----------------------------------------------------------------------

    def _record(self, sender_id: str, hour: int, tools: list[str],
                device_fp: str, msg_len: int, ts: float) -> None:
        self._conn.execute(
            "INSERT INTO ato_messages (sender_id, hour_of_day, tools_json, device_fp, msg_length, ts) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (sender_id, hour, json.dumps(tools), device_fp, msg_len, ts),
        )
        self._conn.commit()

    def _get_history(self, sender_id: str) -> list[tuple[int, str, str, float]]:
        """Returns list of (hour_of_day, tools_json, device_fp, ts)."""
        cur = self._conn.execute(
            "SELECT hour_of_day, tools_json, device_fp, ts FROM ato_messages "
            "WHERE sender_id = ? ORDER BY ts DESC LIMIT 1000",
            (sender_id,),
        )
        return cur.fetchall()

    def reset_baseline(self, sender_id: str) -> int:
        """Clear baseline for a sender. Returns rows deleted."""
        cur = self._conn.execute(
            "DELETE FROM ato_messages WHERE sender_id = ?", (sender_id,),
        )
        self._conn.commit()
        return cur.rowcount
