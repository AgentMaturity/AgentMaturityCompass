"""S5 Reputation Engine — skill & publisher trust scoring with Sybil detection.

Provides a SQLite-backed reputation graph that tracks publisher/skill installs,
uninstalls, crash/security reports, and computes a 0-100 trust score.

Usage::

    from amc.shield.s5_reputation import ReputationGraph, UserReport, ReportType

    graph = ReputationGraph()
    graph.register_publisher("pub-1", "Acme Corp", verified=True)
    graph.register_skill("skill-a", "pub-1")
    graph.record_install("skill-a", "pub-1")
    trust = graph.compute_trust("skill-a")
    print(trust.score, trust.tier)
"""
from __future__ import annotations

import enum
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from pydantic import BaseModel, Field

from amc.core.models import Finding, RiskLevel, ScanResult  # noqa: F401

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class ReportType(str, enum.Enum):
    """Category of a user-filed report against a skill."""

    CRASH = "crash"
    MALICIOUS = "malicious"
    SUSPICIOUS = "suspicious"
    FALSE_POSITIVE = "false_positive"


class TrustTier(str, enum.Enum):
    """Human-readable trust band derived from a numeric score.

    Ranges::

        UNTRUSTED  0-30
        LOW        31-50
        MEDIUM     51-70
        HIGH       71-85
        VERIFIED   86-100
    """

    UNTRUSTED = "untrusted"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    VERIFIED = "verified"


def _tier_from_score(score: int) -> TrustTier:
    """Map a 0-100 score to a :class:`TrustTier`."""
    if score <= 30:
        return TrustTier.UNTRUSTED
    if score <= 50:
        return TrustTier.LOW
    if score <= 70:
        return TrustTier.MEDIUM
    if score <= 85:
        return TrustTier.HIGH
    return TrustTier.VERIFIED


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class UserReport(BaseModel):
    """A report filed by a user against a skill.

    Example::

        report = UserReport(
            reporter_id="user-42",
            report_type=ReportType.CRASH,
            description="Skill crashed on invoke",
            timestamp=datetime.now(timezone.utc),
        )
    """

    reporter_id: str
    report_type: ReportType
    description: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PublisherProfile(BaseModel):
    """Aggregate profile for a skill publisher."""

    publisher_id: str
    name: str
    verified: bool = False
    install_count: int = 0
    uninstall_count: int = 0
    crash_reports: int = 0
    security_reports: int = 0
    signing_history_count: int = 0
    last_active: datetime | None = None


class SkillProfile(BaseModel):
    """Aggregate profile for an individual skill."""

    skill_id: str
    publisher_id: str
    installs: int = 0
    uninstalls: int = 0
    crash_rate: float = 0.0
    avg_risk_score: float = 0.0
    reports: list[UserReport] = Field(default_factory=list)


class TrustScore(BaseModel):
    """Computed trust score with breakdown.

    Example::

        ts = TrustScore(score=72, tier=TrustTier.HIGH, breakdown={"verified": 30.0})
    """

    score: int = Field(ge=0, le=100)
    tier: TrustTier
    breakdown: dict[str, float] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Sybil detection
# ---------------------------------------------------------------------------


class SybilDetector:
    """Detects anomalous install patterns that may indicate Sybil attacks.

    Example::

        detector = SybilDetector()
        suspicious = detector.flag_suspicious_install_pattern("skill-a", conn)
    """

    INSTALL_THRESHOLD: int = 50
    WINDOW_SECONDS: int = 3600  # 1 hour

    def flag_suspicious_install_pattern(
        self,
        skill_id: str,
        db_conn: sqlite3.Connection,
    ) -> bool:
        """Return ``True`` if *skill_id* received >50 installs in the last hour.

        Args:
            skill_id: The skill to check.
            db_conn: Open SQLite connection with an ``installs`` table.

        Returns:
            ``True`` when the pattern is suspicious.
        """
        cutoff = time.time() - self.WINDOW_SECONDS
        row = db_conn.execute(
            "SELECT COUNT(*) FROM installs WHERE skill_id = ? AND ts >= ?",
            (skill_id, cutoff),
        ).fetchone()
        count = row[0] if row else 0
        flagged = count > self.INSTALL_THRESHOLD
        if flagged:
            log.warning(
                "sybil_pattern_detected",
                skill_id=skill_id,
                installs_1h=count,
            )
        return flagged


# ---------------------------------------------------------------------------
# Reputation graph (SQLite-backed)
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS publishers (
    publisher_id TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    verified     INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS skills (
    skill_id       TEXT PRIMARY KEY,
    publisher_id   TEXT NOT NULL,
    avg_risk_score REAL NOT NULL DEFAULT 0.0,
    FOREIGN KEY (publisher_id) REFERENCES publishers(publisher_id)
);
CREATE TABLE IF NOT EXISTS installs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id  TEXT NOT NULL,
    publisher_id TEXT NOT NULL,
    ts        REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS uninstalls (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id TEXT NOT NULL,
    reason   TEXT NOT NULL DEFAULT '',
    ts       REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id    TEXT NOT NULL,
    reporter_id TEXT NOT NULL,
    report_type TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    ts          REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS trust_cache (
    skill_id TEXT PRIMARY KEY,
    score    INTEGER NOT NULL,
    tier     TEXT NOT NULL,
    updated  REAL NOT NULL
);
"""


class ReputationGraph:
    """SQLite-backed reputation graph for skills and publishers.

    Args:
        db_path: Path to the SQLite database (default in-memory).

    Example::

        rg = ReputationGraph()
        rg.register_publisher("pub-1", "Acme", verified=True)
        rg.register_skill("sk-1", "pub-1")
        rg.record_install("sk-1", "pub-1")
        print(rg.compute_trust("sk-1"))
    """

    def __init__(self, db_path: str = ":memory:") -> None:
        self._conn = sqlite3.connect(db_path)
        self._conn.executescript(_SCHEMA)
        self._sybil = SybilDetector()

    # -- registration -------------------------------------------------------

    def register_publisher(
        self,
        publisher_id: str,
        name: str,
        verified: bool = False,
    ) -> None:
        """Register a new publisher.

        Args:
            publisher_id: Unique publisher identifier.
            name: Display name.
            verified: Whether the publisher is verified.
        """
        self._conn.execute(
            "INSERT OR REPLACE INTO publishers (publisher_id, name, verified) VALUES (?, ?, ?)",
            (publisher_id, name, int(verified)),
        )
        self._conn.commit()
        log.info("publisher_registered", publisher_id=publisher_id, verified=verified)

    def register_skill(
        self,
        skill_id: str,
        publisher_id: str,
        avg_risk_score: float = 0.0,
    ) -> None:
        """Register a skill under an existing publisher.

        Args:
            skill_id: Unique skill identifier.
            publisher_id: Owning publisher.
            avg_risk_score: Initial average risk score (0-100).
        """
        self._conn.execute(
            "INSERT OR REPLACE INTO skills (skill_id, publisher_id, avg_risk_score) VALUES (?, ?, ?)",
            (skill_id, publisher_id, avg_risk_score),
        )
        self._conn.commit()
        log.info("skill_registered", skill_id=skill_id, publisher_id=publisher_id)

    # -- activity -----------------------------------------------------------

    def record_install(self, skill_id: str, publisher_id: str) -> None:
        """Record a new install event for *skill_id*.

        Args:
            skill_id: Skill being installed.
            publisher_id: Publisher of the skill.
        """
        self._conn.execute(
            "INSERT INTO installs (skill_id, publisher_id, ts) VALUES (?, ?, ?)",
            (skill_id, publisher_id, time.time()),
        )
        self._conn.commit()

    def record_uninstall(self, skill_id: str, reason: str = "") -> None:
        """Record an uninstall event.

        Args:
            skill_id: Skill being uninstalled.
            reason: Optional reason string.
        """
        self._conn.execute(
            "INSERT INTO uninstalls (skill_id, reason, ts) VALUES (?, ?, ?)",
            (skill_id, reason, time.time()),
        )
        self._conn.commit()

    def file_report(self, skill_id: str, report: UserReport) -> TrustScore:
        """File a user report and trigger a trust rescore.

        Args:
            skill_id: Skill the report is against.
            report: The :class:`UserReport` instance.

        Returns:
            Updated :class:`TrustScore` after rescoring.
        """
        self._conn.execute(
            "INSERT INTO reports (skill_id, reporter_id, report_type, description, ts) VALUES (?, ?, ?, ?, ?)",
            (
                skill_id,
                report.reporter_id,
                report.report_type.value,
                report.description,
                report.timestamp.timestamp(),
            ),
        )
        self._conn.commit()
        log.info("report_filed", skill_id=skill_id, type=report.report_type.value)
        return self.compute_trust(skill_id)

    # -- trust computation --------------------------------------------------

    def compute_trust(self, skill_id: str) -> TrustScore:
        """Compute a trust score for *skill_id*.

        Scoring formula:
            - Verified publisher: +30
            - Low uninstall ratio (<10%): +20
            - Zero security reports: +20
            - Risk contribution: (100 - avg_risk_score) * 0.4, capped at 40
            - Crash rate penalty: up to -10
            - Clamped to 0-100

        Args:
            skill_id: Skill to score.

        Returns:
            :class:`TrustScore` with breakdown.

        Raises:
            ValueError: If *skill_id* is not registered.
        """
        row = self._conn.execute(
            "SELECT publisher_id, avg_risk_score FROM skills WHERE skill_id = ?",
            (skill_id,),
        ).fetchone()
        if row is None:
            raise ValueError(f"Unknown skill: {skill_id}")

        publisher_id, avg_risk_score = row

        pub = self._conn.execute(
            "SELECT verified FROM publishers WHERE publisher_id = ?",
            (publisher_id,),
        ).fetchone()
        verified = bool(pub[0]) if pub else False

        installs = self._conn.execute(
            "SELECT COUNT(*) FROM installs WHERE skill_id = ?", (skill_id,)
        ).fetchone()[0]
        uninstalls = self._conn.execute(
            "SELECT COUNT(*) FROM uninstalls WHERE skill_id = ?", (skill_id,)
        ).fetchone()[0]

        crash_reports = self._conn.execute(
            "SELECT COUNT(*) FROM reports WHERE skill_id = ? AND report_type = ?",
            (skill_id, ReportType.CRASH.value),
        ).fetchone()[0]
        security_reports = self._conn.execute(
            "SELECT COUNT(*) FROM reports WHERE skill_id = ? AND report_type IN (?, ?)",
            (skill_id, ReportType.MALICIOUS.value, ReportType.SUSPICIOUS.value),
        ).fetchone()[0]

        breakdown: dict[str, float] = {}
        score = 0.0

        # Verified publisher bonus
        v_bonus = 30.0 if verified else 0.0
        breakdown["verified_publisher"] = v_bonus
        score += v_bonus

        # Low uninstall ratio bonus
        if installs > 0:
            ratio = uninstalls / installs
        else:
            ratio = 0.0
        u_bonus = 20.0 if ratio < 0.1 else 0.0
        breakdown["low_uninstall_ratio"] = u_bonus
        score += u_bonus

        # Zero security reports bonus
        s_bonus = 20.0 if security_reports == 0 else 0.0
        breakdown["zero_security_reports"] = s_bonus
        score += s_bonus

        # Risk score contribution
        risk_contrib = min((100.0 - avg_risk_score) * 0.4, 40.0)
        breakdown["risk_score_contribution"] = risk_contrib
        score += risk_contrib

        # Crash rate penalty
        crash_rate = (crash_reports / installs) if installs > 0 else 0.0
        crash_penalty = min(crash_rate * 100, 10.0)  # up to -10
        breakdown["crash_rate_penalty"] = -crash_penalty
        score -= crash_penalty

        clamped = max(0, min(100, int(score)))
        tier = _tier_from_score(clamped)

        # Cache
        self._conn.execute(
            "INSERT OR REPLACE INTO trust_cache (skill_id, score, tier, updated) VALUES (?, ?, ?, ?)",
            (skill_id, clamped, tier.value, time.time()),
        )
        self._conn.commit()

        return TrustScore(score=clamped, tier=tier, breakdown=breakdown)

    # -- profiles -----------------------------------------------------------

    def get_publisher_profile(self, publisher_id: str) -> PublisherProfile:
        """Retrieve an aggregate :class:`PublisherProfile`.

        Raises:
            ValueError: If publisher not found.
        """
        row = self._conn.execute(
            "SELECT publisher_id, name, verified FROM publishers WHERE publisher_id = ?",
            (publisher_id,),
        ).fetchone()
        if row is None:
            raise ValueError(f"Unknown publisher: {publisher_id}")

        pid, name, verified = row

        install_count = self._conn.execute(
            "SELECT COUNT(*) FROM installs WHERE publisher_id = ?", (pid,)
        ).fetchone()[0]
        uninstall_count = self._conn.execute(
            "SELECT COUNT(*) FROM uninstalls WHERE skill_id IN (SELECT skill_id FROM skills WHERE publisher_id = ?)",
            (pid,),
        ).fetchone()[0]
        crash_reports = self._conn.execute(
            "SELECT COUNT(*) FROM reports WHERE report_type = ? AND skill_id IN (SELECT skill_id FROM skills WHERE publisher_id = ?)",
            (ReportType.CRASH.value, pid),
        ).fetchone()[0]
        security_reports = self._conn.execute(
            "SELECT COUNT(*) FROM reports WHERE report_type IN (?, ?) AND skill_id IN (SELECT skill_id FROM skills WHERE publisher_id = ?)",
            (ReportType.MALICIOUS.value, ReportType.SUSPICIOUS.value, pid),
        ).fetchone()[0]

        last_row = self._conn.execute(
            "SELECT MAX(ts) FROM installs WHERE publisher_id = ?", (pid,)
        ).fetchone()
        last_active = (
            datetime.fromtimestamp(last_row[0], tz=timezone.utc)
            if last_row and last_row[0]
            else None
        )

        return PublisherProfile(
            publisher_id=pid,
            name=name,
            verified=bool(verified),
            install_count=install_count,
            uninstall_count=uninstall_count,
            crash_reports=crash_reports,
            security_reports=security_reports,
            signing_history_count=0,
            last_active=last_active,
        )

    def get_skill_profile(self, skill_id: str) -> SkillProfile:
        """Retrieve an aggregate :class:`SkillProfile`.

        Raises:
            ValueError: If skill not found.
        """
        row = self._conn.execute(
            "SELECT skill_id, publisher_id, avg_risk_score FROM skills WHERE skill_id = ?",
            (skill_id,),
        ).fetchone()
        if row is None:
            raise ValueError(f"Unknown skill: {skill_id}")

        sid, pid, avg_risk = row
        installs = self._conn.execute(
            "SELECT COUNT(*) FROM installs WHERE skill_id = ?", (sid,)
        ).fetchone()[0]
        uninstalls = self._conn.execute(
            "SELECT COUNT(*) FROM uninstalls WHERE skill_id = ?", (sid,)
        ).fetchone()[0]
        crash_count = self._conn.execute(
            "SELECT COUNT(*) FROM reports WHERE skill_id = ? AND report_type = ?",
            (sid, ReportType.CRASH.value),
        ).fetchone()[0]
        crash_rate = (crash_count / installs) if installs > 0 else 0.0

        report_rows = self._conn.execute(
            "SELECT reporter_id, report_type, description, ts FROM reports WHERE skill_id = ?",
            (sid,),
        ).fetchall()
        reports = [
            UserReport(
                reporter_id=r[0],
                report_type=ReportType(r[1]),
                description=r[2],
                timestamp=datetime.fromtimestamp(r[3], tz=timezone.utc),
            )
            for r in report_rows
        ]

        return SkillProfile(
            skill_id=sid,
            publisher_id=pid,
            installs=installs,
            uninstalls=uninstalls,
            crash_rate=crash_rate,
            avg_risk_score=avg_risk,
            reports=reports,
        )

    # -- enforcement --------------------------------------------------------

    def enforce_threshold(self, skill_id: str, min_score: int) -> TrustScore:
        """Ensure *skill_id* meets a minimum trust score.

        Args:
            skill_id: Skill to check.
            min_score: Minimum acceptable score.

        Returns:
            :class:`TrustScore` if threshold met.

        Raises:
            ValueError: If score is below *min_score*.
        """
        ts = self.compute_trust(skill_id)
        if ts.score < min_score:
            raise ValueError(
                f"Skill {skill_id} trust score {ts.score} is below minimum {min_score}"
            )
        return ts
