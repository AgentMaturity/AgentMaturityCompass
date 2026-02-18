"""W6 Output Attestation

Attests tool outputs with tamper-evident signatures so downstream consumers can
verify that a report / artifact was produced by the intended module and has not
been altered after generation.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Iterable

import structlog

from amc.core.models import ActionReceipt

log = structlog.get_logger(__name__)


class AttestationStatus(str, Enum):
    """Verification status for a recorded output."""

    VALID = "valid"
    INVALID = "invalid"
    MISSING = "missing"


@dataclass
class OutputAttestation:
    """A signed attestation record for a single tool output."""

    attestation_id: str
    receipt_id: str
    session_id: str
    tool_name: str
    output_hash: str
    output_summary: str
    signature: str
    timestamp: str


class OutputAttestationError(Exception):
    """Raised when the attestation store cannot be updated."""


class OutputAttestor:
    """Create and verify cryptographically signed output attestations."""

    def __init__(
        self,
        hmac_key: str = "amc-output-attestation",
        db_path: str = ":memory:",
    ) -> None:
        self._key = hmac_key.encode()
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._init_db()
        if db_path == ":memory:":
            self._db.execute("PRAGMA journal_mode=MEMORY")
        log.info("output_attestor.init", db_path=db_path)

    def _init_db(self) -> None:
        cur = self._db.cursor()
        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS output_attestations (
                attestation_id TEXT PRIMARY KEY,
                receipt_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                output_hash TEXT NOT NULL,
                output_summary TEXT NOT NULL,
                signature TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_attestation_receipt
                ON output_attestations(receipt_id);
            """
        )
        self._db.commit()

    @staticmethod
    def _serialize_output(output: Any) -> str:
        """Serialize any output to a stable canonical string."""
        if isinstance(output, (dict, list)):
            return json.dumps(output, sort_keys=True, separators=(",", ":"))
        if output is None:
            return "null"
        return str(output)

    def _sign(self, payload: str) -> str:
        return hmac.new(self._key, payload.encode(), hashlib.sha256).hexdigest()

    def _shorten(self, text: str, max_len: int = 240) -> str:
        return text if len(text) <= max_len else text[:max_len] + "..."

    def attestate(
        self,
        output: Any,
        receipt: ActionReceipt,
        output_summary: str = "",
        attestation_id: str = "",
    ) -> OutputAttestation:
        """Create an attestation for an output tied to an action receipt."""
        output_payload = self._serialize_output(output)
        summary = self._shorten(output_summary or output_payload[:120])
        digest = hashlib.sha256(output_payload.encode()).hexdigest()
        ts = datetime.now(timezone.utc).isoformat()
        sig_payload = f"{receipt.receipt_id}|{receipt.session_id}|{receipt.tool_name}|{digest}|{ts}|{summary}"
        signature = self._sign(sig_payload)
        record = OutputAttestation(
            attestation_id=attestation_id or f"att-{hashlib.sha256(sig_payload.encode()).hexdigest()[:16]}",
            receipt_id=receipt.receipt_id,
            session_id=receipt.session_id,
            tool_name=receipt.tool_name,
            output_hash=digest,
            output_summary=summary,
            signature=signature,
            timestamp=ts,
        )
        cur = self._db.cursor()
        cur.execute(
            """
            INSERT OR REPLACE INTO output_attestations
            (attestation_id, receipt_id, session_id, tool_name, output_hash, output_summary, signature, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record.attestation_id,
                record.receipt_id,
                record.session_id,
                record.tool_name,
                record.output_hash,
                record.output_summary,
                record.signature,
                record.timestamp,
            ),
        )
        self._db.commit()
        log.info("output_attestor.recorded", attestation_id=record.attestation_id)
        return record

    def list_by_receipt(self, receipt_id: str) -> list[OutputAttestation]:
        rows = self._db.execute(
            "SELECT attestation_id, receipt_id, session_id, tool_name, output_hash, output_summary, signature, timestamp "
            "FROM output_attestations WHERE receipt_id = ? ORDER BY timestamp DESC",
            (receipt_id,),
        ).fetchall()
        return [OutputAttestation(*row) for row in rows]

    def verify(
        self,
        record: OutputAttestation,
        output: Any,
        *,
        expected_tool_name: str | None = None,
    ) -> AttestationStatus:
        """Verify signature and hash for a recorded attestation."""
        cur = self._db.execute(
            "SELECT receipt_id, session_id, tool_name, output_hash, output_summary, signature, timestamp "
            "FROM output_attestations WHERE attestation_id = ?",
            (record.attestation_id,),
        ).fetchone()
        if not cur:
            return AttestationStatus.MISSING

        expected_sig_payload = f"{cur[0]}|{cur[1]}|{cur[2]}|{cur[3]}|{cur[6]}|{cur[4]}"
        expected_sig = self._sign(expected_sig_payload)
        if not hmac.compare_digest(expected_sig, cur[5]):
            return AttestationStatus.INVALID

        if expected_tool_name is not None and expected_tool_name != record.tool_name:
            return AttestationStatus.INVALID

        if hashlib.sha256(self._serialize_output(output).encode()).hexdigest() != cur[3]:
            return AttestationStatus.INVALID

        return AttestationStatus.VALID

    def verify_many(
        self,
        attestations: Iterable[OutputAttestation],
        output_lookup: dict[str, Any],
    ) -> dict[str, AttestationStatus]:
        """Verify multiple attestations using an output_lookup map."""
        return {
            a.attestation_id: self.verify(a, output_lookup.get(a.attestation_id))
            for a in attestations
            if a.attestation_id
        }
