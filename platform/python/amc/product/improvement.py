from __future__ import annotations

"""Feedback-to-improvement loop for product telemetry.

Captures user feedback/corrections and computes a time-windowed improvement score.
"""

from dataclasses import dataclass, asdict, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5
import json
import sqlite3


_IMPROVEMENT_NAMESPACE = UUID("4d6e5f95-c4c5-4e5f-84cb-5d5b5a6a9c2f")


class FeedbackSentiment(str, Enum):
    POSITIVE = "positive"
    CORRECTED = "corrected"
    NEGATIVE = "negative"


_FEEDBACK_SCHEMA = """
CREATE TABLE IF NOT EXISTS feedback_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id TEXT NOT NULL UNIQUE,
    tenant_id TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    run_id TEXT,
    session_id TEXT,
    sentiment TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 0,
    correction_note TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_tenant_workflow
    ON feedback_events(tenant_id, workflow_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created
    ON feedback_events(created_at);
"""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _canonical_json(value: dict[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":"))


@dataclass(frozen=True)
class FeedbackInput:
    tenant_id: str
    workflow_id: str
    run_id: str | None = None
    session_id: str | None = None
    sentiment: FeedbackSentiment = FeedbackSentiment.POSITIVE
    rating: int = 5
    correction_note: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "metadata", dict(self.metadata or {}))

@dataclass(frozen=True)
class FeedbackRecord:
    feedback_id: str
    tenant_id: str
    workflow_id: str
    run_id: str | None
    session_id: str | None
    sentiment: FeedbackSentiment
    rating: int
    correction_note: str | None
    metadata: dict[str, Any]
    created_at: datetime

    @property
    def dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["sentiment"] = self.sentiment.value
        payload["created_at"] = self.created_at.isoformat()
        return payload


@dataclass(frozen=True)
class ImprovementBucket:
    bucket_start: datetime
    bucket_end: datetime
    total_feedback: int
    positive: int
    corrected: int
    negative: int
    score: float


@dataclass(frozen=True)
class ImprovementSeries:
    tenant_id: str
    workflow_id: str
    window_days: int
    total_feedback: int
    mean_rating: float
    current_score: float
    trend_vs_previous: float
    buckets: list[ImprovementBucket]


class FeedbackLoop:
    """Tracks corrections and computes simple improvement scores over time."""

    def __init__(self, db_path: str | Path = "amc_feedback.db") -> None:
        self.db_path = Path(db_path)
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript(_FEEDBACK_SCHEMA)

    @staticmethod
    def _make_feedback_id(record: FeedbackInput) -> str:
        canonical = {
            "tenant_id": record.tenant_id,
            "workflow_id": record.workflow_id,
            "run_id": record.run_id,
            "session_id": record.session_id,
            "sentiment": record.sentiment.value,
            "rating": record.rating,
            "correction_note": record.correction_note or "",
            "metadata": _canonical_json(record.metadata or {}),
        }
        return str(uuid5(_IMPROVEMENT_NAMESPACE, _canonical_json(canonical)))

    def record(self, record: FeedbackInput) -> FeedbackRecord:
        fb_id = self._make_feedback_id(record)
        created_at = _utc_now()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO feedback_events (
                    feedback_id, tenant_id, workflow_id, run_id, session_id,
                    sentiment, rating, correction_note, metadata_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    fb_id,
                    record.tenant_id,
                    record.workflow_id,
                    record.run_id,
                    record.session_id,
                    record.sentiment.value,
                    int(min(10, max(0, record.rating))),
                    record.correction_note,
                    _canonical_json(record.metadata or {}),
                    created_at.isoformat(),
                ),
            )
            conn.commit()

        return FeedbackRecord(
            feedback_id=fb_id,
            tenant_id=record.tenant_id,
            workflow_id=record.workflow_id,
            run_id=record.run_id,
            session_id=record.session_id,
            sentiment=record.sentiment,
            rating=int(min(10, max(0, record.rating))),
            correction_note=record.correction_note,
            metadata=dict(record.metadata or {}),
            created_at=created_at,
        )

    def query(
        self,
        tenant_id: str | None = None,
        workflow_id: str | None = None,
        limit: int = 100,
    ) -> list[FeedbackRecord]:
        clauses = ["1=1"]
        params: list[Any] = []

        if tenant_id:
            clauses.append("tenant_id = ?")
            params.append(tenant_id)
        if workflow_id:
            clauses.append("workflow_id = ?")
            params.append(workflow_id)

        params.append(max(1, min(limit, 1000)))

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            query = f"""
                SELECT feedback_id, tenant_id, workflow_id, run_id, session_id,
                       sentiment, rating, correction_note, metadata_json, created_at
                FROM feedback_events
                WHERE {' AND '.join(clauses)}
                ORDER BY id DESC
                LIMIT ?
            """
            cur = conn.execute(query, params)
            rows = cur.fetchall()

        out: list[FeedbackRecord] = []
        for row in rows:
            out.append(
                FeedbackRecord(
                    feedback_id=row[0],
                    tenant_id=row[1],
                    workflow_id=row[2],
                    run_id=row[3],
                    session_id=row[4],
                    sentiment=FeedbackSentiment(row[5]),
                    rating=row[6],
                    correction_note=row[7],
                    metadata=json.loads(row[8]),
                    created_at=datetime.fromisoformat(row[9]),
                )
            )
        return out

    def compute_improvement(
        self,
        tenant_id: str,
        workflow_id: str,
        window_days: int = 7,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
    ) -> ImprovementSeries:
        feedbacks = self.query(tenant_id=tenant_id, workflow_id=workflow_id, limit=5000)

        if not feedbacks:
            now = _utc_now()
            return ImprovementSeries(
                tenant_id=tenant_id,
                workflow_id=workflow_id,
                window_days=window_days,
                total_feedback=0,
                mean_rating=0.0,
                current_score=0.0,
                trend_vs_previous=0.0,
                buckets=[],
            )

        end = (end_at or _utc_now()).astimezone(timezone.utc)
        start = (start_at or min(f.created_at for f in feedbacks)).astimezone(timezone.utc)
        if window_days <= 0:
            window_days = 7

        filtered = [
            item for item in feedbacks if item.created_at >= start and item.created_at <= end
        ]

        if not filtered:
            return ImprovementSeries(
                tenant_id=tenant_id,
                workflow_id=workflow_id,
                window_days=window_days,
                total_feedback=0,
                mean_rating=0.0,
                current_score=0.0,
                trend_vs_previous=0.0,
                buckets=[],
            )

        # Build contiguous ascending buckets from first event to `end`.
        buckets: list[ImprovementBucket] = []
        cursor = start
        while cursor < end:
            bucket_end = cursor + timedelta(days=window_days)
            upper = min(bucket_end, end)
            if upper == end:
                bucket_items = [f for f in filtered if cursor <= f.created_at <= upper]
            else:
                bucket_items = [f for f in filtered if cursor <= f.created_at < upper]
            pos = sum(1 for f in bucket_items if f.sentiment == FeedbackSentiment.POSITIVE)
            cor = sum(1 for f in bucket_items if f.sentiment == FeedbackSentiment.CORRECTED)
            neg = sum(1 for f in bucket_items if f.sentiment == FeedbackSentiment.NEGATIVE)
            total = len(bucket_items)
            score = 0.0 if total == 0 else round((pos / total) * 100.0, 2)
            buckets.append(
                ImprovementBucket(
                    bucket_start=cursor,
                    bucket_end=min(bucket_end, end),
                    total_feedback=total,
                    positive=pos,
                    corrected=cor,
                    negative=neg,
                    score=score,
                )
            )
            cursor = bucket_end

        # Keep only buckets with at least one sample for trend calculations while
        # preserving the timestamp boundaries for API consumers.
        non_empty = [b for b in buckets if b.total_feedback > 0]
        latest = non_empty[-1] if non_empty else buckets[-1]
        previous = non_empty[-2] if len(non_empty) >= 2 else None

        trend = 0.0
        if previous is not None:
            trend = round(latest.score - previous.score, 2)

        mean_rating = round(
            sum(f.rating for f in filtered) / len(filtered), 3
        ) if filtered else 0.0
        current = latest.score if latest else 0.0

        return ImprovementSeries(
            tenant_id=tenant_id,
            workflow_id=workflow_id,
            window_days=window_days,
            total_feedback=len(filtered),
            mean_rating=mean_rating,
            current_score=current,
            trend_vs_previous=trend,
            buckets=buckets,
        )


# Lightweight singleton helper for API startup/runtime usage.
_global_feedback_loop: FeedbackLoop | None = None


def get_feedback_loop(db_path: str | Path = "amc_feedback.db") -> FeedbackLoop:
    global _global_feedback_loop
    if _global_feedback_loop is None or str(_global_feedback_loop.db_path) != str(db_path):
        _global_feedback_loop = FeedbackLoop(db_path=db_path)
    return _global_feedback_loop
