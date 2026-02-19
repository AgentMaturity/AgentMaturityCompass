"""Deterministic output toolkit for AMC workflows.

Provides:
- Template registry: store named output templates with variables
- Canonicalization rules: normalize text/JSON for reproducible comparison
- Fixed settings per workflow: temperature, seed, etc.
- Run-to-run consistency scoring: hash outputs and compare across runs

All data is persisted in SQLite (shared via ``amc_product_determinism.db``).
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from amc.product.persistence import product_db_path

# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

_DK_SCHEMA = """
CREATE TABLE IF NOT EXISTS dk_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    template_text TEXT NOT NULL,
    variables_json TEXT NOT NULL DEFAULT '[]',
    workflow_id TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dk_templates_workflow
    ON dk_templates(workflow_id);

CREATE TABLE IF NOT EXISTS dk_canon_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    rule_type TEXT NOT NULL,
    pattern TEXT NOT NULL DEFAULT '',
    replacement TEXT NOT NULL DEFAULT '',
    flags TEXT NOT NULL DEFAULT '',
    priority INTEGER NOT NULL DEFAULT 50,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dk_workflow_settings (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL UNIQUE,
    settings_json TEXT NOT NULL DEFAULT '{}',
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dk_run_outputs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    output_key TEXT NOT NULL DEFAULT 'default',
    raw_output TEXT NOT NULL,
    canonical_hash TEXT NOT NULL,
    canonical_text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(workflow_id, run_id, output_key)
);
CREATE INDEX IF NOT EXISTS idx_dk_run_outputs_workflow
    ON dk_run_outputs(workflow_id, output_key);

CREATE TABLE IF NOT EXISTS dk_consistency_scores (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    output_key TEXT NOT NULL DEFAULT 'default',
    run_a_id TEXT NOT NULL,
    run_b_id TEXT NOT NULL,
    hash_a TEXT NOT NULL,
    hash_b TEXT NOT NULL,
    score REAL NOT NULL,
    method TEXT NOT NULL DEFAULT 'exact',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dk_scores_workflow
    ON dk_consistency_scores(workflow_id, output_key);
"""

_DK_DB_FILE = "amc_product_determinism.db"


def _dk_db_path(db_path: str | Path | None = None) -> Path:
    if db_path is not None:
        return Path(db_path)
    base = product_db_path()
    return base.parent / _DK_DB_FILE


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class TemplateRecord:
    id: str
    name: str
    description: str
    template_text: str
    variables: list[str]
    workflow_id: str
    active: bool
    created_at: str
    updated_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "template_text": self.template_text,
            "variables": self.variables,
            "workflow_id": self.workflow_id,
            "active": self.active,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    def render(self, context: dict[str, Any]) -> str:
        """Render template with context variables using {var} substitution."""
        text = self.template_text
        for key, value in context.items():
            text = text.replace(f"{{{key}}}", str(value))
        return text


@dataclass
class CanonRule:
    id: str
    name: str
    description: str
    rule_type: str  # regex | strip | lowercase | json_normalize | whitespace
    pattern: str
    replacement: str
    flags: str
    priority: int
    active: bool
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "rule_type": self.rule_type,
            "pattern": self.pattern,
            "replacement": self.replacement,
            "flags": self.flags,
            "priority": self.priority,
            "active": self.active,
            "created_at": self.created_at,
        }


@dataclass
class WorkflowSettings:
    id: str
    workflow_id: str
    settings: dict[str, Any]
    description: str
    created_at: str
    updated_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "workflow_id": self.workflow_id,
            "settings": self.settings,
            "description": self.description,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class RunOutput:
    id: str
    workflow_id: str
    run_id: str
    output_key: str
    raw_output: str
    canonical_hash: str
    canonical_text: str
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "workflow_id": self.workflow_id,
            "run_id": self.run_id,
            "output_key": self.output_key,
            "raw_output": self.raw_output,
            "canonical_hash": self.canonical_hash,
            "canonical_text": self.canonical_text,
            "created_at": self.created_at,
        }


@dataclass
class ConsistencyScore:
    id: str
    workflow_id: str
    output_key: str
    run_a_id: str
    run_b_id: str
    hash_a: str
    hash_b: str
    score: float
    method: str
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "workflow_id": self.workflow_id,
            "output_key": self.output_key,
            "run_a_id": self.run_a_id,
            "run_b_id": self.run_b_id,
            "hash_a": self.hash_a,
            "hash_b": self.hash_b,
            "score": self.score,
            "method": self.method,
            "created_at": self.created_at,
        }


@dataclass
class ConsistencySummary:
    workflow_id: str
    output_key: str
    total_runs: int
    total_comparisons: int
    mean_score: float
    perfect_matches: int
    match_rate: float
    hash_distribution: dict[str, int]

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "workflow_id": self.workflow_id,
            "output_key": self.output_key,
            "total_runs": self.total_runs,
            "total_comparisons": self.total_comparisons,
            "mean_score": self.mean_score,
            "perfect_matches": self.perfect_matches,
            "match_rate": self.match_rate,
            "hash_distribution": self.hash_distribution,
        }


# ---------------------------------------------------------------------------
# Canonicalizer
# ---------------------------------------------------------------------------

def _apply_rule(text: str, rule: CanonRule) -> str:
    """Apply a single canonicalization rule to text."""
    rt = rule.rule_type.lower()
    if rt == "lowercase":
        return text.lower()
    if rt == "strip":
        return text.strip()
    if rt == "whitespace":
        return re.sub(r"\s+", " ", text).strip()
    if rt == "json_normalize":
        try:
            parsed = json.loads(text)
            return json.dumps(parsed, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        except (json.JSONDecodeError, TypeError):
            return text
    if rt == "regex":
        re_flags = 0
        for flag_char in (rule.flags or "").upper():
            if flag_char == "I":
                re_flags |= re.IGNORECASE
            elif flag_char == "M":
                re_flags |= re.MULTILINE
            elif flag_char == "S":
                re_flags |= re.DOTALL
        try:
            return re.sub(rule.pattern, rule.replacement, text, flags=re_flags)
        except re.error:
            return text
    return text


def canonicalize(text: str, rules: list[CanonRule]) -> str:
    """Apply rules in priority order and return canonical form."""
    ordered = sorted(rules, key=lambda r: r.priority)
    for rule in ordered:
        if rule.active:
            text = _apply_rule(text, rule)
    return text


def canonical_hash(text: str) -> str:
    """SHA-256 of canonical text."""
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()


def compute_consistency_score(hash_a: str, hash_b: str, method: str = "exact") -> float:
    """Score two canonical hashes.

    Methods:
    - ``exact``: 1.0 if identical, 0.0 otherwise
    - ``prefix``: fraction of matching leading nibbles
    """
    if method == "exact":
        return 1.0 if hash_a == hash_b else 0.0
    if method == "prefix":
        if not hash_a or not hash_b:
            return 0.0
        matches = sum(a == b for a, b in zip(hash_a, hash_b))
        return round(matches / max(len(hash_a), len(hash_b)), 4)
    return 1.0 if hash_a == hash_b else 0.0


# ---------------------------------------------------------------------------
# DeterminismKit — main service class
# ---------------------------------------------------------------------------

class DeterminismKit:
    """Template registry + canonicalization + consistency scoring service."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = _dk_db_path(db_path)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(_DK_SCHEMA)

    # ------------------------------------------------------------------
    # Template Registry
    # ------------------------------------------------------------------

    def register_template(
        self,
        name: str,
        template_text: str,
        description: str = "",
        variables: list[str] | None = None,
        workflow_id: str = "",
    ) -> TemplateRecord:
        """Create or update a named output template."""
        now = _utc_now()
        variables = variables or self._extract_variables(template_text)
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT id FROM dk_templates WHERE name = ?", (name,)
            ).fetchone()
            if existing:
                rec_id = existing["id"]
                conn.execute(
                    """UPDATE dk_templates
                       SET description=?, template_text=?, variables_json=?,
                           workflow_id=?, updated_at=?
                       WHERE id=?""",
                    (description, template_text, json.dumps(variables), workflow_id, now, rec_id),
                )
            else:
                rec_id = _new_id()
                conn.execute(
                    """INSERT INTO dk_templates
                       (id, name, description, template_text, variables_json,
                        workflow_id, active, created_at, updated_at)
                       VALUES (?,?,?,?,?,?,1,?,?)""",
                    (rec_id, name, description, template_text, json.dumps(variables), workflow_id, now, now),
                )
        return self.get_template(rec_id)  # type: ignore[return-value]

    def _extract_variables(self, template_text: str) -> list[str]:
        """Find {variable} placeholders in a template."""
        return sorted(set(re.findall(r"\{(\w+)\}", template_text)))

    def get_template(self, template_id: str) -> TemplateRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM dk_templates WHERE id=?", (template_id,)
            ).fetchone()
        return self._row_to_template(row) if row else None

    def get_template_by_name(self, name: str) -> TemplateRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM dk_templates WHERE name=?", (name,)
            ).fetchone()
        return self._row_to_template(row) if row else None

    def list_templates(
        self,
        workflow_id: str | None = None,
        active_only: bool = True,
    ) -> list[TemplateRecord]:
        clauses: list[str] = []
        params: list[Any] = []
        if active_only:
            clauses.append("active=1")
        if workflow_id is not None:
            clauses.append("workflow_id=?")
            params.append(workflow_id)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT * FROM dk_templates {where} ORDER BY name", params
            ).fetchall()
        return [self._row_to_template(r) for r in rows]

    def delete_template(self, template_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE dk_templates SET active=0 WHERE id=?", (template_id,)
            )
        return cur.rowcount > 0

    def render_template(self, template_id: str, context: dict[str, Any]) -> str:
        """Render a template with context variables."""
        rec = self.get_template(template_id)
        if rec is None:
            raise KeyError(f"Template '{template_id}' not found")
        return rec.render(context)

    def _row_to_template(self, row: sqlite3.Row) -> TemplateRecord:
        return TemplateRecord(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            template_text=row["template_text"],
            variables=json.loads(row["variables_json"]),
            workflow_id=row["workflow_id"],
            active=bool(row["active"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    # ------------------------------------------------------------------
    # Canonicalization Rules
    # ------------------------------------------------------------------

    def register_canon_rule(
        self,
        name: str,
        rule_type: str,
        pattern: str = "",
        replacement: str = "",
        flags: str = "",
        priority: int = 50,
        description: str = "",
    ) -> CanonRule:
        """Create or update a canonicalization rule."""
        valid_types = {"lowercase", "strip", "whitespace", "json_normalize", "regex"}
        if rule_type not in valid_types:
            raise ValueError(f"rule_type must be one of {valid_types}")
        now = _utc_now()
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT id FROM dk_canon_rules WHERE name=?", (name,)
            ).fetchone()
            if existing:
                rec_id = existing["id"]
                conn.execute(
                    """UPDATE dk_canon_rules
                       SET description=?, rule_type=?, pattern=?, replacement=?,
                           flags=?, priority=?, active=1
                       WHERE id=?""",
                    (description, rule_type, pattern, replacement, flags, priority, rec_id),
                )
            else:
                rec_id = _new_id()
                conn.execute(
                    """INSERT INTO dk_canon_rules
                       (id, name, description, rule_type, pattern, replacement,
                        flags, priority, active, created_at)
                       VALUES (?,?,?,?,?,?,?,?,1,?)""",
                    (rec_id, name, description, rule_type, pattern, replacement, flags, priority, now),
                )
        return self.get_canon_rule(rec_id)  # type: ignore[return-value]

    def get_canon_rule(self, rule_id: str) -> CanonRule | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM dk_canon_rules WHERE id=?", (rule_id,)
            ).fetchone()
        return self._row_to_rule(row) if row else None

    def list_canon_rules(self, active_only: bool = True) -> list[CanonRule]:
        where = "WHERE active=1" if active_only else ""
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT * FROM dk_canon_rules {where} ORDER BY priority, name"
            ).fetchall()
        return [self._row_to_rule(r) for r in rows]

    def delete_canon_rule(self, rule_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE dk_canon_rules SET active=0 WHERE id=?", (rule_id,)
            )
        return cur.rowcount > 0

    def canonicalize_text(self, text: str) -> tuple[str, str]:
        """Apply all active rules and return (canonical_text, hash)."""
        rules = self.list_canon_rules(active_only=True)
        canon_text = canonicalize(text, rules)
        c_hash = canonical_hash(canon_text)
        return canon_text, c_hash

    def _row_to_rule(self, row: sqlite3.Row) -> CanonRule:
        return CanonRule(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            rule_type=row["rule_type"],
            pattern=row["pattern"],
            replacement=row["replacement"],
            flags=row["flags"],
            priority=row["priority"],
            active=bool(row["active"]),
            created_at=row["created_at"],
        )

    # ------------------------------------------------------------------
    # Workflow Settings
    # ------------------------------------------------------------------

    def set_workflow_settings(
        self,
        workflow_id: str,
        settings: dict[str, Any],
        description: str = "",
    ) -> WorkflowSettings:
        """Store fixed LLM/tool settings for a workflow."""
        now = _utc_now()
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT id FROM dk_workflow_settings WHERE workflow_id=?", (workflow_id,)
            ).fetchone()
            if existing:
                rec_id = existing["id"]
                conn.execute(
                    """UPDATE dk_workflow_settings
                       SET settings_json=?, description=?, updated_at=?
                       WHERE id=?""",
                    (json.dumps(settings), description, now, rec_id),
                )
            else:
                rec_id = _new_id()
                conn.execute(
                    """INSERT INTO dk_workflow_settings
                       (id, workflow_id, settings_json, description, created_at, updated_at)
                       VALUES (?,?,?,?,?,?)""",
                    (rec_id, workflow_id, json.dumps(settings), description, now, now),
                )
        return self.get_workflow_settings(workflow_id)  # type: ignore[return-value]

    def get_workflow_settings(self, workflow_id: str) -> WorkflowSettings | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM dk_workflow_settings WHERE workflow_id=?", (workflow_id,)
            ).fetchone()
        if not row:
            return None
        return WorkflowSettings(
            id=row["id"],
            workflow_id=row["workflow_id"],
            settings=json.loads(row["settings_json"]),
            description=row["description"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def list_workflow_settings(self) -> list[WorkflowSettings]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM dk_workflow_settings ORDER BY workflow_id"
            ).fetchall()
        return [
            WorkflowSettings(
                id=r["id"],
                workflow_id=r["workflow_id"],
                settings=json.loads(r["settings_json"]),
                description=r["description"],
                created_at=r["created_at"],
                updated_at=r["updated_at"],
            )
            for r in rows
        ]

    def delete_workflow_settings(self, workflow_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM dk_workflow_settings WHERE workflow_id=?", (workflow_id,)
            )
        return cur.rowcount > 0

    # ------------------------------------------------------------------
    # Run-to-run Consistency Scoring
    # ------------------------------------------------------------------

    def record_run_output(
        self,
        workflow_id: str,
        run_id: str,
        raw_output: str,
        output_key: str = "default",
    ) -> RunOutput:
        """Store a run output with its canonical hash."""
        canon_text, c_hash = self.canonicalize_text(raw_output)
        now = _utc_now()
        rec_id = _new_id()
        with self._connect() as conn:
            try:
                conn.execute(
                    """INSERT INTO dk_run_outputs
                       (id, workflow_id, run_id, output_key, raw_output,
                        canonical_hash, canonical_text, created_at)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (rec_id, workflow_id, run_id, output_key, raw_output, c_hash, canon_text, now),
                )
            except sqlite3.IntegrityError:
                # Already recorded; fetch existing
                row = conn.execute(
                    """SELECT * FROM dk_run_outputs
                       WHERE workflow_id=? AND run_id=? AND output_key=?""",
                    (workflow_id, run_id, output_key),
                ).fetchone()
                return RunOutput(
                    id=row["id"],
                    workflow_id=row["workflow_id"],
                    run_id=row["run_id"],
                    output_key=row["output_key"],
                    raw_output=row["raw_output"],
                    canonical_hash=row["canonical_hash"],
                    canonical_text=row["canonical_text"],
                    created_at=row["created_at"],
                )
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM dk_run_outputs WHERE id=?", (rec_id,)
            ).fetchone()
        return RunOutput(
            id=row["id"],
            workflow_id=row["workflow_id"],
            run_id=row["run_id"],
            output_key=row["output_key"],
            raw_output=row["raw_output"],
            canonical_hash=row["canonical_hash"],
            canonical_text=row["canonical_text"],
            created_at=row["created_at"],
        )

    def compare_runs(
        self,
        workflow_id: str,
        run_a_id: str,
        run_b_id: str,
        output_key: str = "default",
        method: str = "exact",
    ) -> ConsistencyScore:
        """Compare two run outputs and store + return the consistency score."""
        with self._connect() as conn:
            row_a = conn.execute(
                """SELECT * FROM dk_run_outputs
                   WHERE workflow_id=? AND run_id=? AND output_key=?""",
                (workflow_id, run_a_id, output_key),
            ).fetchone()
            row_b = conn.execute(
                """SELECT * FROM dk_run_outputs
                   WHERE workflow_id=? AND run_id=? AND output_key=?""",
                (workflow_id, run_b_id, output_key),
            ).fetchone()

        if row_a is None:
            raise KeyError(f"No output recorded for run '{run_a_id}'")
        if row_b is None:
            raise KeyError(f"No output recorded for run '{run_b_id}'")

        hash_a = row_a["canonical_hash"]
        hash_b = row_b["canonical_hash"]
        score = compute_consistency_score(hash_a, hash_b, method=method)
        now = _utc_now()
        rec_id = _new_id()
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO dk_consistency_scores
                   (id, workflow_id, output_key, run_a_id, run_b_id, hash_a, hash_b, score, method, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (rec_id, workflow_id, output_key, run_a_id, run_b_id, hash_a, hash_b, score, method, now),
            )
        return ConsistencyScore(
            id=rec_id,
            workflow_id=workflow_id,
            output_key=output_key,
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            hash_a=hash_a,
            hash_b=hash_b,
            score=score,
            method=method,
            created_at=now,
        )

    def consistency_summary(
        self,
        workflow_id: str,
        output_key: str = "default",
    ) -> ConsistencySummary:
        """Aggregate consistency stats for a workflow+output_key."""
        with self._connect() as conn:
            scores_rows = conn.execute(
                """SELECT score, hash_a, hash_b FROM dk_consistency_scores
                   WHERE workflow_id=? AND output_key=?""",
                (workflow_id, output_key),
            ).fetchall()
            run_rows = conn.execute(
                """SELECT canonical_hash FROM dk_run_outputs
                   WHERE workflow_id=? AND output_key=?""",
                (workflow_id, output_key),
            ).fetchall()

        total_runs = len(run_rows)
        total_comparisons = len(scores_rows)
        scores = [r["score"] for r in scores_rows]
        mean_score = round(sum(scores) / len(scores), 4) if scores else 0.0
        perfect = sum(1 for s in scores if s >= 1.0)
        match_rate = round(perfect / total_comparisons, 4) if total_comparisons else 0.0

        hash_dist: dict[str, int] = {}
        for r in run_rows:
            h = r["canonical_hash"][:8]
            hash_dist[h] = hash_dist.get(h, 0) + 1

        return ConsistencySummary(
            workflow_id=workflow_id,
            output_key=output_key,
            total_runs=total_runs,
            total_comparisons=total_comparisons,
            mean_score=mean_score,
            perfect_matches=perfect,
            match_rate=match_rate,
            hash_distribution=hash_dist,
        )

    def list_run_outputs(
        self,
        workflow_id: str,
        output_key: str | None = None,
        limit: int = 100,
    ) -> list[RunOutput]:
        clauses = ["workflow_id=?"]
        params: list[Any] = [workflow_id]
        if output_key is not None:
            clauses.append("output_key=?")
            params.append(output_key)
        params.append(limit)
        where = " AND ".join(clauses)
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT * FROM dk_run_outputs WHERE {where} ORDER BY created_at DESC LIMIT ?",
                params,
            ).fetchall()
        return [
            RunOutput(
                id=r["id"],
                workflow_id=r["workflow_id"],
                run_id=r["run_id"],
                output_key=r["output_key"],
                raw_output=r["raw_output"],
                canonical_hash=r["canonical_hash"],
                canonical_text=r["canonical_text"],
                created_at=r["created_at"],
            )
            for r in rows
        ]


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_KIT: DeterminismKit | None = None


def get_determinism_kit(db_path: str | Path | None = None) -> DeterminismKit:
    global _KIT
    if _KIT is None or db_path is not None:
        _KIT = DeterminismKit(db_path=db_path)
    return _KIT


__all__ = [
    "DeterminismKit",
    "TemplateRecord",
    "CanonRule",
    "WorkflowSettings",
    "RunOutput",
    "ConsistencyScore",
    "ConsistencySummary",
    "canonicalize",
    "canonical_hash",
    "compute_consistency_score",
    "get_determinism_kit",
]
