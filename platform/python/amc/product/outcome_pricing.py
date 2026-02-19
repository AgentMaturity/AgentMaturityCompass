"""AMC Product — Outcome-Based Pricing Wrapper.

Tracks outcomes/results, calculates take-rates, and emits billing events
for results-based billing (pay-per-outcome, revenue-share, etc.).

Billing model:
  - outcome_value: dollar value of the outcome achieved
  - take_rate: platform's cut as a fraction (e.g. 0.10 = 10%)
  - billing_amount = outcome_value × take_rate

Revenue path: aligns platform incentives with customer success → premium tier.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
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
CREATE TABLE IF NOT EXISTS outcome_contracts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id     TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    name            TEXT NOT NULL,
    outcome_type    TEXT NOT NULL,
    take_rate       REAL NOT NULL DEFAULT 0.10,
    min_outcome_usd REAL NOT NULL DEFAULT 0.0,
    max_take_usd    REAL,
    currency        TEXT NOT NULL DEFAULT 'USD',
    active          INTEGER NOT NULL DEFAULT 1,
    billing_mode    TEXT NOT NULL DEFAULT 'realtime',
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contract_tenant ON outcome_contracts(tenant_id, active);

CREATE TABLE IF NOT EXISTS outcome_records (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    outcome_id      TEXT NOT NULL UNIQUE,
    contract_id     TEXT NOT NULL,
    tenant_id       TEXT NOT NULL,
    job_id          TEXT NOT NULL,
    outcome_type    TEXT NOT NULL,
    outcome_value   REAL NOT NULL DEFAULT 0.0,
    currency        TEXT NOT NULL DEFAULT 'USD',
    take_rate       REAL NOT NULL,
    billing_amount  REAL NOT NULL DEFAULT 0.0,
    status          TEXT NOT NULL DEFAULT 'pending',
    evidence_json   TEXT NOT NULL DEFAULT '{}',
    achieved_at     TEXT NOT NULL,
    verified_at     TEXT,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (contract_id) REFERENCES outcome_contracts(contract_id)
);
CREATE INDEX IF NOT EXISTS idx_outcome_tenant   ON outcome_records(tenant_id, achieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_outcome_contract ON outcome_records(contract_id, achieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_outcome_job      ON outcome_records(job_id);

CREATE TABLE IF NOT EXISTS billing_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT NOT NULL UNIQUE,
    outcome_id      TEXT NOT NULL,
    tenant_id       TEXT NOT NULL,
    contract_id     TEXT NOT NULL,
    billing_amount  REAL NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'USD',
    billing_status  TEXT NOT NULL DEFAULT 'pending',
    external_ref    TEXT NOT NULL DEFAULT '',
    billed_at       TEXT NOT NULL,
    paid_at         TEXT,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (outcome_id) REFERENCES outcome_records(outcome_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_tenant ON billing_events(tenant_id, billed_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_status ON billing_events(billing_status);
"""

# ---------------------------------------------------------------------------
# Enums & Models
# ---------------------------------------------------------------------------

class OutcomeStatus(str, Enum):
    PENDING  = "pending"
    VERIFIED = "verified"
    DISPUTED = "disputed"
    REJECTED = "rejected"


class BillingMode(str, Enum):
    REALTIME  = "realtime"
    MONTHLY   = "monthly"
    MILESTONE = "milestone"


class BillingStatus(str, Enum):
    PENDING    = "pending"
    INVOICED   = "invoiced"
    PAID       = "paid"
    FAILED     = "failed"
    REFUNDED   = "refunded"


class ContractCreateInput(BaseModel):
    tenant_id: str
    name: str
    outcome_type: str               # e.g. "deal_closed", "lead_converted", "email_replied"
    take_rate: float = Field(default=0.10, ge=0.0, le=1.0)
    min_outcome_usd: float = 0.0
    max_take_usd: float | None = None
    currency: str = "USD"
    billing_mode: BillingMode = BillingMode.REALTIME
    metadata: dict[str, Any] = Field(default_factory=dict)


class ContractUpdateInput(BaseModel):
    contract_id: str
    take_rate: float | None = Field(default=None, ge=0.0, le=1.0)
    active: bool | None = None
    billing_mode: BillingMode | None = None
    max_take_usd: float | None = None


class OutcomeRecordInput(BaseModel):
    contract_id: str
    job_id: str
    outcome_type: str
    outcome_value: float = Field(default=0.0, ge=0.0)
    currency: str = "USD"
    evidence: dict[str, Any] = Field(default_factory=dict)
    achieved_at: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class OutcomeVerifyInput(BaseModel):
    outcome_id: str
    verified_by: str
    status: OutcomeStatus = OutcomeStatus.VERIFIED
    note: str = ""


class BillingEventInput(BaseModel):
    outcome_id: str
    external_ref: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class BillingStatusUpdateInput(BaseModel):
    event_id: str
    billing_status: BillingStatus
    paid_at: str | None = None
    external_ref: str | None = None


class ContractRecord(BaseModel):
    contract_id: str
    tenant_id: str
    name: str
    outcome_type: str
    take_rate: float
    min_outcome_usd: float
    max_take_usd: float | None
    currency: str
    active: bool
    billing_mode: str
    metadata: dict[str, Any]
    created_at: str
    updated_at: str


class OutcomeRecord(BaseModel):
    outcome_id: str
    contract_id: str
    tenant_id: str
    job_id: str
    outcome_type: str
    outcome_value: float
    currency: str
    take_rate: float
    billing_amount: float
    status: str
    evidence: dict[str, Any]
    achieved_at: str
    verified_at: str | None
    metadata: dict[str, Any]


class BillingEventRecord(BaseModel):
    event_id: str
    outcome_id: str
    tenant_id: str
    contract_id: str
    billing_amount: float
    currency: str
    billing_status: str
    external_ref: str
    billed_at: str
    paid_at: str | None
    metadata: dict[str, Any]


# ---------------------------------------------------------------------------
# Billing calculation
# ---------------------------------------------------------------------------

def calculate_billing_amount(
    outcome_value: float,
    take_rate: float,
    max_take_usd: float | None,
) -> float:
    """outcome_value × take_rate, capped at max_take_usd."""
    amount = round(outcome_value * take_rate, 6)
    if max_take_usd is not None:
        amount = min(amount, max_take_usd)
    return amount


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------

def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class OutcomePricingManager:
    """Outcome-based billing: contracts, outcome tracking, billing events."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._path = str(db_path or product_db_path())
        self._lock = Lock()
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self._path, check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA foreign_keys=ON")
        return c

    def _init_db(self) -> None:
        with self._conn() as c:
            c.executescript(_SCHEMA)

    def _row_to_contract(self, row: sqlite3.Row) -> ContractRecord:
        return ContractRecord(
            contract_id=row["contract_id"], tenant_id=row["tenant_id"],
            name=row["name"], outcome_type=row["outcome_type"],
            take_rate=row["take_rate"], min_outcome_usd=row["min_outcome_usd"],
            max_take_usd=row["max_take_usd"], currency=row["currency"],
            active=bool(row["active"]), billing_mode=row["billing_mode"],
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"], updated_at=row["updated_at"],
        )

    # ------------------------------------------------------------------
    # Contracts
    # ------------------------------------------------------------------

    def create_contract(self, inp: ContractCreateInput) -> ContractRecord:
        contract_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO outcome_contracts
                   (contract_id, tenant_id, name, outcome_type, take_rate,
                    min_outcome_usd, max_take_usd, currency, active,
                    billing_mode, metadata_json, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (contract_id, inp.tenant_id, inp.name, inp.outcome_type,
                 inp.take_rate, inp.min_outcome_usd, inp.max_take_usd,
                 inp.currency, 1, inp.billing_mode.value,
                 json.dumps(inp.metadata), now, now),
            )
        log.info("outcome_pricing.contract_created",
                 contract_id=contract_id, tenant=inp.tenant_id)
        return self.get_contract(contract_id)  # type: ignore[return-value]

    def get_contract(self, contract_id: str) -> ContractRecord | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM outcome_contracts WHERE contract_id=?", (contract_id,)
            ).fetchone()
        return self._row_to_contract(row) if row else None

    def update_contract(self, inp: ContractUpdateInput) -> ContractRecord:
        now = _utc_now()
        fields: dict[str, Any] = {"updated_at": now}
        if inp.take_rate is not None:
            fields["take_rate"] = inp.take_rate
        if inp.active is not None:
            fields["active"] = int(inp.active)
        if inp.billing_mode is not None:
            fields["billing_mode"] = inp.billing_mode.value
        if inp.max_take_usd is not None:
            fields["max_take_usd"] = inp.max_take_usd
        set_clause = ", ".join(f"{k}=?" for k in fields)
        vals = list(fields.values()) + [inp.contract_id]
        with self._lock, self._conn() as c:
            c.execute(f"UPDATE outcome_contracts SET {set_clause} WHERE contract_id=?", vals)
        return self.get_contract(inp.contract_id)  # type: ignore[return-value]

    def list_contracts(
        self, tenant_id: str, active_only: bool = True
    ) -> list[ContractRecord]:
        q = "SELECT * FROM outcome_contracts WHERE tenant_id=?"
        params: list[Any] = [tenant_id]
        if active_only:
            q += " AND active=1"
        q += " ORDER BY created_at DESC"
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [self._row_to_contract(r) for r in rows]

    # ------------------------------------------------------------------
    # Outcome records
    # ------------------------------------------------------------------

    def record_outcome(self, inp: OutcomeRecordInput) -> OutcomeRecord:
        contract = self.get_contract(inp.contract_id)
        if contract is None:
            raise ValueError(f"Contract {inp.contract_id!r} not found")
        if not contract.active:
            raise ValueError(f"Contract {inp.contract_id!r} is inactive")

        billing_amount = calculate_billing_amount(
            inp.outcome_value, contract.take_rate, contract.max_take_usd
        )
        outcome_id = str(uuid.uuid4())
        achieved_at = inp.achieved_at or _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO outcome_records
                   (outcome_id, contract_id, tenant_id, job_id, outcome_type,
                    outcome_value, currency, take_rate, billing_amount, status,
                    evidence_json, achieved_at, metadata_json)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (outcome_id, inp.contract_id, contract.tenant_id, inp.job_id,
                 inp.outcome_type, inp.outcome_value, inp.currency,
                 contract.take_rate, billing_amount, OutcomeStatus.PENDING.value,
                 json.dumps(inp.evidence), achieved_at, json.dumps(inp.metadata)),
            )
        log.info("outcome_pricing.outcome_recorded",
                 outcome_id=outcome_id, value=inp.outcome_value, billing=billing_amount)

        rec = self.get_outcome(outcome_id)  # type: ignore[return-value]

        # Auto-emit billing event for realtime mode
        if contract.billing_mode == BillingMode.REALTIME.value:
            self.emit_billing_event(BillingEventInput(outcome_id=outcome_id))

        return rec

    def get_outcome(self, outcome_id: str) -> OutcomeRecord | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM outcome_records WHERE outcome_id=?", (outcome_id,)
            ).fetchone()
        if row is None:
            return None
        return OutcomeRecord(
            outcome_id=row["outcome_id"], contract_id=row["contract_id"],
            tenant_id=row["tenant_id"], job_id=row["job_id"],
            outcome_type=row["outcome_type"], outcome_value=row["outcome_value"],
            currency=row["currency"], take_rate=row["take_rate"],
            billing_amount=row["billing_amount"], status=row["status"],
            evidence=json.loads(row["evidence_json"]),
            achieved_at=row["achieved_at"], verified_at=row["verified_at"],
            metadata=json.loads(row["metadata_json"]),
        )

    def verify_outcome(self, inp: OutcomeVerifyInput) -> OutcomeRecord:
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                "UPDATE outcome_records SET status=?, verified_at=? WHERE outcome_id=?",
                (inp.status.value, now, inp.outcome_id),
            )
        log.info("outcome_pricing.verified",
                 outcome_id=inp.outcome_id, status=inp.status.value, by=inp.verified_by)
        return self.get_outcome(inp.outcome_id)  # type: ignore[return-value]

    def list_outcomes(
        self,
        tenant_id: str,
        contract_id: str | None = None,
        status: str | None = None,
        limit: int = 100,
    ) -> list[OutcomeRecord]:
        q = "SELECT * FROM outcome_records WHERE tenant_id=?"
        params: list[Any] = [tenant_id]
        if contract_id:
            q += " AND contract_id=?"; params.append(contract_id)
        if status:
            q += " AND status=?"; params.append(status)
        q += " ORDER BY achieved_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [
            OutcomeRecord(
                outcome_id=r["outcome_id"], contract_id=r["contract_id"],
                tenant_id=r["tenant_id"], job_id=r["job_id"],
                outcome_type=r["outcome_type"], outcome_value=r["outcome_value"],
                currency=r["currency"], take_rate=r["take_rate"],
                billing_amount=r["billing_amount"], status=r["status"],
                evidence=json.loads(r["evidence_json"]),
                achieved_at=r["achieved_at"], verified_at=r["verified_at"],
                metadata=json.loads(r["metadata_json"]),
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Billing events
    # ------------------------------------------------------------------

    def emit_billing_event(self, inp: BillingEventInput) -> BillingEventRecord:
        outcome = self.get_outcome(inp.outcome_id)
        if outcome is None:
            raise ValueError(f"Outcome {inp.outcome_id!r} not found")
        event_id = str(uuid.uuid4())
        now = _utc_now()
        with self._lock, self._conn() as c:
            c.execute(
                """INSERT INTO billing_events
                   (event_id, outcome_id, tenant_id, contract_id,
                    billing_amount, currency, billing_status,
                    external_ref, billed_at, metadata_json)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (event_id, inp.outcome_id, outcome.tenant_id,
                 outcome.contract_id, outcome.billing_amount,
                 outcome.currency, BillingStatus.PENDING.value,
                 inp.external_ref, now, json.dumps(inp.metadata)),
            )
        log.info("outcome_pricing.billing_event_emitted",
                 event_id=event_id, amount=outcome.billing_amount)
        return self._get_billing_event(event_id)  # type: ignore[return-value]

    def _get_billing_event(self, event_id: str) -> BillingEventRecord | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM billing_events WHERE event_id=?", (event_id,)
            ).fetchone()
        if row is None:
            return None
        return BillingEventRecord(
            event_id=row["event_id"], outcome_id=row["outcome_id"],
            tenant_id=row["tenant_id"], contract_id=row["contract_id"],
            billing_amount=row["billing_amount"], currency=row["currency"],
            billing_status=row["billing_status"], external_ref=row["external_ref"],
            billed_at=row["billed_at"], paid_at=row["paid_at"],
            metadata=json.loads(row["metadata_json"]),
        )

    def update_billing_status(self, inp: BillingStatusUpdateInput) -> BillingEventRecord:
        now = _utc_now()
        fields: dict[str, Any] = {"billing_status": inp.billing_status.value}
        if inp.paid_at:
            fields["paid_at"] = inp.paid_at
        elif inp.billing_status == BillingStatus.PAID:
            fields["paid_at"] = now
        if inp.external_ref is not None:
            fields["external_ref"] = inp.external_ref
        set_clause = ", ".join(f"{k}=?" for k in fields)
        vals = list(fields.values()) + [inp.event_id]
        with self._lock, self._conn() as c:
            c.execute(f"UPDATE billing_events SET {set_clause} WHERE event_id=?", vals)
        return self._get_billing_event(inp.event_id)  # type: ignore[return-value]

    def list_billing_events(
        self,
        tenant_id: str,
        billing_status: str | None = None,
        limit: int = 100,
    ) -> list[BillingEventRecord]:
        q = "SELECT * FROM billing_events WHERE tenant_id=?"
        params: list[Any] = [tenant_id]
        if billing_status:
            q += " AND billing_status=?"; params.append(billing_status)
        q += " ORDER BY billed_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as c:
            rows = c.execute(q, params).fetchall()
        return [
            BillingEventRecord(
                event_id=r["event_id"], outcome_id=r["outcome_id"],
                tenant_id=r["tenant_id"], contract_id=r["contract_id"],
                billing_amount=r["billing_amount"], currency=r["currency"],
                billing_status=r["billing_status"], external_ref=r["external_ref"],
                billed_at=r["billed_at"], paid_at=r["paid_at"],
                metadata=json.loads(r["metadata_json"]),
            )
            for r in rows
        ]

    def billing_summary(self, tenant_id: str) -> dict[str, Any]:
        """Aggregate billing stats for a tenant."""
        with self._conn() as c:
            row = c.execute(
                """SELECT
                   COUNT(*) as total_events,
                   SUM(billing_amount) as total_billed,
                   SUM(CASE WHEN billing_status='paid' THEN billing_amount ELSE 0 END) as total_paid,
                   SUM(CASE WHEN billing_status='pending' THEN billing_amount ELSE 0 END) as total_pending
                   FROM billing_events WHERE tenant_id=?""",
                (tenant_id,),
            ).fetchone()
        return {
            "tenant_id": tenant_id,
            "total_events": row["total_events"] or 0,
            "total_billed_usd": round(row["total_billed"] or 0.0, 4),
            "total_paid_usd": round(row["total_paid"] or 0.0, 4),
            "total_pending_usd": round(row["total_pending"] or 0.0, 4),
        }


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_outcome_mgr: OutcomePricingManager | None = None
_outcome_lock = Lock()


def get_outcome_manager(db_path: str | Path | None = None) -> OutcomePricingManager:
    global _outcome_mgr
    with _outcome_lock:
        if _outcome_mgr is None:
            _outcome_mgr = OutcomePricingManager(db_path=db_path)
    return _outcome_mgr


__all__ = [
    "OutcomeStatus",
    "BillingMode",
    "BillingStatus",
    "ContractCreateInput",
    "ContractUpdateInput",
    "OutcomeRecordInput",
    "OutcomeVerifyInput",
    "BillingEventInput",
    "BillingStatusUpdateInput",
    "ContractRecord",
    "OutcomeRecord",
    "BillingEventRecord",
    "calculate_billing_amount",
    "OutcomePricingManager",
    "get_outcome_manager",
]
