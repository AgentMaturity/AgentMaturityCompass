"""AMC Product — A/B Testing Platform for Agents (Feature 48).

Allows parallel experiment runs across prompt/workflow/model variants with
automatic winner selection via statistical significance testing.

Key concepts
------------
- **Experiment**: named test with N variants (A, B, C…)
- **ExperimentVariant**: named variant with config overrides
- **ExperimentAssignment**: deterministic variant assignment for (experiment, subject_id)
- **ExperimentObservation**: outcome metric observed after running a variant
- **WinnerAnalysis**: statistical summary comparing variants; selects winner by
  lift over control on the primary metric.

Revenue path: systematic improvement cycles → better task quality → customer
retention and expansion (Lever A + B).
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Any

import structlog

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS experiments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id   TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'draft',
    traffic_percent REAL NOT NULL DEFAULT 100.0,
    primary_metric  TEXT NOT NULL DEFAULT 'success_rate',
    min_sample_size INTEGER NOT NULL DEFAULT 100,
    created_at      TEXT NOT NULL,
    started_at      TEXT,
    stopped_at      TEXT,
    winner_variant  TEXT
);

CREATE TABLE IF NOT EXISTS experiment_variants (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id   TEXT NOT NULL,
    variant_id      TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    is_control      INTEGER NOT NULL DEFAULT 0,
    weight          REAL NOT NULL DEFAULT 1.0,
    config_json     TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (experiment_id) REFERENCES experiments(experiment_id)
);

CREATE TABLE IF NOT EXISTS experiment_assignments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id   TEXT NOT NULL,
    subject_id      TEXT NOT NULL,
    variant_id      TEXT NOT NULL,
    assigned_at     TEXT NOT NULL,
    UNIQUE (experiment_id, subject_id)
);

CREATE TABLE IF NOT EXISTS experiment_observations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    obs_id          TEXT NOT NULL UNIQUE,
    experiment_id   TEXT NOT NULL,
    variant_id      TEXT NOT NULL,
    subject_id      TEXT NOT NULL,
    run_id          TEXT NOT NULL DEFAULT '',
    primary_metric_value  REAL NOT NULL,
    secondary_metrics_json TEXT NOT NULL DEFAULT '{}',
    observed_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_obs_exp ON experiment_observations(experiment_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_assign_exp ON experiment_assignments(experiment_id, subject_id);
"""

# ---------------------------------------------------------------------------
# Enums and models
# ---------------------------------------------------------------------------


class ExperimentStatus(str, Enum):
    DRAFT = "draft"
    RUNNING = "running"
    STOPPED = "stopped"
    CONCLUDED = "concluded"


@dataclass
class ExperimentVariant:
    variant_id: str
    experiment_id: str
    name: str
    is_control: bool = False
    weight: float = 1.0
    config: dict[str, Any] = field(default_factory=dict)

    @property
    def as_dict(self) -> dict[str, Any]:
        return {
            "variant_id": self.variant_id,
            "experiment_id": self.experiment_id,
            "name": self.name,
            "is_control": self.is_control,
            "weight": self.weight,
            "config": self.config,
        }


@dataclass
class Experiment:
    experiment_id: str
    name: str
    description: str
    status: ExperimentStatus
    traffic_percent: float
    primary_metric: str
    min_sample_size: int
    created_at: str
    variants: list[ExperimentVariant] = field(default_factory=list)
    started_at: str | None = None
    stopped_at: str | None = None
    winner_variant: str | None = None

    @property
    def as_dict(self) -> dict[str, Any]:
        return {
            "experiment_id": self.experiment_id,
            "name": self.name,
            "description": self.description,
            "status": self.status.value,
            "traffic_percent": self.traffic_percent,
            "primary_metric": self.primary_metric,
            "min_sample_size": self.min_sample_size,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "stopped_at": self.stopped_at,
            "winner_variant": self.winner_variant,
            "variants": [v.as_dict for v in self.variants],
        }


@dataclass
class ExperimentAssignment:
    experiment_id: str
    subject_id: str
    variant_id: str
    assigned_at: str
    variant_config: dict[str, Any] = field(default_factory=dict)


@dataclass
class VariantStats:
    variant_id: str
    variant_name: str
    is_control: bool
    sample_size: int
    mean: float
    std: float
    lift_vs_control: float | None = None
    p_value: float | None = None
    is_winner: bool = False


@dataclass
class WinnerAnalysis:
    experiment_id: str
    primary_metric: str
    total_observations: int
    min_sample_met: bool
    winner_variant_id: str | None
    winner_name: str | None
    stats: list[VariantStats] = field(default_factory=list)
    conclusion: str = ""

    @property
    def as_dict(self) -> dict[str, Any]:
        return {
            "experiment_id": self.experiment_id,
            "primary_metric": self.primary_metric,
            "total_observations": self.total_observations,
            "min_sample_met": self.min_sample_met,
            "winner_variant_id": self.winner_variant_id,
            "winner_name": self.winner_name,
            "conclusion": self.conclusion,
            "stats": [
                {
                    "variant_id": s.variant_id,
                    "variant_name": s.variant_name,
                    "is_control": s.is_control,
                    "sample_size": s.sample_size,
                    "mean": round(s.mean, 6),
                    "std": round(s.std, 6),
                    "lift_vs_control": round(s.lift_vs_control, 6) if s.lift_vs_control is not None else None,
                    "p_value": round(s.p_value, 6) if s.p_value is not None else None,
                    "is_winner": s.is_winner,
                }
                for s in self.stats
            ],
        }


# ---------------------------------------------------------------------------
# ABTestingPlatform
# ---------------------------------------------------------------------------


class ABTestingPlatform:
    """Manages experiment lifecycle and statistical analysis.

    Uses a deterministic hash-based assignment so the same subject always
    gets the same variant (sticky assignment) unless overridden.
    """

    def __init__(self, db_path: str | Path = "amc_ab_testing.db") -> None:
        self._db = Path(db_path)
        self._lock = Lock()
        self._init_db()
        log.info("ab_testing.init", db=str(self._db))

    # ------------------------------------------------------------------
    # Experiment lifecycle
    # ------------------------------------------------------------------

    def create_experiment(
        self,
        name: str,
        description: str = "",
        primary_metric: str = "success_rate",
        traffic_percent: float = 100.0,
        min_sample_size: int = 100,
        variants: list[dict[str, Any]] | None = None,
    ) -> Experiment:
        """Create a new experiment in draft state with one or more variants."""
        now = datetime.now(timezone.utc).isoformat()
        exp_id = str(uuid.uuid4())

        variant_objects: list[ExperimentVariant] = []

        if variants:
            for idx, v in enumerate(variants):
                vobj = ExperimentVariant(
                    variant_id=str(uuid.uuid4()),
                    experiment_id=exp_id,
                    name=v.get("name", f"variant_{idx}"),
                    is_control=bool(v.get("is_control", idx == 0)),
                    weight=float(v.get("weight", 1.0)),
                    config=dict(v.get("config", {})),
                )
                variant_objects.append(vobj)
        else:
            # Default: control + treatment
            for idx, v_name in enumerate(["control", "treatment"]):
                vobj = ExperimentVariant(
                    variant_id=str(uuid.uuid4()),
                    experiment_id=exp_id,
                    name=v_name,
                    is_control=(idx == 0),
                    weight=1.0,
                    config={},
                )
                variant_objects.append(vobj)

        with self._lock:
            conn = self._connect()
            conn.execute(
                """
                INSERT INTO experiments
                (experiment_id, name, description, status, traffic_percent,
                 primary_metric, min_sample_size, created_at)
                VALUES (?,?,?,?,?,?,?,?)
                """,
                (
                    exp_id, name, description,
                    ExperimentStatus.DRAFT.value,
                    traffic_percent, primary_metric, min_sample_size, now,
                ),
            )
            for v in variant_objects:
                conn.execute(
                    """
                    INSERT INTO experiment_variants
                    (experiment_id, variant_id, name, is_control, weight, config_json)
                    VALUES (?,?,?,?,?,?)
                    """,
                    (
                        exp_id, v.variant_id, v.name,
                        1 if v.is_control else 0,
                        v.weight, json.dumps(v.config),
                    ),
                )
            conn.commit()
            conn.close()

        exp = Experiment(
            experiment_id=exp_id,
            name=name,
            description=description,
            status=ExperimentStatus.DRAFT,
            traffic_percent=traffic_percent,
            primary_metric=primary_metric,
            min_sample_size=min_sample_size,
            created_at=now,
            variants=variant_objects,
        )
        log.info("ab_testing.experiment_created", experiment_id=exp_id, name=name)
        return exp

    def start_experiment(self, experiment_id: str) -> Experiment:
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            conn = self._connect()
            conn.execute(
                "UPDATE experiments SET status=?, started_at=? WHERE experiment_id=?",
                (ExperimentStatus.RUNNING.value, now, experiment_id),
            )
            conn.commit()
            conn.close()
        exp = self.get_experiment(experiment_id)
        if exp is None:
            raise ValueError(f"Experiment not found: {experiment_id}")
        log.info("ab_testing.started", experiment_id=experiment_id)
        return exp

    def stop_experiment(self, experiment_id: str, conclude: bool = False) -> Experiment:
        now = datetime.now(timezone.utc).isoformat()
        status = ExperimentStatus.CONCLUDED if conclude else ExperimentStatus.STOPPED
        with self._lock:
            conn = self._connect()
            conn.execute(
                "UPDATE experiments SET status=?, stopped_at=? WHERE experiment_id=?",
                (status.value, now, experiment_id),
            )
            conn.commit()
            conn.close()
        exp = self.get_experiment(experiment_id)
        if exp is None:
            raise ValueError(f"Experiment not found: {experiment_id}")
        log.info("ab_testing.stopped", experiment_id=experiment_id, status=status.value)
        return exp

    # ------------------------------------------------------------------
    # Assignment
    # ------------------------------------------------------------------

    def assign_variant(
        self, experiment_id: str, subject_id: str
    ) -> ExperimentAssignment | None:
        """Return the variant assignment for a subject; create if not exists.

        Uses weighted deterministic hash so the same subject always gets the
        same variant.  Returns None if the experiment is not running.
        """
        exp = self.get_experiment(experiment_id)
        if exp is None or exp.status != ExperimentStatus.RUNNING:
            return None

        # Check existing assignment
        conn = self._connect()
        existing = conn.execute(
            "SELECT * FROM experiment_assignments WHERE experiment_id=? AND subject_id=?",
            (experiment_id, subject_id),
        ).fetchone()
        conn.close()

        if existing:
            variant_id = existing["variant_id"]
        else:
            variant_id = self._deterministic_assign(subject_id, exp.variants)
            now = datetime.now(timezone.utc).isoformat()
            with self._lock:
                conn = self._connect()
                try:
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO experiment_assignments
                        (experiment_id, subject_id, variant_id, assigned_at)
                        VALUES (?,?,?,?)
                        """,
                        (experiment_id, subject_id, variant_id, now),
                    )
                    conn.commit()
                except sqlite3.IntegrityError:
                    pass  # concurrent insert; re-read below
                finally:
                    conn.close()

        variant = next((v for v in exp.variants if v.variant_id == variant_id), None)
        if variant is None:
            return None

        return ExperimentAssignment(
            experiment_id=experiment_id,
            subject_id=subject_id,
            variant_id=variant_id,
            assigned_at=datetime.now(timezone.utc).isoformat(),
            variant_config=variant.config,
        )

    # ------------------------------------------------------------------
    # Observations
    # ------------------------------------------------------------------

    def record_observation(
        self,
        experiment_id: str,
        variant_id: str,
        subject_id: str,
        primary_metric_value: float,
        run_id: str = "",
        secondary_metrics: dict[str, float] | None = None,
    ) -> str:
        """Record an observed metric value for a variant."""
        obs_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            conn = self._connect()
            conn.execute(
                """
                INSERT INTO experiment_observations
                (obs_id, experiment_id, variant_id, subject_id, run_id,
                 primary_metric_value, secondary_metrics_json, observed_at)
                VALUES (?,?,?,?,?,?,?,?)
                """,
                (
                    obs_id, experiment_id, variant_id, subject_id, run_id,
                    primary_metric_value,
                    json.dumps(secondary_metrics or {}),
                    now,
                ),
            )
            conn.commit()
            conn.close()
        log.debug("ab_testing.observation", obs_id=obs_id, variant_id=variant_id, value=primary_metric_value)
        return obs_id

    # ------------------------------------------------------------------
    # Analysis
    # ------------------------------------------------------------------

    def analyze(self, experiment_id: str) -> WinnerAnalysis:
        """Compute winner and lift statistics for an experiment."""
        exp = self.get_experiment(experiment_id)
        if exp is None:
            raise ValueError(f"Experiment not found: {experiment_id}")

        conn = self._connect()
        obs_rows = conn.execute(
            "SELECT variant_id, primary_metric_value FROM experiment_observations WHERE experiment_id=?",
            (experiment_id,),
        ).fetchall()
        conn.close()

        from collections import defaultdict
        import math

        groups: dict[str, list[float]] = defaultdict(list)
        for r in obs_rows:
            groups[r["variant_id"]].append(r["primary_metric_value"])

        total_obs = sum(len(v) for v in groups.values())
        min_sample_met = all(len(v) >= exp.min_sample_size for v in groups.values())

        def _mean(xs: list[float]) -> float:
            return sum(xs) / len(xs) if xs else 0.0

        def _std(xs: list[float]) -> float:
            if len(xs) < 2:
                return 0.0
            m = _mean(xs)
            return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))

        def _welch_t_pvalue(a: list[float], b: list[float]) -> float:
            """Simplified Welch's t-test p-value approximation."""
            if len(a) < 2 or len(b) < 2:
                return 1.0
            ma, mb = _mean(a), _mean(b)
            va = _std(a) ** 2 / len(a)
            vb = _std(b) ** 2 / len(b)
            denom = math.sqrt(va + vb)
            if denom == 0:
                return 0.0 if ma != mb else 1.0
            t = abs(ma - mb) / denom
            # Crude p-value approximation via normal CDF approximation
            # p ~ 2 * (1 - Φ(t)) — uses a polynomial approximation
            def _norm_cdf(x: float) -> float:
                # Abramowitz & Stegun approximation
                b1, b2, b3, b4, b5 = 0.319381530, -0.356563782, 1.781477937, -1.821255978, 1.330274429
                p = 0.2316419
                k = 1.0 / (1.0 + p * abs(x))
                poly = ((((b5 * k + b4) * k + b3) * k + b2) * k + b1) * k
                return 1.0 - (1.0 / math.sqrt(2 * math.pi)) * math.exp(-0.5 * x * x) * poly

            p_val = 2.0 * (1.0 - _norm_cdf(t))
            return round(max(0.0, min(1.0, p_val)), 6)

        control = next((v for v in exp.variants if v.is_control), exp.variants[0] if exp.variants else None)
        control_data = groups.get(control.variant_id, []) if control else []
        control_mean = _mean(control_data)

        stats: list[VariantStats] = []
        for v in exp.variants:
            data = groups.get(v.variant_id, [])
            vmean = _mean(data)
            vstd = _std(data)
            lift = ((vmean - control_mean) / control_mean) if control_mean and not v.is_control else None
            pval = _welch_t_pvalue(control_data, data) if not v.is_control and control_data else None
            stats.append(VariantStats(
                variant_id=v.variant_id,
                variant_name=v.name,
                is_control=v.is_control,
                sample_size=len(data),
                mean=vmean,
                std=vstd,
                lift_vs_control=lift,
                p_value=pval,
            ))

        # Winner: non-control variant with p < 0.05 and highest positive lift
        candidates = [s for s in stats if not s.is_control and s.p_value is not None and s.p_value < 0.05 and (s.lift_vs_control or 0) > 0]
        winner = max(candidates, key=lambda s: s.lift_vs_control or 0) if candidates else None
        if winner:
            winner.is_winner = True

        if winner:
            conclusion = (
                f"Variant '{winner.variant_name}' is the winner with "
                f"{round((winner.lift_vs_control or 0) * 100, 2)}% lift over control "
                f"(p={winner.p_value:.4f})."
            )
        elif min_sample_met:
            conclusion = "Experiment has sufficient data but no statistically significant winner found."
        else:
            conclusion = f"Insufficient data: need {exp.min_sample_size} observations per variant."

        # Persist winner if found
        if winner:
            with self._lock:
                conn = self._connect()
                conn.execute(
                    "UPDATE experiments SET winner_variant=? WHERE experiment_id=?",
                    (winner.variant_id, experiment_id),
                )
                conn.commit()
                conn.close()

        return WinnerAnalysis(
            experiment_id=experiment_id,
            primary_metric=exp.primary_metric,
            total_observations=total_obs,
            min_sample_met=min_sample_met,
            winner_variant_id=winner.variant_id if winner else None,
            winner_name=winner.variant_name if winner else None,
            stats=stats,
            conclusion=conclusion,
        )

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_experiment(self, experiment_id: str) -> Experiment | None:
        conn = self._connect()
        row = conn.execute(
            "SELECT * FROM experiments WHERE experiment_id=?", (experiment_id,)
        ).fetchone()
        if row is None:
            conn.close()
            return None
        variant_rows = conn.execute(
            "SELECT * FROM experiment_variants WHERE experiment_id=?", (experiment_id,)
        ).fetchall()
        conn.close()

        variants = [
            ExperimentVariant(
                variant_id=v["variant_id"],
                experiment_id=experiment_id,
                name=v["name"],
                is_control=bool(v["is_control"]),
                weight=v["weight"],
                config=json.loads(v["config_json"] or "{}"),
            )
            for v in variant_rows
        ]

        return Experiment(
            experiment_id=row["experiment_id"],
            name=row["name"],
            description=row["description"],
            status=ExperimentStatus(row["status"]),
            traffic_percent=row["traffic_percent"],
            primary_metric=row["primary_metric"],
            min_sample_size=row["min_sample_size"],
            created_at=row["created_at"],
            variants=variants,
            started_at=row["started_at"],
            stopped_at=row["stopped_at"],
            winner_variant=row["winner_variant"],
        )

    def list_experiments(
        self, status: ExperimentStatus | None = None, limit: int = 50
    ) -> list[Experiment]:
        conn = self._connect()
        if status:
            rows = conn.execute(
                "SELECT experiment_id FROM experiments WHERE status=? ORDER BY created_at DESC LIMIT ?",
                (status.value, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT experiment_id FROM experiments ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        conn.close()
        result = []
        for r in rows:
            exp = self.get_experiment(r["experiment_id"])
            if exp:
                result.append(exp)
        return result

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        with self._lock:
            conn = self._connect()
            conn.executescript(_SCHEMA)
            conn.commit()
            conn.close()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _deterministic_assign(subject_id: str, variants: list[ExperimentVariant]) -> str:
        """Assign variant deterministically using weighted hash bucket."""
        if not variants:
            raise ValueError("No variants to assign")
        total_weight = sum(v.weight for v in variants)
        h = int(hashlib.sha256(subject_id.encode()).hexdigest(), 16)
        bucket = (h % 10_000) / 10_000.0  # 0..1
        cumulative = 0.0
        for v in variants:
            cumulative += v.weight / total_weight
            if bucket < cumulative:
                return v.variant_id
        return variants[-1].variant_id


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_default_platform: ABTestingPlatform | None = None


def get_ab_platform(db_path: str | Path = "amc_ab_testing.db") -> ABTestingPlatform:
    global _default_platform
    if _default_platform is None:
        _default_platform = ABTestingPlatform(db_path=db_path)
    return _default_platform


__all__ = [
    "ExperimentStatus",
    "ExperimentVariant",
    "Experiment",
    "ExperimentAssignment",
    "VariantStats",
    "WinnerAnalysis",
    "ABTestingPlatform",
    "get_ab_platform",
]
