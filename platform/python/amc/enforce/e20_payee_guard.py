"""
AMC Enforce E20 — Payee Change Detection and Payment Rail Guard
===============================================================

Prevents business-email-compromise (BEC) and payment-diversion fraud by
maintaining a "golden record" of known payees and gating every payment
against it.

Usage::

    from amc.enforce.e20_payee_guard import PayeeGuard

    guard = PayeeGuard(db_path=":memory:")
    guard.register_payee("Acme Corp", {"account": "123456", "routing": "021000021"},
                         domain="acme.com", billing_contacts=["ap@acme.com"])

    result = guard.validate_payment("Acme Corp", "123456", 500.00, "USD")
    assert result.allowed is True

    # Changed bank details → HIGH risk, blocked
    result = guard.validate_payment("Acme Corp", "999999", 500.00, "USD")
    assert result.allowed is False
    assert result.risk_level == RiskLevel.HIGH
"""
from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.core.models import RiskLevel

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class Payee(BaseModel):
    payee_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    bank_details: dict[str, Any]
    domain: str = ""
    billing_contacts: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PaymentValidation(BaseModel):
    payment_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    payee_name: str
    destination_account: str
    amount: float
    currency: str
    allowed: bool
    risk_level: RiskLevel
    reasons: list[str] = Field(default_factory=list)
    verification_required: bool = False
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VerificationRecord(BaseModel):
    payment_id: str
    channel: str
    code: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(minutes=15))
    confirmed: bool = False
    confirmed_at: datetime | None = None


# ---------------------------------------------------------------------------
# SQL Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS payees (
    payee_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    bank_details TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT '',
    billing_contacts TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
    payment_id TEXT PRIMARY KEY,
    payee_name TEXT NOT NULL,
    destination_account TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    allowed INTEGER NOT NULL,
    risk_level TEXT NOT NULL,
    reasons TEXT NOT NULL DEFAULT '[]',
    verification_required INTEGER NOT NULL DEFAULT 0,
    verified INTEGER NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS verifications (
    payment_id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    confirmed INTEGER NOT NULL DEFAULT 0,
    confirmed_at TEXT
);
"""

# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

_HIGH_AMOUNT_THRESHOLDS: dict[str, float] = {
    "USD": 10_000.0,
    "EUR": 10_000.0,
    "GBP": 8_000.0,
    "INR": 500_000.0,
}


class PayeeGuard:
    """Payment rail guard with golden-record payee registry."""

    def __init__(self, db_path: str = ":memory:", high_amount_thresholds: dict[str, float] | None = None) -> None:
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._thresholds = high_amount_thresholds or _HIGH_AMOUNT_THRESHOLDS

    # ------------------------------------------------------------------
    # Payee registration
    # ------------------------------------------------------------------
    def register_payee(
        self,
        name: str,
        bank_details: dict[str, Any],
        domain: str = "",
        billing_contacts: list[str] | None = None,
    ) -> Payee:
        now = datetime.now(timezone.utc)
        payee = Payee(
            name=name, bank_details=bank_details,
            domain=domain, billing_contacts=billing_contacts or [],
            created_at=now, updated_at=now,
        )
        self._conn.execute(
            "INSERT OR REPLACE INTO payees (payee_id, name, bank_details, domain, billing_contacts, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
            (payee.payee_id, payee.name, json.dumps(payee.bank_details), payee.domain,
             json.dumps(payee.billing_contacts), now.isoformat(), now.isoformat()),
        )
        self._conn.commit()
        logger.info("payee_guard.registered", payee=name)
        return payee

    def get_payee(self, name: str) -> Payee | None:
        row = self._conn.execute("SELECT * FROM payees WHERE name = ?", (name,)).fetchone()
        if row is None:
            return None
        return Payee(
            payee_id=row["payee_id"], name=row["name"],
            bank_details=json.loads(row["bank_details"]),
            domain=row["domain"],
            billing_contacts=json.loads(row["billing_contacts"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    # ------------------------------------------------------------------
    # Payment validation
    # ------------------------------------------------------------------
    def validate_payment(
        self,
        payee_name: str,
        destination_account: str,
        amount: float,
        currency: str,
    ) -> PaymentValidation:
        reasons: list[str] = []
        risk = RiskLevel.LOW
        allowed = True
        verification_required = False

        payee = self.get_payee(payee_name)

        if payee is None:
            risk = RiskLevel.MEDIUM
            reasons.append("Payee not in golden record registry — step-up required")
            verification_required = True
        else:
            # Check bank details match
            golden_account = payee.bank_details.get("account", "")
            if golden_account and destination_account != golden_account:
                risk = RiskLevel.HIGH
                allowed = False
                reasons.append(
                    f"Destination account '{destination_account}' differs from golden record '{golden_account}' — possible BEC"
                )

        # Amount threshold
        threshold = self._thresholds.get(currency.upper(), 10_000.0)
        if amount > threshold:
            if risk.value < RiskLevel.MEDIUM.value or risk == RiskLevel.LOW:
                risk = max(risk, RiskLevel.MEDIUM, key=lambda r: list(RiskLevel).index(r))
            reasons.append(f"Amount {amount} {currency} exceeds threshold {threshold} {currency}")
            verification_required = True

        if not reasons:
            reasons.append("All checks passed")

        validation = PaymentValidation(
            payee_name=payee_name, destination_account=destination_account,
            amount=amount, currency=currency,
            allowed=allowed, risk_level=risk,
            reasons=reasons, verification_required=verification_required,
        )

        # Persist
        self._conn.execute(
            "INSERT INTO payments (payment_id, payee_name, destination_account, amount, currency, allowed, risk_level, reasons, verification_required, verified, timestamp) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (validation.payment_id, payee_name, destination_account, amount, currency,
             int(allowed), risk.value, json.dumps(reasons), int(verification_required),
             0, validation.timestamp.isoformat()),
        )
        self._conn.commit()
        logger.info("payee_guard.validated", payment_id=validation.payment_id, risk=risk.value, allowed=allowed)
        return validation

    # ------------------------------------------------------------------
    # Out-of-band verification
    # ------------------------------------------------------------------
    def require_verification(self, payment_id: str, channel: str = "email") -> str:
        """Generate a verification code for out-of-band confirmation.

        Returns the verification code (caller delivers it via the chosen channel).
        """
        if channel not in ("callback", "email", "sms"):
            raise ValueError(f"Unsupported channel: {channel}")

        code = secrets.token_hex(3).upper()  # 6 hex chars
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        now = datetime.now(timezone.utc)

        self._conn.execute(
            "INSERT OR REPLACE INTO verifications (payment_id, channel, code_hash, created_at, expires_at, confirmed, confirmed_at) VALUES (?,?,?,?,?,?,?)",
            (payment_id, channel, code_hash, now.isoformat(),
             (now + timedelta(minutes=15)).isoformat(), 0, None),
        )
        self._conn.commit()
        logger.info("payee_guard.verification_required", payment_id=payment_id, channel=channel)
        return code

    def confirm_verification(self, payment_id: str, code: str) -> bool:
        """Confirm an out-of-band verification code. Returns True on success."""
        row = self._conn.execute(
            "SELECT * FROM verifications WHERE payment_id = ?", (payment_id,)
        ).fetchone()
        if row is None:
            return False
        if row["confirmed"]:
            return True  # already confirmed

        now = datetime.now(timezone.utc)
        if now > datetime.fromisoformat(row["expires_at"]):
            logger.warning("payee_guard.verification_expired", payment_id=payment_id)
            return False

        code_hash = hashlib.sha256(code.encode()).hexdigest()
        if code_hash != row["code_hash"]:
            logger.warning("payee_guard.verification_failed", payment_id=payment_id)
            return False

        self._conn.execute(
            "UPDATE verifications SET confirmed = 1, confirmed_at = ? WHERE payment_id = ?",
            (now.isoformat(), payment_id),
        )
        self._conn.execute(
            "UPDATE payments SET verified = 1 WHERE payment_id = ?", (payment_id,)
        )
        self._conn.commit()
        logger.info("payee_guard.verified", payment_id=payment_id)
        return True

    # ------------------------------------------------------------------
    # Evidence
    # ------------------------------------------------------------------
    def generate_evidence(self, payment_id: str) -> dict[str, Any]:
        """Generate an evidence pack for audit."""
        payment_row = self._conn.execute(
            "SELECT * FROM payments WHERE payment_id = ?", (payment_id,)
        ).fetchone()
        if payment_row is None:
            raise ValueError(f"Payment {payment_id} not found")

        evidence: dict[str, Any] = {
            "payment_id": payment_id,
            "payee_name": payment_row["payee_name"],
            "destination_account": payment_row["destination_account"],
            "amount": payment_row["amount"],
            "currency": payment_row["currency"],
            "allowed": bool(payment_row["allowed"]),
            "risk_level": payment_row["risk_level"],
            "reasons": json.loads(payment_row["reasons"]),
            "verification_required": bool(payment_row["verification_required"]),
            "verified": bool(payment_row["verified"]),
            "timestamp": payment_row["timestamp"],
        }

        # Include golden record if exists
        payee = self.get_payee(payment_row["payee_name"])
        if payee:
            evidence["golden_record"] = payee.model_dump(mode="json")

        # Verification details
        ver_row = self._conn.execute(
            "SELECT * FROM verifications WHERE payment_id = ?", (payment_id,)
        ).fetchone()
        if ver_row:
            evidence["verification"] = {
                "channel": ver_row["channel"],
                "confirmed": bool(ver_row["confirmed"]),
                "confirmed_at": ver_row["confirmed_at"],
                "expires_at": ver_row["expires_at"],
            }

        return evidence
