"""
AMC Shield — S13: Download Quarantine + Safe-Open Pipeline
===============================================================================

Purpose
-------
Any file downloaded by an agent is quarantined, scanned for threats, and
converted to a safe format before being passed onward.  This prevents malicious
content embedded in downloads from executing in the agent's context.

Pipeline:
    1. ``quarantine_file`` — save bytes, compute SHA-256, mark status=pending.
    2. ``scan_file``       — check extension, size, magic bytes, threat patterns.
    3. ``extract_safe_text`` — return plain-text for text files; redacted stub
                               for binaries.
    4. ``release_file``   — copy to release dir only if status=safe.

Usage
-----

.. code-block:: python

    from pathlib import Path
    from amc.shield.s13_download_quarantine import DownloadQuarantine, QuarantineConfig

    config = QuarantineConfig(quarantine_dir=Path("/tmp/quarantine"))
    q = DownloadQuarantine(config=config, db_path="/tmp/quarantine.db")

    with open("report.txt", "rb") as f:
        data = f.read()

    qfile = q.quarantine_file(data, "report.txt")
    result = q.scan_file(qfile.file_id)
    if result.is_safe:
        text = q.extract_safe_text(qfile.file_id)
        released = q.release_file(qfile.file_id)
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class QuarantineConfig(BaseModel):
    """Configuration for the download quarantine pipeline.

    Attributes
    ----------
    quarantine_dir:
        Directory where quarantined files are stored.
    allowed_extensions:
        Extensions permitted after scanning.
    max_file_size_mb:
        Maximum allowed file size in megabytes.
    auto_convert_to_text:
        When True, text-based files are returned as plain text during release.
    """

    quarantine_dir: Path
    allowed_extensions: list[str] = Field(
        default_factory=lambda: [".pdf", ".txt", ".csv", ".json", ".png", ".jpg"]
    )
    max_file_size_mb: int = 50
    auto_convert_to_text: bool = True


class QuarantinedFile(BaseModel):
    """Metadata record for a quarantined file.

    Attributes
    ----------
    file_id:
        Unique file identifier (UUID).
    original_name:
        Original filename as reported by the downloader.
    original_extension:
        Lowercase extension extracted from *original_name*.
    file_size:
        Size in bytes.
    sha256_hash:
        Hex-encoded SHA-256 of the raw bytes.
    quarantined_at:
        Timestamp of quarantine entry.
    scan_status:
        Lifecycle status of the file.
    safe_text_path:
        Path to the extracted safe-text version, if created.
    """

    file_id: str
    original_name: str
    original_extension: str
    file_size: int
    sha256_hash: str
    quarantined_at: datetime
    scan_status: Literal["pending", "safe", "suspicious", "blocked"]
    safe_text_path: str | None = None


class ScanResult(BaseModel):
    """Result of a file scan.

    Attributes
    ----------
    file_id:
        File being reported on.
    threats_found:
        List of threat descriptions discovered.
    is_safe:
        True only when no threats were found.
    scan_notes:
        Narrative explanation of the scan outcome.
    scanned_at:
        Timestamp of the scan.
    """

    file_id: str
    threats_found: list[str] = Field(default_factory=list)
    is_safe: bool
    scan_notes: str
    scanned_at: datetime


# ---------------------------------------------------------------------------
# Threat detection constants
# ---------------------------------------------------------------------------

# Magic bytes for common executable/dangerous formats
_MAGIC_SIGNATURES: list[tuple[bytes, str]] = [
    (b"MZ", "Windows PE executable (MZ header)"),
    (b"\x7fELF", "ELF executable"),
    (b"\xca\xfe\xba\xbe", "Mach-O fat binary"),
    (b"\xfe\xed\xfa\xce", "Mach-O 32-bit binary"),
    (b"\xfe\xed\xfa\xcf", "Mach-O 64-bit binary"),
    (b"PK\x03\x04", "ZIP/JAR archive (could contain executables)"),
    (b"\x1f\x8b", "GZIP compressed archive"),
    (b"#!/", "Shell script shebang"),
    (b"#!", "Script shebang"),
    (b"%PDF", "PDF (valid — checked separately)"),
]

# Text-based extensions that can be safely extracted
_TEXT_EXTENSIONS = {".txt", ".csv", ".json", ".xml", ".yaml", ".yml", ".md", ".log"}

# Potentially dangerous content patterns in text files (basic check)
_THREAT_PATTERNS: list[tuple[bytes, str]] = [
    (b"<script", "Embedded JavaScript/HTML script tag"),
    (b"javascript:", "JavaScript URI"),
    (b"vbscript:", "VBScript URI"),
    (b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE", "EICAR test virus signature"),
    (b"eval(base64_decode", "PHP obfuscated eval pattern"),
    (b"exec(base64", "Base64-encoded exec pattern"),
    (b"powershell -enc", "Encoded PowerShell command"),
    (b"powershell -e ", "Encoded PowerShell shorthand"),
    (b"cmd.exe /c", "Windows command injection pattern"),
    (b"os.system(", "Python os.system shell execution"),
    (b"subprocess.call(", "Python subprocess call"),
    (b"__import__('os')", "Python import injection"),
]

# ---------------------------------------------------------------------------
# SQL schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS quarantined_files (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id            TEXT NOT NULL UNIQUE,
    original_name      TEXT NOT NULL,
    original_extension TEXT NOT NULL,
    file_size          INTEGER NOT NULL,
    sha256_hash        TEXT NOT NULL,
    quarantined_at     TEXT NOT NULL,
    scan_status        TEXT NOT NULL DEFAULT 'pending',
    safe_text_path     TEXT
);

CREATE TABLE IF NOT EXISTS scan_results (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id        TEXT NOT NULL,
    threats_found  TEXT NOT NULL,
    is_safe        INTEGER NOT NULL,
    scan_notes     TEXT NOT NULL,
    scanned_at     TEXT NOT NULL,
    FOREIGN KEY(file_id) REFERENCES quarantined_files(file_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_qf_status ON quarantined_files(scan_status);
CREATE INDEX IF NOT EXISTS idx_scan_file ON scan_results(file_id);
"""


class DownloadQuarantine:
    """Quarantine, scan, and release pipeline for downloaded files.

    Parameters
    ----------
    config:
        Quarantine configuration.
    db_path:
        SQLite database path.
    """

    def __init__(
        self,
        config: QuarantineConfig | None = None,
        *,
        db_path: str | Path = "/tmp/amc_quarantine.db",
    ) -> None:
        self.config = config or QuarantineConfig(quarantine_dir=Path("/tmp/amc_quarantine"))
        self.db_path = Path(db_path)
        self.quarantine_dir = self.config.quarantine_dir
        self.release_dir = self.quarantine_dir / "released"

        self.quarantine_dir.mkdir(parents=True, exist_ok=True)
        self.release_dir.mkdir(parents=True, exist_ok=True)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        self._init_schema()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def quarantine_file(self, file_bytes: bytes, filename: str) -> QuarantinedFile:
        """Save *file_bytes* to the quarantine directory and create a DB record.

        Parameters
        ----------
        file_bytes:
            Raw file content.
        filename:
            Original filename (used for extension and display).

        Returns
        -------
        QuarantinedFile:
            Metadata record with ``scan_status="pending"``.
        """
        file_id = str(uuid.uuid4())
        suffix = Path(filename).suffix.lower() or ".bin"
        sha256 = hashlib.sha256(file_bytes).hexdigest()
        now = datetime.now(timezone.utc)
        size = len(file_bytes)

        dest = self.quarantine_dir / f"{file_id}{suffix}"
        dest.write_bytes(file_bytes)

        record = QuarantinedFile(
            file_id=file_id,
            original_name=filename,
            original_extension=suffix,
            file_size=size,
            sha256_hash=sha256,
            quarantined_at=now,
            scan_status="pending",
            safe_text_path=None,
        )
        self._persist_file(record)
        log.info(
            "quarantine.received",
            file_id=file_id,
            filename=filename,
            size=size,
            sha256=sha256[:16] + "…",
        )
        return record

    def scan_file(self, file_id: str) -> ScanResult:
        """Scan a quarantined file and update its DB status.

        Checks (in order):
        1. Extension allowlist.
        2. File size limit.
        3. Magic bytes (executable detection).
        4. Text-based threat patterns.

        Returns
        -------
        ScanResult:
            Full scan report.  ``is_safe=True`` only when no threats found.
        """
        now = datetime.now(timezone.utc)
        record = self._load_file(file_id)
        if record is None:
            result = ScanResult(
                file_id=file_id,
                threats_found=["File not found in quarantine database"],
                is_safe=False,
                scan_notes="File record missing — cannot scan.",
                scanned_at=now,
            )
            return result

        threats: list[str] = []
        notes: list[str] = []

        # Check 1: extension allowlist
        if record.original_extension not in self.config.allowed_extensions:
            threats.append(
                f"Extension '{record.original_extension}' not in allowlist."
            )
            notes.append("Extension blocked.")

        # Check 2: size limit
        max_bytes = self.config.max_file_size_mb * 1024 * 1024
        if record.file_size > max_bytes:
            threats.append(
                f"File size {record.file_size} bytes exceeds limit "
                f"{max_bytes} bytes ({self.config.max_file_size_mb} MB)."
            )
            notes.append("Size limit exceeded.")

        # Load file bytes for deep inspection
        file_path = self.quarantine_dir / f"{file_id}{record.original_extension}"
        if file_path.exists():
            raw = file_path.read_bytes()

            # Check 3: magic bytes
            for magic, label in _MAGIC_SIGNATURES:
                if magic == b"%PDF":
                    continue  # PDF allowed, handled by extension allowlist
                if raw.startswith(magic):
                    threats.append(f"Suspicious magic bytes detected: {label}.")
                    notes.append(f"Magic: {label}")
                    break

            # Check 4: threat patterns in content
            lower_raw = raw[:65536]  # scan only first 64 KB for performance
            for pattern, label in _THREAT_PATTERNS:
                if pattern.lower() in lower_raw.lower():
                    threats.append(f"Threat pattern found: {label}.")
                    notes.append(f"Pattern: {label}")
        else:
            threats.append("Quarantine file missing from disk.")
            notes.append("File not found on disk.")

        is_safe = len(threats) == 0
        new_status: Literal["pending", "safe", "suspicious", "blocked"]
        if is_safe:
            new_status = "safe"
        elif any(
            "size" in t.lower() or "extension" in t.lower() or "magic" in t.lower()
            for t in threats
        ):
            new_status = "blocked"
        else:
            new_status = "suspicious"

        scan_notes = "; ".join(notes) if notes else "No threats found."
        result = ScanResult(
            file_id=file_id,
            threats_found=threats,
            is_safe=is_safe,
            scan_notes=scan_notes,
            scanned_at=now,
        )
        self._persist_scan(result, new_status)
        log.info(
            "quarantine.scanned",
            file_id=file_id,
            safe=is_safe,
            threats=len(threats),
            status=new_status,
        )
        return result

    def extract_safe_text(self, file_id: str) -> str | None:
        """Return a safe text representation of a quarantined file.

        For text-based files (txt, csv, json, xml…) returns decoded content.
        For binary/image files returns ``"[BINARY FILE: sha256=…]"``.
        Returns ``None`` if the file record is not found.
        """
        record = self._load_file(file_id)
        if record is None:
            return None

        file_path = self.quarantine_dir / f"{file_id}{record.original_extension}"
        if not file_path.exists():
            return f"[MISSING FILE: sha256={record.sha256_hash}]"

        if record.original_extension in _TEXT_EXTENSIONS:
            try:
                return file_path.read_text(encoding="utf-8", errors="replace")
            except Exception as exc:  # pragma: no cover
                log.warning("quarantine.text_extract_error", file_id=file_id, error=str(exc))
                return f"[EXTRACT ERROR: sha256={record.sha256_hash}]"
        else:
            return f"[BINARY FILE: sha256={record.sha256_hash}]"

    def release_file(self, file_id: str) -> Path | None:
        """Copy a safe file to the release directory and return its path.

        Returns ``None`` if the file is not in ``safe`` status.
        """
        record = self._load_file(file_id)
        if record is None or record.scan_status != "safe":
            log.warning(
                "quarantine.release_blocked",
                file_id=file_id,
                status=record.scan_status if record else "not_found",
            )
            return None

        src = self.quarantine_dir / f"{file_id}{record.original_extension}"
        if not src.exists():
            return None

        dest = self.release_dir / f"{file_id}{record.original_extension}"
        shutil.copy2(src, dest)
        log.info("quarantine.released", file_id=file_id, dest=str(dest))
        return dest

    def get_quarantine_stats(self) -> dict[str, Any]:
        """Return counts of files by scan_status."""
        with self._tx() as cur:
            rows = cur.execute(
                "SELECT scan_status, COUNT(*) FROM quarantined_files GROUP BY scan_status"
            ).fetchall()
        stats: dict[str, int] = {
            "pending": 0,
            "safe": 0,
            "suspicious": 0,
            "blocked": 0,
        }
        for row in rows:
            stats[row[0]] = row[1]
        return stats

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    @contextmanager
    def _tx(self):
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("PRAGMA foreign_keys = ON")
            cur = conn.cursor()
            yield cur
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._tx() as cur:
            cur.executescript(_SCHEMA)

    def _persist_file(self, record: QuarantinedFile) -> None:
        with self._tx() as cur:
            cur.execute(
                """
                INSERT OR REPLACE INTO quarantined_files
                (file_id, original_name, original_extension, file_size,
                 sha256_hash, quarantined_at, scan_status, safe_text_path)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.file_id,
                    record.original_name,
                    record.original_extension,
                    record.file_size,
                    record.sha256_hash,
                    record.quarantined_at.isoformat(),
                    record.scan_status,
                    record.safe_text_path,
                ),
            )

    def _persist_scan(
        self,
        result: ScanResult,
        new_status: Literal["pending", "safe", "suspicious", "blocked"],
    ) -> None:
        with self._tx() as cur:
            cur.execute(
                """
                INSERT INTO scan_results
                (file_id, threats_found, is_safe, scan_notes, scanned_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    result.file_id,
                    json.dumps(result.threats_found),
                    int(result.is_safe),
                    result.scan_notes,
                    result.scanned_at.isoformat(),
                ),
            )
            cur.execute(
                "UPDATE quarantined_files SET scan_status = ? WHERE file_id = ?",
                (new_status, result.file_id),
            )

    def _load_file(self, file_id: str) -> QuarantinedFile | None:
        with self._tx() as cur:
            row = cur.execute(
                """
                SELECT file_id, original_name, original_extension, file_size,
                       sha256_hash, quarantined_at, scan_status, safe_text_path
                FROM quarantined_files WHERE file_id = ?
                """,
                (file_id,),
            ).fetchone()
        if not row:
            return None
        return QuarantinedFile(
            file_id=row[0],
            original_name=row[1],
            original_extension=row[2],
            file_size=row[3],
            sha256_hash=row[4],
            quarantined_at=datetime.fromisoformat(row[5]),
            scan_status=row[6],
            safe_text_path=row[7],
        )
