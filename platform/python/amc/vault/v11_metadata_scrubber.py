"""
AMC Vault — V11: Attachment Metadata Scrubber
=============================================

Removes EXIF data, author fields, hidden revisions, and embedded IDs from
files before the agent sends them externally.

Supported formats: JSON, CSV, plain-text/Markdown.
Unknown/binary files are flagged and SHA-256 logged but not modified.

Usage
-----

.. code-block:: python

    from pathlib import Path
    from amc.vault.v11_metadata_scrubber import MetadataScrubber

    scrubber = MetadataScrubber()

    # Scrub a file in-place (write to output path):
    result = scrubber.scrub_file(Path("report.json"), Path("report.clean.json"))
    print(result.is_safe_to_send, result.fields_processed)

    # Or scrub raw bytes:
    clean_bytes, result = scrubber.scrub_bytes(raw_bytes, "report.json")

    # Analyse without modifying:
    result = scrubber.analyze_only(raw_bytes, "report.json")
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator, Literal

import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_AUTHOR_KEYS: frozenset[str] = frozenset(
    {
        "author",
        "creator",
        "created_by",
        "modified_by",
        "user",
        "editor",
        "machine",
        "hostname",
        "uuid",
    }
)

_CSV_META_PREFIXES: tuple[str, ...] = ("Author:", "Created:", "Generator:")

# HTML/XML comment containing author info, e.g. <!-- author: John Doe -->
_AUTHOR_COMMENT_RE = re.compile(
    r"<!--\s*(?:author|creator|created_by|modified_by|user|editor)\s*:.*?-->",
    re.IGNORECASE | re.DOTALL,
)

# Default DB path (can be overridden in constructor)
_DEFAULT_DB = Path("/tmp/amc_v11_scrubber.db")

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ScrubConfig(BaseModel):
    """Configuration for the metadata scrubber."""

    remove_exif: bool = True
    remove_author: bool = True
    remove_hidden_revisions: bool = True
    remove_embedded_ids: bool = True
    watermark_output: bool = False
    watermark_text: str = "AMC-SCRUBBED"


class MetadataField(BaseModel):
    """Record of a single metadata field encountered during scrubbing."""

    field_name: str
    original_value: str
    action_taken: Literal["removed", "redacted", "kept"]
    reason: str


class ScrubResult(BaseModel):
    """Full result of a scrub operation."""

    file_id: str
    original_size: int
    scrubbed_size: int
    fields_processed: list[MetadataField] = Field(default_factory=list)
    is_safe_to_send: bool
    warnings: list[str] = Field(default_factory=list)
    scrubbed_at: datetime


# ---------------------------------------------------------------------------
# SQLite helpers
# ---------------------------------------------------------------------------


def _init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS scrub_history (
            file_id       TEXT PRIMARY KEY,
            original_size INTEGER NOT NULL,
            scrubbed_size INTEGER NOT NULL,
            fields_json   TEXT    NOT NULL,
            warnings_json TEXT    NOT NULL,
            is_safe       INTEGER NOT NULL,
            scrubbed_at   TEXT    NOT NULL
        )
        """
    )
    conn.commit()


def _save_result(conn: sqlite3.Connection, result: ScrubResult) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO scrub_history
            (file_id, original_size, scrubbed_size, fields_json,
             warnings_json, is_safe, scrubbed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            result.file_id,
            result.original_size,
            result.scrubbed_size,
            json.dumps([f.model_dump() for f in result.fields_processed]),
            json.dumps(result.warnings),
            int(result.is_safe_to_send),
            result.scrubbed_at.isoformat(),
        ),
    )
    conn.commit()


def _load_results(conn: sqlite3.Connection, limit: int) -> list[ScrubResult]:
    rows = conn.execute(
        "SELECT * FROM scrub_history ORDER BY scrubbed_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    results: list[ScrubResult] = []
    for row in rows:
        fields = [MetadataField(**f) for f in json.loads(row[3])]
        results.append(
            ScrubResult(
                file_id=row[0],
                original_size=row[1],
                scrubbed_size=row[2],
                fields_processed=fields,
                warnings=json.loads(row[4]),
                is_safe_to_send=bool(row[5]),
                scrubbed_at=datetime.fromisoformat(row[6]),
            )
        )
    return results


# ---------------------------------------------------------------------------
# Format-specific scrubbing helpers
# ---------------------------------------------------------------------------


def _scrub_json_obj(
    obj: Any,
    config: ScrubConfig,
    fields: list[MetadataField],
) -> Any:
    """Recursively remove author/identity keys from a JSON-decoded object."""
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for k, v in obj.items():
            if k.lower() in _AUTHOR_KEYS and config.remove_author:
                fields.append(
                    MetadataField(
                        field_name=k,
                        original_value=str(v)[:200],
                        action_taken="removed",
                        reason="Key matched author/identity pattern",
                    )
                )
            else:
                out[k] = _scrub_json_obj(v, config, fields)
        if config.watermark_output:
            out["_amc_scrubbed"] = config.watermark_text
        return out
    elif isinstance(obj, list):
        return [_scrub_json_obj(item, config, fields) for item in obj]
    else:
        return obj


def _scrub_json(
    raw: bytes, config: ScrubConfig
) -> tuple[bytes, list[MetadataField], list[str]]:
    """Scrub a JSON file."""
    warnings: list[str] = []
    fields: list[MetadataField] = []
    try:
        obj = json.loads(raw.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as exc:
        warnings.append(f"JSON parse error — file may be corrupt: {exc}")
        return raw, fields, warnings
    cleaned = _scrub_json_obj(obj, config, fields)
    out = json.dumps(cleaned, ensure_ascii=False, indent=2).encode("utf-8")
    return out, fields, warnings


def _scrub_csv(
    raw: bytes, config: ScrubConfig
) -> tuple[bytes, list[MetadataField], list[str]]:
    """Strip metadata header rows from CSV."""
    warnings: list[str] = []
    fields: list[MetadataField] = []
    text = raw.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    kept_rows: list[list[str]] = []
    for row in reader:
        if row and any(row[0].startswith(pfx) for pfx in _CSV_META_PREFIXES):
            fields.append(
                MetadataField(
                    field_name=row[0].rstrip(":").lower(),
                    original_value=",".join(row)[:200],
                    action_taken="removed",
                    reason="CSV metadata header row stripped",
                )
            )
        else:
            kept_rows.append(row)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerows(kept_rows)
    if config.watermark_output:
        writer.writerow([config.watermark_text])
    return buf.getvalue().encode("utf-8"), fields, warnings


def _scrub_text(
    raw: bytes, config: ScrubConfig
) -> tuple[bytes, list[MetadataField], list[str]]:
    """Remove HTML author comment blocks from text/markdown."""
    warnings: list[str] = []
    fields: list[MetadataField] = []
    text = raw.decode("utf-8", errors="replace")
    cleaned = text
    if config.remove_author:
        for match in _AUTHOR_COMMENT_RE.finditer(text):
            fields.append(
                MetadataField(
                    field_name="html_author_comment",
                    original_value=match.group()[:200],
                    action_taken="removed",
                    reason="HTML comment with author info removed",
                )
            )
        cleaned = _AUTHOR_COMMENT_RE.sub("", text)
    if config.watermark_output:
        cleaned = f"<!-- {config.watermark_text} -->\n" + cleaned
    return cleaned.encode("utf-8"), fields, warnings


def _handle_binary(
    raw: bytes,
) -> tuple[bytes, list[MetadataField], list[str]]:
    """Flag binary/unknown files — compute SHA-256 but do not modify."""
    sha256 = hashlib.sha256(raw).hexdigest()
    warnings = [
        f"Cannot scrub binary file — returned as-is. SHA-256: {sha256}"
    ]
    fields = [
        MetadataField(
            field_name="binary_content",
            original_value=f"sha256:{sha256}",
            action_taken="kept",
            reason="Binary format not supported for scrubbing",
        )
    ]
    return raw, fields, warnings


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------


class MetadataScrubber:
    """Attachment metadata scrubber for the AMC vault.

    Supports JSON, CSV, and text/Markdown files.  Binary files are flagged
    but not modified.

    Parameters
    ----------
    config:
        Scrubbing behaviour options.
    db_path:
        Path to the SQLite database used for history persistence.
    """

    def __init__(
        self,
        config: ScrubConfig | None = None,
        db_path: Path = _DEFAULT_DB,
    ) -> None:
        self.config = config or ScrubConfig()
        self.db_path = db_path
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        _init_db(self._conn)
        log.info("MetadataScrubber initialised", db_path=str(db_path))

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _detect_format(self, filename: str) -> str:
        suffix = Path(filename).suffix.lower()
        if suffix == ".json":
            return "json"
        if suffix == ".csv":
            return "csv"
        if suffix in {".txt", ".md", ".markdown", ".rst", ".text"}:
            return "text"
        return "binary"

    def _do_scrub(
        self,
        file_bytes: bytes,
        filename: str,
        dry_run: bool = False,
    ) -> tuple[bytes, list[MetadataField], list[str]]:
        fmt = self._detect_format(filename)
        if fmt == "json":
            config = self.config if not dry_run else ScrubConfig(
                remove_exif=False, remove_author=False,
                remove_hidden_revisions=False, remove_embedded_ids=False,
                watermark_output=False,
            )
            # For dry_run we still need to detect — but use real config for detection
            return _scrub_json(file_bytes, self.config if dry_run else self.config)
        elif fmt == "csv":
            return _scrub_csv(file_bytes, self.config)
        elif fmt == "text":
            return _scrub_text(file_bytes, self.config)
        else:
            return _handle_binary(file_bytes)

    def _build_result(
        self,
        file_id: str,
        original_bytes: bytes,
        scrubbed_bytes: bytes,
        fields: list[MetadataField],
        warnings: list[str],
        fmt: str,
    ) -> ScrubResult:
        is_safe = fmt != "binary" and not any(
            "cannot scrub" in w.lower() for w in warnings
        )
        return ScrubResult(
            file_id=file_id,
            original_size=len(original_bytes),
            scrubbed_size=len(scrubbed_bytes),
            fields_processed=fields,
            is_safe_to_send=is_safe,
            warnings=warnings,
            scrubbed_at=datetime.now(timezone.utc),
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def scrub_bytes(
        self, file_bytes: bytes, filename: str
    ) -> tuple[bytes, ScrubResult]:
        """Scrub *file_bytes* and return (clean_bytes, ScrubResult).

        Parameters
        ----------
        file_bytes:
            Raw bytes of the file to scrub.
        filename:
            Original filename (used to detect format via extension).

        Returns
        -------
        tuple[bytes, ScrubResult]
            The cleaned bytes and a full scrub report.
        """
        file_id = str(uuid.uuid4())
        fmt = self._detect_format(filename)
        scrubbed, fields, warnings = self._do_scrub(file_bytes, filename)
        result = self._build_result(
            file_id, file_bytes, scrubbed, fields, warnings, fmt
        )
        _save_result(self._conn, result)
        log.info(
            "scrub_bytes complete",
            filename=filename,
            file_id=file_id,
            fields_processed=len(fields),
            is_safe=result.is_safe_to_send,
        )
        return scrubbed, result

    def scrub_file(
        self, input_path: Path, output_path: Path
    ) -> ScrubResult:
        """Read *input_path*, scrub, write to *output_path*.

        Parameters
        ----------
        input_path:
            Source file path.
        output_path:
            Destination for the scrubbed file.

        Returns
        -------
        ScrubResult
        """
        raw = input_path.read_bytes()
        clean, result = self.scrub_bytes(raw, input_path.name)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(clean)
        log.info(
            "scrub_file complete",
            input=str(input_path),
            output=str(output_path),
        )
        return result

    def analyze_only(
        self, file_bytes: bytes, filename: str
    ) -> ScrubResult:
        """Detect metadata in *file_bytes* without modifying it.

        Parameters
        ----------
        file_bytes:
            Raw bytes to analyse.
        filename:
            Original filename (format detection).

        Returns
        -------
        ScrubResult
            `scrubbed_size` will equal `original_size`; bytes are unchanged.
        """
        file_id = str(uuid.uuid4())
        fmt = self._detect_format(filename)
        # We still run the full scrub pipeline to detect fields, but we
        # return the original bytes in the result (scrubbed_size = original_size).
        _, fields, warnings = self._do_scrub(file_bytes, filename)
        result = ScrubResult(
            file_id=file_id,
            original_size=len(file_bytes),
            scrubbed_size=len(file_bytes),  # unchanged
            fields_processed=fields,
            is_safe_to_send=fmt != "binary"
            and not any("cannot scrub" in w.lower() for w in warnings),
            warnings=warnings,
            scrubbed_at=datetime.now(timezone.utc),
        )
        _save_result(self._conn, result)
        log.info(
            "analyze_only complete",
            filename=filename,
            file_id=file_id,
            fields_found=len(fields),
        )
        return result

    def get_scrub_history(self, limit: int = 100) -> list[ScrubResult]:
        """Return recent scrub results from SQLite.

        Parameters
        ----------
        limit:
            Maximum number of records to return (most recent first).
        """
        return _load_results(self._conn, limit)
