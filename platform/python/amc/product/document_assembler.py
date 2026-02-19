"""AMC Product — Multi-Step Document Assembly Engine.

Section management, TOC generation, multi-source artifact assembly,
consistent formatting.

API: /api/v1/product/docs/assemble/*
"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import UUID, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_NS = UUID("b2c3d4e5-f6a7-8901-bcde-f12345678901")

# ── Schema ────────────────────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS doc_templates (
    template_id     TEXT NOT NULL PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    format          TEXT NOT NULL DEFAULT 'markdown',
    sections_json   TEXT NOT NULL DEFAULT '[]',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_templates_name ON doc_templates(name);

CREATE TABLE IF NOT EXISTS doc_assemblies (
    assembly_id     TEXT NOT NULL PRIMARY KEY,
    template_id     TEXT,
    name            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',
    toc_json        TEXT NOT NULL DEFAULT '[]',
    output_format   TEXT NOT NULL DEFAULT 'markdown',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    completed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_doc_assemblies_status ON doc_assemblies(status);

CREATE TABLE IF NOT EXISTS doc_sections (
    section_id      TEXT NOT NULL PRIMARY KEY,
    assembly_id     TEXT NOT NULL REFERENCES doc_assemblies(assembly_id),
    title           TEXT NOT NULL,
    seq             INTEGER NOT NULL DEFAULT 0,
    level           INTEGER NOT NULL DEFAULT 1,
    content         TEXT NOT NULL DEFAULT '',
    source_type     TEXT NOT NULL DEFAULT 'manual',
    source_ref      TEXT NOT NULL DEFAULT '',
    format          TEXT NOT NULL DEFAULT 'markdown',
    word_count      INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'empty',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_sections_assembly ON doc_sections(assembly_id, seq);

CREATE TABLE IF NOT EXISTS doc_artifacts (
    artifact_id     TEXT NOT NULL PRIMARY KEY,
    assembly_id     TEXT NOT NULL REFERENCES doc_assemblies(assembly_id),
    section_id      TEXT REFERENCES doc_sections(section_id),
    artifact_type   TEXT NOT NULL,
    content         TEXT NOT NULL DEFAULT '',
    source_url      TEXT NOT NULL DEFAULT '',
    fetched_at      TEXT,
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_artifacts_assembly ON doc_artifacts(assembly_id);
CREATE INDEX IF NOT EXISTS idx_doc_artifacts_section  ON doc_artifacts(section_id);
"""


# ── Enums ─────────────────────────────────────────────────────────────────────


class AssemblyStatus(str, Enum):
    DRAFT      = "draft"
    ASSEMBLING = "assembling"
    REVIEW     = "review"
    COMPLETED  = "completed"
    FAILED     = "failed"


class SectionStatus(str, Enum):
    EMPTY    = "empty"
    DRAFTED  = "drafted"
    SOURCED  = "sourced"
    REVIEWED = "reviewed"
    APPROVED = "approved"


class OutputFormat(str, Enum):
    MARKDOWN   = "markdown"
    HTML       = "html"
    PDF_READY  = "pdf_ready"
    DOCX_READY = "docx_ready"
    JSON       = "json"


class SourceType(str, Enum):
    MANUAL   = "manual"
    API      = "api"
    FILE     = "file"
    DATABASE = "database"
    AGENT    = "agent"


# ── Dataclasses ───────────────────────────────────────────────────────────────


@dataclass
class DocTemplate:
    template_id: str
    name:        str
    description: str
    format:      str
    sections:    list[dict[str, Any]]
    metadata:    dict[str, Any]
    created_at:  str
    updated_at:  str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "template_id": self.template_id,
            "name":        self.name,
            "description": self.description,
            "format":      self.format,
            "sections":    self.sections,
            "metadata":    self.metadata,
            "created_at":  self.created_at,
            "updated_at":  self.updated_at,
        }


@dataclass
class DocAssembly:
    assembly_id:  str
    template_id:  str | None
    name:         str
    status:       AssemblyStatus
    toc:          list[dict[str, Any]]
    output_format: OutputFormat
    metadata:     dict[str, Any]
    created_at:   str
    updated_at:   str
    completed_at: str | None

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "assembly_id":  self.assembly_id,
            "template_id":  self.template_id,
            "name":         self.name,
            "status":       self.status.value,
            "toc":          self.toc,
            "output_format": self.output_format.value,
            "metadata":     self.metadata,
            "created_at":   self.created_at,
            "updated_at":   self.updated_at,
            "completed_at": self.completed_at,
        }


@dataclass
class DocSection:
    section_id:  str
    assembly_id: str
    title:       str
    seq:         int
    level:       int
    content:     str
    source_type: SourceType
    source_ref:  str
    format:      str
    word_count:  int
    status:      SectionStatus
    created_at:  str
    updated_at:  str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "section_id":  self.section_id,
            "assembly_id": self.assembly_id,
            "title":       self.title,
            "seq":         self.seq,
            "level":       self.level,
            "content":     self.content,
            "source_type": self.source_type.value,
            "source_ref":  self.source_ref,
            "format":      self.format,
            "word_count":  self.word_count,
            "status":      self.status.value,
            "created_at":  self.created_at,
            "updated_at":  self.updated_at,
        }


@dataclass
class DocArtifact:
    artifact_id:  str
    assembly_id:  str
    section_id:   str | None
    artifact_type: str
    content:      str
    source_url:   str
    fetched_at:   str | None
    created_at:   str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "artifact_id":   self.artifact_id,
            "assembly_id":   self.assembly_id,
            "section_id":    self.section_id,
            "artifact_type": self.artifact_type,
            "content":       self.content,
            "source_url":    self.source_url,
            "fetched_at":    self.fetched_at,
            "created_at":    self.created_at,
        }


# ── Helpers ───────────────────────────────────────────────────────────────────


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_id(prefix: str, *parts: str) -> str:
    return str(uuid5(_NS, f"{prefix}:{':'.join(parts)}:{_now()}"))


def _count_words(text: str) -> int:
    return len(text.split()) if text.strip() else 0


def _row_to_template(row: sqlite3.Row) -> DocTemplate:
    return DocTemplate(
        template_id=row["template_id"],
        name=row["name"],
        description=row["description"],
        format=row["format"],
        sections=json.loads(row["sections_json"] or "[]"),
        metadata=json.loads(row["metadata_json"] or "{}"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_assembly(row: sqlite3.Row) -> DocAssembly:
    return DocAssembly(
        assembly_id=row["assembly_id"],
        template_id=row["template_id"],
        name=row["name"],
        status=AssemblyStatus(row["status"]),
        toc=json.loads(row["toc_json"] or "[]"),
        output_format=OutputFormat(row["output_format"]),
        metadata=json.loads(row["metadata_json"] or "{}"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        completed_at=row["completed_at"],
    )


def _row_to_section(row: sqlite3.Row) -> DocSection:
    return DocSection(
        section_id=row["section_id"],
        assembly_id=row["assembly_id"],
        title=row["title"],
        seq=row["seq"],
        level=row["level"],
        content=row["content"],
        source_type=SourceType(row["source_type"]),
        source_ref=row["source_ref"],
        format=row["format"],
        word_count=row["word_count"],
        status=SectionStatus(row["status"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_artifact(row: sqlite3.Row) -> DocArtifact:
    return DocArtifact(
        artifact_id=row["artifact_id"],
        assembly_id=row["assembly_id"],
        section_id=row["section_id"],
        artifact_type=row["artifact_type"],
        content=row["content"],
        source_url=row["source_url"],
        fetched_at=row["fetched_at"],
        created_at=row["created_at"],
    )


# ── DocumentAssembler ─────────────────────────────────────────────────────────


class DocumentAssembler:
    """Multi-step document assembly engine with SQLite persistence.

    Thread-safe via ``threading.Lock``.
    """

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._lock    = Lock()
        self._db_path = product_db_path(db_path)
        self._init_db()

    # ── internals ─────────────────────────────────────────────────────────────

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_db(self) -> None:
        with self._lock:
            with self._connect() as conn:
                conn.executescript(_SCHEMA)

    # ── Templates ─────────────────────────────────────────────────────────────

    def create_template(
        self,
        name: str,
        description: str,
        format: str = "markdown",
        sections: list[dict[str, Any]] | None = None,
    ) -> DocTemplate:
        now = _now()
        tid = _make_id("template", name)
        secs = sections or []
        template = DocTemplate(
            template_id=tid,
            name=name,
            description=description,
            format=format,
            sections=secs,
            metadata={},
            created_at=now,
            updated_at=now,
        )
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """INSERT INTO doc_templates
                       (template_id, name, description, format,
                        sections_json, metadata_json, created_at, updated_at)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (tid, name, description, format,
                     json.dumps(secs), "{}", now, now),
                )
        log.info("doc.template.created", template_id=tid, name=name)
        return template

    def get_template(self, template_id: str) -> DocTemplate | None:
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT * FROM doc_templates WHERE template_id = ?", (template_id,)
                ).fetchone()
        return _row_to_template(row) if row else None

    def list_templates(self) -> list[DocTemplate]:
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT * FROM doc_templates ORDER BY created_at DESC"
                ).fetchall()
        return [_row_to_template(r) for r in rows]

    # ── Assemblies ────────────────────────────────────────────────────────────

    def create_assembly(
        self,
        name: str,
        template_id: str | None = None,
        output_format: str = "markdown",
        metadata: dict[str, Any] | None = None,
    ) -> DocAssembly:
        now = _now()
        aid = _make_id("assembly", name)
        meta = metadata or {}
        try:
            of = OutputFormat(output_format)
        except ValueError:
            of = OutputFormat.MARKDOWN
        assembly = DocAssembly(
            assembly_id=aid,
            template_id=template_id,
            name=name,
            status=AssemblyStatus.DRAFT,
            toc=[],
            output_format=of,
            metadata=meta,
            created_at=now,
            updated_at=now,
            completed_at=None,
        )
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """INSERT INTO doc_assemblies
                       (assembly_id, template_id, name, status, toc_json,
                        output_format, metadata_json, created_at, updated_at, completed_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (aid, template_id, name, AssemblyStatus.DRAFT.value, "[]",
                     of.value, json.dumps(meta), now, now, None),
                )
        # If template given, auto-populate sections from template definition
        if template_id:
            tmpl = self.get_template(template_id)
            if tmpl:
                for sec in sorted(tmpl.sections, key=lambda s: s.get("seq", 0)):
                    self.add_section(
                        assembly_id=aid,
                        title=sec.get("title", "Untitled"),
                        seq=sec.get("seq", 0),
                        level=sec.get("level", 1),
                    )
        log.info("doc.assembly.created", assembly_id=aid, name=name)
        return assembly

    def get_assembly(self, assembly_id: str) -> DocAssembly | None:
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT * FROM doc_assemblies WHERE assembly_id = ?", (assembly_id,)
                ).fetchone()
        return _row_to_assembly(row) if row else None

    def list_assemblies(self, status: AssemblyStatus | str | None = None) -> list[DocAssembly]:
        params: list[Any] = []
        where = ""
        if status is not None:
            sv = status.value if isinstance(status, AssemblyStatus) else status
            where = "WHERE status = ?"
            params.append(sv)
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(
                    f"SELECT * FROM doc_assemblies {where} ORDER BY created_at DESC",
                    params,
                ).fetchall()
        return [_row_to_assembly(r) for r in rows]

    # ── Sections ──────────────────────────────────────────────────────────────

    def add_section(
        self,
        assembly_id: str,
        title: str,
        seq: int,
        level: int,
        content: str = "",
        source_type: str = "manual",
        source_ref: str = "",
    ) -> DocSection:
        now = _now()
        sid = _make_id("section", assembly_id, title, str(seq))
        wc  = _count_words(content)
        try:
            st = SourceType(source_type)
        except ValueError:
            st = SourceType.MANUAL
        section = DocSection(
            section_id=sid,
            assembly_id=assembly_id,
            title=title,
            seq=seq,
            level=level,
            content=content,
            source_type=st,
            source_ref=source_ref,
            format="markdown",
            word_count=wc,
            status=SectionStatus.EMPTY if not content else SectionStatus.DRAFTED,
            created_at=now,
            updated_at=now,
        )
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """INSERT INTO doc_sections
                       (section_id, assembly_id, title, seq, level, content,
                        source_type, source_ref, format, word_count, status,
                        created_at, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (sid, assembly_id, title, seq, level, content,
                     st.value, source_ref, "markdown", wc,
                     section.status.value, now, now),
                )
        log.info("doc.section.added", section_id=sid, title=title, seq=seq)
        return section

    def update_section(
        self,
        section_id: str,
        content: str | None = None,
        status: SectionStatus | str | None = None,
        source_type: SourceType | str | None = None,
        source_ref: str | None = None,
    ) -> DocSection:
        now = _now()
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT * FROM doc_sections WHERE section_id = ?", (section_id,)
                ).fetchone()
                if not row:
                    raise ValueError(f"Section not found: {section_id}")
                new_content     = content    if content    is not None else row["content"]
                new_source_ref  = source_ref if source_ref is not None else row["source_ref"]
                new_wc          = _count_words(new_content)
                if status is not None:
                    sv = status.value if isinstance(status, SectionStatus) else status
                else:
                    sv = row["status"]
                if source_type is not None:
                    stv = source_type.value if isinstance(source_type, SourceType) else source_type
                else:
                    stv = row["source_type"]
                conn.execute(
                    """UPDATE doc_sections
                       SET content = ?, status = ?, source_type = ?,
                           source_ref = ?, word_count = ?, updated_at = ?
                       WHERE section_id = ?""",
                    (new_content, sv, stv, new_source_ref, new_wc, now, section_id),
                )
                row2 = conn.execute(
                    "SELECT * FROM doc_sections WHERE section_id = ?", (section_id,)
                ).fetchone()
        log.info("doc.section.updated", section_id=section_id)
        return _row_to_section(row2)

    def get_sections(self, assembly_id: str) -> list[DocSection]:
        """Return sections ordered by seq."""
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT * FROM doc_sections WHERE assembly_id = ? ORDER BY seq ASC",
                    (assembly_id,),
                ).fetchall()
        return [_row_to_section(r) for r in rows]

    # ── Artifacts ─────────────────────────────────────────────────────────────

    def add_artifact(
        self,
        assembly_id: str,
        section_id: str | None,
        artifact_type: str,
        content: str,
        source_url: str = "",
    ) -> DocArtifact:
        now = _now()
        aid = _make_id("artifact", assembly_id, artifact_type)
        artifact = DocArtifact(
            artifact_id=aid,
            assembly_id=assembly_id,
            section_id=section_id,
            artifact_type=artifact_type,
            content=content,
            source_url=source_url,
            fetched_at=now if source_url else None,
            created_at=now,
        )
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """INSERT INTO doc_artifacts
                       (artifact_id, assembly_id, section_id, artifact_type,
                        content, source_url, fetched_at, created_at)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (aid, assembly_id, section_id, artifact_type,
                     content, source_url, artifact.fetched_at, now),
                )
        log.info("doc.artifact.added", artifact_id=aid, artifact_type=artifact_type)
        return artifact

    def get_artifacts(
        self,
        assembly_id: str | None = None,
        section_id: str | None = None,
    ) -> list[DocArtifact]:
        clauses: list[str] = []
        params:  list[Any] = []
        if assembly_id is not None:
            clauses.append("assembly_id = ?")
            params.append(assembly_id)
        if section_id is not None:
            clauses.append("section_id = ?")
            params.append(section_id)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(
                    f"SELECT * FROM doc_artifacts {where} ORDER BY created_at ASC",
                    params,
                ).fetchall()
        return [_row_to_artifact(r) for r in rows]

    # ── TOC & Assembly ────────────────────────────────────────────────────────

    def generate_toc(self, assembly_id: str) -> list[dict[str, Any]]:
        """Build a table of contents from all sections."""
        sections = self.get_sections(assembly_id)
        toc = [
            {
                "title":      s.title,
                "level":      s.level,
                "seq":        s.seq,
                "section_id": s.section_id,
            }
            for s in sections
        ]
        # Persist TOC into assembly row
        now = _now()
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE doc_assemblies SET toc_json = ?, updated_at = ? WHERE assembly_id = ?",
                    (json.dumps(toc), now, assembly_id),
                )
        return toc

    def format_section(self, section: DocSection, format: OutputFormat) -> str:
        """Render a single section in the desired output format."""
        heading_prefix = "#" * section.level
        title_line = f"{heading_prefix} {section.title}"
        content = section.content or ""

        if format == OutputFormat.MARKDOWN:
            return f"{title_line}\n\n{content}"
        elif format == OutputFormat.HTML:
            h_tag = f"h{section.level}"
            return (
                f"<{h_tag}>{section.title}</{h_tag}>\n"
                f"<div class='section-content'>{content}</div>"
            )
        elif format == OutputFormat.PDF_READY:
            return f"[PDF:{section.level}] {section.title}\n\n{content}"
        elif format == OutputFormat.DOCX_READY:
            return f"[DOCX:Heading{section.level}] {section.title}\n\n{content}"
        elif format == OutputFormat.JSON:
            return json.dumps(section.dict, indent=2)
        return f"{title_line}\n\n{content}"

    def assemble_document(self, assembly_id: str) -> str:
        """Compile all sections into the final document with TOC prepended."""
        assembly = self.get_assembly(assembly_id)
        if not assembly:
            raise ValueError(f"Assembly not found: {assembly_id}")

        # Update status to assembling
        now = _now()
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE doc_assemblies SET status = ?, updated_at = ? WHERE assembly_id = ?",
                    (AssemblyStatus.ASSEMBLING.value, now, assembly_id),
                )

        toc      = self.generate_toc(assembly_id)
        sections = self.get_sections(assembly_id)
        fmt      = assembly.output_format

        # Build TOC string
        toc_lines = ["# Table of Contents\n"]
        for entry in toc:
            indent = "  " * (entry["level"] - 1)
            toc_lines.append(f"{indent}- {entry['title']}")
        toc_str = "\n".join(toc_lines)

        # Build body
        body_parts: list[str] = []
        for sec in sections:
            body_parts.append(self.format_section(sec, fmt))

        separator = "\n\n---\n\n" if fmt == OutputFormat.MARKDOWN else "\n\n"
        body = separator.join(body_parts)

        document = f"{toc_str}\n\n---\n\n{body}"
        log.info("doc.assembled", assembly_id=assembly_id, sections=len(sections))
        return document

    def complete_assembly(self, assembly_id: str) -> DocAssembly:
        """Mark an assembly as completed."""
        now = _now()
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """UPDATE doc_assemblies
                       SET status = ?, completed_at = ?, updated_at = ?
                       WHERE assembly_id = ?""",
                    (AssemblyStatus.COMPLETED.value, now, now, assembly_id),
                )
                row = conn.execute(
                    "SELECT * FROM doc_assemblies WHERE assembly_id = ?", (assembly_id,)
                ).fetchone()
        if not row:
            raise ValueError(f"Assembly not found: {assembly_id}")
        log.info("doc.assembly.completed", assembly_id=assembly_id)
        return _row_to_assembly(row)

    def get_word_counts(self, assembly_id: str) -> dict[str, Any]:
        """Return per-section word counts and total."""
        sections = self.get_sections(assembly_id)
        per_section = {s.section_id: {"title": s.title, "word_count": s.word_count}
                       for s in sections}
        total = sum(s.word_count for s in sections)
        return {
            "assembly_id":  assembly_id,
            "per_section":  per_section,
            "total_words":  total,
            "section_count": len(sections),
        }


__all__ = [
    "AssemblyStatus",
    "SectionStatus",
    "OutputFormat",
    "SourceType",
    "DocTemplate",
    "DocAssembly",
    "DocSection",
    "DocArtifact",
    "DocumentAssembler",
]


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

import threading as _threading

_da_instance: DocumentAssembler | None = None
_da_lock = _threading.Lock()


def get_document_assembler() -> DocumentAssembler:
    global _da_instance
    if _da_instance is None:
        with _da_lock:
            if _da_instance is None:
                _da_instance = DocumentAssembler()
    return _da_instance


def reset_document_assembler(db_path: str | None = None) -> DocumentAssembler:
    global _da_instance
    with _da_lock:
        _da_instance = DocumentAssembler(db_path=db_path)
    return _da_instance
