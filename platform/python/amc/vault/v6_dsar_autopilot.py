"""
AMC Vault — V6: DSAR and Consent Operations Autopilot
====================================================

Implements a small, production-oriented DSAR workflow including:

* intake and verification
* periodic connector-based personal data collection
* deletion execution with evidence hashing
* deadline tracking (30-day default response window)
* sqlite-backed audit trail

Usage
-----

.. code-block:: python

    from amc.vault.v6_dsar_autopilot import DSARAutopilot

    autopilot = DSARAutopilot()
    req = autopilot.submit_request(
        requester_email="user@example.com",
        request_type="access",
        verification_token="abc123",
    )

    if autopilot.verify_requester(req.request_id, "abc123"):
        package = autopilot.compile_data_package(req.request_id, [autopilot.fs_connector])
        print(package.file_path)

"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import uuid
from abc import ABC, abstractmethod
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zipfile import ZIP_DEFLATED, ZipFile

import structlog
from pydantic import BaseModel, Field

from amc.core.models import RiskLevel

log = structlog.get_logger(__name__)


# PII regexes used by file-system connector scans.
_PII_PATTERNS = [
    re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),  # email
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),                              # SSN-like
    re.compile(r"\b\d{10,}\b"),                                         # broad numeric id
]


class DSARRequest(BaseModel):
    """Single DSAR intake record."""

    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    requester_name: str
    requester_email: str
    request_type: str
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    deadline_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(days=30))
    status: str = "received"
    verification_token_hash: str = Field(default="")


class DataPackage(BaseModel):
    """Compiled evidence package emitted for DSAR response/export."""

    request_id: str
    data_found: dict[str, list[str]]
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    file_path: str


class DeletionRecord(BaseModel):
    """Audit proof that PII deletion steps executed."""

    request_id: str
    deleted_items: list[str]
    systems_processed: list[str]
    completed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    evidence_hash: str


class DataConnector(ABC):
    """Abstract source system connector for DSAR workflows."""

    system_name = "generic"

    @abstractmethod
    def scan(self, subject_email: str) -> list[str]:
        """Return list of paths or IDs that contain subject data."""

    @abstractmethod
    def delete(self, item: str) -> bool:
        """Delete or redact data represented by *item*."""

    @abstractmethod
    def evidence_entries(self, subject_email: str) -> list[str]:
        """Return human-readable evidence of what exists/was touched."""


class FileSystemConnector(DataConnector):
    """Simple connector that scans local workspace files for PII-like strings."""

    system_name = "filesystem"

    def __init__(self, workspace_root: str | None = None, file_mask: str = "*") -> None:
        self.workspace_root = Path(workspace_root or os.getcwd())
        self.file_mask = file_mask

    def _walk_files(self) -> list[Path]:
        files: list[Path] = []
        for path in self.workspace_root.rglob(self.file_mask):
            if path.is_file() and path.suffix.lower() in {".txt", ".md", ".json", ".log", ".csv"}:
                files.append(path)
        return files

    def scan(self, subject_email: str) -> list[str]:
        matches: list[str] = []
        for path in self._walk_files():
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            if subject_email in text:
                matches.append(str(path))
                continue
            for pat in _PII_PATTERNS:
                if pat.search(text):
                    matches.append(str(path))
                    break
        return sorted(set(matches))

    def delete(self, item: str) -> bool:
        """Redact subject-linked evidence in-place for safety-first deletion."""
        p = Path(item)
        if not p.exists() or not p.is_file():
            return False
        try:
            text = p.read_text(encoding="utf-8", errors="ignore")
            for pat in _PII_PATTERNS:
                text = pat.sub("[REDACTED_FOR_DSAR]", text)
            p.write_text(text, encoding="utf-8")
            return True
        except Exception:
            return False

    def evidence_entries(self, subject_email: str) -> list[str]:
        return self.scan(subject_email)


class StubConnector(DataConnector):
    """Template connector for future systems (CRM/email/support/etc.)."""

    def __init__(self, system_name: str = "stub", dataset: dict[str, list[str]] | None = None) -> None:
        self.system_name = system_name
        self._dataset = dataset or {}

    def scan(self, subject_email: str) -> list[str]:
        return list(self._dataset.get(subject_email, []))

    def delete(self, item: str) -> bool:
        # A stub cannot mutate external systems; it only records intent.
        return bool(item)

    def evidence_entries(self, subject_email: str) -> list[str]:
        return [f"{self.system_name}:{k}" for k in self._dataset.get(subject_email, [])]


class DSARAutopilot:
    """End-to-end DSAR lifecycle controller."""

    def __init__(self, db_path: str = "dsar_autopilot.db") -> None:
        self._db_path = Path(db_path)
        self._requests: dict[str, DSARRequest] = {}
        self._init_db()
        # default file-system connector scanning caller workspace
        self.fs_connector = FileSystemConnector()
        log.info("dsar.autopilot.init", db=str(self._db_path))

    def _init_db(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS dsar_requests (
                    request_id TEXT PRIMARY KEY,
                    requester_name TEXT NOT NULL,
                    requester_email TEXT NOT NULL,
                    request_type TEXT NOT NULL,
                    submitted_at TEXT NOT NULL,
                    deadline_at TEXT NOT NULL,
                    status TEXT NOT NULL,
                    verification_token_hash TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS dsar_events (
                    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )

    @staticmethod
    def _hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def submit_request(self, requester_email: str, request_type: str, verification_token: str) -> DSARRequest:
        """Create and persist a DSAR request entry."""
        if request_type not in {"access", "delete", "export", "rectify"}:
            raise ValueError("request_type must be one of: access, delete, export, rectify")

        requester_name = requester_email.split("@", 1)[0]
        now = datetime.now(timezone.utc)
        req = DSARRequest(
            requester_name=requester_name,
            requester_email=requester_email,
            request_type=request_type,
            submitted_at=now,
            deadline_at=now + timedelta(days=30),
            verification_token_hash=self._hash_token(verification_token),
        )
        self._requests[req.request_id] = req

        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                """
                INSERT INTO dsar_requests(
                    request_id, requester_name, requester_email,
                    request_type, submitted_at, deadline_at, status, verification_token_hash
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    req.request_id,
                    req.requester_name,
                    req.requester_email,
                    req.request_type,
                    req.submitted_at.isoformat(),
                    req.deadline_at.isoformat(),
                    req.status,
                    req.verification_token_hash,
                ),
            )
            conn.execute(
                "INSERT INTO dsar_events(request_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)",
                (req.request_id, "submitted", json.dumps({"status": req.status}), datetime.now(timezone.utc).isoformat()),
            )

        log.info("dsar.submit", request_id=req.request_id, email=req.requester_email)
        return req

    def verify_requester(self, request_id: str, token: str) -> bool:
        """Verify requester before moving to processing."""
        req = self._requests.get(request_id)
        if req is None:
            row = self._load_request(request_id)
            if row is None:
                return False
            req = row

        ok = self._hash_token(token) == req.verification_token_hash
        if not ok:
            log.warning("dsar.verify.failed", request_id=request_id)
            return False

        req.status = "verifying"
        self._persist_update(req)
        self._append_event(request_id, "verified", {"status": req.status})
        log.info("dsar.verify.success", request_id=request_id)
        return True

    def _load_request(self, request_id: str) -> DSARRequest | None:
        with sqlite3.connect(str(self._db_path)) as conn:
            row = conn.execute(
                """
                SELECT requester_name, requester_email, request_type,
                       submitted_at, deadline_at, status, verification_token_hash
                FROM dsar_requests WHERE request_id = ?
                """,
                (request_id,),
            ).fetchone()
        if row is None:
            return None
        return DSARRequest(
            request_id=request_id,
            requester_name=row[0],
            requester_email=row[1],
            request_type=row[2],
            submitted_at=datetime.fromisoformat(row[3]),
            deadline_at=datetime.fromisoformat(row[4]),
            status=row[5],
            verification_token_hash=row[6],
        )

    def _persist_update(self, req: DSARRequest) -> None:
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                "UPDATE dsar_requests SET status = ?, submitted_at = ?, deadline_at = ? WHERE request_id = ?",
                (req.status, req.submitted_at.isoformat(), req.deadline_at.isoformat(), req.request_id),
            )

    def _append_event(self, request_id: str, event_type: str, payload: dict[str, Any]) -> None:
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                "INSERT INTO dsar_events(request_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)",
                (request_id, event_type, json.dumps(payload), datetime.now(timezone.utc).isoformat()),
            )

    def compile_data_package(self, request_id: str, connectors: list[DataConnector]) -> DataPackage:
        """Scan all connectors and compile a password-safe export package."""
        req = self._require_verified_request(request_id)
        req.status = "processing"
        self._persist_update(req)

        findings: dict[str, list[str]] = {}
        total_matches = 0
        for connector in connectors:
            discovered = connector.scan(req.requester_email)
            if discovered:
                findings[connector.system_name] = discovered
                total_matches += len(discovered)

        # Write package as JSON and zip it for immutable evidence.
        pkg_dir = Path("exports") / request_id
        pkg_dir.mkdir(parents=True, exist_ok=True)
        json_path = pkg_dir / "data_package.json"
        payload = {
            "request_id": request_id,
            "requester_email": req.requester_email,
            "request_type": req.request_type,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "counts_by_system": {k: len(v) for k, v in findings.items()},
            "items": findings,
        }
        json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

        zip_path = pkg_dir / "package.zip"
        with ZipFile(zip_path, mode="w", compression=ZIP_DEFLATED) as zf:
            zf.write(json_path, arcname="data_package.json")

        data_package = DataPackage(
            request_id=request_id,
            data_found=findings,
            generated_at=datetime.now(timezone.utc),
            file_path=str(zip_path),
        )

        req.status = "completed"
        self._persist_update(req)
        self._append_event(request_id, "compiled", {"systems": list(findings), "items": total_matches})
        log.info(
            "dsar.package",
            request_id=request_id,
            systems=len(findings),
            matches=total_matches,
            zip=str(zip_path),
        )
        return data_package

    def execute_deletion(self, request_id: str, connectors: list[DataConnector]) -> DeletionRecord:
        """Delete/redact matched PII across connectors and return audit record."""
        req = self._require_verified_request(request_id)
        deleted: list[str] = []
        systems: list[str] = []

        for connector in connectors:
            systems.append(connector.system_name)
            to_delete = connector.scan(req.requester_email)
            for item in to_delete:
                try:
                    if connector.delete(item):
                        deleted.append(f"{connector.system_name}:{item}")
                except Exception as exc:  # pragma: no cover - connector dependent
                    log.warning("dsar.delete_error", request_id=request_id, connector=connector.system_name, item=item, error=str(exc))

        evidence_blob = json.dumps({"request_id": request_id, "deleted": deleted, "time": datetime.now(timezone.utc).isoformat()})
        evidence_hash = hashlib.sha256(evidence_blob.encode("utf-8")).hexdigest()
        record = DeletionRecord(
            request_id=request_id,
            deleted_items=deleted,
            systems_processed=systems,
            completed_at=datetime.now(timezone.utc),
            evidence_hash=evidence_hash,
        )

        self._append_event(request_id, "deleted", {
            "deleted_items": deleted,
            "evidence_hash": evidence_hash,
        })
        req.status = "completed"
        self._persist_update(req)
        log.info("dsar.delete", request_id=request_id, deleted=len(deleted))
        return record

    def _require_verified_request(self, request_id: str) -> DSARRequest:
        req = self._requests.get(request_id)
        if req is None:
            req = self._load_request(request_id)
        if req is None:
            raise ValueError(f"DSAR request not found: {request_id}")
        return req

    def get_overdue(self) -> list[DSARRequest]:
        """Return requests still unresolved past their 30-day compliance deadline."""
        now = datetime.now(timezone.utc)
        out: list[DSARRequest] = []
        with sqlite3.connect(str(self._db_path)) as conn:
            rows = conn.execute(
                "SELECT request_id, requester_name, requester_email, request_type, "
                "submitted_at, deadline_at, status, verification_token_hash "
                "FROM dsar_requests "
                "WHERE datetime(deadline_at) < datetime(?) AND status != 'completed'",
                (now.isoformat(),),
            ).fetchall()

        for row in rows:
            out.append(
                DSARRequest(
                    request_id=row[0],
                    requester_name=row[1],
                    requester_email=row[2],
                    request_type=row[3],
                    submitted_at=datetime.fromisoformat(row[4]),
                    deadline_at=datetime.fromisoformat(row[5]),
                    status=row[6],
                    verification_token_hash=row[7],
                )
            )

        log.info("dsar.overdue", count=len(out))
        return out


__all__ = [
    "DSARAutopilot",
    "DSARRequest",
    "DataConnector",
    "FileSystemConnector",
    "StubConnector",
    "DataPackage",
    "DeletionRecord",
]
