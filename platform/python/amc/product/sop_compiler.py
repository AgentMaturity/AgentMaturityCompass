"""SOP → Workflow compiler.

Parses SOP documents (markdown / plain-text / HTML) into structured
``CompiledWorkflow`` objects whose steps are persisted in SQLite for
auditing and retrieval.

Usage::

    from amc.product.sop_compiler import get_sop_compiler, SOPCompileRequest

    compiler = get_sop_compiler()
    result = compiler.compile(SOPCompileRequest(content=my_markdown, format="markdown"))
    print(result.workflow.steps)
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.product.persistence import product_db_path

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class SOPStep(BaseModel):
    step_id: str
    step_number: int
    name: str
    description: str
    inputs: list[str]
    outputs: list[str]
    tools: list[str]
    validation_rules: list[str]
    preconditions: list[str]
    postconditions: list[str]
    estimated_duration_minutes: int
    role_responsible: str
    metadata: dict[str, Any]


class CompiledWorkflow(BaseModel):
    workflow_id: str
    title: str
    source_format: str  # "markdown" | "text" | "html"
    steps: list[SOPStep]
    total_steps: int
    estimated_total_minutes: int
    validation_summary: list[str]
    compiled_at: str
    raw_doc_hash: str
    metadata: dict[str, Any]


class SOPCompileRequest(BaseModel):
    content: str
    format: str = "markdown"  # markdown | text | html
    title: str = ""
    extract_tools: bool = True
    extract_validation: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class SOPCompileResult(BaseModel):
    workflow: CompiledWorkflow
    warnings: list[str]
    parse_errors: list[str]
    duration_ms: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_TOOL_TRIGGER_RE = re.compile(
    r"\b(?:use|using|via|with)\s+([A-Z][A-Za-z0-9_]*|[a-z][a-z0-9_]*(?:_[a-z0-9_]+)+)",
    re.IGNORECASE,
)
_VALIDATION_RE = re.compile(
    r"\b(?:verify|check|validate|ensure|confirm)\b", re.IGNORECASE
)
_INPUT_RE = re.compile(
    r"(?:^|\n)\s*(?:input|requires?):\s*(.+)", re.IGNORECASE
)
_OUTPUT_RE = re.compile(
    r"(?:^|\n)\s*(?:output|produces?):\s*(.+)", re.IGNORECASE
)
_PRECOND_RE = re.compile(
    r"(?:^|\n)\s*(?:precondition|before|pre-?req(?:uisite)?):\s*(.+)", re.IGNORECASE
)
_POSTCOND_RE = re.compile(
    r"(?:^|\n)\s*(?:postcondition|after|result):\s*(.+)", re.IGNORECASE
)
_ROLE_RE = re.compile(
    r"(?:^|\n)\s*(?:responsible|owner|role|assigned[- ]?to):\s*(.+)", re.IGNORECASE
)
_DURATION_RE = re.compile(
    r"(\d+)\s*(?:min(?:utes?)?|hrs?|hours?)", re.IGNORECASE
)

_NUMBERED_LINE_RE = re.compile(r"^\s*(\d+)[.)]\s+(.+)")
_BOLD_LINE_RE = re.compile(r"^\*\*(.+?)\*\*")
_H2_RE = re.compile(r"^##\s+(.+)")
_H3_RE = re.compile(r"^###\s+(.+)")


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _extract_tools(text: str) -> list[str]:
    """Return unique tool names found near trigger words."""
    found: list[str] = []
    for m in _TOOL_TRIGGER_RE.finditer(text):
        tool = m.group(1).strip()
        if tool and tool not in found:
            found.append(tool)
    return found


def _extract_validation(lines: list[str]) -> list[str]:
    return [ln.strip() for ln in lines if _VALIDATION_RE.search(ln)]


def _extract_pattern(text: str, pattern: re.Pattern) -> list[str]:
    return [m.group(1).strip() for m in pattern.finditer(text) if m.group(1).strip()]


def _estimate_duration(text: str) -> int:
    """Sum all duration mentions; return minutes (hours converted)."""
    total = 0
    for m in _DURATION_RE.finditer(text):
        val = int(m.group(1))
        unit = m.group(0).replace(str(val), "").strip().lower()
        if unit.startswith("h"):
            val *= 60
        total += val
    return total or 5  # default 5 min if nothing found


def _build_step(
    step_number: int,
    name: str,
    description: str,
    block_text: str,
    extract_tools: bool,
    extract_validation: bool,
) -> SOPStep:
    all_text = f"{name}\n{description}\n{block_text}"
    return SOPStep(
        step_id=str(uuid.uuid4()),
        step_number=step_number,
        name=name.strip(),
        description=description.strip(),
        inputs=_extract_pattern(all_text, _INPUT_RE),
        outputs=_extract_pattern(all_text, _OUTPUT_RE),
        tools=_extract_tools(all_text) if extract_tools else [],
        validation_rules=_extract_validation(all_text.splitlines()) if extract_validation else [],
        preconditions=_extract_pattern(all_text, _PRECOND_RE),
        postconditions=_extract_pattern(all_text, _POSTCOND_RE),
        estimated_duration_minutes=_estimate_duration(all_text),
        role_responsible=next(iter(_extract_pattern(all_text, _ROLE_RE)), "Unassigned"),
        metadata={},
    )


# ---------------------------------------------------------------------------
# Core compiler class
# ---------------------------------------------------------------------------

_DB_INIT_SQL = """
CREATE TABLE IF NOT EXISTS sop_workflows (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id   TEXT NOT NULL,
    title         TEXT NOT NULL,
    steps_json    TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    compiled_at   TEXT NOT NULL,
    doc_hash      TEXT NOT NULL,
    source_format TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sop_wf_id ON sop_workflows (workflow_id);
CREATE INDEX IF NOT EXISTS idx_sop_compiled ON sop_workflows (compiled_at);
"""


class SOPCompiler:
    """Parse SOP documents into structured ``CompiledWorkflow`` objects."""

    def __init__(self, db_path: Path | None = None) -> None:
        self._db_path = db_path or product_db_path()
        self._conn: sqlite3.Connection = sqlite3.connect(
            str(self._db_path), check_same_thread=False
        )
        self._conn.row_factory = sqlite3.Row
        self._init_db()
        logger.info("sop_compiler.init", db_path=str(self._db_path))

    # ------------------------------------------------------------------
    # DB bootstrap
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        with self._conn:
            self._conn.executescript(_DB_INIT_SQL)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def compile(self, request: SOPCompileRequest) -> SOPCompileResult:
        """Main entry-point: parse content and persist result."""
        t0 = time.monotonic()
        warnings: list[str] = []
        parse_errors: list[str] = []

        doc_hash = _sha256(request.content)
        fmt = request.format.lower()

        try:
            if fmt == "markdown":
                title, steps, w, e = self._parse_markdown(
                    request.content, request.title
                )
            elif fmt in ("text", "plain"):
                title, steps, w, e = self._parse_text(
                    request.content, request.title
                )
            elif fmt == "html":
                # Strip tags then treat as text
                clean = re.sub(r"<[^>]+>", " ", request.content)
                clean = re.sub(r"\s+", " ", clean)
                title, steps, w, e = self._parse_text(clean, request.title)
                w.append("HTML was stripped to plain text before parsing")
            else:
                parse_errors.append(f"Unknown format '{request.format}'; falling back to text")
                title, steps, w, e = self._parse_text(
                    request.content, request.title
                )

            warnings.extend(w)
            parse_errors.extend(e)

            if not steps:
                warnings.append("No structured steps detected; document may need manual review")
        except Exception as exc:  # noqa: BLE001
            logger.exception("sop_compiler.parse_failed", error=str(exc))
            parse_errors.append(f"Parse exception: {exc}")
            steps = []
            title = request.title or "Unknown"

        # Override title if request has explicit one
        if request.title:
            title = request.title

        validation_summary = list(
            {rule for step in steps for rule in step.validation_rules}
        )

        workflow = CompiledWorkflow(
            workflow_id=str(uuid.uuid4()),
            title=title or "Untitled SOP",
            source_format=fmt,
            steps=steps,
            total_steps=len(steps),
            estimated_total_minutes=sum(s.estimated_duration_minutes for s in steps),
            validation_summary=validation_summary,
            compiled_at=datetime.now(timezone.utc).isoformat(),
            raw_doc_hash=doc_hash,
            metadata=request.metadata,
        )

        self._persist(workflow)
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.info(
            "sop_compiler.compiled",
            workflow_id=workflow.workflow_id,
            steps=len(steps),
            duration_ms=duration_ms,
        )
        return SOPCompileResult(
            workflow=workflow,
            warnings=warnings,
            parse_errors=parse_errors,
            duration_ms=duration_ms,
        )

    # ------------------------------------------------------------------
    # Parsers
    # ------------------------------------------------------------------

    def _parse_markdown(
        self, content: str, title: str
    ) -> tuple[str, list[SOPStep], list[str], list[str]]:
        """Parse markdown into steps.

        A step boundary is detected when we see:
        - A ``##`` or ``###`` heading
        - A line matching ``1.`` / ``1)`` numbered-list pattern
        - A line that is entirely ``**bold**``
        """
        warnings: list[str] = []
        errors: list[str] = []
        steps: list[SOPStep] = []
        doc_title = title

        lines = content.splitlines()

        # Extract top-level title from first H1
        if not doc_title:
            for ln in lines:
                if ln.startswith("# ") and not ln.startswith("## "):
                    doc_title = ln.lstrip("# ").strip()
                    break

        # Collect step blocks: list of (name, [lines])
        blocks: list[tuple[str, list[str]]] = []
        current_name: str | None = None
        current_lines: list[str] = []

        def flush():
            if current_name is not None:
                blocks.append((current_name, list(current_lines)))

        step_counter = 0
        for ln in lines:
            h2 = _H2_RE.match(ln)
            h3 = _H3_RE.match(ln)
            num = _NUMBERED_LINE_RE.match(ln)
            bold = _BOLD_LINE_RE.match(ln)

            if h2:
                flush()
                current_name = h2.group(1).strip()
                current_lines = []
            elif h3:
                flush()
                current_name = h3.group(1).strip()
                current_lines = []
            elif num:
                flush()
                step_counter = int(num.group(1))
                current_name = num.group(2).strip()
                current_lines = []
            elif bold and current_name is None:
                flush()
                current_name = bold.group(1).strip()
                current_lines = []
            else:
                if current_name is not None:
                    current_lines.append(ln)

        flush()

        if not blocks:
            warnings.append("No recognisable step boundaries found in markdown")

        for idx, (name, blk_lines) in enumerate(blocks, start=1):
            description = " ".join(
                ln.strip() for ln in blk_lines if ln.strip() and not ln.startswith("#")
            )
            block_text = "\n".join(blk_lines)
            step = _build_step(
                step_number=idx,
                name=name,
                description=description[:500],
                block_text=block_text,
                extract_tools=True,
                extract_validation=True,
            )
            steps.append(step)

        return doc_title or "Untitled SOP", steps, warnings, errors

    def _parse_text(
        self, content: str, title: str
    ) -> tuple[str, list[SOPStep], list[str], list[str]]:
        """Parse plain text into steps.

        Steps are bounded by numbered lines (``1.`` / ``1)``).
        If no numbered lines exist, each non-empty paragraph becomes a step.
        """
        warnings: list[str] = []
        errors: list[str] = []
        steps: list[SOPStep] = []
        doc_title = title

        lines = content.splitlines()

        # Try to infer title from first non-empty line if not set
        if not doc_title:
            for ln in lines:
                if ln.strip():
                    doc_title = ln.strip()
                    break

        # Collect numbered blocks
        blocks: list[tuple[int, str, list[str]]] = []
        current_num: int | None = None
        current_name: str | None = None
        current_lines: list[str] = []

        def flush_text():
            if current_num is not None and current_name is not None:
                blocks.append((current_num, current_name, list(current_lines)))

        for ln in lines:
            m = _NUMBERED_LINE_RE.match(ln)
            if m:
                flush_text()
                current_num = int(m.group(1))
                current_name = m.group(2).strip()
                current_lines = []
            else:
                if current_num is not None:
                    current_lines.append(ln)

        flush_text()

        if not blocks:
            # Fall back: each paragraph (blank-line separated) is a step
            warnings.append("No numbered steps found; splitting on blank lines")
            paragraphs = re.split(r"\n\s*\n", content.strip())
            for idx, para in enumerate(paragraphs, start=1):
                para = para.strip()
                if not para:
                    continue
                first_line = para.splitlines()[0].strip()
                step = _build_step(
                    step_number=idx,
                    name=first_line[:80],
                    description=para[:500],
                    block_text=para,
                    extract_tools=True,
                    extract_validation=True,
                )
                steps.append(step)
        else:
            for num, name, blk_lines in blocks:
                description = " ".join(ln.strip() for ln in blk_lines if ln.strip())
                block_text = "\n".join(blk_lines)
                step = _build_step(
                    step_number=num,
                    name=name,
                    description=description[:500],
                    block_text=block_text,
                    extract_tools=True,
                    extract_validation=True,
                )
                steps.append(step)

        return doc_title or "Untitled SOP", steps, warnings, errors

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _persist(self, workflow: CompiledWorkflow) -> None:
        sql = """
            INSERT INTO sop_workflows
                (workflow_id, title, steps_json, metadata_json, compiled_at, doc_hash, source_format)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        try:
            with self._conn:
                self._conn.execute(
                    sql,
                    (
                        workflow.workflow_id,
                        workflow.title,
                        json.dumps([s.model_dump() for s in workflow.steps]),
                        json.dumps(workflow.metadata),
                        workflow.compiled_at,
                        workflow.raw_doc_hash,
                        workflow.source_format,
                    ),
                )
        except Exception as exc:  # noqa: BLE001
            logger.error("sop_compiler.persist_failed", error=str(exc))

    def get_history(self, limit: int = 20) -> list[dict]:
        """Return the most recently compiled workflows from SQLite."""
        sql = """
            SELECT id, workflow_id, title, steps_json, metadata_json,
                   compiled_at, doc_hash, source_format
            FROM sop_workflows
            ORDER BY compiled_at DESC
            LIMIT ?
        """
        try:
            cur = self._conn.execute(sql, (limit,))
            rows = cur.fetchall()
            result = []
            for row in rows:
                d = dict(row)
                d["steps"] = json.loads(d.pop("steps_json", "[]"))
                d["metadata"] = json.loads(d.pop("metadata_json", "{}"))
                result.append(d)
            return result
        except Exception as exc:  # noqa: BLE001
            logger.error("sop_compiler.history_failed", error=str(exc))
            return []


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_instance: SOPCompiler | None = None


def get_sop_compiler() -> SOPCompiler:
    """Return the module-level singleton ``SOPCompiler``."""
    global _instance  # noqa: PLW0603
    if _instance is None:
        _instance = SOPCompiler()
    return _instance


# ---------------------------------------------------------------------------
# Public API surface
# ---------------------------------------------------------------------------

__all__ = [
    "SOPStep",
    "CompiledWorkflow",
    "SOPCompileRequest",
    "SOPCompileResult",
    "SOPCompiler",
    "get_sop_compiler",
]
