"""LLM Output Diff Tracker — track run-to-run diffs, detect regressions.

Stores output history in SQLite and computes structural + textual diffs
between runs for the same prompt/workflow key.

API: /api/v1/product/output/diff/*
"""
from __future__ import annotations

import difflib
import hashlib
import json
import re
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS output_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          TEXT NOT NULL UNIQUE,
    workflow_id     TEXT NOT NULL DEFAULT '',
    prompt_key      TEXT NOT NULL DEFAULT '',
    tenant_id       TEXT NOT NULL DEFAULT '',
    session_id      TEXT NOT NULL DEFAULT '',
    output_text     TEXT NOT NULL,
    output_hash     TEXT NOT NULL,
    token_count     INTEGER NOT NULL DEFAULT 0,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orun_workflow   ON output_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_orun_prompt     ON output_runs(prompt_key);
CREATE INDEX IF NOT EXISTS idx_orun_tenant     ON output_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orun_hash       ON output_runs(output_hash);

CREATE TABLE IF NOT EXISTS output_diffs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    diff_id         TEXT NOT NULL UNIQUE,
    workflow_id     TEXT NOT NULL DEFAULT '',
    prompt_key      TEXT NOT NULL DEFAULT '',
    tenant_id       TEXT NOT NULL DEFAULT '',
    run_a_id        TEXT NOT NULL,
    run_b_id        TEXT NOT NULL,
    similarity      REAL NOT NULL DEFAULT 1.0,
    is_regression   INTEGER NOT NULL DEFAULT 0,
    regression_reason TEXT NOT NULL DEFAULT '',
    added_lines     INTEGER NOT NULL DEFAULT 0,
    removed_lines   INTEGER NOT NULL DEFAULT 0,
    changed_lines   INTEGER NOT NULL DEFAULT 0,
    unified_diff    TEXT NOT NULL DEFAULT '',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_odiff_workflow  ON output_diffs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_odiff_prompt    ON output_diffs(prompt_key);
CREATE INDEX IF NOT EXISTS idx_odiff_regression ON output_diffs(is_regression);
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _text_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def _approx_token_count(text: str) -> int:
    return max(1, len(text) // 4)


def _similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio()


def _unified_diff(a: str, b: str) -> tuple[str, int, int, int]:
    a_lines = a.splitlines(keepends=True)
    b_lines = b.splitlines(keepends=True)
    diff_lines = list(difflib.unified_diff(a_lines, b_lines, lineterm=""))
    added = sum(1 for l in diff_lines if l.startswith("+") and not l.startswith("+++"))
    removed = sum(1 for l in diff_lines if l.startswith("-") and not l.startswith("---"))
    changed = min(added, removed)
    return "\n".join(diff_lines), added, removed, changed


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------


@dataclass
class RunRecord:
    run_id: str
    workflow_id: str
    prompt_key: str
    tenant_id: str
    session_id: str
    output_text: str
    output_hash: str
    token_count: int
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "workflow_id": self.workflow_id,
            "prompt_key": self.prompt_key,
            "tenant_id": self.tenant_id,
            "session_id": self.session_id,
            "output_text": self.output_text,
            "output_hash": self.output_hash,
            "token_count": self.token_count,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


@dataclass
class DiffRecord:
    diff_id: str
    workflow_id: str
    prompt_key: str
    tenant_id: str
    run_a_id: str
    run_b_id: str
    similarity: float
    is_regression: bool
    regression_reason: str
    added_lines: int
    removed_lines: int
    changed_lines: int
    unified_diff: str
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "diff_id": self.diff_id,
            "workflow_id": self.workflow_id,
            "prompt_key": self.prompt_key,
            "tenant_id": self.tenant_id,
            "run_a_id": self.run_a_id,
            "run_b_id": self.run_b_id,
            "similarity": round(self.similarity, 4),
            "is_regression": self.is_regression,
            "regression_reason": self.regression_reason,
            "added_lines": self.added_lines,
            "removed_lines": self.removed_lines,
            "changed_lines": self.changed_lines,
            "unified_diff": self.unified_diff,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


@dataclass
class RegressionSummary:
    workflow_id: str
    prompt_key: str
    total_runs: int
    total_diffs: int
    regression_count: int
    avg_similarity: float
    latest_run_id: str | None

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "workflow_id": self.workflow_id,
            "prompt_key": self.prompt_key,
            "total_runs": self.total_runs,
            "total_diffs": self.total_diffs,
            "regression_count": self.regression_count,
            "avg_similarity": round(self.avg_similarity, 4),
            "latest_run_id": self.latest_run_id,
        }


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class OutputDiffTracker:
    """Record LLM outputs and compute diffs between consecutive runs."""

    # Similarity below this threshold → flag as regression candidate
    REGRESSION_THRESHOLD = 0.60

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = str(product_db_path(db_path))
        self._conn = self._init_db()

    def _init_db(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.executescript(_SCHEMA)
        conn.commit()
        return conn

    # ------------------------------------------------------------------
    # Run storage
    # ------------------------------------------------------------------

    def record_run(
        self,
        output_text: str,
        workflow_id: str = "",
        prompt_key: str = "",
        tenant_id: str = "",
        session_id: str = "",
        run_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        auto_diff: bool = True,
    ) -> RunRecord:
        """Store an LLM output. If auto_diff, compute diff against latest prior run."""
        run_id = run_id or str(uuid4())
        now = _utc_now()
        record = RunRecord(
            run_id=run_id,
            workflow_id=workflow_id,
            prompt_key=prompt_key,
            tenant_id=tenant_id,
            session_id=session_id,
            output_text=output_text,
            output_hash=_text_hash(output_text),
            token_count=_approx_token_count(output_text),
            metadata=metadata or {},
            created_at=now,
        )
        self._conn.execute(
            """
            INSERT OR IGNORE INTO output_runs
                (run_id, workflow_id, prompt_key, tenant_id, session_id,
                 output_text, output_hash, token_count, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record.run_id, record.workflow_id, record.prompt_key,
                record.tenant_id, record.session_id, record.output_text,
                record.output_hash, record.token_count,
                json.dumps(record.metadata), record.created_at,
            ),
        )
        self._conn.commit()

        if auto_diff:
            prior = self._latest_run(workflow_id, prompt_key, exclude_run_id=run_id)
            if prior:
                self.compute_diff(prior.run_id, run_id)

        log.debug("output_run_recorded", run_id=run_id, workflow_id=workflow_id)
        return record

    def get_run(self, run_id: str) -> RunRecord | None:
        row = self._conn.execute(
            "SELECT * FROM output_runs WHERE run_id=?", (run_id,)
        ).fetchone()
        return self._row_to_run(row) if row else None

    def list_runs(
        self,
        workflow_id: str | None = None,
        prompt_key: str | None = None,
        tenant_id: str | None = None,
        limit: int = 50,
    ) -> list[RunRecord]:
        q = "SELECT * FROM output_runs WHERE 1=1"
        params: list[Any] = []
        if workflow_id:
            q += " AND workflow_id=?"
            params.append(workflow_id)
        if prompt_key:
            q += " AND prompt_key=?"
            params.append(prompt_key)
        if tenant_id:
            q += " AND tenant_id=?"
            params.append(tenant_id)
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        return [self._row_to_run(r) for r in self._conn.execute(q, params).fetchall()]

    def _latest_run(
        self, workflow_id: str, prompt_key: str, exclude_run_id: str = ""
    ) -> RunRecord | None:
        q = "SELECT * FROM output_runs WHERE workflow_id=? AND prompt_key=?"
        params: list[Any] = [workflow_id, prompt_key]
        if exclude_run_id:
            q += " AND run_id!=?"
            params.append(exclude_run_id)
        q += " ORDER BY created_at DESC LIMIT 1"
        row = self._conn.execute(q, params).fetchone()
        return self._row_to_run(row) if row else None

    # ------------------------------------------------------------------
    # Diff computation
    # ------------------------------------------------------------------

    def compute_diff(
        self,
        run_a_id: str,
        run_b_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> DiffRecord:
        """Compute and store a diff between two run outputs."""
        run_a = self.get_run(run_a_id)
        run_b = self.get_run(run_b_id)
        if not run_a or not run_b:
            raise ValueError(f"Run not found: {run_a_id if not run_a else run_b_id}")

        sim = _similarity(run_a.output_text, run_b.output_text)
        diff_text, added, removed, changed = _unified_diff(
            run_a.output_text, run_b.output_text
        )

        is_regression = sim < self.REGRESSION_THRESHOLD
        regression_reason = (
            f"Similarity {sim:.2%} below threshold {self.REGRESSION_THRESHOLD:.0%}"
            if is_regression
            else ""
        )

        diff_id = str(uuid4())
        now = _utc_now()
        record = DiffRecord(
            diff_id=diff_id,
            workflow_id=run_a.workflow_id,
            prompt_key=run_a.prompt_key,
            tenant_id=run_a.tenant_id,
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            similarity=sim,
            is_regression=is_regression,
            regression_reason=regression_reason,
            added_lines=added,
            removed_lines=removed,
            changed_lines=changed,
            unified_diff=diff_text,
            metadata=metadata or {},
            created_at=now,
        )
        self._conn.execute(
            """
            INSERT OR IGNORE INTO output_diffs
                (diff_id, workflow_id, prompt_key, tenant_id, run_a_id, run_b_id,
                 similarity, is_regression, regression_reason, added_lines,
                 removed_lines, changed_lines, unified_diff, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record.diff_id, record.workflow_id, record.prompt_key,
                record.tenant_id, record.run_a_id, record.run_b_id,
                record.similarity, 1 if record.is_regression else 0,
                record.regression_reason, record.added_lines,
                record.removed_lines, record.changed_lines,
                record.unified_diff, json.dumps(record.metadata), record.created_at,
            ),
        )
        self._conn.commit()

        log.info(
            "output_diff_computed",
            diff_id=diff_id,
            similarity=round(sim, 4),
            is_regression=is_regression,
        )
        return record

    def get_diff(self, diff_id: str) -> DiffRecord | None:
        row = self._conn.execute(
            "SELECT * FROM output_diffs WHERE diff_id=?", (diff_id,)
        ).fetchone()
        return self._row_to_diff(row) if row else None

    def list_diffs(
        self,
        workflow_id: str | None = None,
        prompt_key: str | None = None,
        regressions_only: bool = False,
        limit: int = 50,
    ) -> list[DiffRecord]:
        q = "SELECT * FROM output_diffs WHERE 1=1"
        params: list[Any] = []
        if workflow_id:
            q += " AND workflow_id=?"
            params.append(workflow_id)
        if prompt_key:
            q += " AND prompt_key=?"
            params.append(prompt_key)
        if regressions_only:
            q += " AND is_regression=1"
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        return [self._row_to_diff(r) for r in self._conn.execute(q, params).fetchall()]

    def regression_summary(
        self,
        workflow_id: str,
        prompt_key: str = "",
    ) -> RegressionSummary:
        runs = self.list_runs(workflow_id=workflow_id, prompt_key=prompt_key or None, limit=10000)
        diffs = self.list_diffs(workflow_id=workflow_id, prompt_key=prompt_key or None, limit=10000)
        regressions = [d for d in diffs if d.is_regression]
        avg_sim = (
            sum(d.similarity for d in diffs) / len(diffs) if diffs else 1.0
        )
        latest_run = runs[0].run_id if runs else None
        return RegressionSummary(
            workflow_id=workflow_id,
            prompt_key=prompt_key,
            total_runs=len(runs),
            total_diffs=len(diffs),
            regression_count=len(regressions),
            avg_similarity=avg_sim,
            latest_run_id=latest_run,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _row_to_run(self, row: sqlite3.Row) -> RunRecord:
        return RunRecord(
            run_id=row["run_id"],
            workflow_id=row["workflow_id"],
            prompt_key=row["prompt_key"],
            tenant_id=row["tenant_id"],
            session_id=row["session_id"],
            output_text=row["output_text"],
            output_hash=row["output_hash"],
            token_count=row["token_count"],
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"],
        )

    def _row_to_diff(self, row: sqlite3.Row) -> DiffRecord:
        return DiffRecord(
            diff_id=row["diff_id"],
            workflow_id=row["workflow_id"],
            prompt_key=row["prompt_key"],
            tenant_id=row["tenant_id"],
            run_a_id=row["run_a_id"],
            run_b_id=row["run_b_id"],
            similarity=row["similarity"],
            is_regression=bool(row["is_regression"]),
            regression_reason=row["regression_reason"],
            added_lines=row["added_lines"],
            removed_lines=row["removed_lines"],
            changed_lines=row["changed_lines"],
            unified_diff=row["unified_diff"],
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"],
        )


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_tracker: OutputDiffTracker | None = None


def get_output_diff_tracker(db_path: str | Path | None = None) -> OutputDiffTracker:
    global _tracker
    if _tracker is None:
        _tracker = OutputDiffTracker(db_path=db_path)
    return _tracker


__all__ = [
    "RunRecord",
    "DiffRecord",
    "RegressionSummary",
    "OutputDiffTracker",
    "get_output_diff_tracker",
]
