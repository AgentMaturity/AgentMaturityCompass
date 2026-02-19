"""
AMC Watch — W1: Signed Action Receipts Ledger
Tamper-evident, append-only audit trail for every agent action.

Usage:
    ledger = ReceiptsLedger(db_path="amc_receipts.db")
    await ledger.init()

    receipt = ActionReceipt(
        session_id="main",
        sender_id="+9163...",
        trust_level=SessionTrust.OWNER,
        tool_name="exec",
        tool_category=ToolCategory.EXEC,
        parameters_redacted={"command": "ls -la"},
        outcome_summary="Listed 12 files in workspace",
        policy_decision=PolicyDecision.ALLOW,
        policy_reasons=["exec allowed for owner in workspace scope"],
    )
    sealed = await ledger.append(receipt)
    print(sealed.receipt_hash)  # cryptographic proof
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterator

import aiosqlite
import structlog

from amc.core.models import ActionReceipt, PolicyDecision, RiskLevel, SessionTrust, ToolCategory

log = structlog.get_logger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS receipts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id    TEXT    NOT NULL UNIQUE,
    session_id    TEXT    NOT NULL,
    sender_id     TEXT    NOT NULL,
    trust_level   TEXT    NOT NULL,
    tool_name     TEXT    NOT NULL,
    tool_category TEXT    NOT NULL,
    policy_decision TEXT  NOT NULL,
    timestamp     TEXT    NOT NULL,
    prev_hash     TEXT    NOT NULL DEFAULT '',
    receipt_hash  TEXT    NOT NULL,
    payload_json  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session ON receipts(session_id);
CREATE INDEX IF NOT EXISTS idx_timestamp ON receipts(timestamp);
CREATE INDEX IF NOT EXISTS idx_tool ON receipts(tool_name);
CREATE INDEX IF NOT EXISTS idx_decision ON receipts(policy_decision);

CREATE TABLE IF NOT EXISTS chain_meta (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    last_hash     TEXT    NOT NULL DEFAULT '',
    total_count   INTEGER NOT NULL DEFAULT 0,
    last_updated  TEXT    NOT NULL
);

INSERT OR IGNORE INTO chain_meta (id, last_hash, total_count, last_updated)
    VALUES (1, '', 0, datetime('now'));
"""


class ChainIntegrityError(Exception):
    """Raised when the hash chain is broken (tamper detected)."""


class ReceiptsLedger:
    """
    Append-only, hash-chained SQLite ledger for agent action receipts.

    Properties:
    - Each receipt is SHA-256 hashed including the previous receipt's hash.
    - Tampering with any historical record breaks all subsequent hashes.
    - Supports SIEM export (JSON Lines format).
    - Supports integrity verification across entire chain.
    """

    def __init__(self, db_path: str | Path = "amc_receipts.db") -> None:
        self.db_path = Path(db_path)
        self._last_hash = ""

    async def init(self) -> None:
        """Initialize the database schema."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.executescript(SCHEMA)
            await db.commit()
            # Load last hash from chain_meta
            async with db.execute("SELECT last_hash FROM chain_meta WHERE id = 1") as cur:
                row = await cur.fetchone()
                if row:
                    self._last_hash = row[0]
        log.info("receipts_ledger.initialized", db_path=str(self.db_path))

    async def append(self, receipt: ActionReceipt) -> ActionReceipt:
        """Seal and append a receipt to the chain. Returns the sealed receipt."""
        sealed = receipt.seal(prev_hash=self._last_hash)
        payload = sealed.model_dump_json()

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                INSERT INTO receipts
                    (receipt_id, session_id, sender_id, trust_level, tool_name,
                     tool_category, policy_decision, timestamp, prev_hash, receipt_hash,
                     payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sealed.receipt_id,
                    sealed.session_id,
                    sealed.sender_id,
                    sealed.trust_level.value,
                    sealed.tool_name,
                    sealed.tool_category.value,
                    sealed.policy_decision.value,
                    sealed.timestamp.isoformat(),
                    sealed.prev_hash,
                    sealed.receipt_hash,
                    payload,
                ),
            )
            await db.execute(
                """
                UPDATE chain_meta
                SET last_hash = ?, total_count = total_count + 1, last_updated = ?
                WHERE id = 1
                """,
                (sealed.receipt_hash, datetime.now(timezone.utc).isoformat()),
            )
            await db.commit()

        self._last_hash = sealed.receipt_hash
        log.info(
            "receipt.appended",
            receipt_id=sealed.receipt_id,
            tool=sealed.tool_name,
            decision=sealed.policy_decision,
            hash=sealed.receipt_hash[:16] + "...",
        )
        return sealed

    async def verify_chain(self) -> tuple[bool, str]:
        """
        Walk the entire chain and verify hash integrity.
        Returns (ok: bool, message: str).
        """
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                "SELECT receipt_id, prev_hash, receipt_hash, payload_json FROM receipts ORDER BY id ASC"
            ) as cur:
                rows = await cur.fetchall()

        if not rows:
            return True, "Empty chain — OK"

        prev_hash = ""
        for i, (rid, stored_prev, stored_hash, payload_json) in enumerate(rows):
            if stored_prev != prev_hash:
                return False, f"Chain broken at receipt #{i+1} ({rid}): prev_hash mismatch"

            # Recompute hash by reconstructing the receipt and calling compute_hash()
            # This ensures we use the exact same serialisation as the original seal().
            receipt = ActionReceipt.model_validate_json(payload_json)
            expected = receipt.compute_hash()
            if expected != stored_hash:
                return False, f"Hash mismatch at receipt #{i+1} ({rid}): content tampered"

            prev_hash = stored_hash

        return True, f"Chain OK — {len(rows)} receipts verified"

    async def query(
        self,
        session_id: str | None = None,
        tool_name: str | None = None,
        decision: PolicyDecision | None = None,
        since: datetime | None = None,
        limit: int = 100,
    ) -> list[ActionReceipt]:
        """Search receipts by filter criteria."""
        clauses: list[str] = []
        params: list[str | int] = []

        if session_id:
            clauses.append("session_id = ?")
            params.append(session_id)
        if tool_name:
            clauses.append("tool_name = ?")
            params.append(tool_name)
        if decision:
            clauses.append("policy_decision = ?")
            params.append(decision.value)
        if since:
            clauses.append("timestamp >= ?")
            params.append(since.isoformat())

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)

        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                f"SELECT payload_json FROM receipts {where} ORDER BY id DESC LIMIT ?",
                params,
            ) as cur:
                rows = await cur.fetchall()

        return [ActionReceipt.model_validate_json(row[0]) for row in rows]

    async def export_jsonl(self, path: Path) -> int:
        """Export all receipts as JSON Lines for SIEM ingestion."""
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                "SELECT payload_json FROM receipts ORDER BY id ASC"
            ) as cur:
                rows = await cur.fetchall()

        with path.open("w") as f:
            for row in rows:
                f.write(row[0] + "\n")

        log.info("receipts.exported", path=str(path), count=len(rows))
        return len(rows)

    async def stats(self) -> dict:
        """Return summary stats."""
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                "SELECT total_count, last_hash, last_updated FROM chain_meta WHERE id = 1"
            ) as cur:
                meta = await cur.fetchone()
            async with db.execute(
                "SELECT policy_decision, COUNT(*) FROM receipts GROUP BY policy_decision"
            ) as cur:
                decisions = dict(await cur.fetchall())
            async with db.execute(
                "SELECT tool_name, COUNT(*) FROM receipts GROUP BY tool_name ORDER BY 2 DESC LIMIT 10"
            ) as cur:
                top_tools = dict(await cur.fetchall())

        return {
            "total_receipts": meta[0] if meta else 0,
            "last_hash": (meta[1][:16] + "...") if meta and meta[1] else "",
            "last_updated": meta[2] if meta else None,
            "by_decision": decisions,
            "top_tools": top_tools,
        }


# ---------------------------------------------------------------------------
# Convenience factory: one global ledger per process
# ---------------------------------------------------------------------------

_global_ledger: ReceiptsLedger | None = None
_global_ledger_path: str | None = None


async def get_ledger(db_path: str = "amc_receipts.db") -> ReceiptsLedger:
    global _global_ledger, _global_ledger_path
    db_path = str(db_path)
    if _global_ledger is None or _global_ledger_path != db_path:
        _global_ledger = ReceiptsLedger(db_path)
        await _global_ledger.init()
        _global_ledger_path = db_path
    return _global_ledger


async def log_action(
    *,
    session_id: str,
    sender_id: str,
    trust_level: SessionTrust,
    tool_name: str,
    tool_category: ToolCategory,
    parameters_redacted: dict,
    outcome_summary: str,
    policy_decision: PolicyDecision,
    policy_reasons: list[str] | None = None,
    approved_by: str | None = None,
) -> ActionReceipt:
    """One-liner for logging an action to the global ledger."""
    ledger = await get_ledger()
    receipt = ActionReceipt(
        session_id=session_id,
        sender_id=sender_id,
        trust_level=trust_level,
        tool_name=tool_name,
        tool_category=tool_category,
        parameters_redacted=parameters_redacted,
        outcome_summary=outcome_summary,
        policy_decision=policy_decision,
        policy_reasons=policy_reasons or [],
        approved_by=approved_by,
    )
    return await ledger.append(receipt)
