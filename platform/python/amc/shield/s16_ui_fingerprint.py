"""
AMC Shield — S16: Trusted UI Fingerprint Guard
===============================================

Detects portal UI tampering and phishing by comparing page fingerprints
before the agent enters credentials or submits forms.  A baseline is captured
for trusted pages; subsequent visits are compared and a drift score (0–1) is
calculated.  Suspicious pages are blocklisted in SQLite.

Usage
-----

.. code-block:: python

    from amc.shield.s16_ui_fingerprint import UIFingerprintGuard, FingerprintPolicy

    guard = UIFingerprintGuard(
        policy=FingerprintPolicy(monitored_domains=["auth.myapp.com"]),
    )

    # Capture a trusted baseline
    baseline = guard.capture_baseline(
        domain="auth.myapp.com",
        page_path="/login",
        title="My App — Sign In",
        form_html='<form><input name="email"/><input name="password"/></form>',
        cert_issuer="Let's Encrypt",
    )

    # Later: check a live page
    check = guard.check_page(
        domain="auth.myapp.com",
        page_path="/login",
        title="My App — Sign In",
        form_html='<form><input name="email"/><input name="password"/></form>',
        cert_issuer="Let's Encrypt",
    )
    # check.drift_score == 0.0  (identical)
    # check.suspicious == False
"""
from __future__ import annotations

import hashlib
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator

import structlog
from pydantic import BaseModel, Field

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class UIFingerprint(BaseModel):
    """A stored fingerprint for a trusted page."""

    fingerprint_id: str
    domain: str
    page_path: str
    title_hash: str
    form_fields_hash: str
    cert_issuer: str | None = None
    logo_hash: str | None = None
    captured_at: datetime
    trusted: bool = False


class FingerprintCheck(BaseModel):
    """Result of comparing a live page against a stored baseline."""

    domain: str
    page_path: str
    current_title_hash: str
    current_form_hash: str
    cert_issuer: str | None = None
    baseline_id: str | None = None
    drift_score: float  # 0 = identical, 1 = completely different
    suspicious: bool
    drift_details: list[str]
    checked_at: datetime


class FingerprintPolicy(BaseModel):
    """Policy controlling which domains are monitored and what constitutes suspicious."""

    monitored_domains: list[str] = Field(default_factory=list)
    block_on_suspicious: bool = True
    alert_on_new_domain: bool = True
    similarity_threshold: float = 0.8  # drift above this → suspicious


# ---------------------------------------------------------------------------
# DDL
# ---------------------------------------------------------------------------

_DDL = """
CREATE TABLE IF NOT EXISTS ui_fingerprints (
    fingerprint_id      TEXT PRIMARY KEY,
    domain              TEXT NOT NULL,
    page_path           TEXT NOT NULL,
    title_hash          TEXT NOT NULL,
    form_fields_hash    TEXT NOT NULL,
    cert_issuer         TEXT,
    logo_hash           TEXT,
    captured_at         TEXT NOT NULL,
    trusted             INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_uf_domain_path ON ui_fingerprints(domain, page_path);

CREATE TABLE IF NOT EXISTS blocked_domains (
    domain      TEXT PRIMARY KEY,
    blocked_at  TEXT NOT NULL
);
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------

class UIFingerprintGuard:
    """
    Guards trusted portal pages from UI tampering and phishing.

    Parameters
    ----------
    policy : FingerprintPolicy
        Runtime policy governing monitoring and blocking behaviour.
    db_path : str | Path
        Path to the SQLite database.  Defaults to in-memory.
    """

    def __init__(
        self,
        policy: FingerprintPolicy | None = None,
        db_path: str | Path = ":memory:",
    ) -> None:
        self.policy = policy or FingerprintPolicy()
        self._db_path = str(db_path)
        # SQLite in-memory DBs are per-connection, so keep one open connection
        # when using ``:memory:`` (the default in unit tests).
        self._conn_obj = (
            sqlite3.connect(self._db_path, check_same_thread=False)
            if self._db_path == ":memory:"
            else None
        )
        self._init_db()
        logger.info(
            "UIFingerprintGuard ready",
            monitored_domains=self.policy.monitored_domains,
        )

    # ------------------------------------------------------------------
    # DB
    # ------------------------------------------------------------------

    @contextmanager
    def _conn(self) -> Generator[sqlite3.Connection, None, None]:
        if self._conn_obj is not None:
            conn = self._conn_obj
            conn.row_factory = sqlite3.Row
            try:
                yield conn
                conn.commit()
            finally:
                pass
            return

        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self) -> None:
        with self._conn() as conn:
            conn.executescript(_DDL)

    def _row_to_fingerprint(self, row: sqlite3.Row) -> UIFingerprint:
        return UIFingerprint(
            fingerprint_id=row["fingerprint_id"],
            domain=row["domain"],
            page_path=row["page_path"],
            title_hash=row["title_hash"],
            form_fields_hash=row["form_fields_hash"],
            cert_issuer=row["cert_issuer"],
            logo_hash=row["logo_hash"],
            captured_at=datetime.fromisoformat(row["captured_at"]),
            trusted=bool(row["trusted"]),
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def capture_baseline(
        self,
        domain: str,
        page_path: str,
        title: str,
        form_html: str,
        cert_issuer: str | None = None,
    ) -> UIFingerprint:
        """
        Hash the provided page attributes and store them as a trusted baseline.

        Parameters
        ----------
        domain:
            Hostname of the page (e.g. ``auth.myapp.com``).
        page_path:
            URL path (e.g. ``/login``).
        title:
            Full page title text.
        form_html:
            Raw HTML of the form(s) on the page — used for field hashing.
        cert_issuer:
            TLS certificate issuer CN (optional).

        Returns
        -------
        UIFingerprint
            The newly stored baseline fingerprint.
        """
        fp = UIFingerprint(
            fingerprint_id=str(uuid.uuid4()),
            domain=domain,
            page_path=page_path,
            title_hash=_sha256(title),
            form_fields_hash=_sha256(form_html),
            cert_issuer=cert_issuer,
            logo_hash=None,
            captured_at=_utcnow(),
            trusted=True,
        )
        with self._conn() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO ui_fingerprints
                    (fingerprint_id, domain, page_path, title_hash, form_fields_hash,
                     cert_issuer, logo_hash, captured_at, trusted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    fp.fingerprint_id,
                    fp.domain,
                    fp.page_path,
                    fp.title_hash,
                    fp.form_fields_hash,
                    fp.cert_issuer,
                    fp.logo_hash,
                    fp.captured_at.isoformat(),
                    int(fp.trusted),
                ),
            )
        logger.info(
            "UI baseline captured",
            domain=domain,
            page_path=page_path,
            fingerprint_id=fp.fingerprint_id,
        )
        return fp

    def check_page(
        self,
        domain: str,
        page_path: str,
        title: str,
        form_html: str,
        cert_issuer: str | None = None,
    ) -> FingerprintCheck:
        """
        Compare a live page against the stored baseline for (domain, page_path).

        Parameters
        ----------
        domain, page_path, title, form_html, cert_issuer:
            Current page attributes to fingerprint.

        Returns
        -------
        FingerprintCheck
            Drift score and suspicion flags.
        """
        now = _utcnow()
        current_title_hash = _sha256(title)
        current_form_hash = _sha256(form_html)
        drift_details: list[str] = []

        # Lookup baseline
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM ui_fingerprints WHERE domain = ? AND page_path = ? "
                "AND trusted = 1 ORDER BY captured_at DESC LIMIT 1",
                (domain, page_path),
            ).fetchone()

        if row is None:
            # No baseline — new domain / path
            if self.policy.alert_on_new_domain:
                drift_details.append(f"No baseline found for {domain}{page_path}")
            check = FingerprintCheck(
                domain=domain,
                page_path=page_path,
                current_title_hash=current_title_hash,
                current_form_hash=current_form_hash,
                cert_issuer=cert_issuer,
                baseline_id=None,
                drift_score=1.0,
                suspicious=self.policy.alert_on_new_domain,
                drift_details=drift_details,
                checked_at=now,
            )
            logger.warning("No UI baseline found", domain=domain, page_path=page_path)
            return check

        baseline = self._row_to_fingerprint(row)
        check_partial = FingerprintCheck(
            domain=domain,
            page_path=page_path,
            current_title_hash=current_title_hash,
            current_form_hash=current_form_hash,
            cert_issuer=cert_issuer,
            baseline_id=baseline.fingerprint_id,
            drift_score=0.0,
            suspicious=False,
            drift_details=[],
            checked_at=now,
        )
        drift_score = self.compute_drift_score(baseline, check_partial)

        if baseline.title_hash != current_title_hash:
            drift_details.append("Page title changed")
        if baseline.form_fields_hash != current_form_hash:
            drift_details.append("Form fields changed")
        if baseline.cert_issuer != cert_issuer:
            drift_details.append(
                f"TLS cert issuer changed: expected '{baseline.cert_issuer}', got '{cert_issuer}'"
            )

        suspicious = drift_score >= (1.0 - self.policy.similarity_threshold)

        check = FingerprintCheck(
            domain=domain,
            page_path=page_path,
            current_title_hash=current_title_hash,
            current_form_hash=current_form_hash,
            cert_issuer=cert_issuer,
            baseline_id=baseline.fingerprint_id,
            drift_score=drift_score,
            suspicious=suspicious,
            drift_details=drift_details,
            checked_at=now,
        )

        if suspicious and self.policy.block_on_suspicious:
            self.mark_suspicious(domain)
            logger.warning(
                "Suspicious UI detected — domain blocked",
                domain=domain,
                drift_score=drift_score,
            )
        else:
            logger.debug("UI check passed", domain=domain, drift_score=drift_score)

        return check

    def compute_drift_score(
        self,
        baseline: UIFingerprint,
        current: FingerprintCheck,
    ) -> float:
        """
        Compute a drift score between 0 (identical) and 1 (completely different).

        Each component (title hash, form hash, cert issuer) contributes
        0 (no drift) or 1 (changed) to the average.
        """
        components: list[float] = []

        # Title hash — 0 if same, 1 if different
        components.append(0.0 if baseline.title_hash == current.current_title_hash else 1.0)

        # Form hash — 0 if same, 1 if different
        components.append(0.0 if baseline.form_fields_hash == current.current_form_hash else 1.0)

        # Cert issuer — 0 if same (including both None), 1 if different
        components.append(0.0 if baseline.cert_issuer == current.cert_issuer else 1.0)

        return sum(components) / len(components)

    def mark_suspicious(self, domain: str) -> None:
        """
        Add *domain* to the SQLite blocklist.

        This is idempotent — calling it multiple times is safe.
        """
        with self._conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO blocked_domains (domain, blocked_at) VALUES (?, ?)",
                (domain, _utcnow().isoformat()),
            )
        logger.info("Domain marked suspicious", domain=domain)

    def is_blocked(self, domain: str) -> bool:
        """Return ``True`` if *domain* is in the blocklist."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT 1 FROM blocked_domains WHERE domain = ?", (domain,)
            ).fetchone()
        return row is not None
