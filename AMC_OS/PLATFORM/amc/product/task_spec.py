"""Task Spec + Acceptance Criteria Compiler — Wave-2 Tool Intelligence.

Parses a natural-language task request into a formal structured specification:
  - goal statement
  - inputs (entities/values needed)
  - outputs (deliverables expected)
  - constraints (limits, rules)
  - done-criteria (measurable acceptance checklist)

Heuristic extraction (no LLM dependency). SQLite-backed for persistence.
"""
from __future__ import annotations

import json
import re
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS task_specs (
    spec_id         TEXT PRIMARY KEY,
    raw_request     TEXT NOT NULL,
    goal            TEXT NOT NULL DEFAULT '',
    inputs_json     TEXT NOT NULL DEFAULT '[]',
    outputs_json    TEXT NOT NULL DEFAULT '[]',
    constraints_json TEXT NOT NULL DEFAULT '[]',
    done_criteria_json TEXT NOT NULL DEFAULT '[]',
    confidence      REAL NOT NULL DEFAULT 0.5,
    session_id      TEXT NOT NULL DEFAULT '',
    tenant_id       TEXT NOT NULL DEFAULT '',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_specs_tenant ON task_specs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_specs_session ON task_specs(session_id);
"""

# ---------------------------------------------------------------------------
# Keyword-trigger dictionaries for heuristic extraction
# ---------------------------------------------------------------------------

_INPUT_SIGNALS = re.compile(
    r"\b(given|with|using|from|based on|input[s]?|provided?|taking|accept[s]?)\b",
    re.IGNORECASE,
)
_OUTPUT_SIGNALS = re.compile(
    r"\b(produce[s]?|generate[s]?|output[s]?|return[s]?|create[s]?|deliver[s]?|"
    r"write[s]?|build[s]?|provide[s]?|send[s]?|export[s]?)\b",
    re.IGNORECASE,
)
_CONSTRAINT_SIGNALS = re.compile(
    r"\b(must|shall|should|cannot|must not|no more than|at most|at least|"
    r"within|under|limit|restrict|require[s]?|do not|avoid|only|"
    r"maximum|minimum|budget|deadline|sla|threshold)\b",
    re.IGNORECASE,
)
_DONE_SIGNALS = re.compile(
    r"\b(done when|complete when|accept when|success when|verify|tested|validated|"
    r"confirmed|approved|passes|all.*pass|zero.*error|no.*error|coverage|"
    r"deployed|reviewed)\b",
    re.IGNORECASE,
)

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|(?<=\n)")


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_SPLIT.split(text) if s.strip()]


def _extract_goal(text: str) -> str:
    """Use the first meaningful sentence as the goal."""
    sents = _sentences(text)
    return sents[0] if sents else text[:120]


def _extract_tagged(text: str, signal: re.Pattern[str]) -> list[str]:
    """Return sentences that contain a trigger for a given signal pattern."""
    return [s for s in _sentences(text) if signal.search(s)]


def _score_confidence(
    goal: str,
    inputs: list[str],
    outputs: list[str],
    constraints: list[str],
    done: list[str],
) -> float:
    """Simple heuristic completeness score [0,1]."""
    score = 0.0
    if goal and len(goal) > 10:
        score += 0.3
    if inputs:
        score += 0.15
    if outputs:
        score += 0.2
    if constraints:
        score += 0.15
    if done:
        score += 0.2
    return round(min(score, 1.0), 3)


def _auto_done_criteria(goal: str, outputs: list[str]) -> list[str]:
    """Generate sensible default done-criteria when none are detected."""
    criteria: list[str] = []
    if outputs:
        criteria.append(f"All expected outputs are produced: {outputs[0]}")
    criteria.append("No runtime errors or exceptions occur during execution")
    criteria.append("Output passes schema / format validation")
    if "test" in goal.lower() or "spec" in goal.lower():
        criteria.append("All tests pass with zero failures")
    return criteria


# ---------------------------------------------------------------------------
# Domain model
# ---------------------------------------------------------------------------


@dataclass
class TaskSpec:
    spec_id: str
    raw_request: str
    goal: str
    inputs: list[str]
    outputs: list[str]
    constraints: list[str]
    done_criteria: list[str]
    confidence: float
    session_id: str
    tenant_id: str
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "spec_id": self.spec_id,
            "raw_request": self.raw_request,
            "goal": self.goal,
            "inputs": self.inputs,
            "outputs": self.outputs,
            "constraints": self.constraints,
            "done_criteria": self.done_criteria,
            "confidence": self.confidence,
            "session_id": self.session_id,
            "tenant_id": self.tenant_id,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


# ---------------------------------------------------------------------------
# Core compiler
# ---------------------------------------------------------------------------


class TaskSpecCompiler:
    """Compile NL task requests into formal specs. SQLite-backed."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(product_db_path(db_path))
        self._conn = self._init_db()

    def _init_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.executescript(_SCHEMA)
        conn.commit()
        return conn

    def compile(
        self,
        raw_request: str,
        session_id: str = "",
        tenant_id: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> TaskSpec:
        """Parse a natural-language request and persist the resulting spec."""
        goal = _extract_goal(raw_request)
        inputs = _extract_tagged(raw_request, _INPUT_SIGNALS)
        outputs = _extract_tagged(raw_request, _OUTPUT_SIGNALS)
        constraints = _extract_tagged(raw_request, _CONSTRAINT_SIGNALS)
        done = _extract_tagged(raw_request, _DONE_SIGNALS)
        if not done:
            done = _auto_done_criteria(goal, outputs)

        conf = _score_confidence(goal, inputs, outputs, constraints, done)
        spec_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        self._conn.execute(
            """INSERT INTO task_specs
               (spec_id,raw_request,goal,inputs_json,outputs_json,
                constraints_json,done_criteria_json,confidence,
                session_id,tenant_id,metadata_json,created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                spec_id, raw_request, goal,
                json.dumps(inputs), json.dumps(outputs),
                json.dumps(constraints), json.dumps(done),
                conf, session_id, tenant_id,
                json.dumps(metadata or {}), now,
            ),
        )
        self._conn.commit()

        return TaskSpec(
            spec_id=spec_id, raw_request=raw_request, goal=goal,
            inputs=inputs, outputs=outputs, constraints=constraints,
            done_criteria=done, confidence=conf,
            session_id=session_id, tenant_id=tenant_id,
            metadata=metadata or {}, created_at=now,
        )

    def get(self, spec_id: str) -> TaskSpec | None:
        row = self._conn.execute(
            "SELECT * FROM task_specs WHERE spec_id=?", (spec_id,)
        ).fetchone()
        return self._row_to_spec(row) if row else None

    def list_specs(
        self,
        tenant_id: str | None = None,
        session_id: str | None = None,
        limit: int = 50,
    ) -> list[TaskSpec]:
        q = "SELECT * FROM task_specs WHERE 1=1"
        params: list[Any] = []
        if tenant_id:
            q += " AND tenant_id=?"; params.append(tenant_id)
        if session_id:
            q += " AND session_id=?"; params.append(session_id)
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        rows = self._conn.execute(q, params).fetchall()
        return [self._row_to_spec(r) for r in rows]

    def delete(self, spec_id: str) -> bool:
        cur = self._conn.execute("DELETE FROM task_specs WHERE spec_id=?", (spec_id,))
        self._conn.commit()
        return cur.rowcount > 0

    @staticmethod
    def _row_to_spec(row: sqlite3.Row) -> TaskSpec:
        return TaskSpec(
            spec_id=row["spec_id"],
            raw_request=row["raw_request"],
            goal=row["goal"],
            inputs=json.loads(row["inputs_json"]),
            outputs=json.loads(row["outputs_json"]),
            constraints=json.loads(row["constraints_json"]),
            done_criteria=json.loads(row["done_criteria_json"]),
            confidence=row["confidence"],
            session_id=row["session_id"],
            tenant_id=row["tenant_id"],
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"],
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_compiler: TaskSpecCompiler | None = None


def get_task_spec_compiler(db_path: str | Path | None = None) -> TaskSpecCompiler:
    global _compiler
    if _compiler is None:
        _compiler = TaskSpecCompiler(db_path=db_path)
    return _compiler


__all__ = [
    "TaskSpec",
    "TaskSpecCompiler",
    "get_task_spec_compiler",
]
