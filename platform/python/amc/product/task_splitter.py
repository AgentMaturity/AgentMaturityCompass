"""Multi-Agent Task Splitter — Wave-2 Tool Intelligence.

Decomposes a complex task (described as a TaskSpec or raw NL) into
discrete sub-tasks, each assignable to a specific agent type. Produces:
  - sub-task list with agent assignments
  - parallel/sequential execution hints
  - aggregation strategy for results

Heuristic decomposition rules + SQLite-backed for persistence.
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
CREATE TABLE IF NOT EXISTS task_splits (
    split_id        TEXT PRIMARY KEY,
    parent_task     TEXT NOT NULL DEFAULT '',
    sub_tasks_json  TEXT NOT NULL DEFAULT '[]',
    execution_mode  TEXT NOT NULL DEFAULT 'sequential',
    aggregation     TEXT NOT NULL DEFAULT 'merge',
    agent_count     INTEGER NOT NULL DEFAULT 1,
    tenant_id       TEXT NOT NULL DEFAULT '',
    session_id      TEXT NOT NULL DEFAULT '',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_splits_tenant ON task_splits(tenant_id);
"""

# ---------------------------------------------------------------------------
# Agent type registry (built-in)
# ---------------------------------------------------------------------------

AGENT_TYPES = {
    "researcher": re.compile(
        r"\b(research|find|search|look up|gather|collect|analyze|investigate|"
        r"survey|review|study|read|browse|fetch|retrieve)\b", re.IGNORECASE
    ),
    "writer": re.compile(
        r"\b(write|draft|compose|document|summarize|summarise|create|"
        r"report|essay|blog|email|message|copy|content)\b", re.IGNORECASE
    ),
    "coder": re.compile(
        r"\b(code|implement|program|develop|build|script|function|api|"
        r"module|test|debug|refactor|deploy|run|execute)\b", re.IGNORECASE
    ),
    "analyst": re.compile(
        r"\b(analyz|calculate|compute|measure|evaluat|assess|score|"
        r"compare|rank|prioritize|model|forecast|predict)\b", re.IGNORECASE
    ),
    "coordinator": re.compile(
        r"\b(coordinate|orchestrate|schedule|plan|manage|assign|"
        r"delegate|track|monitor|report)\b", re.IGNORECASE
    ),
    "validator": re.compile(
        r"\b(validate|verify|check|test|review|audit|confirm|"
        r"approve|ensure|certify|quality)\b", re.IGNORECASE
    ),
}

_PARALLEL_SIGNALS = re.compile(
    r"\b(simultaneously|parallel|concurrent|at the same time|"
    r"independent|in parallel|both|all of|each)\b",
    re.IGNORECASE,
)
_SEQUENTIAL_SIGNALS = re.compile(
    r"\b(then|after|once|following|sequentially|next|subsequently|"
    r"first.*then|step by step|in order)\b",
    re.IGNORECASE,
)

_CONJUNCTIONS = re.compile(
    r"\b(and also|additionally|furthermore|moreover|as well as|plus)\b",
    re.IGNORECASE,
)


def _infer_agent(description: str) -> str:
    scores: dict[str, int] = {}
    for agent, pat in AGENT_TYPES.items():
        matches = pat.findall(description)
        if matches:
            scores[agent] = len(matches)
    if not scores:
        return "coordinator"
    return max(scores, key=lambda k: scores[k])


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?;])\s+|\n+", text)
    return [p.strip() for p in parts if p.strip() and len(p.strip()) > 10]


def _infer_execution_mode(task_text: str) -> str:
    if _PARALLEL_SIGNALS.search(task_text):
        return "parallel"
    if _SEQUENTIAL_SIGNALS.search(task_text):
        return "sequential"
    return "sequential"


def _infer_aggregation(output_sentences: list[str]) -> str:
    """Guess aggregation strategy from task description."""
    combined = " ".join(output_sentences).lower()
    if any(w in combined for w in ("report", "summary", "merge", "combine")):
        return "merge"
    if any(w in combined for w in ("vote", "consensus", "majority")):
        return "vote"
    if any(w in combined for w in ("pipeline", "chain", "pass")):
        return "pipeline"
    return "merge"


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class SubTask:
    sub_task_id: str
    parent_split_id: str
    title: str
    description: str
    agent_type: str
    order: int
    can_parallel: bool
    depends_on: list[str]
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "sub_task_id": self.sub_task_id,
            "parent_split_id": self.parent_split_id,
            "title": self.title,
            "description": self.description,
            "agent_type": self.agent_type,
            "order": self.order,
            "can_parallel": self.can_parallel,
            "depends_on": self.depends_on,
            "metadata": self.metadata,
        }


@dataclass
class TaskSplit:
    split_id: str
    parent_task: str
    sub_tasks: list[SubTask]
    execution_mode: str
    aggregation: str
    agent_count: int
    tenant_id: str
    session_id: str
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "split_id": self.split_id,
            "parent_task": self.parent_task,
            "sub_tasks": [s.dict for s in self.sub_tasks],
            "execution_mode": self.execution_mode,
            "aggregation": self.aggregation,
            "agent_count": self.agent_count,
            "tenant_id": self.tenant_id,
            "session_id": self.session_id,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


# ---------------------------------------------------------------------------
# Core splitter
# ---------------------------------------------------------------------------


class MultiAgentTaskSplitter:
    """Decompose complex tasks into assignable sub-tasks. SQLite-backed."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(product_db_path(db_path))
        self._conn = self._init_db()

    def _init_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.executescript(_SCHEMA)
        conn.commit()
        return conn

    def split(
        self,
        parent_task: str,
        manual_sub_tasks: list[dict[str, Any]] | None = None,
        session_id: str = "",
        tenant_id: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> TaskSplit:
        """Decompose a task into sub-tasks and persist."""
        split_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        exec_mode = _infer_execution_mode(parent_task)

        if manual_sub_tasks:
            sub_tasks = self._build_from_manual(split_id, manual_sub_tasks, exec_mode)
        else:
            sub_tasks = self._auto_decompose(split_id, parent_task, exec_mode)

        aggregation = _infer_aggregation([s.description for s in sub_tasks])
        agent_types = {s.agent_type for s in sub_tasks}

        self._conn.execute(
            """INSERT INTO task_splits
               (split_id,parent_task,sub_tasks_json,execution_mode,
                aggregation,agent_count,tenant_id,session_id,metadata_json,created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (
                split_id, parent_task,
                json.dumps([s.dict for s in sub_tasks]),
                exec_mode, aggregation, len(agent_types),
                tenant_id, session_id, json.dumps(metadata or {}), now,
            ),
        )
        self._conn.commit()

        return TaskSplit(
            split_id=split_id, parent_task=parent_task,
            sub_tasks=sub_tasks, execution_mode=exec_mode,
            aggregation=aggregation, agent_count=len(agent_types),
            tenant_id=tenant_id, session_id=session_id,
            metadata=metadata or {}, created_at=now,
        )

    def get(self, split_id: str) -> TaskSplit | None:
        row = self._conn.execute(
            "SELECT * FROM task_splits WHERE split_id=?", (split_id,)
        ).fetchone()
        return self._row_to_split(row) if row else None

    def list_splits(
        self,
        tenant_id: str | None = None,
        session_id: str | None = None,
        limit: int = 50,
    ) -> list[TaskSplit]:
        q = "SELECT * FROM task_splits WHERE 1=1"
        params: list[Any] = []
        if tenant_id:
            q += " AND tenant_id=?"; params.append(tenant_id)
        if session_id:
            q += " AND session_id=?"; params.append(session_id)
        q += " ORDER BY created_at DESC LIMIT ?"; params.append(limit)
        return [self._row_to_split(r) for r in self._conn.execute(q, params).fetchall()]

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _auto_decompose(
        self, split_id: str, task: str, exec_mode: str
    ) -> list[SubTask]:
        """Heuristically decompose task text into sub-tasks."""
        sentences = _split_sentences(task)
        if not sentences:
            sentences = [task]

        # Also split on conjunction signals
        expanded: list[str] = []
        for sent in sentences:
            parts = _CONJUNCTIONS.split(sent)
            expanded.extend(p.strip() for p in parts if p.strip())

        # Merge tiny fragments
        merged: list[str] = []
        buf = ""
        for part in expanded:
            if len(part) < 20 and buf:
                buf += " " + part
            else:
                if buf:
                    merged.append(buf)
                buf = part
        if buf:
            merged.append(buf)

        if not merged:
            merged = [task]

        sub_tasks: list[SubTask] = []
        prev_ids: list[str] = []
        for i, desc in enumerate(merged[:10]):  # cap at 10 sub-tasks
            agent = _infer_agent(desc)
            sub_id = str(uuid.uuid4())
            can_parallel = exec_mode == "parallel"
            depends = [] if (can_parallel or i == 0) else [prev_ids[-1]]
            title = desc[:60].rstrip(",;.") if len(desc) > 60 else desc
            sub_tasks.append(SubTask(
                sub_task_id=sub_id, parent_split_id=split_id,
                title=title, description=desc,
                agent_type=agent, order=i + 1,
                can_parallel=can_parallel, depends_on=depends,
            ))
            prev_ids.append(sub_id)

        return sub_tasks

    def _build_from_manual(
        self, split_id: str, items: list[dict[str, Any]], exec_mode: str
    ) -> list[SubTask]:
        """Build sub-tasks from caller-provided definitions."""
        sub_tasks: list[SubTask] = []
        prev_id: str | None = None
        for i, item in enumerate(items):
            sub_id = item.get("sub_task_id") or str(uuid.uuid4())
            desc = item.get("description", "")
            agent = item.get("agent_type") or _infer_agent(desc)
            can_parallel = item.get("can_parallel", exec_mode == "parallel")
            depends = item.get("depends_on", [] if (can_parallel or not prev_id) else [prev_id])
            sub_tasks.append(SubTask(
                sub_task_id=sub_id, parent_split_id=split_id,
                title=item.get("title", desc[:60]),
                description=desc,
                agent_type=agent,
                order=item.get("order", i + 1),
                can_parallel=can_parallel,
                depends_on=depends,
                metadata=item.get("metadata", {}),
            ))
            prev_id = sub_id
        return sub_tasks

    @staticmethod
    def _row_to_split(row: sqlite3.Row) -> TaskSplit:
        raw = json.loads(row["sub_tasks_json"])
        sub_tasks = [
            SubTask(
                sub_task_id=s["sub_task_id"], parent_split_id=s["parent_split_id"],
                title=s["title"], description=s["description"],
                agent_type=s["agent_type"], order=s["order"],
                can_parallel=s["can_parallel"], depends_on=s["depends_on"],
                metadata=s.get("metadata", {}),
            )
            for s in raw
        ]
        return TaskSplit(
            split_id=row["split_id"], parent_task=row["parent_task"],
            sub_tasks=sub_tasks, execution_mode=row["execution_mode"],
            aggregation=row["aggregation"], agent_count=row["agent_count"],
            tenant_id=row["tenant_id"], session_id=row["session_id"],
            metadata=json.loads(row["metadata_json"]), created_at=row["created_at"],
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_splitter: MultiAgentTaskSplitter | None = None


def get_task_splitter(db_path: str | Path | None = None) -> MultiAgentTaskSplitter:
    global _splitter
    if _splitter is None:
        _splitter = MultiAgentTaskSplitter(db_path=db_path)
    return _splitter


__all__ = [
    "SubTask",
    "TaskSplit",
    "MultiAgentTaskSplitter",
    "get_task_splitter",
    "AGENT_TYPES",
]
