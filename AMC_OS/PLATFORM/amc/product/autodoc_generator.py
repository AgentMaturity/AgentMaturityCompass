"""AMC Product — Auto Documentation Generator (Module 3).

Generate README / examples / limitations documents from workflow step definitions
and test definitions. Supports Markdown, HTML, and reStructuredText output formats.

Workflow:
1. Caller assembles a ``DocGenerateRequest`` describing the workflow, its steps,
   test definitions, known limitations, and output format preferences.
2. ``AutoDocGenerator.generate()`` dispatches to the matching renderer, stores the
   result in SQLite, and returns a ``DocGenerateResult`` with the full rendered text.

SQLite table: ``generated_docs``

API mount point: /api/v1/product/autodoc
"""
from __future__ import annotations

import json
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from threading import Lock
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS generated_docs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id          TEXT NOT NULL UNIQUE,
    workflow_name   TEXT NOT NULL,
    format          TEXT NOT NULL DEFAULT 'markdown',
    content         TEXT NOT NULL DEFAULT '',
    word_count      INTEGER NOT NULL DEFAULT 0,
    sections_json   TEXT NOT NULL DEFAULT '[]',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    generated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_generated_docs_workflow ON generated_docs(workflow_name);
CREATE INDEX IF NOT EXISTS idx_generated_docs_format   ON generated_docs(format);
CREATE INDEX IF NOT EXISTS idx_generated_docs_ts       ON generated_docs(generated_at);
"""

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------


class WorkflowStep(BaseModel):
    """One logical step inside a workflow."""

    name: str
    description: str
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)


class TestDefinition(BaseModel):
    """Describes one test case associated with a workflow."""

    name: str
    description: str
    inputs: dict[str, Any] = Field(default_factory=dict)
    expected_outputs: dict[str, Any] = Field(default_factory=dict)
    test_type: str = "unit"  # unit | integration | e2e


class DocGenerateRequest(BaseModel):
    """Full specification for generating a workflow documentation artifact."""

    workflow_name: str
    workflow_description: str
    steps: list[WorkflowStep] = Field(default_factory=list)
    tests: list[TestDefinition] = Field(default_factory=list)
    version: str = "1.0.0"
    author: str = ""
    tags: list[str] = Field(default_factory=list)
    known_limitations: list[str] = Field(default_factory=list)
    include_examples: bool = True
    include_limitations: bool = True
    include_changelog: bool = False
    output_format: str = "markdown"  # markdown | html | rst
    metadata: dict[str, Any] = Field(default_factory=dict)


class GeneratedDoc(BaseModel):
    """The rendered documentation artifact returned to the caller."""

    doc_id: str
    workflow_name: str
    content: str  # the actual rendered doc text
    format: str
    sections: list[str]  # list of section names included
    word_count: int
    generated_at: str
    metadata: dict[str, Any]


class DocGenerateResult(BaseModel):
    """Top-level result wrapper returned by ``AutoDocGenerator.generate()``."""

    doc: GeneratedDoc
    warnings: list[str]
    duration_ms: int


# ---------------------------------------------------------------------------
# Core Class
# ---------------------------------------------------------------------------


class AutoDocGenerator:
    """Generate, persist, and retrieve workflow documentation artifacts."""

    def __init__(self, db_path: str | None = None) -> None:
        resolved = str(product_db_path(db_path))
        self._conn = sqlite3.connect(resolved, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = Lock()
        self._init_schema()
        log.info("autodoc_generator.ready", db_path=resolved)

    # ------------------------------------------------------------------
    # Schema init
    # ------------------------------------------------------------------

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate(self, request: DocGenerateRequest) -> DocGenerateResult:
        """Generate documentation for *request* and persist the result."""
        t0 = time.monotonic()
        warnings: list[str] = []

        fmt = request.output_format.lower()
        if fmt == "markdown":
            content, sections = self._render_markdown(request)
        elif fmt == "html":
            content, sections = self._render_html(request)
        elif fmt == "rst":
            content, sections = self._render_rst(request)
        else:
            warnings.append(f"Unknown output_format '{fmt}'; falling back to markdown.")
            fmt = "markdown"
            content, sections = self._render_markdown(request)

        if not request.steps:
            warnings.append("No workflow steps provided; steps table will be empty.")
        if not request.tests and request.include_examples:
            warnings.append("include_examples=True but no test definitions provided.")

        word_count = len(content.split())
        doc_id = str(uuid.uuid4())
        generated_at = datetime.now(timezone.utc).isoformat()
        metadata = dict(request.metadata)
        metadata.setdefault("version", request.version)
        metadata.setdefault("author", request.author)
        metadata.setdefault("tags", request.tags)

        doc = GeneratedDoc(
            doc_id=doc_id,
            workflow_name=request.workflow_name,
            content=content,
            format=fmt,
            sections=sections,
            word_count=word_count,
            generated_at=generated_at,
            metadata=metadata,
        )

        self._persist_doc(doc)
        duration_ms = int((time.monotonic() - t0) * 1000)
        log.info(
            "autodoc_generator.generated",
            doc_id=doc_id,
            workflow=request.workflow_name,
            fmt=fmt,
            word_count=word_count,
            duration_ms=duration_ms,
        )
        return DocGenerateResult(doc=doc, warnings=warnings, duration_ms=duration_ms)

    # ------------------------------------------------------------------
    # Renderers
    # ------------------------------------------------------------------

    def _render_markdown(self, request: DocGenerateRequest) -> tuple[str, list[str]]:
        """Render a full README.md-style document in Markdown."""
        sections: list[str] = []
        lines: list[str] = []

        # Title + description
        sections.append("Overview")
        lines.append(f"# {request.workflow_name}")
        lines.append("")
        if request.author:
            lines.append(f"> **Author:** {request.author} | **Version:** {request.version}")
        else:
            lines.append(f"> **Version:** {request.version}")
        if request.tags:
            lines.append(f"> **Tags:** {', '.join(request.tags)}")
        lines.append("")
        lines.append(request.workflow_description)
        lines.append("")

        # Quick-start
        sections.append("Quick Start")
        lines.append("## Quick Start")
        lines.append("")
        lines.append("```python")
        safe_name = request.workflow_name.lower().replace(" ", "_")
        lines.append(f"from amc.workflows import {safe_name}")
        lines.append("")
        lines.append(f"result = {safe_name}.run(inputs={{}})")
        lines.append("print(result)")
        lines.append("```")
        lines.append("")

        # Steps table
        sections.append("Workflow Steps")
        lines.append("## Workflow Steps")
        lines.append("")
        if request.steps:
            lines.append("| Step | Description | Inputs | Outputs | Tools |")
            lines.append("|------|-------------|--------|---------|-------|")
            for step in request.steps:
                inputs_str = ", ".join(step.inputs) if step.inputs else "—"
                outputs_str = ", ".join(step.outputs) if step.outputs else "—"
                tools_str = ", ".join(step.tools) if step.tools else "—"
                desc = step.description.replace("|", "\\|")
                lines.append(
                    f"| **{step.name}** | {desc} | {inputs_str} | {outputs_str} | {tools_str} |"
                )
        else:
            lines.append("*No steps defined.*")
        lines.append("")

        # Examples section
        if request.include_examples:
            sections.append("Examples")
            lines.append("## Examples")
            lines.append("")
            if request.tests:
                for test in request.tests:
                    lines.append(f"### {test.name} (`{test.test_type}`)")
                    lines.append("")
                    lines.append(test.description)
                    lines.append("")
                    lines.append("```python")
                    lines.append(f"# {test.name}")
                    lines.append(f"inputs = {json.dumps(test.inputs, indent=4)}")
                    lines.append(f"expected = {json.dumps(test.expected_outputs, indent=4)}")
                    lines.append(f"result = {safe_name}.run(inputs=inputs)")
                    lines.append("assert result == expected")
                    lines.append("```")
                    lines.append("")
            else:
                lines.append("*No test definitions provided.*")
                lines.append("")

        # Limitations section
        if request.include_limitations:
            sections.append("Limitations")
            lines.append("## Limitations")
            lines.append("")
            if request.known_limitations:
                for limitation in request.known_limitations:
                    lines.append(f"- {limitation}")
            else:
                lines.append("*No known limitations documented.*")
            lines.append("")

            # Known issues (sub-section of limitations)
            sections.append("Known Issues")
            lines.append("### Known Issues")
            lines.append("")
            lines.append("Please file issues at the AMC platform tracker.")
            lines.append("")

        # Changelog placeholder
        if request.include_changelog:
            sections.append("Changelog")
            lines.append("## Changelog")
            lines.append("")
            lines.append(f"### {request.version}")
            lines.append("")
            lines.append("- Initial release.")
            lines.append("")

        content = "\n".join(lines)
        return content, sections

    def _render_html(self, request: DocGenerateRequest) -> tuple[str, list[str]]:
        """Render the same structure as HTML."""
        sections: list[str] = []
        parts: list[str] = []

        safe_name = request.workflow_name.lower().replace(" ", "_")

        parts.append("<!DOCTYPE html>")
        parts.append("<html lang='en'>")
        parts.append("<head>")
        parts.append(f"  <meta charset='UTF-8'>")
        parts.append(f"  <title>{_esc(request.workflow_name)}</title>")
        parts.append("</head>")
        parts.append("<body>")

        # Overview
        sections.append("Overview")
        parts.append(f"<h1>{_esc(request.workflow_name)}</h1>")
        meta_parts: list[str] = [f"Version: {_esc(request.version)}"]
        if request.author:
            meta_parts.insert(0, f"Author: {_esc(request.author)}")
        if request.tags:
            meta_parts.append(f"Tags: {_esc(', '.join(request.tags))}")
        parts.append(f"<p><em>{' | '.join(meta_parts)}</em></p>")
        parts.append(f"<p>{_esc(request.workflow_description)}</p>")

        # Quick-start
        sections.append("Quick Start")
        parts.append("<h2>Quick Start</h2>")
        quick_code = (
            f"from amc.workflows import {safe_name}\n\n"
            f"result = {safe_name}.run(inputs={{}})\n"
            f"print(result)"
        )
        parts.append(f"<pre><code>{_esc(quick_code)}</code></pre>")

        # Steps table
        sections.append("Workflow Steps")
        parts.append("<h2>Workflow Steps</h2>")
        if request.steps:
            parts.append("<table border='1' cellpadding='6' cellspacing='0'>")
            parts.append(
                "<thead><tr>"
                "<th>Step</th><th>Description</th><th>Inputs</th><th>Outputs</th><th>Tools</th>"
                "</tr></thead>"
            )
            parts.append("<tbody>")
            for step in request.steps:
                inputs_str = ", ".join(step.inputs) if step.inputs else "—"
                outputs_str = ", ".join(step.outputs) if step.outputs else "—"
                tools_str = ", ".join(step.tools) if step.tools else "—"
                parts.append(
                    f"<tr><td><strong>{_esc(step.name)}</strong></td>"
                    f"<td>{_esc(step.description)}</td>"
                    f"<td>{_esc(inputs_str)}</td>"
                    f"<td>{_esc(outputs_str)}</td>"
                    f"<td>{_esc(tools_str)}</td></tr>"
                )
            parts.append("</tbody></table>")
        else:
            parts.append("<p><em>No steps defined.</em></p>")

        # Examples
        if request.include_examples:
            sections.append("Examples")
            parts.append("<h2>Examples</h2>")
            if request.tests:
                for test in request.tests:
                    parts.append(f"<h3>{_esc(test.name)} (<code>{_esc(test.test_type)}</code>)</h3>")
                    parts.append(f"<p>{_esc(test.description)}</p>")
                    code = (
                        f"# {test.name}\n"
                        f"inputs = {json.dumps(test.inputs, indent=4)}\n"
                        f"expected = {json.dumps(test.expected_outputs, indent=4)}\n"
                        f"result = {safe_name}.run(inputs=inputs)\n"
                        f"assert result == expected"
                    )
                    parts.append(f"<pre><code>{_esc(code)}</code></pre>")
            else:
                parts.append("<p><em>No test definitions provided.</em></p>")

        # Limitations
        if request.include_limitations:
            sections.append("Limitations")
            parts.append("<h2>Limitations</h2>")
            if request.known_limitations:
                parts.append("<ul>")
                for lim in request.known_limitations:
                    parts.append(f"  <li>{_esc(lim)}</li>")
                parts.append("</ul>")
            else:
                parts.append("<p><em>No known limitations documented.</em></p>")

            sections.append("Known Issues")
            parts.append("<h3>Known Issues</h3>")
            parts.append("<p>Please file issues at the AMC platform tracker.</p>")

        # Changelog
        if request.include_changelog:
            sections.append("Changelog")
            parts.append("<h2>Changelog</h2>")
            parts.append(f"<h3>{_esc(request.version)}</h3>")
            parts.append("<ul><li>Initial release.</li></ul>")

        parts.append("</body>")
        parts.append("</html>")

        content = "\n".join(parts)
        return content, sections

    def _render_rst(self, request: DocGenerateRequest) -> tuple[str, list[str]]:
        """Render the same structure as reStructuredText."""
        sections: list[str] = []
        lines: list[str] = []

        safe_name = request.workflow_name.lower().replace(" ", "_")

        def _heading(text: str, char: str) -> list[str]:
            return [text, char * len(text), ""]

        # Overview
        sections.append("Overview")
        lines.extend(_heading(request.workflow_name, "="))
        meta_parts: list[str] = [f":version: {request.version}"]
        if request.author:
            meta_parts.insert(0, f":author: {request.author}")
        if request.tags:
            meta_parts.append(f":tags: {', '.join(request.tags)}")
        for m in meta_parts:
            lines.append(m)
        lines.append("")
        lines.append(request.workflow_description)
        lines.append("")

        # Quick-start
        sections.append("Quick Start")
        lines.extend(_heading("Quick Start", "-"))
        lines.append(".. code-block:: python")
        lines.append("")
        lines.append(f"   from amc.workflows import {safe_name}")
        lines.append("")
        lines.append(f"   result = {safe_name}.run(inputs={{}})")
        lines.append("   print(result)")
        lines.append("")

        # Steps table
        sections.append("Workflow Steps")
        lines.extend(_heading("Workflow Steps", "-"))
        if request.steps:
            # RST list-table
            lines.append(".. list-table::")
            lines.append("   :header-rows: 1")
            lines.append("   :widths: 20 30 15 15 20")
            lines.append("")
            lines.append("   * - Step")
            lines.append("     - Description")
            lines.append("     - Inputs")
            lines.append("     - Outputs")
            lines.append("     - Tools")
            for step in request.steps:
                inputs_str = ", ".join(step.inputs) if step.inputs else "—"
                outputs_str = ", ".join(step.outputs) if step.outputs else "—"
                tools_str = ", ".join(step.tools) if step.tools else "—"
                lines.append(f"   * - **{step.name}**")
                lines.append(f"     - {step.description}")
                lines.append(f"     - {inputs_str}")
                lines.append(f"     - {outputs_str}")
                lines.append(f"     - {tools_str}")
            lines.append("")
        else:
            lines.append("*No steps defined.*")
            lines.append("")

        # Examples
        if request.include_examples:
            sections.append("Examples")
            lines.extend(_heading("Examples", "-"))
            if request.tests:
                for test in request.tests:
                    lines.extend(_heading(f"{test.name} ({test.test_type})", "~"))
                    lines.append(test.description)
                    lines.append("")
                    lines.append(".. code-block:: python")
                    lines.append("")
                    lines.append(f"   # {test.name}")
                    for line in json.dumps(test.inputs, indent=4).splitlines():
                        lines.append(f"   {line}")
                    lines.append("")
                    for line in json.dumps(test.expected_outputs, indent=4).splitlines():
                        lines.append(f"   {line}")
                    lines.append(f"   result = {safe_name}.run(inputs=inputs)")
                    lines.append("   assert result == expected")
                    lines.append("")
            else:
                lines.append("*No test definitions provided.*")
                lines.append("")

        # Limitations
        if request.include_limitations:
            sections.append("Limitations")
            lines.extend(_heading("Limitations", "-"))
            if request.known_limitations:
                for lim in request.known_limitations:
                    lines.append(f"- {lim}")
            else:
                lines.append("*No known limitations documented.*")
            lines.append("")

            sections.append("Known Issues")
            lines.extend(_heading("Known Issues", "~"))
            lines.append("Please file issues at the AMC platform tracker.")
            lines.append("")

        # Changelog
        if request.include_changelog:
            sections.append("Changelog")
            lines.extend(_heading("Changelog", "-"))
            lines.extend(_heading(request.version, "~"))
            lines.append("- Initial release.")
            lines.append("")

        content = "\n".join(lines)
        return content, sections

    # ------------------------------------------------------------------
    # History / Retrieval
    # ------------------------------------------------------------------

    def get_history(self, limit: int = 20) -> list[dict]:
        """Return the most recent *limit* generated docs (without full content)."""
        with self._lock:
            cur = self._conn.execute(
                """
                SELECT doc_id, workflow_name, format, word_count, sections_json,
                       metadata_json, generated_at
                FROM   generated_docs
                ORDER  BY generated_at DESC
                LIMIT  ?
                """,
                (limit,),
            )
            rows = cur.fetchall()
        return [
            {
                "doc_id": r["doc_id"],
                "workflow_name": r["workflow_name"],
                "format": r["format"],
                "word_count": r["word_count"],
                "sections": json.loads(r["sections_json"]),
                "metadata": json.loads(r["metadata_json"]),
                "generated_at": r["generated_at"],
            }
            for r in rows
        ]

    def get_doc(self, doc_id: str) -> dict | None:
        """Return the full stored document record for *doc_id*, or ``None``."""
        with self._lock:
            cur = self._conn.execute(
                """
                SELECT doc_id, workflow_name, format, content, word_count,
                       sections_json, metadata_json, generated_at
                FROM   generated_docs
                WHERE  doc_id = ?
                """,
                (doc_id,),
            )
            row = cur.fetchone()
        if row is None:
            return None
        return {
            "doc_id": row["doc_id"],
            "workflow_name": row["workflow_name"],
            "format": row["format"],
            "content": row["content"],
            "word_count": row["word_count"],
            "sections": json.loads(row["sections_json"]),
            "metadata": json.loads(row["metadata_json"]),
            "generated_at": row["generated_at"],
        }

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    def _persist_doc(self, doc: GeneratedDoc) -> None:
        with self._lock:
            self._conn.execute(
                """
                INSERT OR REPLACE INTO generated_docs
                    (doc_id, workflow_name, format, content, word_count,
                     sections_json, metadata_json, generated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    doc.doc_id,
                    doc.workflow_name,
                    doc.format,
                    doc.content,
                    doc.word_count,
                    json.dumps(doc.sections),
                    json.dumps(doc.metadata),
                    doc.generated_at,
                ),
            )
            self._conn.commit()


# ---------------------------------------------------------------------------
# HTML escape helper
# ---------------------------------------------------------------------------


def _esc(text: str) -> str:
    """Minimal HTML entity escaping."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_instance: AutoDocGenerator | None = None
_instance_lock = Lock()


def get_autodoc_generator() -> AutoDocGenerator:
    """Return the process-wide ``AutoDocGenerator`` singleton."""
    global _instance
    if _instance is None:
        with _instance_lock:
            if _instance is None:
                _instance = AutoDocGenerator()
    return _instance


# ---------------------------------------------------------------------------
# Public API surface
# ---------------------------------------------------------------------------

__all__ = [
    "WorkflowStep",
    "TestDefinition",
    "DocGenerateRequest",
    "GeneratedDoc",
    "DocGenerateResult",
    "AutoDocGenerator",
    "get_autodoc_generator",
]
