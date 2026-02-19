"""
AMC Enforce — E33: Watchdog Agent
===============================================================================

Purpose
-------
An independent oversight process that reviews proposed tool calls and can
approve, deny, or demand extra evidence before execution.  Decisions are
deterministic and driven by configurable rules, making them auditable and
reproducible.

Usage
-----

.. code-block:: python

    from amc.enforce.e33_watchdog import WatchdogAgent, WatchdogConfig, ProposedAction
    from datetime import datetime, timezone

    config = WatchdogConfig(
        always_review=["send_payment"],
        risk_threshold=0.7,
        require_evidence_for=["send_payment"],
    )
    agent = WatchdogAgent(config=config, db_path="/tmp/watchdog.db")

    action = ProposedAction(
        action_id="act-001",
        tool_name="read_file",
        parameters={"path": "/etc/hosts"},
        session_id="sess-1",
        sender_id="agent-a",
        risk_score=0.2,
        provenance=[],
        proposed_at=datetime.now(timezone.utc),
    )
    decision = agent.review_action(action)
    print(decision.verdict)  # "approve"
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class WatchdogConfig(BaseModel):
    """Configuration for the Watchdog Agent.

    Attributes
    ----------
    review_all:
        If True, all actions are reviewed regardless of other rules.
    always_review:
        List of tool names that always trigger a review (require_evidence or
        deny depending on risk score).
    risk_threshold:
        Risk score at or above which tainted-provenance actions require evidence.
    require_evidence_for:
        Tool names that always require evidence at minimum.
    max_review_ms:
        Maximum milliseconds allowed for a review decision (advisory).
    """

    review_all: bool = False
    always_review: list[str] = Field(default_factory=list)
    risk_threshold: float = 0.7
    require_evidence_for: list[str] = Field(default_factory=list)
    max_review_ms: int = 5000


class ProposedAction(BaseModel):
    """A tool call proposed by an agent, pending watchdog review.

    Attributes
    ----------
    action_id:
        Unique identifier for this proposed action.
    tool_name:
        Name of the tool being called.
    parameters:
        Tool call parameters.
    session_id:
        Session originating this action.
    sender_id:
        Agent or user ID proposing the action.
    risk_score:
        Numeric risk score in [0.0, ∞).  Scores >= 1.0 are always denied.
    provenance:
        Sources that influenced the parameters (empty = clean, non-empty = tainted).
    proposed_at:
        Timestamp of proposal.
    """

    action_id: str
    tool_name: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    session_id: str
    sender_id: str
    risk_score: float = 0.0
    provenance: list[str] = Field(default_factory=list)
    proposed_at: datetime


class WatchdogDecision(BaseModel):
    """Watchdog verdict for a proposed action.

    Attributes
    ----------
    action_id:
        Mirrors the action being decided.
    verdict:
        ``"approve"`` | ``"deny"`` | ``"require_evidence"``.
    reason:
        Human-readable explanation of the decision.
    required_evidence:
        For ``require_evidence`` verdicts: list of evidence types needed.
    decided_at:
        Timestamp of the decision.
    """

    action_id: str
    verdict: Literal["approve", "deny", "require_evidence"]
    reason: str
    required_evidence: list[str] | None = None
    decided_at: datetime


class EvidenceSubmission(BaseModel):
    """Evidence submitted in response to a ``require_evidence`` decision.

    Attributes
    ----------
    action_id:
        The action being evidenced.
    evidence_type:
        Category of evidence (e.g. ``"human_approval"``, ``"audit_log"``).
    evidence_value:
        The actual evidence content or reference.
    submitted_by:
        Agent or user ID submitting the evidence.
    submitted_at:
        Timestamp of submission.
    """

    action_id: str
    evidence_type: str
    evidence_value: str
    submitted_by: str
    submitted_at: datetime


# ---------------------------------------------------------------------------
# SQL schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS watchdog_actions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id   TEXT NOT NULL UNIQUE,
    tool_name   TEXT NOT NULL,
    parameters  TEXT NOT NULL,
    session_id  TEXT NOT NULL,
    sender_id   TEXT NOT NULL,
    risk_score  REAL NOT NULL,
    provenance  TEXT NOT NULL,
    proposed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watchdog_decisions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id         TEXT NOT NULL,
    verdict           TEXT NOT NULL,
    reason            TEXT NOT NULL,
    required_evidence TEXT,
    decided_at        TEXT NOT NULL,
    FOREIGN KEY(action_id) REFERENCES watchdog_actions(action_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS watchdog_evidence (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id      TEXT NOT NULL,
    evidence_type  TEXT NOT NULL,
    evidence_value TEXT NOT NULL,
    submitted_by   TEXT NOT NULL,
    submitted_at   TEXT NOT NULL,
    FOREIGN KEY(action_id) REFERENCES watchdog_actions(action_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wd_action ON watchdog_decisions(action_id);
CREATE INDEX IF NOT EXISTS idx_wd_evidence ON watchdog_evidence(action_id);
"""

# Keyword fragments that always require at least evidence
_DESTRUCTIVE_KEYWORDS = ("delete", "drop", "wipe", "rm")


class WatchdogAgent:
    """Independent oversight agent that reviews proposed tool calls.

    Decisions are deterministic and applied in the following order:

    1. ``always_review`` list → require_evidence (below threshold) or deny (at/above).
    2. ``risk_score >= 1.0`` → deny always.
    3. ``risk_score >= threshold`` AND provenance non-empty → require_evidence.
    4. Tool name contains a destructive keyword → require_evidence minimum.
    5. Otherwise → approve.

    Parameters
    ----------
    config:
        Watchdog configuration.
    db_path:
        SQLite database path.
    """

    def __init__(
        self,
        config: WatchdogConfig | None = None,
        *,
        db_path: str | Path = "/tmp/amc_watchdog.db",
    ) -> None:
        self.config = config or WatchdogConfig()
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def review_action(self, action: ProposedAction) -> WatchdogDecision:
        """Apply deterministic rules and return a verdict for *action*.

        The action and decision are persisted to SQLite.
        """
        self._upsert_action(action)
        decision = self._apply_rules(action)
        self._upsert_decision(decision)
        log.info(
            "watchdog.reviewed",
            action_id=action.action_id,
            tool=action.tool_name,
            risk=action.risk_score,
            verdict=decision.verdict,
        )
        return decision

    def submit_evidence(
        self, submission: EvidenceSubmission
    ) -> WatchdogDecision | None:
        """Record evidence and re-evaluate the pending decision.

        Returns an updated :class:`WatchdogDecision` if the submitted evidence
        is now sufficient (i.e. the action had a ``require_evidence`` verdict
        and there is now at least one piece of supporting evidence).  Returns
        ``None`` if the action was already approved/denied or if evidence is
        still insufficient.
        """
        decision = self.get_decision(submission.action_id)
        if decision is None or decision.verdict != "require_evidence":
            log.warning(
                "watchdog.evidence_ignored",
                action_id=submission.action_id,
                reason="no pending require_evidence decision",
            )
            return None

        self._store_evidence(submission)

        # Retrieve the action and re-check: if we now have all required evidence
        # types satisfied, upgrade to approve.
        action = self._load_action(submission.action_id)
        if action is None:
            return None

        evidence_rows = self._load_evidence(submission.action_id)
        submitted_types = {e["evidence_type"] for e in evidence_rows}
        required = set(decision.required_evidence or [])

        if required and not required.issubset(submitted_types):
            # Still waiting on some evidence types
            return None

        # Evidence is sufficient — upgrade to approve
        new_decision = WatchdogDecision(
            action_id=action.action_id,
            verdict="approve",
            reason=(
                f"Evidence submitted ({submission.evidence_type}) satisfies "
                "watchdog requirements after re-evaluation."
            ),
            required_evidence=None,
            decided_at=datetime.now(timezone.utc),
        )
        self._upsert_decision(new_decision)
        log.info(
            "watchdog.evidence_accepted",
            action_id=action.action_id,
            upgraded_to="approve",
        )
        return new_decision

    def get_pending_reviews(self) -> list[ProposedAction]:
        """Return all actions currently awaiting evidence."""
        with self._tx() as cur:
            rows = cur.execute(
                """
                SELECT a.action_id, a.tool_name, a.parameters, a.session_id,
                       a.sender_id, a.risk_score, a.provenance, a.proposed_at
                FROM watchdog_actions a
                JOIN watchdog_decisions d ON d.action_id = a.action_id
                WHERE d.verdict = 'require_evidence'
                ORDER BY a.id DESC
                """
            ).fetchall()
        return [self._row_to_action(r) for r in rows]

    def get_decision(self, action_id: str) -> WatchdogDecision | None:
        """Return the most recent decision for *action_id*, or ``None``."""
        with self._tx() as cur:
            row = cur.execute(
                """
                SELECT action_id, verdict, reason, required_evidence, decided_at
                FROM watchdog_decisions
                WHERE action_id = ?
                ORDER BY id DESC LIMIT 1
                """,
                (action_id,),
            ).fetchone()
        if not row:
            return None
        return WatchdogDecision(
            action_id=row[0],
            verdict=row[1],
            reason=row[2],
            required_evidence=json.loads(row[3]) if row[3] else None,
            decided_at=datetime.fromisoformat(row[4]),
        )

    # ------------------------------------------------------------------
    # Rule engine
    # ------------------------------------------------------------------

    def _apply_rules(self, action: ProposedAction) -> WatchdogDecision:
        """Return the first matching verdict for *action*."""
        cfg = self.config
        tool = action.tool_name
        now = datetime.now(timezone.utc)

        # Rule 1: always_review list
        if tool in cfg.always_review:
            if action.risk_score >= cfg.risk_threshold:
                return WatchdogDecision(
                    action_id=action.action_id,
                    verdict="deny",
                    reason=(
                        f"Tool '{tool}' is in always_review and risk_score "
                        f"{action.risk_score:.2f} >= threshold {cfg.risk_threshold:.2f}."
                    ),
                    decided_at=now,
                )
            else:
                evidence_required = list(cfg.require_evidence_for) or ["human_approval"]
                return WatchdogDecision(
                    action_id=action.action_id,
                    verdict="require_evidence",
                    reason=(
                        f"Tool '{tool}' is in always_review list — evidence required."
                    ),
                    required_evidence=evidence_required,
                    decided_at=now,
                )

        # Rule 2: absolute denial at risk >= 1.0
        if action.risk_score >= 1.0:
            return WatchdogDecision(
                action_id=action.action_id,
                verdict="deny",
                reason=f"risk_score {action.risk_score:.2f} >= 1.0 — absolute denial.",
                decided_at=now,
            )

        # Rule 3: high risk + tainted provenance
        if action.risk_score >= cfg.risk_threshold and len(action.provenance) > 0:
            return WatchdogDecision(
                action_id=action.action_id,
                verdict="require_evidence",
                reason=(
                    f"risk_score {action.risk_score:.2f} >= threshold "
                    f"{cfg.risk_threshold:.2f} with tainted provenance — evidence required."
                ),
                required_evidence=["provenance_review"],
                decided_at=now,
            )

        # Rule 4: destructive keyword in tool name
        if any(kw in tool.lower() for kw in _DESTRUCTIVE_KEYWORDS):
            return WatchdogDecision(
                action_id=action.action_id,
                verdict="require_evidence",
                reason=(
                    f"Tool '{tool}' contains a destructive keyword — evidence required."
                ),
                required_evidence=["human_approval"],
                decided_at=now,
            )

        # Rule 5: default approve
        return WatchdogDecision(
            action_id=action.action_id,
            verdict="approve",
            reason="No risk conditions triggered — action approved.",
            decided_at=now,
        )

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    @contextmanager
    def _tx(self):
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("PRAGMA foreign_keys = ON")
            cur = conn.cursor()
            yield cur
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._tx() as cur:
            cur.executescript(_SCHEMA)

    def _upsert_action(self, action: ProposedAction) -> None:
        with self._tx() as cur:
            cur.execute(
                """
                INSERT OR REPLACE INTO watchdog_actions
                (action_id, tool_name, parameters, session_id, sender_id,
                 risk_score, provenance, proposed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    action.action_id,
                    action.tool_name,
                    json.dumps(action.parameters),
                    action.session_id,
                    action.sender_id,
                    action.risk_score,
                    json.dumps(action.provenance),
                    action.proposed_at.isoformat(),
                ),
            )

    def _upsert_decision(self, decision: WatchdogDecision) -> None:
        with self._tx() as cur:
            cur.execute(
                """
                INSERT INTO watchdog_decisions
                (action_id, verdict, reason, required_evidence, decided_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    decision.action_id,
                    decision.verdict,
                    decision.reason,
                    json.dumps(decision.required_evidence)
                    if decision.required_evidence is not None
                    else None,
                    decision.decided_at.isoformat(),
                ),
            )

    def _store_evidence(self, submission: EvidenceSubmission) -> None:
        with self._tx() as cur:
            cur.execute(
                """
                INSERT INTO watchdog_evidence
                (action_id, evidence_type, evidence_value, submitted_by, submitted_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    submission.action_id,
                    submission.evidence_type,
                    submission.evidence_value,
                    submission.submitted_by,
                    submission.submitted_at.isoformat(),
                ),
            )

    def _load_action(self, action_id: str) -> ProposedAction | None:
        with self._tx() as cur:
            row = cur.execute(
                """
                SELECT action_id, tool_name, parameters, session_id, sender_id,
                       risk_score, provenance, proposed_at
                FROM watchdog_actions WHERE action_id = ?
                """,
                (action_id,),
            ).fetchone()
        if not row:
            return None
        return self._row_to_action(row)

    def _load_evidence(self, action_id: str) -> list[dict[str, Any]]:
        with self._tx() as cur:
            rows = cur.execute(
                """
                SELECT evidence_type, evidence_value, submitted_by, submitted_at
                FROM watchdog_evidence WHERE action_id = ?
                """,
                (action_id,),
            ).fetchall()
        return [
            {
                "evidence_type": r[0],
                "evidence_value": r[1],
                "submitted_by": r[2],
                "submitted_at": r[3],
            }
            for r in rows
        ]

    @staticmethod
    def _row_to_action(row: tuple) -> ProposedAction:
        return ProposedAction(
            action_id=row[0],
            tool_name=row[1],
            parameters=json.loads(row[2]),
            session_id=row[3],
            sender_id=row[4],
            risk_score=row[5],
            provenance=json.loads(row[6]),
            proposed_at=datetime.fromisoformat(row[7]),
        )
