"""
AMC Vault — V9: Invoice Fraud and Vendor Impersonation Scoring
=============================================================

This module assigns a fraud score to inbound invoices and tracks vendor
behaviour across time so that sudden account/amount changes are detected.

Usage
-----

.. code-block:: python

    from amc.vault.v9_invoice_fraud import InvoiceFraudScorer, InvoiceData

    scorer = InvoiceFraudScorer(db_path="/tmp/invoice_fraud.db")

    score = scorer.score_invoice(
        InvoiceData(
            sender_email="billing@trusted-supplier.com",
            sender_domain="trusted-supplier.com",
            reply_to_email="billing@trusted-supplier.com",
            bank_account="1234567890",
            invoice_number="INV-1001",
            amount=1999.00,
            currency="USD",
            po_number="PO-77",
            items=[{"sku": "A1", "qty": 3}],
        )
    )

    print(score.total_score, score.risk_level, score.recommended_action)

    # After manual human verification:
    scorer.register_legitimate("INV-1001")
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.core.models import RiskLevel

log = structlog.get_logger(__name__)


def _levenshtein_distance(a: str, b: str) -> int:
    """Simple dynamic-programming Levenshtein distance."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)

    prev = list(range(len(b) + 1))
    for i, ch1 in enumerate(a, start=1):
        cur = [i]
        for j, ch2 in enumerate(b, start=1):
            cost = 0 if ch1 == ch2 else 1
            cur.append(
                min(
                    cur[-1] + 1,      # insertion
                    prev[j] + 1,      # deletion
                    prev[j - 1] + cost,  # substitution
                )
            )
        prev = cur
    return prev[-1]


class FraudSignalSeverity(str, Enum):
    LOW = "low"
    LOW_MEDIUM = "low-medium"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class InvoiceData(BaseModel):
    """Minimal structured invoice payload used by the scorer."""

    sender_email: str
    sender_domain: str
    reply_to_email: str
    bank_account: str
    invoice_number: str
    amount: float
    currency: str
    po_number: str | None = None
    items: list[dict[str, Any]] = Field(default_factory=list)


class FraudSignal(BaseModel):
    """Atomic fraud detection reason and weight."""

    signal_id: str
    severity: FraudSignalSeverity
    score: float = Field(..., ge=0.0, le=100.0)
    details: str


class FraudScore(BaseModel):
    """Aggregate invoice risk score + action recommendation."""

    invoice_id: str
    total_score: float = Field(..., ge=0.0, le=100.0)
    risk_level: RiskLevel
    signals: list[FraudSignal]
    recommended_action: str


_SCHEMA = """
CREATE TABLE IF NOT EXISTS vendor_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_domain TEXT NOT NULL UNIQUE,
    known_bank_accounts TEXT NOT NULL,
    invoice_numbers TEXT NOT NULL,
    avg_amount_usd REAL NOT NULL DEFAULT 0,
    max_amount_usd REAL NOT NULL DEFAULT 0,
    invoice_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    last_invoice_number TEXT
);

CREATE TABLE IF NOT EXISTS scored_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT NOT NULL UNIQUE,
    sender_domain TEXT NOT NULL,
    sender_email TEXT NOT NULL,
    bank_account TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    po_number TEXT,
    total_score REAL NOT NULL,
    risk_level TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    signals_json TEXT NOT NULL,
    scored_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vendor ON vendor_history(vendor_domain);
CREATE INDEX IF NOT EXISTS idx_scored_sender_domain ON scored_invoices(sender_domain);
CREATE INDEX IF NOT EXISTS idx_scored_at ON scored_invoices(scored_at);
"""


class InvoiceFraudScorer:
    """Score invoice impersonation/fraud signals and maintain vendor baselines."""

    # Thresholds per signal (subject to tuning)
    SIG_DOMAIN = 32.0      # <= distance 2 => risky, high severity
    SIG_REPLY_TO = 40.0    # reply-to mismatch alone should breach verify threshold
    SIG_BANK_CHANGED = 46.0
    SIG_INV_SEQ = 10.0
    SIG_PO_MISSING = 16.0
    SIG_AMT_ANOMALY = 40.0  # >3x amount anomaly should trigger verify

    CURRENCY_USD_RATES: dict[str, float] = {
        "USD": 1.0,
        "USDT": 1.0,
        "EUR": 1.09,
        "GBP": 1.27,
        "INR": 0.012,
    }

    # Action policy by score
    SCORE_TO_RISK = [
        (80.0, RiskLevel.CRITICAL, "reject"),
        (65.0, RiskLevel.HIGH, "hold"),
        (40.0, RiskLevel.MEDIUM, "verify"),
    ]

    # Known-allowed domains can be bootstrapped externally.
    KNOWN_VENDOR_DOMAINS = {
        "trustedsupplier.com",
        "enterprise-payables.example",
        "acme-payments.net",
        "vendor.example",
    }

    def __init__(self, db_path: str | Path = "/tmp/amc_invoice_fraud.db") -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    # Public API ------------------------------------------------------------

    def score_invoice(self, invoice: InvoiceData) -> FraudScore:
        """Score one invoice and persist a scoring artifact."""
        vendor = self._normalise_domain(invoice.sender_domain)
        score = 0.0
        signals: list[FraudSignal] = []

        baseline = self._load_vendor_baseline(vendor)
        usd_amount = invoice.amount * self.CURRENCY_USD_RATES.get(invoice.currency.upper(), 1.0)

        # 1) Domain similarity attack
        similarity_penalty = self._domain_similarity_signal(vendor)
        score += similarity_penalty
        if similarity_penalty:
            signals.append(
                FraudSignal(
                    signal_id="domain_similarity",
                    severity=FraudSignalSeverity.HIGH,
                    score=similarity_penalty,
                    details=(
                        f"sender_domain '{vendor}' is visually similar to a known vendor."
                    ),
                )
            )

        # 2) Reply-to differs from From
        if self._normalise_email(invoice.reply_to_email) != self._normalise_email(invoice.sender_email):
            score += self.SIG_REPLY_TO
            signals.append(
                FraudSignal(
                    signal_id="reply_to_mismatch",
                    severity=FraudSignalSeverity.MEDIUM,
                    score=self.SIG_REPLY_TO,
                    details="reply-to domain differs from from-address domain",
                )
            )

        # 3) Bank account changed vs known history
        if baseline and invoice.bank_account not in baseline["accounts"]:
            score += self.SIG_BANK_CHANGED
            signals.append(
                FraudSignal(
                    signal_id="bank_account_change",
                    severity=FraudSignalSeverity.CRITICAL,
                    score=self.SIG_BANK_CHANGED,
                    details="bank account does not match vendor historical accounts",
                )
            )

        # 4) Invoice number sequence anomaly
        seq_penalty = self._invoice_sequence_signal(vendor, invoice.invoice_number, baseline)
        score += seq_penalty
        if seq_penalty > 0:
            signals.append(
                FraudSignal(
                    signal_id="invoice_sequence",
                    severity=FraudSignalSeverity.LOW_MEDIUM,
                    score=seq_penalty,
                    details="invoice number does not follow expected sequence",
                )
            )

        # 5) Missing PO match when POs tracked
        if baseline and baseline["po_tracked"] and not invoice.po_number:
            score += self.SIG_PO_MISSING
            signals.append(
                FraudSignal(
                    signal_id="missing_po",
                    severity=FraudSignalSeverity.MEDIUM,
                    score=self.SIG_PO_MISSING,
                    details="PO number missing but vendor typically sends PO-mapped invoices",
                )
            )

        # 6) Amount anomaly vs baseline
        if baseline and baseline["avg_amount_usd"] > 0:
            anomaly = abs(usd_amount - baseline["avg_amount_usd"]) / baseline["avg_amount_usd"]
            if anomaly > 3.0:
                score += self.SIG_AMT_ANOMALY
                signals.append(
                    FraudSignal(
                        signal_id="amount_anomaly",
                        severity=FraudSignalSeverity.HIGH,
                        score=self.SIG_AMT_ANOMALY,
                        details=(
                            f"amount {_fmt_money(invoice.amount, invoice.currency)} is >3x usual {vendor} average "
                            f"({_fmt_money(baseline['avg_amount_usd'], 'USD')})"
                        ),
                    )
                )

        score = max(0.0, min(100.0, round(score, 2)))

        risk_level = self._score_to_risk(score)
        recommended_action = self._action_for_score(score)

        invoice_id = self._invoice_id(invoice)

        result = FraudScore(
            invoice_id=invoice_id,
            total_score=score,
            risk_level=risk_level,
            signals=signals,
            recommended_action=recommended_action,
        )

        self._persist_scored_invoice(invoice_id, invoice, result)

        log.info(
            "invoice_fraud.scored",
            invoice_id=invoice_id,
            vendor=vendor,
            score=score,
            risk=risk_level,
            action=recommended_action,
            signals=len(signals),
        )
        return result

    def register_legitimate(self, invoice_id: str) -> None:
        """Incorporate a previously scored invoice into vendor baseline.

        Call this after human verification that the invoice is legitimate.
        """
        with self._tx() as cur:
            row = cur.execute(
                "SELECT sender_domain, bank_account, invoice_number, amount, currency FROM scored_invoices WHERE invoice_id = ?",
                (invoice_id,),
            ).fetchone()

            if not row:
                raise KeyError(f"invoice_id '{invoice_id}' not found in scored_invoices")

            sender_domain, bank_account, invoice_number, amount, currency = row
            amt_usd = float(amount) * self.CURRENCY_USD_RATES.get(currency.upper(), 1.0)
            vendor = self._normalise_domain(sender_domain)

            base = self._load_vendor_baseline(vendor, cur=cur)
            if base is None:
                cur.execute(
                    "INSERT INTO vendor_history (vendor_domain, known_bank_accounts, invoice_numbers, avg_amount_usd, max_amount_usd, invoice_count, updated_at, last_invoice_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        vendor,
                        json.dumps([bank_account]),
                        json.dumps([invoice_number]),
                        amt_usd,
                        amt_usd,
                        1,
                        datetime.now(timezone.utc).isoformat(),
                        invoice_number,
                    ),
                )
                return

            accounts = set(base["accounts"])
            accounts.add(bank_account)
            invoice_list = base["invoice_numbers"]
            invoice_list.append(invoice_number)
            inv_count = base["invoice_count"] + 1
            prev_sum = base["avg_amount_usd"] * base["invoice_count"]
            new_avg = (prev_sum + amt_usd) / inv_count
            new_max = max(base["max_amount_usd"], amt_usd)

            cur.execute(
                "UPDATE vendor_history SET known_bank_accounts = ?, invoice_numbers = ?, avg_amount_usd = ?, max_amount_usd = ?, invoice_count = ?, last_invoice_number = ?, updated_at = ? WHERE vendor_domain = ?",
                (
                    json.dumps(sorted(accounts)),
                    json.dumps(invoice_list[-50:]),
                    new_avg,
                    new_max,
                    inv_count,
                    invoice_number,
                    datetime.now(timezone.utc).isoformat(),
                    vendor,
                ),
            )

        log.info("invoice_fraud.register_legitimate", invoice_id=invoice_id, vendor=vendor)

    def list_recent_scores(self, limit: int = 25) -> list[FraudScore]:
        """Return recent score artifacts."""
        with self._tx() as cur:
            rows = cur.execute(
                "SELECT invoice_id, total_score, risk_level, recommended_action, signals_json FROM scored_invoices ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()

        out: list[FraudScore] = []
        for rid, total_score, risk_level, rec, signals_json in rows:
            sigs_raw = json.loads(signals_json or "[]")
            out.append(
                FraudScore(
                    invoice_id=rid,
                    total_score=float(total_score),
                    risk_level=RiskLevel(risk_level),
                    signals=[FraudSignal.model_validate(s) for s in sigs_raw],
                    recommended_action=rec,
                )
            )
        return out

    # ------------------------------------------------------------------
    # Internal methods
    # ------------------------------------------------------------------

    @contextmanager
    def _tx(self):
        conn = sqlite3.connect(self.db_path)
        try:
            cur = conn.cursor()
            yield cur
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._tx() as cur:
            cur.executescript(_SCHEMA)

    @staticmethod
    def _invoice_id(invoice: InvoiceData) -> str:
        return hashlib.sha256(
            f"{invoice.sender_domain}|{invoice.invoice_number}|{invoice.amount}|{invoice.currency}".encode(
                "utf-8"
            )
        ).hexdigest()

    @staticmethod
    def _normalise_domain(domain: str) -> str:
        return domain.strip().lower().lstrip(".")

    @staticmethod
    def _normalise_email(value: str) -> str:
        return value.strip().lower()

    def _domain_similarity_signal(self, sender_domain: str) -> float:
        sender_domain = self._normalise_domain(sender_domain)
        for known in self.KNOWN_VENDOR_DOMAINS:
            if known == sender_domain:
                return 0.0
            distance = _levenshtein_distance(sender_domain, known)
            if distance < 3:
                return self.SIG_DOMAIN
        return 0.0

    def _invoice_sequence_signal(self, vendor: str, invoice_number: str, baseline: dict[str, Any] | None) -> float:
        if not baseline or not baseline.get("invoice_numbers"):
            return 0.0

        numbers = baseline["invoice_numbers"]
        if not numbers:
            return 0.0

        # Heuristic: compare numeric suffix against most recent invoice number.
        last = self._extract_invoice_num(numbers[-1])
        current = self._extract_invoice_num(invoice_number)
        if last is None or current is None:
            return 0.0

        if current > last + 1:
            # Allow gap of up to 2 for skipped numbers; above that is suspicious.
            return self.SIG_INV_SEQ if current - last > 2 else 0.0
        return 0.0

    def _load_vendor_baseline(self, vendor: str, cur: sqlite3.Cursor | None = None) -> dict[str, Any] | None:
        close = False
        if cur is None:
            conn = sqlite3.connect(self.db_path)
            cur = conn.cursor()
            close = True

        try:
            row = cur.execute(
                "SELECT known_bank_accounts, invoice_numbers, avg_amount_usd, max_amount_usd, invoice_count, last_invoice_number FROM vendor_history WHERE vendor_domain = ?",
                (vendor,),
            ).fetchone()
        finally:
            if close:
                cur.connection.close()

        if not row:
            return None

        accounts = set(json.loads(row[0]))
        invoices = json.loads(row[1])
        return {
            "accounts": list(accounts),
            "invoice_numbers": invoices,
            "avg_amount_usd": float(row[2]),
            "max_amount_usd": float(row[3]),
            "invoice_count": int(row[4]),
            "last_invoice_number": row[5],
            "po_tracked": len(invoices) >= 3 and all(self._extract_invoice_num(x) is not None for x in invoices),
        }

    def _persist_scored_invoice(
        self,
        invoice_id: str,
        invoice: InvoiceData,
        result: FraudScore,
    ) -> None:
        with self._tx() as cur:
            cur.execute(
                "INSERT OR REPLACE INTO scored_invoices"
                " (invoice_id, sender_domain, sender_email, bank_account, invoice_number, amount, currency, po_number, total_score, risk_level, recommended_action, signals_json, scored_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    invoice_id,
                    invoice.sender_domain,
                    invoice.sender_email,
                    invoice.bank_account,
                    invoice.invoice_number,
                    invoice.amount,
                    invoice.currency,
                    invoice.po_number,
                    result.total_score,
                    result.risk_level.value,
                    result.recommended_action,
                    json.dumps([s.model_dump() for s in result.signals]),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )

    @staticmethod
    def _extract_invoice_num(value: str) -> int | None:
        digits = re.findall(r"(\d+)", value)
        if not digits:
            return None
        return int(digits[-1])

    def _score_to_risk(self, score: float) -> RiskLevel:
        if score >= 80:
            return RiskLevel.CRITICAL
        if score >= 60:
            return RiskLevel.HIGH
        if score >= 40:
            return RiskLevel.MEDIUM
        if score >= 20:
            return RiskLevel.LOW
        return RiskLevel.SAFE

    def _action_for_score(self, score: float) -> str:
        for threshold, _risk, action in self.SCORE_TO_RISK:
            if score >= threshold:
                return action
        return "pay"


def _fmt_money(amount: float, currency: str) -> str:
    return f"{currency.upper()} {amount:,.2f}"


InvoiceData.model_rebuild()
FraudSignal.model_rebuild()
FraudScore.model_rebuild()
