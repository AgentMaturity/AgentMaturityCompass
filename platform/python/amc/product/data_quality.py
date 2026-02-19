"""AMC Data Quality Monitor — Feature #35.

Detect missing/stale/duplicate fields in records, score overall data quality,
and manage per-tenant alert thresholds. SQLite-backed.
"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5

import structlog

from amc.product.persistence import product_db_path

log = structlog.get_logger(__name__)

_DQ_NAMESPACE = UUID("d4e5f6a7-b8c9-0123-defa-234567890123")

_DQ_SCHEMA = """
CREATE TABLE IF NOT EXISTS dq_reports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id       TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    record_type     TEXT NOT NULL,
    record_id       TEXT NOT NULL,
    score           REAL NOT NULL DEFAULT 0.0,
    grade           TEXT NOT NULL DEFAULT 'F',
    issues_json     TEXT NOT NULL DEFAULT '[]',
    checked_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dq_tenant_type   ON dq_reports(tenant_id, record_type);
CREATE INDEX IF NOT EXISTS idx_dq_record        ON dq_reports(tenant_id, record_id);
CREATE INDEX IF NOT EXISTS idx_dq_score         ON dq_reports(score);

CREATE TABLE IF NOT EXISTS dq_thresholds (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    threshold_id    TEXT NOT NULL UNIQUE,
    tenant_id       TEXT NOT NULL,
    record_type     TEXT NOT NULL,
    field_name      TEXT NOT NULL DEFAULT '*',
    check_type      TEXT NOT NULL,
    threshold_value REAL NOT NULL,
    severity        TEXT NOT NULL DEFAULT 'warning',
    active          INTEGER NOT NULL DEFAULT 1,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dq_threshold_key
    ON dq_thresholds(tenant_id, record_type, field_name, check_type);
CREATE INDEX IF NOT EXISTS idx_dq_threshold_tenant ON dq_thresholds(tenant_id, record_type);
"""

_VALID_CHECKS = {"missing", "stale", "duplicate", "format", "range", "custom"}
_VALID_SEVERITIES = {"info", "warning", "error", "critical"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_report_id(tenant_id: str, record_id: str, ts: str) -> str:
    return str(uuid5(_DQ_NAMESPACE, f"report:{tenant_id}:{record_id}:{ts}"))


def _make_threshold_id(tenant_id: str, record_type: str, field: str, check: str) -> str:
    return str(uuid5(_DQ_NAMESPACE, f"threshold:{tenant_id}:{record_type}:{field}:{check}"))


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------

@dataclass
class DataQualityIssue:
    """A single issue found during quality check."""
    issue_type: str    # missing / stale / duplicate / format / range / custom
    field_name: str
    severity: str      # info / warning / error / critical
    description: str
    current_value: Any = None
    expected: str = ""

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "issue_type": self.issue_type,
            "field_name": self.field_name,
            "severity": self.severity,
            "description": self.description,
            "current_value": self.current_value,
            "expected": self.expected,
        }


@dataclass
class QualityReport:
    """Full quality report for a single record."""
    report_id: str
    tenant_id: str
    record_type: str
    record_id: str
    score: float           # 0–100
    grade: str             # A / B / C / D / F
    issues: list[DataQualityIssue]
    checked_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "report_id": self.report_id,
            "tenant_id": self.tenant_id,
            "record_type": self.record_type,
            "record_id": self.record_id,
            "score": self.score,
            "grade": self.grade,
            "issues": [i.dict for i in self.issues],
            "checked_at": self.checked_at,
        }


@dataclass
class CheckInput:
    """Input for a data quality check."""
    tenant_id: str
    record_type: str
    record_id: str
    record: dict[str, Any]
    required_fields: list[str] = field(default_factory=list)
    stale_fields: dict[str, int] = field(default_factory=dict)   # field → max_age_days
    unique_fields: list[str] = field(default_factory=list)        # fields expected unique
    corpus: list[dict[str, Any]] = field(default_factory=list)   # other records (for dup check)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ThresholdInput:
    """Input for setting an alert threshold."""
    tenant_id: str
    record_type: str
    check_type: str
    threshold_value: float
    field_name: str = "*"
    severity: str = "warning"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ThresholdRecord:
    threshold_id: str
    tenant_id: str
    record_type: str
    field_name: str
    check_type: str
    threshold_value: float
    severity: str
    active: bool
    metadata: dict[str, Any]
    created_at: str

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "threshold_id": self.threshold_id,
            "tenant_id": self.tenant_id,
            "record_type": self.record_type,
            "field_name": self.field_name,
            "check_type": self.check_type,
            "threshold_value": self.threshold_value,
            "severity": self.severity,
            "active": self.active,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


@dataclass
class BatchQualitySummary:
    """Summary across multiple records."""
    tenant_id: str
    record_type: str
    total_records: int
    avg_score: float
    grade_distribution: dict[str, int]
    top_issues: list[str]
    alerts_triggered: list[str]

    @property
    def dict(self) -> dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "record_type": self.record_type,
            "total_records": self.total_records,
            "avg_score": self.avg_score,
            "grade_distribution": self.grade_distribution,
            "top_issues": self.top_issues,
            "alerts_triggered": self.alerts_triggered,
        }


# ---------------------------------------------------------------------------
# Core monitor
# ---------------------------------------------------------------------------

class DataQualityMonitor:
    """Detect data quality issues, score records, and manage alert thresholds."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db = Path(db_path) if db_path else product_db_path()
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self) -> None:
        with self._conn() as conn:
            conn.executescript(_DQ_SCHEMA)

    # ------------------------------------------------------------------
    # Check
    # ------------------------------------------------------------------

    def check(self, inp: CheckInput) -> QualityReport:
        """Run all configured checks and score the record."""
        issues: list[DataQualityIssue] = []

        # 1. Missing fields
        issues.extend(_check_missing(inp.record, inp.required_fields))

        # 2. Stale fields
        issues.extend(_check_stale(inp.record, inp.stale_fields))

        # 3. Duplicate detection (within provided corpus)
        if inp.corpus and inp.unique_fields:
            issues.extend(_check_duplicates(inp.record, inp.corpus, inp.unique_fields))

        # 4. Threshold-based checks from DB
        thresholds = self.list_thresholds(inp.tenant_id, inp.record_type)
        issues.extend(_apply_thresholds(inp.record, thresholds))

        score = _compute_score(issues)
        grade = _score_to_grade(score)
        now = _utc_now()
        report_id = _make_report_id(inp.tenant_id, inp.record_id, now)

        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO dq_reports
                    (report_id, tenant_id, record_type, record_id, score, grade, issues_json, checked_at)
                VALUES (?,?,?,?,?,?,?,?)
                """,
                (
                    report_id, inp.tenant_id, inp.record_type, inp.record_id,
                    score, grade, json.dumps([i.dict for i in issues]), now,
                ),
            )

        log.info(
            "dq.checked",
            report_id=report_id,
            tenant=inp.tenant_id,
            record_type=inp.record_type,
            score=score,
            grade=grade,
            issues=len(issues),
        )
        return QualityReport(
            report_id=report_id,
            tenant_id=inp.tenant_id,
            record_type=inp.record_type,
            record_id=inp.record_id,
            score=score,
            grade=grade,
            issues=issues,
            checked_at=now,
        )

    def get_report(self, report_id: str) -> QualityReport | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM dq_reports WHERE report_id=?", (report_id,)
            ).fetchone()
        return _row_to_report(row) if row else None

    def list_reports(
        self,
        tenant_id: str,
        record_type: str | None = None,
        record_id: str | None = None,
        min_score: float | None = None,
        max_score: float | None = None,
        limit: int = 100,
    ) -> list[QualityReport]:
        sql = "SELECT * FROM dq_reports WHERE tenant_id=?"
        params: list[Any] = [tenant_id]
        if record_type:
            sql += " AND record_type=?"
            params.append(record_type)
        if record_id:
            sql += " AND record_id=?"
            params.append(record_id)
        if min_score is not None:
            sql += " AND score>=?"
            params.append(min_score)
        if max_score is not None:
            sql += " AND score<=?"
            params.append(max_score)
        sql += " ORDER BY checked_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [_row_to_report(r) for r in rows]

    def batch_summary(
        self,
        tenant_id: str,
        record_type: str,
        limit: int = 500,
    ) -> BatchQualitySummary:
        """Summarize quality across recent reports for a record type."""
        reports = self.list_reports(tenant_id, record_type=record_type, limit=limit)
        if not reports:
            return BatchQualitySummary(
                tenant_id=tenant_id,
                record_type=record_type,
                total_records=0,
                avg_score=0.0,
                grade_distribution={},
                top_issues=[],
                alerts_triggered=[],
            )

        avg_score = round(sum(r.score for r in reports) / len(reports), 2)
        grade_dist: dict[str, int] = {}
        issue_counter: dict[str, int] = {}
        alerts: list[str] = []

        for r in reports:
            grade_dist[r.grade] = grade_dist.get(r.grade, 0) + 1
            for issue in r.issues:
                key = f"{issue.issue_type}:{issue.field_name}"
                issue_counter[key] = issue_counter.get(key, 0) + 1
                if issue.severity in ("error", "critical"):
                    alerts.append(f"{r.record_id}:{issue.field_name}:{issue.issue_type}")

        top_issues = [
            k for k, _ in sorted(issue_counter.items(), key=lambda x: x[1], reverse=True)
        ][:10]

        return BatchQualitySummary(
            tenant_id=tenant_id,
            record_type=record_type,
            total_records=len(reports),
            avg_score=avg_score,
            grade_distribution=grade_dist,
            top_issues=top_issues,
            alerts_triggered=list(set(alerts))[:20],
        )

    # ------------------------------------------------------------------
    # Thresholds
    # ------------------------------------------------------------------

    def set_threshold(self, inp: ThresholdInput) -> ThresholdRecord:
        check = inp.check_type.lower()
        if check not in _VALID_CHECKS:
            raise ValueError(f"Invalid check_type '{check}'. Choose from: {sorted(_VALID_CHECKS)}")
        sev = inp.severity.lower()
        if sev not in _VALID_SEVERITIES:
            raise ValueError(f"Invalid severity '{sev}'. Choose from: {sorted(_VALID_SEVERITIES)}")

        threshold_id = _make_threshold_id(inp.tenant_id, inp.record_type, inp.field_name, check)
        now = _utc_now()

        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO dq_thresholds
                    (threshold_id, tenant_id, record_type, field_name, check_type,
                     threshold_value, severity, active, metadata_json, created_at)
                VALUES (?,?,?,?,?,?,?,1,?,?)
                ON CONFLICT(tenant_id, record_type, field_name, check_type)
                DO UPDATE SET threshold_value=excluded.threshold_value,
                              severity=excluded.severity,
                              active=1,
                              metadata_json=excluded.metadata_json
                """,
                (
                    threshold_id, inp.tenant_id, inp.record_type, inp.field_name,
                    check, inp.threshold_value, sev, json.dumps(inp.metadata), now,
                ),
            )

        return self.get_threshold(threshold_id)  # type: ignore[return-value]

    def get_threshold(self, threshold_id: str) -> ThresholdRecord | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM dq_thresholds WHERE threshold_id=?", (threshold_id,)
            ).fetchone()
        return _row_to_threshold(row) if row else None

    def list_thresholds(
        self,
        tenant_id: str,
        record_type: str | None = None,
        active_only: bool = True,
    ) -> list[ThresholdRecord]:
        sql = "SELECT * FROM dq_thresholds WHERE tenant_id=?"
        params: list[Any] = [tenant_id]
        if record_type:
            sql += " AND record_type=?"
            params.append(record_type)
        if active_only:
            sql += " AND active=1"
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [_row_to_threshold(r) for r in rows]

    def delete_threshold(self, threshold_id: str) -> bool:
        with self._conn() as conn:
            cur = conn.execute(
                "UPDATE dq_thresholds SET active=0 WHERE threshold_id=?", (threshold_id,)
            )
        return cur.rowcount > 0


# ---------------------------------------------------------------------------
# Check helpers
# ---------------------------------------------------------------------------

def _check_missing(record: dict[str, Any], required: list[str] | None = None, *, required_fields: list[str] | None = None) -> list[DataQualityIssue]:
    required = required_fields if required_fields is not None else (required or [])
    issues = []
    for field_name in required:
        val = record.get(field_name)
        if val is None or val == "" or val == [] or val == {}:
            issues.append(DataQualityIssue(
                issue_type="missing",
                field_name=field_name,
                severity="error",
                description=f"Required field '{field_name}' is missing or empty.",
                current_value=val,
                expected="non-empty value",
            ))
    return issues


def _check_stale(record: dict[str, Any], stale_fields: dict[str, int] | None = None) -> list[DataQualityIssue]:
    """Check timestamp fields for staleness."""
    stale_fields = stale_fields or {}
    issues = []
    now = datetime.now(timezone.utc)
    for field_name, max_age_days in stale_fields.items():
        val = record.get(field_name)
        if val is None:
            continue
        try:
            ts = _parse_timestamp(str(val))
            age = now - ts
            if age > timedelta(days=max_age_days):
                issues.append(DataQualityIssue(
                    issue_type="stale",
                    field_name=field_name,
                    severity="warning",
                    description=(
                        f"Field '{field_name}' is {age.days} days old "
                        f"(max allowed: {max_age_days} days)."
                    ),
                    current_value=str(val),
                    expected=f"updated within last {max_age_days} days",
                ))
        except (ValueError, TypeError):
            issues.append(DataQualityIssue(
                issue_type="format",
                field_name=field_name,
                severity="warning",
                description=f"Field '{field_name}' is not a parseable timestamp.",
                current_value=str(val),
                expected="ISO 8601 timestamp",
            ))
    return issues


def _check_duplicates(
    record: dict[str, Any],
    corpus: list[dict[str, Any]],
    unique_fields: list[str],
) -> list[DataQualityIssue]:
    """Check if record's unique fields match any in corpus."""
    issues = []
    for field_name in unique_fields:
        val = record.get(field_name)
        if val is None:
            continue
        matches = [
            r for r in corpus
            if r.get(field_name) == val and r is not record
        ]
        if matches:
            issues.append(DataQualityIssue(
                issue_type="duplicate",
                field_name=field_name,
                severity="error",
                description=f"Field '{field_name}'='{val}' duplicates {len(matches)} other record(s).",
                current_value=val,
                expected="unique value",
            ))
    return issues


def _apply_thresholds(
    record: dict[str, Any],
    thresholds: list[ThresholdRecord],
) -> list[DataQualityIssue]:
    """Apply stored thresholds to the record."""
    issues = []
    for t in thresholds:
        if t.check_type == "missing" and t.field_name != "*":
            val = record.get(t.field_name)
            if val is None or val == "":
                issues.append(DataQualityIssue(
                    issue_type="missing",
                    field_name=t.field_name,
                    severity=t.severity,
                    description=f"Threshold: field '{t.field_name}' required by policy.",
                    current_value=val,
                    expected="non-empty value",
                ))
        elif t.check_type == "range" and t.field_name != "*":
            val = record.get(t.field_name)
            if val is not None:
                try:
                    fval = float(val)
                    if fval > t.threshold_value:
                        issues.append(DataQualityIssue(
                            issue_type="range",
                            field_name=t.field_name,
                            severity=t.severity,
                            description=(
                                f"Field '{t.field_name}'={fval} exceeds threshold {t.threshold_value}."
                            ),
                            current_value=val,
                            expected=f"<= {t.threshold_value}",
                        ))
                except (ValueError, TypeError):
                    pass
    return issues


def _parse_timestamp(val: str) -> datetime:
    """Parse an ISO timestamp or common date string."""
    # Try fromisoformat first (handles +HH:MM, Z, etc.)
    try:
        # Python 3.11+ handles 'Z'; for older versions replace 'Z' → '+00:00'
        norm = val.strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(norm)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        pass
    # Fallback strptime formats
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            dt = datetime.strptime(val[:19], fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse timestamp: {val!r}")


def _compute_score(issues: list[DataQualityIssue]) -> float:
    """Score 0–100; deduct per issue by severity."""
    deductions = {"info": 2, "warning": 8, "error": 15, "critical": 25}
    score = 100.0
    for issue in issues:
        score -= deductions.get(issue.severity, 5)
    return round(max(0.0, score), 2)


def _score_to_grade(score: float) -> str:
    if score >= 90:
        return "A"
    if score >= 75:
        return "B"
    if score >= 60:
        return "C"
    if score >= 40:
        return "D"
    return "F"


def _row_to_report(row: sqlite3.Row) -> QualityReport:
    issues_raw = json.loads(row["issues_json"])
    issues = [
        DataQualityIssue(
            issue_type=i["issue_type"],
            field_name=i["field_name"],
            severity=i["severity"],
            description=i["description"],
            current_value=i.get("current_value"),
            expected=i.get("expected", ""),
        )
        for i in issues_raw
    ]
    return QualityReport(
        report_id=row["report_id"],
        tenant_id=row["tenant_id"],
        record_type=row["record_type"],
        record_id=row["record_id"],
        score=row["score"],
        grade=row["grade"],
        issues=issues,
        checked_at=row["checked_at"],
    )


def _row_to_threshold(row: sqlite3.Row) -> ThresholdRecord:
    return ThresholdRecord(
        threshold_id=row["threshold_id"],
        tenant_id=row["tenant_id"],
        record_type=row["record_type"],
        field_name=row["field_name"],
        check_type=row["check_type"],
        threshold_value=row["threshold_value"],
        severity=row["severity"],
        active=bool(row["active"]),
        metadata=json.loads(row["metadata_json"]),
        created_at=row["created_at"],
    )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_monitor: DataQualityMonitor | None = None


def get_data_quality_monitor(db_path: str | Path | None = None) -> DataQualityMonitor:
    global _monitor
    if _monitor is None:
        _monitor = DataQualityMonitor(db_path=db_path)
    return _monitor
