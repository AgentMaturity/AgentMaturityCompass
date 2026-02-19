"""
AMC Enforce E23 — Numeric Reasonableness and Unit Consistency Checker
====================================================================

Catches unreasonable numbers, unit mismatches, and statistical anomalies
before they propagate through financial or operational workflows.

Usage::

    from amc.enforce.e23_numeric_checker import NumericChecker

    checker = NumericChecker(db_path=":memory:")
    checker.register_bounds("invoice_amount", 10.0, 5000.0, "USD")

    result = checker.check(150.0, "USD", {"field": "invoice_amount"})
    # result.valid == True, anomaly_score ≈ 0.0

    result = checker.check(1_000_000.0, "USD", {"field": "invoice_amount"})
    # result.valid == False, warnings include anomaly + bounds alert
"""
from __future__ import annotations

import json
import math
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.core.models import RiskLevel

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class NumericCheckResult(BaseModel):
    valid: bool
    warnings: list[str] = Field(default_factory=list)
    normalized_value: float
    normalized_unit: str
    anomaly_score: float = 0.0
    risk_level: RiskLevel = RiskLevel.LOW
    suggestions: list[str] = Field(default_factory=list)


class BoundsConfig(BaseModel):
    field_name: str
    min_val: float
    max_val: float
    unit: str
    alert_multiplier: float = 3.0


# ---------------------------------------------------------------------------
# Unit normalization tables
# ---------------------------------------------------------------------------

# canonical_unit → {alias: multiplier_to_canonical}
_UNIT_FAMILIES: dict[str, dict[str, float]] = {
    "kg": {"kg": 1.0, "g": 0.001, "gram": 0.001, "grams": 0.001, "kilogram": 1.0, "lb": 0.453592, "lbs": 0.453592},
    "km": {"km": 1.0, "m": 0.001, "meter": 0.001, "meters": 0.001, "mile": 1.60934, "miles": 1.60934, "mi": 1.60934},
    "USD": {"USD": 1.0, "usd": 1.0, "cents": 0.01, "cent": 0.01},
    "INR": {"INR": 1.0, "inr": 1.0, "paise": 0.01, "paisa": 0.01},
    "percent": {"percent": 1.0, "%": 1.0, "pct": 1.0, "basis_points": 0.01, "bps": 0.01},
}

# Reverse lookup: alias → (canonical, multiplier)
_UNIT_LOOKUP: dict[str, tuple[str, float]] = {}
for canonical, aliases in _UNIT_FAMILIES.items():
    for alias, mult in aliases.items():
        _UNIT_LOOKUP[alias.lower()] = (canonical, mult)

# Approximate exchange rates (for cross-currency reasonableness only)
_EXCHANGE_APPROX: dict[tuple[str, str], tuple[float, float]] = {
    ("USD", "INR"): (70.0, 90.0),
    ("INR", "USD"): (1 / 90.0, 1 / 70.0),
    ("USD", "EUR"): (0.8, 1.0),
    ("EUR", "USD"): (1.0, 1.25),
}


# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------

_SQL = """
CREATE TABLE IF NOT EXISTS bounds (
    field_name TEXT PRIMARY KEY,
    config TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    field_name TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    timestamp TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_field ON history(field_name);
"""


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class NumericChecker:
    """Numeric reasonableness and unit consistency checker."""

    def __init__(self, db_path: str = ":memory:") -> None:
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SQL)
        self._bounds: dict[str, BoundsConfig] = {}
        for row in self._conn.execute("SELECT field_name, config FROM bounds"):
            self._bounds[row["field_name"]] = BoundsConfig.model_validate_json(row["config"])

    # ------------------------------------------------------------------
    def register_bounds(
        self, field_name: str, min_val: float, max_val: float,
        unit: str, alert_multiplier: float = 3.0,
    ) -> BoundsConfig:
        cfg = BoundsConfig(field_name=field_name, min_val=min_val,
                           max_val=max_val, unit=unit, alert_multiplier=alert_multiplier)
        self._bounds[field_name] = cfg
        self._conn.execute(
            "INSERT OR REPLACE INTO bounds (field_name, config) VALUES (?,?)",
            (field_name, cfg.model_dump_json()),
        )
        self._conn.commit()
        return cfg

    # ------------------------------------------------------------------
    def check(self, value: float, unit: str, context: dict[str, Any] | None = None) -> NumericCheckResult:
        context = context or {}
        field_name = context.get("field", "unknown")
        warnings: list[str] = []
        suggestions: list[str] = []
        risk = RiskLevel.LOW
        valid = True

        # Normalize unit
        norm_value, norm_unit = self._normalize(value, unit)

        # Bounds check
        bounds = self._bounds.get(field_name)
        if bounds:
            # Normalize value to bounds unit for comparison
            cmp_value, cmp_unit = self._normalize_to(value, unit, bounds.unit)
            if cmp_value is not None:
                if cmp_value < bounds.min_val:
                    warnings.append(f"Value {cmp_value:.2f} {cmp_unit} below minimum {bounds.min_val}")
                    risk = RiskLevel.MEDIUM
                    valid = False
                elif cmp_value > bounds.max_val * bounds.alert_multiplier:
                    warnings.append(
                        f"Value {cmp_value:.2f} {cmp_unit} exceeds {bounds.alert_multiplier}x max ({bounds.max_val}) — HIGH risk"
                    )
                    risk = RiskLevel.HIGH
                    valid = False
                elif cmp_value > bounds.max_val:
                    warnings.append(f"Value {cmp_value:.2f} {cmp_unit} exceeds max {bounds.max_val}")
                    risk = RiskLevel.MEDIUM
                    valid = False

                # Cents-vs-dollars suggestion
                if cmp_value > bounds.max_val and bounds.unit.upper() in ("USD", "EUR", "GBP"):
                    div100 = cmp_value / 100.0
                    if bounds.min_val <= div100 <= bounds.max_val:
                        suggestions.append(
                            f"This looks like cents not dollars (÷100 = {div100:.2f} is in expected range)"
                        )

        # Historical anomaly
        anomaly_score = self._historical_anomaly(field_name, norm_value, norm_unit)
        if anomaly_score > 3.0:
            warnings.append(f"Statistical anomaly: {anomaly_score:.1f} sigma from historical mean")
            if risk.value < RiskLevel.HIGH.value:
                risk = RiskLevel.HIGH
            valid = False
        elif anomaly_score > 2.0:
            warnings.append(f"Elevated anomaly score: {anomaly_score:.1f} sigma")
            if risk == RiskLevel.LOW:
                risk = RiskLevel.MEDIUM

        # Record history
        self._record(field_name, norm_value, norm_unit)

        # Cross-currency reasonableness
        expected_unit = bounds.unit if bounds else None
        if expected_unit and expected_unit.upper() != norm_unit.upper():
            pair = (norm_unit.upper(), expected_unit.upper())
            rates = _EXCHANGE_APPROX.get(pair)
            if rates:
                lo, hi = rates
                suggestions.append(
                    f"Unit mismatch: got {norm_unit}, expected {expected_unit}. "
                    f"If converting, {value} {norm_unit} ≈ {value * lo:.2f}–{value * hi:.2f} {expected_unit}"
                )

        return NumericCheckResult(
            valid=valid, warnings=warnings,
            normalized_value=norm_value, normalized_unit=norm_unit,
            anomaly_score=anomaly_score, risk_level=risk,
            suggestions=suggestions,
        )

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _normalize(self, value: float, unit: str) -> tuple[float, str]:
        lookup = _UNIT_LOOKUP.get(unit.lower())
        if lookup:
            canonical, mult = lookup
            return value * mult, canonical
        return value, unit

    def _normalize_to(self, value: float, from_unit: str, to_unit: str) -> tuple[float | None, str]:
        """Normalize value from from_unit to to_unit if in the same family."""
        from_info = _UNIT_LOOKUP.get(from_unit.lower())
        to_info = _UNIT_LOOKUP.get(to_unit.lower())
        if from_info and to_info and from_info[0] == to_info[0]:
            # Same family: convert to canonical then to target
            canonical_val = value * from_info[1]
            target_val = canonical_val / to_info[1]
            return target_val, to_unit
        if from_unit.lower() == to_unit.lower():
            return value, to_unit
        # Different families — return as-is for direct comparison
        return value, from_unit

    def _historical_anomaly(self, field_name: str, value: float, unit: str) -> float:
        rows = self._conn.execute(
            "SELECT value FROM history WHERE field_name = ? ORDER BY id DESC LIMIT 100",
            (field_name,),
        ).fetchall()
        if len(rows) < 3:
            return 0.0
        values = [r["value"] for r in rows]
        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        std = math.sqrt(variance) if variance > 0 else 0.0
        if std == 0:
            return 0.0 if abs(value - mean) < 1e-9 else 10.0
        return abs(value - mean) / std

    def _record(self, field_name: str, value: float, unit: str) -> None:
        self._conn.execute(
            "INSERT INTO history (field_name, value, unit, timestamp) VALUES (?,?,?,?)",
            (field_name, value, unit, datetime.now(timezone.utc).isoformat()),
        )
        self._conn.commit()
