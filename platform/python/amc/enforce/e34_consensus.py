"""
AMC Enforce — E34: Consensus Checks
===============================================================================

Purpose
-------
For critical actions, require agreement between two or more independent
reasoning passes before execution is allowed.  A ``ConsensusEngine`` manages
rounds of voting, evaluates agreement on both the outcome (approve/deny) and
on key fields (amount, recipient, etc.), and escalates when agents disagree.

Usage
-----

.. code-block:: python

    from amc.enforce.e34_consensus import ConsensusEngine, ConsensusConfig, ConsensusVote
    from datetime import datetime, timezone

    config = ConsensusConfig(required_for=["send_payment"], agreement_threshold=0.8)
    engine = ConsensusEngine(config=config, db_path="/tmp/consensus.db")

    round_ = engine.create_round("send_payment", {"amount": "100", "recipient": "alice"}, "sess-1")

    vote1 = ConsensusVote(
        round_id=round_.round_id,
        voter_id="model-a",
        verdict="approve",
        key_fields={"amount": "100", "recipient": "alice"},
        confidence=0.95,
        rationale="Looks good.",
        voted_at=datetime.now(timezone.utc),
    )
    vote2 = ConsensusVote(
        round_id=round_.round_id,
        voter_id="model-b",
        verdict="approve",
        key_fields={"amount": "100", "recipient": "alice"},
        confidence=0.9,
        rationale="Confirmed.",
        voted_at=datetime.now(timezone.utc),
    )

    engine.submit_vote(vote1)
    result = engine.submit_vote(vote2)
    print(result.final_verdict)  # "approved"
"""

from __future__ import annotations

import fnmatch
import json
import sqlite3
import uuid
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


class ConsensusConfig(BaseModel):
    """Configuration for the Consensus Engine.

    Attributes
    ----------
    required_for:
        List of action types or tool name glob patterns that require consensus.
    agreement_threshold:
        Fraction of key fields that must match across all votes to count as
        agreeing (0.0–1.0).
    max_wait_seconds:
        Maximum seconds to wait for quorum before auto-escalation (advisory).
    auto_escalate_on_disagreement:
        When True, disagreement on key fields triggers escalation automatically.
    """

    required_for: list[str] = Field(default_factory=list)
    agreement_threshold: float = 0.8
    max_wait_seconds: int = 30
    auto_escalate_on_disagreement: bool = True


class ConsensusRound(BaseModel):
    """A single consensus evaluation round.

    Attributes
    ----------
    round_id:
        Unique round identifier.
    action_type:
        Type of action being voted on.
    action_params:
        Parameters of the proposed action.
    session_id:
        Session that triggered the round.
    created_at:
        Timestamp when the round was created.
    """

    round_id: str
    action_type: str
    action_params: dict[str, Any] = Field(default_factory=dict)
    session_id: str
    created_at: datetime


class ConsensusVote(BaseModel):
    """A single agent vote within a consensus round.

    Attributes
    ----------
    round_id:
        Round this vote belongs to.
    voter_id:
        Identifier for the voting model/agent.
    verdict:
        ``"approve"`` | ``"deny"`` | ``"abstain"``.
    key_fields:
        Critical fields the voter extracted (e.g. ``{"amount": "100"}``).
    confidence:
        Voter's confidence in its own verdict (0.0–1.0).
    rationale:
        Free-text reasoning.
    voted_at:
        Timestamp of the vote.
    """

    round_id: str
    voter_id: str
    verdict: Literal["approve", "deny", "abstain"]
    key_fields: dict[str, str] = Field(default_factory=dict)
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str
    voted_at: datetime


class ConsensusResult(BaseModel):
    """Resolved outcome of a consensus round.

    Attributes
    ----------
    round_id:
        Round identifier.
    final_verdict:
        ``"approved"`` | ``"denied"`` | ``"escalated"``.
    agreement_score:
        Fraction of key fields where all voters agreed (0.0–1.0).
    votes:
        All votes cast in this round.
    key_field_agreements:
        Per-field agreement flag.
    resolved_at:
        Timestamp of resolution.
    """

    round_id: str
    final_verdict: Literal["approved", "denied", "escalated"]
    agreement_score: float
    votes: list[ConsensusVote] = Field(default_factory=list)
    key_field_agreements: dict[str, bool] = Field(default_factory=dict)
    resolved_at: datetime


# ---------------------------------------------------------------------------
# SQL schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS consensus_rounds (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id     TEXT NOT NULL UNIQUE,
    action_type  TEXT NOT NULL,
    action_params TEXT NOT NULL,
    session_id   TEXT NOT NULL,
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consensus_votes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id    TEXT NOT NULL,
    voter_id    TEXT NOT NULL,
    verdict     TEXT NOT NULL,
    key_fields  TEXT NOT NULL,
    confidence  REAL NOT NULL,
    rationale   TEXT NOT NULL,
    voted_at    TEXT NOT NULL,
    FOREIGN KEY(round_id) REFERENCES consensus_rounds(round_id) ON DELETE CASCADE,
    UNIQUE(round_id, voter_id)
);

CREATE TABLE IF NOT EXISTS consensus_results (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id           TEXT NOT NULL UNIQUE,
    final_verdict      TEXT NOT NULL,
    agreement_score    REAL NOT NULL,
    key_field_agreements TEXT NOT NULL,
    resolved_at        TEXT NOT NULL,
    FOREIGN KEY(round_id) REFERENCES consensus_rounds(round_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_con_votes ON consensus_votes(round_id);
"""

_QUORUM = 2  # Minimum votes required to reach a result


class ConsensusEngine:
    """Manages consensus rounds for critical action approval.

    Parameters
    ----------
    config:
        Consensus configuration.
    db_path:
        SQLite database path.
    """

    def __init__(
        self,
        config: ConsensusConfig | None = None,
        *,
        db_path: str | Path = "/tmp/amc_consensus.db",
    ) -> None:
        self.config = config or ConsensusConfig()
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def create_round(
        self, action_type: str, action_params: dict[str, Any], session_id: str
    ) -> ConsensusRound:
        """Create and persist a new consensus round."""
        round_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        round_ = ConsensusRound(
            round_id=round_id,
            action_type=action_type,
            action_params=action_params,
            session_id=session_id,
            created_at=now,
        )
        with self._tx() as cur:
            cur.execute(
                """
                INSERT INTO consensus_rounds
                (round_id, action_type, action_params, session_id, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    round_id,
                    action_type,
                    json.dumps(action_params),
                    session_id,
                    now.isoformat(),
                ),
            )
        log.info("consensus.round_created", round_id=round_id, action_type=action_type)
        return round_

    def submit_vote(self, vote: ConsensusVote) -> ConsensusResult | None:
        """Record a vote; return a result if quorum is now reached.

        Returns ``None`` if quorum (≥ 2 non-abstaining votes) has not been met.
        """
        with self._tx() as cur:
            cur.execute(
                """
                INSERT OR REPLACE INTO consensus_votes
                (round_id, voter_id, verdict, key_fields, confidence, rationale, voted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    vote.round_id,
                    vote.voter_id,
                    vote.verdict,
                    json.dumps(vote.key_fields),
                    vote.confidence,
                    vote.rationale,
                    vote.voted_at.isoformat(),
                ),
            )

        votes = self._load_votes(vote.round_id)
        active = [v for v in votes if v.verdict != "abstain"]
        if len(active) < _QUORUM:
            log.debug(
                "consensus.waiting_for_quorum",
                round_id=vote.round_id,
                have=len(active),
                need=_QUORUM,
            )
            return None

        return self._resolve(vote.round_id, votes)

    def evaluate(self, round_id: str) -> ConsensusResult:
        """Force-evaluate the round with whatever votes exist."""
        votes = self._load_votes(round_id)
        return self._resolve(round_id, votes)

    def requires_consensus(self, tool_name: str, action_type: str) -> bool:
        """Return True if this tool/action requires a consensus round."""
        for pattern in self.config.required_for:
            if fnmatch.fnmatch(tool_name, pattern) or fnmatch.fnmatch(action_type, pattern):
                return True
        return False

    def get_result(self, round_id: str) -> ConsensusResult | None:
        """Return persisted result for *round_id*, or ``None``."""
        with self._tx() as cur:
            row = cur.execute(
                """
                SELECT round_id, final_verdict, agreement_score,
                       key_field_agreements, resolved_at
                FROM consensus_results WHERE round_id = ?
                """,
                (round_id,),
            ).fetchone()
        if not row:
            return None
        votes = self._load_votes(round_id)
        return ConsensusResult(
            round_id=row[0],
            final_verdict=row[1],
            agreement_score=row[2],
            votes=votes,
            key_field_agreements=json.loads(row[3]),
            resolved_at=datetime.fromisoformat(row[4]),
        )

    # ------------------------------------------------------------------
    # Agreement scoring
    # ------------------------------------------------------------------

    def _resolve(self, round_id: str, votes: list[ConsensusVote]) -> ConsensusResult:
        """Compute agreement and persist the result."""
        now = datetime.now(timezone.utc)
        active = [v for v in votes if v.verdict != "abstain"]

        # Key field agreement: for each field, check all active voters agree.
        all_fields: set[str] = set()
        for v in active:
            all_fields.update(v.key_fields.keys())

        key_field_agreements: dict[str, bool] = {}
        for field in all_fields:
            values = [v.key_fields.get(field) for v in active]
            key_field_agreements[field] = len(set(values)) == 1 and values[0] is not None

        agreement_score = (
            sum(1 for agreed in key_field_agreements.values() if agreed)
            / len(key_field_agreements)
            if key_field_agreements
            else 1.0
        )

        # Determine verdict
        approvals = sum(1 for v in active if v.verdict == "approve")
        denials = sum(1 for v in active if v.verdict == "deny")

        if (
            agreement_score >= self.config.agreement_threshold
            and approvals > denials
        ):
            final_verdict: Literal["approved", "denied", "escalated"] = "approved"
        elif denials >= approvals:
            final_verdict = "denied"
        else:
            final_verdict = "escalated"

        # If key fields disagree, force escalation (when configured)
        if (
            self.config.auto_escalate_on_disagreement
            and agreement_score < self.config.agreement_threshold
            and final_verdict == "approved"
        ):
            final_verdict = "escalated"

        result = ConsensusResult(
            round_id=round_id,
            final_verdict=final_verdict,
            agreement_score=round(agreement_score, 4),
            votes=votes,
            key_field_agreements=key_field_agreements,
            resolved_at=now,
        )
        self._persist_result(result)
        log.info(
            "consensus.resolved",
            round_id=round_id,
            verdict=final_verdict,
            agreement=agreement_score,
        )
        return result

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

    def _load_votes(self, round_id: str) -> list[ConsensusVote]:
        with self._tx() as cur:
            rows = cur.execute(
                """
                SELECT round_id, voter_id, verdict, key_fields,
                       confidence, rationale, voted_at
                FROM consensus_votes WHERE round_id = ?
                ORDER BY id
                """,
                (round_id,),
            ).fetchall()
        return [
            ConsensusVote(
                round_id=r[0],
                voter_id=r[1],
                verdict=r[2],
                key_fields=json.loads(r[3]),
                confidence=r[4],
                rationale=r[5],
                voted_at=datetime.fromisoformat(r[6]),
            )
            for r in rows
        ]

    def _persist_result(self, result: ConsensusResult) -> None:
        with self._tx() as cur:
            cur.execute(
                """
                INSERT OR REPLACE INTO consensus_results
                (round_id, final_verdict, agreement_score, key_field_agreements, resolved_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    result.round_id,
                    result.final_verdict,
                    result.agreement_score,
                    json.dumps(result.key_field_agreements),
                    result.resolved_at.isoformat(),
                ),
            )
