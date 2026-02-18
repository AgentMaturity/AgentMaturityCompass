"""Docs Ingestion Manager — Continuous docs ingestion + change summaries.

Ingests documents (files, URLs, directories), detects changes via content hashing,
generates diff summaries and action items. Weekly summary generation. SQLite-backed.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS doc_sources (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id               TEXT NOT NULL UNIQUE,
    name                    TEXT NOT NULL,
    path                    TEXT NOT NULL DEFAULT '',
    source_type             TEXT NOT NULL DEFAULT 'file',
    watch_interval_minutes  INTEGER NOT NULL DEFAULT 60,
    tags_json               TEXT NOT NULL DEFAULT '[]',
    metadata_json           TEXT NOT NULL DEFAULT '{}',
    created_at              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_name ON doc_sources(name);

CREATE TABLE IF NOT EXISTS doc_versions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id      TEXT NOT NULL UNIQUE,
    source_id       TEXT NOT NULL,
    content_hash    TEXT NOT NULL,
    content_length  INTEGER NOT NULL DEFAULT 0,
    detected_at     TEXT NOT NULL,
    change_type     TEXT NOT NULL DEFAULT 'new',
    diff_summary    TEXT NOT NULL DEFAULT '',
    action_items_json TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (source_id) REFERENCES doc_sources(source_id)
);
CREATE INDEX IF NOT EXISTS idx_versions_source ON doc_versions(source_id);
CREATE INDEX IF NOT EXISTS idx_versions_ts     ON doc_versions(detected_at);
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_content(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()


def _extract_sections(content: str) -> list[str]:
    """Extract markdown section headings from content."""
    return re.findall(r"^#{1,6}\s+(.+)$", content, re.MULTILINE)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

from pydantic import BaseModel, Field
from uuid import uuid4


class DocSource(BaseModel):
    source_id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    path: str = ""
    source_type: str = "file"  # file | url | directory
    watch_interval_minutes: int = 60
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocVersion(BaseModel):
    version_id: str
    source_id: str
    content_hash: str
    content_length: int
    detected_at: str
    change_type: str  # new | modified | deleted
    diff_summary: str
    action_items: list[str]


class IngestRequest(BaseModel):
    content: str
    source_name: str
    source_path: str = ""
    source_type: str = "file"
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class IngestResult(BaseModel):
    version: DocVersion
    is_new: bool
    is_changed: bool
    source: DocSource
    duration_ms: int


class WeeklySummaryRequest(BaseModel):
    since_days: int = 7
    source_ids: list[str] = Field(default_factory=list)  # empty = all


class WeeklySummary(BaseModel):
    summary_id: str
    period_start: str
    period_end: str
    total_sources: int
    new_docs: int
    modified_docs: int
    deleted_docs: int
    key_changes: list[str]
    action_items: list[str]
    generated_at: str


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------


class DocsIngestionManager:
    """Ingest docs, detect changes, and generate summaries."""

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
    # Ingestion
    # ------------------------------------------------------------------

    def ingest(self, request: IngestRequest) -> IngestResult:
        t0 = time.monotonic()
        ts = _utc_now()

        # Get or create source
        source = self._get_source_by_name(request.source_name)
        is_new_source = source is None
        if source is None:
            source = DocSource(
                name=request.source_name,
                path=request.source_path,
                source_type=request.source_type,
                tags=request.tags,
                metadata=request.metadata,
            )
            self._conn.execute(
                """
                INSERT OR IGNORE INTO doc_sources
                    (source_id, name, path, source_type, watch_interval_minutes,
                     tags_json, metadata_json, created_at)
                VALUES (?, ?, ?, ?, 60, ?, ?, ?)
                """,
                (
                    source.source_id, source.name, source.path,
                    source.source_type, json.dumps(source.tags),
                    json.dumps(source.metadata), ts,
                ),
            )
            self._conn.commit()

        # Check last version
        last_version = self._get_last_version(source.source_id)
        new_hash = _hash_content(request.content)

        is_new = last_version is None
        is_changed = last_version is not None and last_version.content_hash != new_hash

        if is_new:
            change_type = "new"
            old_content: str | None = None
        elif is_changed:
            change_type = "modified"
            old_content = None  # we don't store full content, use length heuristic
        else:
            # No change — still record a version for audit but mark as unchanged
            change_type = "modified"
            # Actually skip creating a new version if nothing changed
            duration_ms = int((time.monotonic() - t0) * 1000)
            log.info("docs_ingestion.no_change", source=request.source_name)
            version = DocVersion(
                version_id=str(uuid.uuid4()),
                source_id=source.source_id,
                content_hash=new_hash,
                content_length=len(request.content),
                detected_at=ts,
                change_type="modified",
                diff_summary="No changes detected.",
                action_items=[],
            )
            return IngestResult(
                version=version,
                is_new=False,
                is_changed=False,
                source=source,
                duration_ms=duration_ms,
            )

        # Generate diff summary and action items
        old_len = last_version.content_length if last_version else None
        diff_summary, action_items = self._generate_diff_summary(
            old_len=old_len,
            old_hash=last_version.content_hash if last_version else None,
            new_content=request.content,
            change_type=change_type,
        )

        version_id = str(uuid.uuid4())
        self._conn.execute(
            """
            INSERT INTO doc_versions
                (version_id, source_id, content_hash, content_length,
                 detected_at, change_type, diff_summary, action_items_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                version_id, source.source_id, new_hash, len(request.content),
                ts, change_type, diff_summary, json.dumps(action_items),
            ),
        )
        self._conn.commit()

        version = DocVersion(
            version_id=version_id,
            source_id=source.source_id,
            content_hash=new_hash,
            content_length=len(request.content),
            detected_at=ts,
            change_type=change_type,
            diff_summary=diff_summary,
            action_items=action_items,
        )

        duration_ms = int((time.monotonic() - t0) * 1000)
        log.info("docs_ingestion.ingested", source=request.source_name, change_type=change_type)
        return IngestResult(
            version=version,
            is_new=is_new,
            is_changed=is_changed,
            source=source,
            duration_ms=duration_ms,
        )

    def _generate_diff_summary(
        self,
        old_len: int | None,
        old_hash: str | None,
        new_content: str,
        change_type: str,
    ) -> tuple[str, list[str]]:
        """Generate a human-readable diff summary and action items."""
        new_len = len(new_content)
        new_lines = new_content.splitlines()
        sections = _extract_sections(new_content)

        action_items: list[str] = []

        if change_type == "new":
            summary = (
                f"New document ingested. "
                f"{new_len} characters, {len(new_lines)} lines, "
                f"{len(sections)} sections."
            )
            if sections:
                summary += f" Sections: {', '.join(sections[:5])}"
                if len(sections) > 5:
                    summary += f" (+{len(sections)-5} more)"
            action_items.append("Review and categorize the new document.")
            if any(kw in new_content.lower() for kw in ["todo", "fixme", "tbd", "placeholder"]):
                action_items.append("Document contains TODO/FIXME/TBD markers — review for completeness.")
        else:
            delta = new_len - (old_len or 0)
            delta_str = f"+{delta}" if delta >= 0 else str(delta)
            summary = (
                f"Document modified. "
                f"Size changed by {delta_str} chars "
                f"(now {new_len} chars, {len(new_lines)} lines)."
            )
            if sections:
                summary += f" Current sections: {', '.join(sections[:5])}"
            if abs(delta) > 500:
                action_items.append(
                    f"Significant content change ({delta_str} chars). "
                    "Review for accuracy and update downstream consumers."
                )
            if any(kw in new_content.lower() for kw in ["deprecated", "removed", "breaking"]):
                action_items.append(
                    "Document mentions breaking changes or deprecations — notify affected teams."
                )
            if any(kw in new_content.lower() for kw in ["api", "endpoint", "schema"]):
                action_items.append(
                    "API or schema content detected — verify integration docs are up to date."
                )

        return summary, action_items

    # ------------------------------------------------------------------
    # Sources
    # ------------------------------------------------------------------

    def _get_source_by_name(self, name: str) -> DocSource | None:
        row = self._conn.execute(
            "SELECT * FROM doc_sources WHERE name=?", (name,)
        ).fetchone()
        return self._row_to_source(row) if row else None

    def get_source(self, source_id: str) -> DocSource | None:
        row = self._conn.execute(
            "SELECT * FROM doc_sources WHERE source_id=?", (source_id,)
        ).fetchone()
        return self._row_to_source(row) if row else None

    def list_sources(self) -> list[DocSource]:
        rows = self._conn.execute(
            "SELECT * FROM doc_sources ORDER BY created_at DESC"
        ).fetchall()
        return [self._row_to_source(r) for r in rows]

    def _row_to_source(self, row: sqlite3.Row) -> DocSource:
        return DocSource(
            source_id=row["source_id"],
            name=row["name"],
            path=row["path"],
            source_type=row["source_type"],
            watch_interval_minutes=row["watch_interval_minutes"],
            tags=json.loads(row["tags_json"]),
            metadata=json.loads(row["metadata_json"]),
        )

    # ------------------------------------------------------------------
    # Versions
    # ------------------------------------------------------------------

    def _get_last_version(self, source_id: str) -> DocVersion | None:
        row = self._conn.execute(
            "SELECT * FROM doc_versions WHERE source_id=? ORDER BY detected_at DESC LIMIT 1",
            (source_id,),
        ).fetchone()
        return self._row_to_version(row) if row else None

    def get_versions(self, source_id: str, limit: int = 10) -> list[DocVersion]:
        rows = self._conn.execute(
            "SELECT * FROM doc_versions WHERE source_id=? ORDER BY detected_at DESC LIMIT ?",
            (source_id, limit),
        ).fetchall()
        return [self._row_to_version(r) for r in rows]

    def _row_to_version(self, row: sqlite3.Row) -> DocVersion:
        return DocVersion(
            version_id=row["version_id"],
            source_id=row["source_id"],
            content_hash=row["content_hash"],
            content_length=row["content_length"],
            detected_at=row["detected_at"],
            change_type=row["change_type"],
            diff_summary=row["diff_summary"],
            action_items=json.loads(row["action_items_json"]),
        )

    # ------------------------------------------------------------------
    # Weekly summary
    # ------------------------------------------------------------------

    def generate_weekly_summary(self, request: WeeklySummaryRequest) -> WeeklySummary:
        now = datetime.now(timezone.utc)
        period_end = now
        period_start = now - timedelta(days=request.since_days)
        ts_start = period_start.isoformat()

        # Query versions in period
        if request.source_ids:
            placeholders = ",".join("?" * len(request.source_ids))
            rows = self._conn.execute(
                f"SELECT * FROM doc_versions WHERE detected_at >= ? AND source_id IN ({placeholders})",
                [ts_start] + request.source_ids,
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT * FROM doc_versions WHERE detected_at >= ?",
                (ts_start,),
            ).fetchall()

        new_count = sum(1 for r in rows if r["change_type"] == "new")
        modified_count = sum(1 for r in rows if r["change_type"] == "modified")
        deleted_count = sum(1 for r in rows if r["change_type"] == "deleted")

        # Collect unique sources affected
        unique_sources = len(set(r["source_id"] for r in rows))

        # Key changes: collect diff summaries
        key_changes: list[str] = []
        for row in rows[:10]:
            summary = row["diff_summary"]
            if summary and summary not in key_changes:
                key_changes.append(summary)

        # Aggregate action items
        all_action_items: list[str] = []
        for row in rows:
            items = json.loads(row["action_items_json"])
            for item in items:
                if item not in all_action_items:
                    all_action_items.append(item)

        if not key_changes:
            key_changes = ["No document changes detected in the period."]

        return WeeklySummary(
            summary_id=str(uuid.uuid4()),
            period_start=period_start.isoformat(),
            period_end=period_end.isoformat(),
            total_sources=unique_sources,
            new_docs=new_count,
            modified_docs=modified_count,
            deleted_docs=deleted_count,
            key_changes=key_changes,
            action_items=all_action_items[:20],
            generated_at=_utc_now(),
        )

    def mark_deleted(self, source_name: str) -> DocVersion | None:
        """Record a deletion event for a source."""
        source = self._get_source_by_name(source_name)
        if not source:
            return None
        ts = _utc_now()
        version_id = str(uuid.uuid4())
        self._conn.execute(
            """
            INSERT INTO doc_versions
                (version_id, source_id, content_hash, content_length,
                 detected_at, change_type, diff_summary, action_items_json)
            VALUES (?, ?, '', 0, ?, 'deleted', 'Document deleted or removed.', '["Remove references to this document."]')
            """,
            (version_id, source.source_id, ts),
        )
        self._conn.commit()
        return DocVersion(
            version_id=version_id,
            source_id=source.source_id,
            content_hash="",
            content_length=0,
            detected_at=ts,
            change_type="deleted",
            diff_summary="Document deleted or removed.",
            action_items=["Remove references to this document."],
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_manager: DocsIngestionManager | None = None


def get_docs_ingestion_manager(db_path: str | Path | None = None) -> DocsIngestionManager:
    global _manager
    if _manager is None:
        _manager = DocsIngestionManager(db_path=db_path)
    return _manager


__all__ = [
    "DocSource",
    "DocVersion",
    "IngestRequest",
    "IngestResult",
    "WeeklySummaryRequest",
    "WeeklySummary",
    "DocsIngestionManager",
    "get_docs_ingestion_manager",
]
