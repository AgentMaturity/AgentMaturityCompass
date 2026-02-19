"""
AMC Vault — V14: Secret Rotation Orchestrator
==============================================

When a session is flagged as risky (or on schedule / manually), automatically
rotates tokens/keys and revokes sessions.

No actual secret values are stored.  This module manages *metadata* and
*coordination*; in production the steps would call real vault APIs (e.g.
HashiCorp Vault, AWS Secrets Manager).

Usage
-----

.. code-block:: python

    from datetime import datetime, timezone, timedelta
    from amc.vault.v14_secret_rotation import (
        SecretRotationOrchestrator, SecretRecord, RotationTrigger,
    )

    orch = SecretRotationOrchestrator()

    now = datetime.now(timezone.utc)
    record = orch.register_secret(SecretRecord(
        secret_id="api-key-prod",
        secret_type="api_key",
        description="Production API key",
        last_rotated=now,
        next_rotation=now + timedelta(days=90),
        rotation_count=0,
        status="active",
    ))

    trigger = RotationTrigger(
        trigger_id="t-001",
        trigger_type="risk_flag",
        session_id="sess-xyz",
        risk_score=0.92,
        triggered_at=now,
    )
    result = orch.trigger_rotation(trigger)
    print(result.success, result.secrets_rotated)
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)

_DEFAULT_DB = Path("/tmp/amc_v14_secret_rotation.db")

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class RotationTrigger(BaseModel):
    """An event that initiates the rotation workflow."""

    trigger_id: str
    trigger_type: Literal["risk_flag", "schedule", "manual", "expiry"]
    session_id: str | None = None
    risk_score: float | None = None
    triggered_at: datetime


class SecretRecord(BaseModel):
    """Metadata record for a managed secret (no actual secret value stored)."""

    secret_id: str
    secret_type: str  # e.g. "api_key", "oauth_token", "db_password"
    description: str
    last_rotated: datetime
    next_rotation: datetime
    rotation_count: int = 0
    status: Literal["active", "rotating", "rotated", "revoked"] = "active"


class RotationPlaybook(BaseModel):
    """A rotation playbook that describes how to respond to a trigger."""

    playbook_id: str
    trigger_types: list[str]  # which trigger_type values activate this playbook
    secret_types: list[str]  # which secret_types this playbook covers ("*" = all)
    steps: list[str]  # human-readable step descriptions
    notify_channels: list[str]
    blast_radius: str  # description of scope


class RotationResult(BaseModel):
    """Result of executing a rotation playbook."""

    trigger_id: str
    secrets_rotated: list[str]
    sessions_revoked: list[str]
    playbook_used: str
    success: bool
    errors: list[str] = Field(default_factory=list)
    completed_at: datetime


# ---------------------------------------------------------------------------
# Built-in playbooks
# ---------------------------------------------------------------------------

_BUILTIN_PLAYBOOKS: list[RotationPlaybook] = [
    RotationPlaybook(
        playbook_id="pb-risk-all",
        trigger_types=["risk_flag"],
        secret_types=["*"],
        steps=[
            "1. Identify all active secrets associated with the flagged session",
            "2. Mark secrets as 'rotating' in the registry",
            "3. Generate new secret values via vault API (simulated)",
            "4. Update dependent services with new credentials",
            "5. Revoke old credentials and flagged session",
            "6. Notify security team via configured channels",
            "7. Mark secrets as 'rotated' in the registry",
        ],
        notify_channels=["security-alerts", "pagerduty"],
        blast_radius="All active secrets linked to the compromised session",
    ),
    RotationPlaybook(
        playbook_id="pb-schedule-api-key",
        trigger_types=["schedule", "expiry"],
        secret_types=["api_key", "oauth_token"],
        steps=[
            "1. Identify scheduled secrets past their rotation deadline",
            "2. Generate new API key / OAuth token via vault API (simulated)",
            "3. Update application config with new credentials",
            "4. Revoke old credentials after grace period",
            "5. Update next_rotation timestamp",
        ],
        notify_channels=["ops-notifications"],
        blast_radius="Affected API keys and OAuth tokens only",
    ),
    RotationPlaybook(
        playbook_id="pb-manual-any",
        trigger_types=["manual"],
        secret_types=["*"],
        steps=[
            "1. Operator initiates manual rotation",
            "2. Mark target secrets as 'rotating'",
            "3. Generate new secret values (simulated)",
            "4. Revoke old values",
            "5. Mark secrets as 'rotated'",
        ],
        notify_channels=["audit-log"],
        blast_radius="Operator-specified secrets",
    ),
]

# ---------------------------------------------------------------------------
# SQLite helpers
# ---------------------------------------------------------------------------


def _init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS secrets (
            secret_id      TEXT PRIMARY KEY,
            secret_type    TEXT NOT NULL,
            description    TEXT NOT NULL,
            last_rotated   TEXT NOT NULL,
            next_rotation  TEXT NOT NULL,
            rotation_count INTEGER NOT NULL DEFAULT 0,
            status         TEXT NOT NULL DEFAULT 'active'
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rotation_results (
            result_id        TEXT PRIMARY KEY,
            trigger_id       TEXT NOT NULL,
            secrets_rotated  TEXT NOT NULL,
            sessions_revoked TEXT NOT NULL,
            playbook_used    TEXT NOT NULL,
            success          INTEGER NOT NULL,
            errors_json      TEXT NOT NULL,
            completed_at     TEXT NOT NULL
        )
        """
    )
    conn.commit()


def _save_secret(conn: sqlite3.Connection, rec: SecretRecord) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO secrets
            (secret_id, secret_type, description, last_rotated,
             next_rotation, rotation_count, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            rec.secret_id,
            rec.secret_type,
            rec.description,
            rec.last_rotated.isoformat(),
            rec.next_rotation.isoformat(),
            rec.rotation_count,
            rec.status,
        ),
    )
    conn.commit()


def _load_secret(
    conn: sqlite3.Connection, secret_id: str
) -> SecretRecord | None:
    row = conn.execute(
        "SELECT * FROM secrets WHERE secret_id = ?", (secret_id,)
    ).fetchone()
    if row is None:
        return None
    return _row_to_secret(row)


def _row_to_secret(row: tuple) -> SecretRecord:
    return SecretRecord(
        secret_id=row[0],
        secret_type=row[1],
        description=row[2],
        last_rotated=datetime.fromisoformat(row[3]),
        next_rotation=datetime.fromisoformat(row[4]),
        rotation_count=row[5],
        status=row[6],
    )


def _save_result(
    conn: sqlite3.Connection, result_id: str, result: RotationResult
) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO rotation_results
            (result_id, trigger_id, secrets_rotated, sessions_revoked,
             playbook_used, success, errors_json, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            result_id,
            result.trigger_id,
            json.dumps(result.secrets_rotated),
            json.dumps(result.sessions_revoked),
            result.playbook_used,
            int(result.success),
            json.dumps(result.errors),
            result.completed_at.isoformat(),
        ),
    )
    conn.commit()


def _load_results(
    conn: sqlite3.Connection, secret_id: str | None
) -> list[RotationResult]:
    if secret_id:
        # Filter by secrets_rotated JSON containing the secret_id
        rows = conn.execute(
            "SELECT * FROM rotation_results ORDER BY completed_at DESC"
        ).fetchall()
        rows = [
            r for r in rows if secret_id in json.loads(r[2])
        ]
    else:
        rows = conn.execute(
            "SELECT * FROM rotation_results ORDER BY completed_at DESC"
        ).fetchall()

    results: list[RotationResult] = []
    for row in rows:
        results.append(
            RotationResult(
                trigger_id=row[1],
                secrets_rotated=json.loads(row[2]),
                sessions_revoked=json.loads(row[3]),
                playbook_used=row[4],
                success=bool(row[5]),
                errors=json.loads(row[6]),
                completed_at=datetime.fromisoformat(row[7]),
            )
        )
    return results


# ---------------------------------------------------------------------------
# Core class
# ---------------------------------------------------------------------------


class SecretRotationOrchestrator:
    """Orchestrate secret rotation when triggered by risk flags, schedule,
    manual request, or expiry.

    Parameters
    ----------
    db_path:
        Path to the SQLite database used for persistence.
    playbooks:
        Additional playbooks to include alongside the built-ins.
    """

    def __init__(
        self,
        db_path: Path = _DEFAULT_DB,
        playbooks: list[RotationPlaybook] | None = None,
    ) -> None:
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        _init_db(self._conn)
        self._playbooks: list[RotationPlaybook] = _BUILTIN_PLAYBOOKS + (
            playbooks or []
        )
        log.info("SecretRotationOrchestrator initialised", db_path=str(db_path))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def register_secret(self, record: SecretRecord) -> SecretRecord:
        """Register a secret record in the registry.

        Parameters
        ----------
        record:
            The secret metadata to store (no actual secret value).

        Returns
        -------
        SecretRecord
            The stored record.
        """
        _save_secret(self._conn, record)
        log.info(
            "register_secret",
            secret_id=record.secret_id,
            secret_type=record.secret_type,
        )
        return record

    def trigger_rotation(self, trigger: RotationTrigger) -> RotationResult:
        """Execute the appropriate playbook for *trigger*.

        Finds the best-matching playbook, simulates all steps, marks
        affected secrets as 'rotated', and records the result.

        Parameters
        ----------
        trigger:
            The event that is initiating rotation.

        Returns
        -------
        RotationResult
        """
        log.info(
            "trigger_rotation",
            trigger_id=trigger.trigger_id,
            trigger_type=trigger.trigger_type,
        )

        # Pick playbook
        playbook = self._select_playbook(trigger)
        errors: list[str] = []
        secrets_rotated: list[str] = []
        sessions_revoked: list[str] = []

        # Collect relevant secrets
        candidates = self._get_active_secrets()
        target_secrets = [
            s for s in candidates
            if playbook.secret_types == ["*"]
            or s.secret_type in playbook.secret_types
        ]

        if not target_secrets and not candidates:
            # No secrets registered — warn but succeed
            errors.append(
                "No active secrets found in registry — rotation is a no-op"
            )

        for secret in target_secrets:
            try:
                self._simulate_rotation_steps(playbook, secret)
                # Mark as rotated
                now = datetime.now(timezone.utc)
                rotated = SecretRecord(
                    secret_id=secret.secret_id,
                    secret_type=secret.secret_type,
                    description=secret.description,
                    last_rotated=now,
                    next_rotation=secret.next_rotation,
                    rotation_count=secret.rotation_count + 1,
                    status="rotated",
                )
                _save_secret(self._conn, rotated)
                secrets_rotated.append(secret.secret_id)
            except Exception as exc:  # pragma: no cover
                errors.append(f"Failed to rotate {secret.secret_id}: {exc}")

        # Revoke session if provided
        if trigger.session_id:
            sessions_revoked.append(trigger.session_id)
            log.info("session_revoked", session_id=trigger.session_id)

        result = RotationResult(
            trigger_id=trigger.trigger_id,
            secrets_rotated=secrets_rotated,
            sessions_revoked=sessions_revoked,
            playbook_used=playbook.playbook_id,
            success=len(errors) == 0,
            errors=errors,
            completed_at=datetime.now(timezone.utc),
        )
        _save_result(self._conn, str(uuid.uuid4()), result)
        log.info(
            "rotation_complete",
            trigger_id=trigger.trigger_id,
            rotated=len(secrets_rotated),
            errors=len(errors),
        )
        return result

    def schedule_rotation(
        self, secret_id: str, rotate_after_days: int
    ) -> SecretRecord:
        """Set *next_rotation* for *secret_id* to *rotate_after_days* from now.

        Parameters
        ----------
        secret_id:
            The secret to schedule.
        rotate_after_days:
            Number of days until the secret should be rotated.

        Returns
        -------
        SecretRecord
            Updated record.

        Raises
        ------
        KeyError
            If *secret_id* is not found in the registry.
        """
        record = _load_secret(self._conn, secret_id)
        if record is None:
            raise KeyError(f"Secret '{secret_id}' not found in registry")
        now = datetime.now(timezone.utc)
        updated = SecretRecord(
            secret_id=record.secret_id,
            secret_type=record.secret_type,
            description=record.description,
            last_rotated=record.last_rotated,
            next_rotation=now + timedelta(days=rotate_after_days),
            rotation_count=record.rotation_count,
            status=record.status,
        )
        _save_secret(self._conn, updated)
        log.info(
            "schedule_rotation",
            secret_id=secret_id,
            rotate_after_days=rotate_after_days,
        )
        return updated

    def get_overdue_rotations(self) -> list[SecretRecord]:
        """Return all secrets whose *next_rotation* is in the past.

        Returns
        -------
        list[SecretRecord]
        """
        now = datetime.now(timezone.utc).isoformat()
        rows = self._conn.execute(
            """
            SELECT * FROM secrets
            WHERE next_rotation < ? AND status NOT IN ('revoked', 'rotating')
            ORDER BY next_rotation ASC
            """,
            (now,),
        ).fetchall()
        return [_row_to_secret(r) for r in rows]

    def get_rotation_history(
        self, secret_id: str | None = None
    ) -> list[RotationResult]:
        """Return past rotation results, optionally filtered by *secret_id*.

        Parameters
        ----------
        secret_id:
            If provided, only results involving this secret are returned.

        Returns
        -------
        list[RotationResult]
            Most recent first.
        """
        return _load_results(self._conn, secret_id)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _select_playbook(self, trigger: RotationTrigger) -> RotationPlaybook:
        """Select the best matching playbook for *trigger*."""
        for pb in self._playbooks:
            if trigger.trigger_type in pb.trigger_types:
                return pb
        # Fallback: first playbook (should not happen with built-ins)
        log.warning(
            "No playbook matched trigger type — using first available",
            trigger_type=trigger.trigger_type,
        )
        return self._playbooks[0]

    def _get_active_secrets(self) -> list[SecretRecord]:
        """Return all non-revoked secrets from the registry."""
        rows = self._conn.execute(
            "SELECT * FROM secrets WHERE status NOT IN ('revoked')"
        ).fetchall()
        return [_row_to_secret(r) for r in rows]

    def _simulate_rotation_steps(
        self, playbook: RotationPlaybook, secret: SecretRecord
    ) -> None:
        """Log each playbook step for *secret* (production would call vault APIs)."""
        for step in playbook.steps:
            log.info(
                "rotation_step",
                secret_id=secret.secret_id,
                playbook_id=playbook.playbook_id,
                step=step,
            )
