"""AMC Loop/Thrash Detector + Strategy Switcher — Wave 2 Feature #5.

Detects when an agent is repeating the same or near-identical actions without
progress (loop) or oscillating between two strategies (thrash), then recommends
a corrective strategy.

Detection is hash-based (exact repeats) plus an edit-distance window for
near-duplicates.  All action history and detections are stored in SQLite so
analysis can be done post-hoc.

API mount point: /api/v1/product/loops
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

# ── Schema ───────────────────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS action_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id        TEXT NOT NULL UNIQUE,
    session_id      TEXT NOT NULL,
    tenant_id       TEXT NOT NULL,
    action_type     TEXT NOT NULL,
    action_summary  TEXT NOT NULL DEFAULT '',
    action_hash     TEXT NOT NULL,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ah_session ON action_history(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ah_hash ON action_history(action_hash);

CREATE TABLE IF NOT EXISTS loop_detections (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    detection_id    TEXT NOT NULL UNIQUE,
    session_id      TEXT NOT NULL,
    tenant_id       TEXT NOT NULL,
    pattern_type    TEXT NOT NULL DEFAULT 'loop',
    repeat_count    INTEGER NOT NULL DEFAULT 0,
    window_size     INTEGER NOT NULL DEFAULT 0,
    action_hashes   TEXT NOT NULL DEFAULT '[]',
    strategy        TEXT NOT NULL DEFAULT 'escalate',
    explanation     TEXT NOT NULL DEFAULT '',
    resolved        INTEGER NOT NULL DEFAULT 0,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ld_session ON loop_detections(session_id, created_at);
"""


# ── Enums ─────────────────────────────────────────────────────────────────────


class PatternType(str, Enum):
    LOOP = "loop"          # exact or near-identical repeated action
    THRASH = "thrash"      # oscillation between two distinct strategies
    STUCK = "stuck"        # same error repeated N times


class RecoveryStrategy(str, Enum):
    ESCALATE = "escalate"        # ask a human
    CHANGE_TOOL = "change_tool"  # try a different tool for the same goal
    CLARIFY = "clarify"          # ask for clarification from the user
    BACKTRACK = "backtrack"      # undo last N steps and restart
    ABORT = "abort"              # stop the task entirely
    RETRY_ONCE = "retry_once"    # one controlled retry then escalate


_STRATEGY_FOR: dict[PatternType, RecoveryStrategy] = {
    PatternType.LOOP: RecoveryStrategy.CHANGE_TOOL,
    PatternType.THRASH: RecoveryStrategy.CLARIFY,
    PatternType.STUCK: RecoveryStrategy.ESCALATE,
}


# ── Domain models ────────────────────────────────────────────────────────────


@dataclass
class ActionEntry:
    entry_id: str
    session_id: str
    tenant_id: str
    action_type: str
    action_summary: str
    action_hash: str
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "entry_id": self.entry_id,
            "session_id": self.session_id,
            "tenant_id": self.tenant_id,
            "action_type": self.action_type,
            "action_summary": self.action_summary,
            "action_hash": self.action_hash,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


@dataclass
class LoopDetection:
    detection_id: str
    session_id: str
    tenant_id: str
    pattern_type: PatternType
    repeat_count: int
    window_size: int
    action_hashes: list[str]
    strategy: RecoveryStrategy
    explanation: str
    resolved: bool
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "detection_id": self.detection_id,
            "session_id": self.session_id,
            "tenant_id": self.tenant_id,
            "pattern_type": self.pattern_type.value,
            "repeat_count": self.repeat_count,
            "window_size": self.window_size,
            "action_hashes": self.action_hashes,
            "strategy": self.strategy.value,
            "explanation": self.explanation,
            "resolved": self.resolved,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


@dataclass
class DetectionResult:
    detected: bool
    detection: LoopDetection | None
    session_id: str
    action_count: int

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "detected": self.detected,
            "detection": self.detection.dict if self.detection else None,
            "session_id": self.session_id,
            "action_count": self.action_count,
        }


# ── Core engine ──────────────────────────────────────────────────────────────


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_action(action_type: str, action_summary: str) -> str:
    raw = f"{action_type.lower().strip()}|{action_summary.lower().strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _levenshtein(a: str, b: str) -> int:
    """Simple Levenshtein distance (trimmed to first 200 chars for speed)."""
    a, b = a[:200], b[:200]
    if a == b:
        return 0
    la, lb = len(a), len(b)
    prev = list(range(lb + 1))
    for i, ca in enumerate(a):
        curr = [i + 1] + [0] * lb
        for j, cb in enumerate(b):
            curr[j + 1] = min(
                prev[j + 1] + 1,
                curr[j] + 1,
                prev[j] + (0 if ca == cb else 1),
            )
        prev = curr
    return prev[lb]


def _are_near_identical(s1: str, s2: str, threshold: float = 0.15) -> bool:
    """Return True if edit distance / max_len <= threshold."""
    max_len = max(len(s1), len(s2), 1)
    return _levenshtein(s1, s2) / max_len <= threshold


class LoopDetector:
    """Records action history and detects loops/thrash patterns per session."""

    # How many recent actions to consider in the window
    WINDOW = 10
    # Minimum repeats to trigger loop detection
    LOOP_THRESHOLD = 3
    # Minimum alternations to trigger thrash detection
    THRASH_THRESHOLD = 4

    def __init__(self, db_path: Path | None = None) -> None:
        self._db = str(db_path or product_db_path("loops.db"))
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_db(self) -> None:
        with self._conn() as conn:
            conn.executescript(_SCHEMA)

    # ── Action recording ─────────────────────────────────────────────────────

    def record_action(
        self,
        session_id: str,
        tenant_id: str,
        action_type: str,
        action_summary: str,
        metadata: dict[str, Any] | None = None,
    ) -> ActionEntry:
        entry_id = str(uuid.uuid4())
        action_hash = _hash_action(action_type, action_summary)
        now = _utc_now()
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO action_history
                   (entry_id, session_id, tenant_id, action_type, action_summary,
                    action_hash, metadata_json, created_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    entry_id,
                    session_id,
                    tenant_id,
                    action_type,
                    action_summary,
                    action_hash,
                    json.dumps(metadata or {}),
                    now,
                ),
            )
        return ActionEntry(
            entry_id=entry_id,
            session_id=session_id,
            tenant_id=tenant_id,
            action_type=action_type,
            action_summary=action_summary,
            action_hash=action_hash,
            metadata=metadata or {},
            created_at=now,
        )

    # ── Detection ────────────────────────────────────────────────────────────

    def check(
        self,
        session_id: str,
        tenant_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> DetectionResult:
        """Analyse recent history for this session and return detection result."""
        entries = self._recent_entries(session_id)
        action_count = len(entries)

        if action_count < self.LOOP_THRESHOLD:
            return DetectionResult(
                detected=False, detection=None,
                session_id=session_id, action_count=action_count,
            )

        # 1. Exact hash loop — require CONSECUTIVE repeats (not just total count)
        hashes = [e.action_hash for e in entries[-self.WINDOW:]]
        # Count max run length of any single hash in recent window
        max_run, cur_run, cur_hash = 1, 1, hashes[0] if hashes else ""
        for h in hashes[1:]:
            if h == cur_hash:
                cur_run += 1
                max_run = max(max_run, cur_run)
            else:
                cur_run = 1
                cur_hash = h
        most_common_hash = cur_hash
        most_count = max_run
        if most_count >= self.LOOP_THRESHOLD:
            detection = self._record_detection(
                session_id=session_id,
                tenant_id=tenant_id,
                pattern_type=PatternType.LOOP,
                repeat_count=most_count,
                window_size=len(hashes),
                action_hashes=hashes,
                explanation=(
                    f"Action hash '{most_common_hash}' repeated {most_count}x "
                    f"in last {len(hashes)} actions."
                ),
                metadata=metadata or {},
            )
            return DetectionResult(
                detected=True, detection=detection,
                session_id=session_id, action_count=action_count,
            )

        # 2. Thrash detection (A/B alternation) — check before near-dup
        #    to prefer the more specific pattern label.
        types = [e.action_type for e in entries[-self.WINDOW:]]
        if len(set(types)) == 2 and len(types) >= self.THRASH_THRESHOLD:
            # Check if they alternate (A,B,A,B…)
            alternating = all(
                types[i] != types[i + 1] for i in range(len(types) - 1)
            )
            if alternating:
                detection = self._record_detection(
                    session_id=session_id,
                    tenant_id=tenant_id,
                    pattern_type=PatternType.THRASH,
                    repeat_count=len(types),
                    window_size=len(types),
                    action_hashes=hashes,
                    explanation=(
                        f"Agent oscillating between '{types[0]}' and '{types[1]}' "
                        f"over {len(types)} steps."
                    ),
                    metadata=metadata or {},
                )
                return DetectionResult(
                    detected=True, detection=detection,
                    session_id=session_id, action_count=action_count,
                )

        # 3. Near-duplicate loop — count consecutive near-identical summaries at tail
        summaries = [e.action_summary for e in entries[-self.WINDOW:]]
        near_run = 1
        ref = summaries[-1]
        for s in reversed(summaries[:-1]):
            if _are_near_identical(ref, s):
                near_run += 1
                ref = s  # slide reference for chain detection
            else:
                break
        if near_run >= self.LOOP_THRESHOLD:
            detection = self._record_detection(
                session_id=session_id,
                tenant_id=tenant_id,
                pattern_type=PatternType.LOOP,
                repeat_count=near_run,
                window_size=len(summaries),
                action_hashes=hashes,
                explanation=(
                    f"Near-identical action repeated {near_run}x consecutively."
                ),
                metadata=metadata or {},
            )
            return DetectionResult(
                detected=True, detection=detection,
                session_id=session_id, action_count=action_count,
            )

        return DetectionResult(
            detected=False, detection=None,
            session_id=session_id, action_count=action_count,
        )

    def record_action_and_check(
        self,
        session_id: str,
        tenant_id: str,
        action_type: str,
        action_summary: str,
        metadata: dict[str, Any] | None = None,
    ) -> DetectionResult:
        """Convenience: record action then immediately check for patterns."""
        self.record_action(
            session_id=session_id,
            tenant_id=tenant_id,
            action_type=action_type,
            action_summary=action_summary,
            metadata=metadata,
        )
        return self.check(session_id, tenant_id, metadata=metadata)

    def resolve_detection(self, detection_id: str) -> bool:
        with self._conn() as conn:
            cur = conn.execute(
                "UPDATE loop_detections SET resolved=1 WHERE detection_id=?",
                (detection_id,),
            )
        return cur.rowcount > 0

    def list_detections(
        self,
        session_id: str | None = None,
        tenant_id: str | None = None,
        resolved: bool | None = None,
        limit: int = 50,
    ) -> list[LoopDetection]:
        q = "SELECT * FROM loop_detections WHERE 1=1"
        params: list[Any] = []
        if session_id:
            q += " AND session_id=?"
            params.append(session_id)
        if tenant_id:
            q += " AND tenant_id=?"
            params.append(tenant_id)
        if resolved is not None:
            q += " AND resolved=?"
            params.append(int(resolved))
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as conn:
            rows = conn.execute(q, params).fetchall()
        return [self._row_to_detection(r) for r in rows]

    def session_history(self, session_id: str, limit: int = 50) -> list[ActionEntry]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM action_history WHERE session_id=? ORDER BY created_at ASC LIMIT ?",
                (session_id, limit),
            ).fetchall()
        return [
            ActionEntry(
                entry_id=r["entry_id"],
                session_id=r["session_id"],
                tenant_id=r["tenant_id"],
                action_type=r["action_type"],
                action_summary=r["action_summary"],
                action_hash=r["action_hash"],
                metadata=json.loads(r["metadata_json"]),
                created_at=r["created_at"],
            )
            for r in rows
        ]

    # ── Helpers ─────────────────────────────────────────────────────────────

    def _recent_entries(self, session_id: str) -> list[ActionEntry]:
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT * FROM action_history WHERE session_id=?
                   ORDER BY created_at ASC""",
                (session_id,),
            ).fetchall()
        return [
            ActionEntry(
                entry_id=r["entry_id"],
                session_id=r["session_id"],
                tenant_id=r["tenant_id"],
                action_type=r["action_type"],
                action_summary=r["action_summary"],
                action_hash=r["action_hash"],
                metadata=json.loads(r["metadata_json"]),
                created_at=r["created_at"],
            )
            for r in rows
        ]

    def _record_detection(
        self,
        session_id: str,
        tenant_id: str,
        pattern_type: PatternType,
        repeat_count: int,
        window_size: int,
        action_hashes: list[str],
        explanation: str,
        metadata: dict[str, Any],
    ) -> LoopDetection:
        strategy = _STRATEGY_FOR.get(pattern_type, RecoveryStrategy.ESCALATE)
        det_id = str(uuid.uuid4())
        now = _utc_now()
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO loop_detections
                   (detection_id, session_id, tenant_id, pattern_type, repeat_count,
                    window_size, action_hashes, strategy, explanation, resolved,
                    metadata_json, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,0,?,?)""",
                (
                    det_id,
                    session_id,
                    tenant_id,
                    pattern_type.value,
                    repeat_count,
                    window_size,
                    json.dumps(action_hashes),
                    strategy.value,
                    explanation,
                    json.dumps(metadata),
                    now,
                ),
            )
        log.warning(
            "loop_detected",
            detection_id=det_id,
            pattern=pattern_type.value,
            strategy=strategy.value,
        )
        return LoopDetection(
            detection_id=det_id,
            session_id=session_id,
            tenant_id=tenant_id,
            pattern_type=pattern_type,
            repeat_count=repeat_count,
            window_size=window_size,
            action_hashes=action_hashes,
            strategy=strategy,
            explanation=explanation,
            resolved=False,
            metadata=metadata,
            created_at=now,
        )

    @staticmethod
    def _row_to_detection(row: sqlite3.Row) -> LoopDetection:
        return LoopDetection(
            detection_id=row["detection_id"],
            session_id=row["session_id"],
            tenant_id=row["tenant_id"],
            pattern_type=PatternType(row["pattern_type"]),
            repeat_count=row["repeat_count"],
            window_size=row["window_size"],
            action_hashes=json.loads(row["action_hashes"]),
            strategy=RecoveryStrategy(row["strategy"]),
            explanation=row["explanation"],
            resolved=bool(row["resolved"]),
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"],
        )


# ── Singleton factory ────────────────────────────────────────────────────────

_detector: LoopDetector | None = None


def get_loop_detector() -> LoopDetector:
    global _detector
    if _detector is None:
        _detector = LoopDetector()
    return _detector


def reset_detector(db_path: Path | None = None) -> LoopDetector:
    global _detector
    _detector = LoopDetector(db_path=db_path)
    return _detector
