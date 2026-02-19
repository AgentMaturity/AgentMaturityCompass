"""AMC Goal Tracker — Wave 2 Features #3, #4.

Goal Decomposer with Milestones + Goal Drift Detector.

Stores goals, decomposes them into ordered milestones, tracks milestone
completion, and detects whether ongoing actions are drifting away from the
original intent using embedding-free heuristics (keyword overlap + action
alignment scoring) that can be upgraded to embeddings later.

SQLite-backed.

API mount point: /api/v1/product/goals
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_NS = UUID("d2e3f4a5-b6c7-8901-defa-234567890bcd")

# ── Schema ───────────────────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS goals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id         TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    session_id      TEXT NOT NULL DEFAULT '',
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'active',
    keywords_json   TEXT NOT NULL DEFAULT '[]',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goals_tenant ON goals(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_session ON goals(session_id);

CREATE TABLE IF NOT EXISTS milestones (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    milestone_id    TEXT NOT NULL UNIQUE,
    goal_id         TEXT NOT NULL REFERENCES goals(goal_id),
    seq             INTEGER NOT NULL DEFAULT 0,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    acceptance      TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'pending',
    depends_on_json TEXT NOT NULL DEFAULT '[]',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    completed_at    TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_milestones_goal ON milestones(goal_id, seq);

CREATE TABLE IF NOT EXISTS drift_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    drift_id        TEXT NOT NULL UNIQUE,
    goal_id         TEXT NOT NULL REFERENCES goals(goal_id),
    tenant_id       TEXT NOT NULL,
    action_summary  TEXT NOT NULL DEFAULT '',
    drift_score     REAL NOT NULL DEFAULT 0.0,
    aligned         INTEGER NOT NULL DEFAULT 1,
    explanation     TEXT NOT NULL DEFAULT '',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drift_goal ON drift_events(goal_id, created_at);
"""


# ── Enums ─────────────────────────────────────────────────────────────────────


class GoalStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    ABANDONED = "abandoned"
    DRIFTED = "drifted"


class MilestoneStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    SKIPPED = "skipped"
    BLOCKED = "blocked"


# ── Domain models ────────────────────────────────────────────────────────────


@dataclass
class GoalInput:
    tenant_id: str
    title: str
    description: str = ""
    session_id: str = ""
    keywords: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class MilestoneInput:
    goal_id: str
    title: str
    seq: int = 0
    description: str = ""
    acceptance: str = ""
    depends_on: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class GoalRecord:
    goal_id: str
    tenant_id: str
    session_id: str
    title: str
    description: str
    status: GoalStatus
    keywords: list[str]
    metadata: dict[str, Any]
    milestones: list["MilestoneRecord"]
    created_at: str
    updated_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "goal_id": self.goal_id,
            "tenant_id": self.tenant_id,
            "session_id": self.session_id,
            "title": self.title,
            "description": self.description,
            "status": self.status.value,
            "keywords": self.keywords,
            "metadata": self.metadata,
            "milestones": [m.dict for m in self.milestones],
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class MilestoneRecord:
    milestone_id: str
    goal_id: str
    seq: int
    title: str
    description: str
    acceptance: str
    status: MilestoneStatus
    depends_on: list[str]
    metadata: dict[str, Any]
    completed_at: str | None
    created_at: str
    updated_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "milestone_id": self.milestone_id,
            "goal_id": self.goal_id,
            "seq": self.seq,
            "title": self.title,
            "description": self.description,
            "acceptance": self.acceptance,
            "status": self.status.value,
            "depends_on": self.depends_on,
            "metadata": self.metadata,
            "completed_at": self.completed_at,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class DriftEvent:
    drift_id: str
    goal_id: str
    tenant_id: str
    action_summary: str
    drift_score: float
    aligned: bool
    explanation: str
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "drift_id": self.drift_id,
            "goal_id": self.goal_id,
            "tenant_id": self.tenant_id,
            "action_summary": self.action_summary,
            "drift_score": self.drift_score,
            "aligned": self.aligned,
            "explanation": self.explanation,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


# ── Core engine ──────────────────────────────────────────────────────────────


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_goal_id(tenant_id: str, title: str) -> str:
    return str(uuid5(_NS, f"{tenant_id}:{title}:{uuid.uuid4()}"))


def _tokenize(text: str) -> set[str]:
    """Simple word tokeniser for drift detection heuristics."""
    import re
    return {w.lower() for w in re.findall(r"[a-z0-9]+", text.lower()) if len(w) > 2}


def _keyword_overlap(goal_keywords: list[str], action_text: str) -> float:
    """Return fraction of goal keywords present in action_text (0–1)."""
    if not goal_keywords:
        return 1.0
    action_tokens = _tokenize(action_text)
    goal_tokens = {k.lower() for k in goal_keywords}
    hits = goal_tokens & action_tokens
    return len(hits) / len(goal_tokens)


class GoalTracker:
    """Goal + milestone store with integrated drift detection."""

    # Drift score threshold above which we flag alignment issues
    DRIFT_THRESHOLD = 0.35

    def __init__(self, db_path: Path | None = None) -> None:
        self._db = str(db_path or product_db_path("goals.db"))
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

    # ── Goals ────────────────────────────────────────────────────────────────

    def create_goal(self, inp: GoalInput) -> GoalRecord:
        goal_id = str(uuid.uuid4())
        now = _utc_now()
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO goals
                   (goal_id, tenant_id, session_id, title, description, status,
                    keywords_json, metadata_json, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    goal_id,
                    inp.tenant_id,
                    inp.session_id,
                    inp.title,
                    inp.description,
                    GoalStatus.ACTIVE.value,
                    json.dumps(inp.keywords),
                    json.dumps(inp.metadata),
                    now,
                    now,
                ),
            )
        log.info("goal_created", goal_id=goal_id, title=inp.title)
        return self.get_goal(goal_id)  # type: ignore[return-value]

    def get_goal(self, goal_id: str) -> GoalRecord | None:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM goals WHERE goal_id=?", (goal_id,)).fetchone()
            if not row:
                return None
            milestones = self._load_milestones(conn, goal_id)
        return self._row_to_goal(row, milestones)

    def list_goals(
        self,
        tenant_id: str,
        session_id: str | None = None,
        status: GoalStatus | None = None,
        limit: int = 50,
    ) -> list[GoalRecord]:
        q = "SELECT * FROM goals WHERE tenant_id=?"
        params: list[Any] = [tenant_id]
        if session_id:
            q += " AND session_id=?"
            params.append(session_id)
        if status:
            q += " AND status=?"
            params.append(status.value)
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as conn:
            rows = conn.execute(q, params).fetchall()
            return [self._row_to_goal(r, self._load_milestones(conn, r["goal_id"])) for r in rows]

    def update_goal_status(self, goal_id: str, status: GoalStatus) -> GoalRecord | None:
        with self._conn() as conn:
            conn.execute(
                "UPDATE goals SET status=?, updated_at=? WHERE goal_id=?",
                (status.value, _utc_now(), goal_id),
            )
        return self.get_goal(goal_id)

    # ── Milestones ──────────────────────────────────────────────────────────

    def add_milestone(self, inp: MilestoneInput) -> MilestoneRecord:
        mid = str(uuid.uuid4())
        now = _utc_now()
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO milestones
                   (milestone_id, goal_id, seq, title, description, acceptance,
                    status, depends_on_json, metadata_json, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    mid,
                    inp.goal_id,
                    inp.seq,
                    inp.title,
                    inp.description,
                    inp.acceptance,
                    MilestoneStatus.PENDING.value,
                    json.dumps(inp.depends_on),
                    json.dumps(inp.metadata),
                    now,
                    now,
                ),
            )
        log.info("milestone_added", milestone_id=mid, goal_id=inp.goal_id)
        return self.get_milestone(mid)  # type: ignore[return-value]

    def get_milestone(self, milestone_id: str) -> MilestoneRecord | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM milestones WHERE milestone_id=?", (milestone_id,)
            ).fetchone()
        return self._row_to_milestone(row) if row else None

    def update_milestone_status(
        self,
        milestone_id: str,
        status: MilestoneStatus,
    ) -> MilestoneRecord | None:
        now = _utc_now()
        completed_at = now if status == MilestoneStatus.DONE else None
        with self._conn() as conn:
            conn.execute(
                """UPDATE milestones SET status=?, completed_at=?, updated_at=?
                   WHERE milestone_id=?""",
                (status.value, completed_at, now, milestone_id),
            )
        # Check if all milestones for the goal are done → auto-complete goal
        row = conn.execute(
            "SELECT goal_id FROM milestones WHERE milestone_id=?", (milestone_id,)
        ).fetchone()
        if row:
            self._maybe_complete_goal(row["goal_id"])
        return self.get_milestone(milestone_id)

    def _maybe_complete_goal(self, goal_id: str) -> None:
        with self._conn() as conn:
            pending = conn.execute(
                "SELECT COUNT(*) FROM milestones WHERE goal_id=? AND status NOT IN (?,?)",
                (goal_id, MilestoneStatus.DONE.value, MilestoneStatus.SKIPPED.value),
            ).fetchone()[0]
            if pending == 0:
                conn.execute(
                    "UPDATE goals SET status=?, updated_at=? WHERE goal_id=?",
                    (GoalStatus.COMPLETED.value, _utc_now(), goal_id),
                )
                log.info("goal_auto_completed", goal_id=goal_id)

    def decompose(
        self,
        goal_id: str,
        milestone_specs: list[dict[str, Any]],
    ) -> list[MilestoneRecord]:
        """Bulk-add milestones from a list of spec dicts."""
        records = []
        for idx, spec in enumerate(milestone_specs):
            inp = MilestoneInput(
                goal_id=goal_id,
                title=spec.get("title", f"Milestone {idx + 1}"),
                seq=spec.get("seq", idx),
                description=spec.get("description", ""),
                acceptance=spec.get("acceptance", ""),
                depends_on=spec.get("depends_on", []),
                metadata=spec.get("metadata", {}),
            )
            records.append(self.add_milestone(inp))
        return records

    # ── Drift detection ─────────────────────────────────────────────────────

    def check_drift(
        self,
        goal_id: str,
        action_summary: str,
        metadata: dict[str, Any] | None = None,
    ) -> DriftEvent:
        """Evaluate whether an action aligns with the goal and record the result."""
        goal = self.get_goal(goal_id)
        if goal is None:
            raise ValueError(f"goal_id not found: {goal_id}")

        overlap = _keyword_overlap(goal.keywords, action_summary)
        # drift_score = 1 - overlap  (0 = perfectly aligned, 1 = totally off)
        drift_score = round(1.0 - overlap, 4)
        aligned = drift_score < self.DRIFT_THRESHOLD

        if not aligned:
            explanation = (
                f"Action has low keyword overlap with goal '{goal.title}' "
                f"(overlap={overlap:.2f}, drift={drift_score:.2f} >= threshold={self.DRIFT_THRESHOLD}). "
                "Consider steering back to goal or updating goal keywords."
            )
            # Mark goal as drifted if not already completed/abandoned
            if goal.status == GoalStatus.ACTIVE:
                with self._conn() as conn:
                    conn.execute(
                        "UPDATE goals SET status=?, updated_at=? WHERE goal_id=?",
                        (GoalStatus.DRIFTED.value, _utc_now(), goal_id),
                    )
        else:
            explanation = (
                f"Action aligns with goal '{goal.title}' "
                f"(overlap={overlap:.2f}, drift={drift_score:.2f})."
            )

        drift_id = str(uuid.uuid4())
        now = _utc_now()
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO drift_events
                   (drift_id, goal_id, tenant_id, action_summary, drift_score,
                    aligned, explanation, metadata_json, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    drift_id,
                    goal_id,
                    goal.tenant_id,
                    action_summary,
                    drift_score,
                    int(aligned),
                    explanation,
                    json.dumps(metadata or {}),
                    now,
                ),
            )
        log.info(
            "drift_check",
            drift_id=drift_id,
            goal_id=goal_id,
            aligned=aligned,
            drift_score=drift_score,
        )
        return DriftEvent(
            drift_id=drift_id,
            goal_id=goal_id,
            tenant_id=goal.tenant_id,
            action_summary=action_summary,
            drift_score=drift_score,
            aligned=aligned,
            explanation=explanation,
            metadata=metadata or {},
            created_at=now,
        )

    def list_drift_events(
        self,
        goal_id: str,
        aligned_only: bool | None = None,
        limit: int = 50,
    ) -> list[DriftEvent]:
        q = "SELECT * FROM drift_events WHERE goal_id=?"
        params: list[Any] = [goal_id]
        if aligned_only is not None:
            q += " AND aligned=?"
            params.append(int(aligned_only))
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as conn:
            rows = conn.execute(q, params).fetchall()
        return [
            DriftEvent(
                drift_id=r["drift_id"],
                goal_id=r["goal_id"],
                tenant_id=r["tenant_id"],
                action_summary=r["action_summary"],
                drift_score=r["drift_score"],
                aligned=bool(r["aligned"]),
                explanation=r["explanation"],
                metadata=json.loads(r["metadata_json"]),
                created_at=r["created_at"],
            )
            for r in rows
        ]

    # ── Helpers ─────────────────────────────────────────────────────────────

    def _load_milestones(
        self, conn: sqlite3.Connection, goal_id: str
    ) -> list[MilestoneRecord]:
        rows = conn.execute(
            "SELECT * FROM milestones WHERE goal_id=? ORDER BY seq ASC", (goal_id,)
        ).fetchall()
        return [self._row_to_milestone(r) for r in rows]

    @staticmethod
    def _row_to_goal(row: sqlite3.Row, milestones: list[MilestoneRecord]) -> GoalRecord:
        return GoalRecord(
            goal_id=row["goal_id"],
            tenant_id=row["tenant_id"],
            session_id=row["session_id"],
            title=row["title"],
            description=row["description"],
            status=GoalStatus(row["status"]),
            keywords=json.loads(row["keywords_json"]),
            metadata=json.loads(row["metadata_json"]),
            milestones=milestones,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _row_to_milestone(row: sqlite3.Row) -> MilestoneRecord:
        return MilestoneRecord(
            milestone_id=row["milestone_id"],
            goal_id=row["goal_id"],
            seq=row["seq"],
            title=row["title"],
            description=row["description"],
            acceptance=row["acceptance"],
            status=MilestoneStatus(row["status"]),
            depends_on=json.loads(row["depends_on_json"]),
            metadata=json.loads(row["metadata_json"]),
            completed_at=row["completed_at"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


# ── Singleton factory ────────────────────────────────────────────────────────

_tracker: GoalTracker | None = None


def get_goal_tracker() -> GoalTracker:
    global _tracker
    if _tracker is None:
        _tracker = GoalTracker()
    return _tracker


def reset_tracker(db_path: Path | None = None) -> GoalTracker:
    global _tracker
    _tracker = GoalTracker(db_path=db_path)
    return _tracker
