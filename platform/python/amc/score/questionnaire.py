"""
AMC Score — Questionnaire Engine
Drives the 30-question maturity assessment (5 dimensions with 5 questions, 4 dimensions with 4 questions),
tracks session state, and produces a CompositeScore on completion.

Usage:
    engine = QuestionnaireEngine()
    session = engine.start_session()

    while (q := engine.next_question(session)) is not None:
        session = engine.answer(session, q.id, user_input)

    composite = engine.complete(session)
"""
from __future__ import annotations

import uuid

import structlog
from pydantic import BaseModel, Field

from amc.score.dimensions import (
    CompositeScore,
    Dimension,
    ScoringEngine,
)

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class Question(BaseModel):
    """A single assessment question."""
    id: str
    dimension: Dimension
    text: str
    evidence_prompt: str = ""
    scoring_rubric: dict[str, int] = Field(default_factory=dict)


class QuestionnaireSession(BaseModel):
    """Tracks state of an in-progress questionnaire."""
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    answers: dict[str, str] = Field(default_factory=dict)
    current_question: int = 0
    completed: bool = False


# ---------------------------------------------------------------------------
# Question Bank — 30 questions (7 dimensions × 4–5 questions)
# ---------------------------------------------------------------------------

QUESTION_BANK: list[Question] = [
    # Governance (gov_1..gov_4)
    Question(id="gov_1", dimension=Dimension.GOVERNANCE, text="Do you have a documented AI governance policy covering agent behavior, data handling, and approval workflows?", evidence_prompt="Share a link or description of your governance policy.", scoring_rubric={"policy": 10, "documented": 10, "approval": 5}),
    Question(id="gov_2", dimension=Dimension.GOVERNANCE, text="Is there a clear owner or RACI matrix for AI agent decisions and incidents?", evidence_prompt="Describe ownership structure.", scoring_rubric={"owner": 10, "raci": 10, "accountable": 5}),
    Question(id="gov_3", dimension=Dimension.GOVERNANCE, text="Do you maintain an audit trail for all agent actions?", evidence_prompt="Describe your audit logging setup.", scoring_rubric={"audit": 10, "log": 10, "trail": 5}),
    Question(id="gov_4", dimension=Dimension.GOVERNANCE, text="Is human-in-the-loop approval required for high-risk agent actions?", evidence_prompt="Describe your escalation process.", scoring_rubric={"approval": 10, "human": 10, "escalation": 5}),
    Question(id="gov_5", dimension=Dimension.GOVERNANCE, text="Do you conduct formal risk assessments for new agent features before rollout?", evidence_prompt="Share your pre-release risk review process.", scoring_rubric={"risk": 10, "assessment": 10, "review": 5}),

    # Security (sec_1..sec_5)
    Question(id="sec_1", dimension=Dimension.SECURITY, text="Do you have a policy firewall that filters agent tool calls based on trust level?", evidence_prompt="Describe your tool-call policy engine.", scoring_rubric={"firewall": 10, "policy": 10, "allowlist": 5}),
    Question(id="sec_2", dimension=Dimension.SECURITY, text="Do you detect and block prompt injection attacks on agent inputs?", evidence_prompt="Describe your injection detection approach.", scoring_rubric={"injection": 10, "detect": 10, "scan": 5}),
    Question(id="sec_3", dimension=Dimension.SECURITY, text="How do you handle secrets and PII in agent prompts and outputs?", evidence_prompt="Describe your DLP / vault setup.", scoring_rubric={"vault": 10, "redact": 10, "dlp": 5}),
    Question(id="sec_4", dimension=Dimension.SECURITY, text="Do you scan agent skills/plugins for malicious patterns before loading?", evidence_prompt="Describe your skill scanning process.", scoring_rubric={"scan": 10, "analyze": 10, "review": 5}),

    # Reliability (rel_1..rel_4)
    Question(id="rel_1", dimension=Dimension.RELIABILITY, text="Do you have circuit breakers and retry logic for LLM API calls?", evidence_prompt="Describe your resilience patterns.", scoring_rubric={"circuit": 10, "breaker": 10, "retry": 5}),
    Question(id="rel_2", dimension=Dimension.RELIABILITY, text="Do you enforce rate limits and timeouts on agent operations?", evidence_prompt="Describe your rate limiting setup.", scoring_rubric={"rate": 10, "limit": 10, "timeout": 5}),
    Question(id="rel_3", dimension=Dimension.RELIABILITY, text="Do you have health monitoring and alerting for your agent infrastructure?", evidence_prompt="Describe your monitoring stack.", scoring_rubric={"monitor": 10, "alert": 10, "health": 5}),
    Question(id="rel_4", dimension=Dimension.RELIABILITY, text="Do you have a safe deployment strategy with rollback capability for agent updates?", evidence_prompt="Describe your deployment process.", scoring_rubric={"rollback": 10, "canary": 10, "deploy": 5}),

    # Evaluation (eval_1..eval_4)
    Question(id="eval_1", dimension=Dimension.EVALUATION, text="Do you have an evaluation framework for measuring agent output quality?", evidence_prompt="Describe your eval suite.", scoring_rubric={"eval": 10, "benchmark": 10, "metrics": 5}),
    Question(id="eval_2", dimension=Dimension.EVALUATION, text="Do you run automated regression tests on agent behavior?", evidence_prompt="Describe your CI eval pipeline.", scoring_rubric={"regression": 10, "automated": 10, "ci": 5}),
    Question(id="eval_3", dimension=Dimension.EVALUATION, text="Do you have human evaluation or feedback loops for agent outputs?", evidence_prompt="Describe your human eval process.", scoring_rubric={"human": 10, "review": 10, "feedback": 5}),
    Question(id="eval_4", dimension=Dimension.EVALUATION, text="Do you conduct red-team or adversarial testing on your agents?", evidence_prompt="Describe your red-team process.", scoring_rubric={"red-team": 10, "adversarial": 10, "attack": 5}),

    # Observability (obs_1..obs_4)
    Question(id="obs_1", dimension=Dimension.OBSERVABILITY, text="Do you use structured logging for agent actions and decisions?", evidence_prompt="Describe your logging approach.", scoring_rubric={"structlog": 10, "structured": 10, "trace": 5}),
    Question(id="obs_2", dimension=Dimension.OBSERVABILITY, text="Do you track token usage and costs per agent session?", evidence_prompt="Describe your cost tracking.", scoring_rubric={"token": 10, "cost": 10, "budget": 5}),
    Question(id="obs_3", dimension=Dimension.OBSERVABILITY, text="Do you have dashboards or metrics for agent performance?", evidence_prompt="Describe your observability stack.", scoring_rubric={"dashboard": 10, "grafana": 10, "metrics": 5}),
    Question(id="obs_4", dimension=Dimension.OBSERVABILITY, text="Do you maintain tamper-evident receipts for agent actions?", evidence_prompt="Describe your receipt/audit chain.", scoring_rubric={"receipt": 10, "chain": 10, "immutable": 5}),

    # Cost Efficiency (cost_1..cost_4)
    Question(id="cost_1", dimension=Dimension.COST_EFFICIENCY, text="Do you have budgets or spending caps for AI agent usage?", evidence_prompt="Describe your budget controls.", scoring_rubric={"budget": 10, "cap": 10, "limit": 5}),
    Question(id="cost_2", dimension=Dimension.COST_EFFICIENCY, text="Do you route requests to different model tiers based on complexity?", evidence_prompt="Describe your model routing strategy.", scoring_rubric={"route": 10, "tier": 10, "model": 5}),
    Question(id="cost_3", dimension=Dimension.COST_EFFICIENCY, text="Do you cache or deduplicate agent responses to reduce costs?", evidence_prompt="Describe your caching approach.", scoring_rubric={"cache": 10, "dedup": 10, "reuse": 5}),
    Question(id="cost_4", dimension=Dimension.COST_EFFICIENCY, text="Do you have cost attribution and reporting per team or use case?", evidence_prompt="Describe your cost allocation process.", scoring_rubric={"report": 10, "chargeback": 10, "attribution": 5}),

    # Operating Model (ops_1..ops_4)
    Question(id="ops_1", dimension=Dimension.OPERATING_MODEL, text="Do you have a centralized AI platform team or center of excellence?", evidence_prompt="Describe your org structure for AI.", scoring_rubric={"platform": 10, "team": 10, "center": 5}),
    Question(id="ops_2", dimension=Dimension.OPERATING_MODEL, text="Do you provide standardized agent templates or golden paths?", evidence_prompt="Describe your template catalog.", scoring_rubric={"template": 10, "standard": 10, "golden": 5}),
    Question(id="ops_3", dimension=Dimension.OPERATING_MODEL, text="Do you offer a self-serve developer portal for agent capabilities?", evidence_prompt="Describe your developer experience.", scoring_rubric={"self-serve": 10, "portal": 10, "api": 5}),
    Question(id="ops_4", dimension=Dimension.OPERATING_MODEL, text="Do you support multi-agent orchestration and coordination workflows?", evidence_prompt="Describe your orchestration approach.", scoring_rubric={"multi-agent": 10, "orchestrat": 10, "workflow": 5}),
    Question(id="ops_5", dimension=Dimension.OPERATING_MODEL, text="Do you have a formal adoption playbook and training for business teams using AI agents?", evidence_prompt="Describe your internal enablement program.", scoring_rubric={"training": 10, "playbook": 10, "adoption": 5}),
]


# ---------------------------------------------------------------------------
# QuestionnaireEngine
# ---------------------------------------------------------------------------

class QuestionnaireEngine:
    """
    Drives the maturity assessment questionnaire, tracks session state,
    and delegates scoring to the ScoringEngine on completion.
    """

    def __init__(self, questions: list[Question] | None = None) -> None:
        self.questions = questions or QUESTION_BANK
        self._scoring_engine = ScoringEngine()

    def start_session(self) -> QuestionnaireSession:
        """Create a new questionnaire session."""
        session = QuestionnaireSession()
        log.info("questionnaire.started", session_id=session.session_id)
        return session

    def next_question(self, session: QuestionnaireSession) -> Question | None:
        """
        Return the next unanswered question, or None if all are answered.

        Args:
            session: Current questionnaire session.

        Returns:
            Next Question or None.
        """
        if session.completed:
            return None
        if session.current_question >= len(self.questions):
            return None
        return self.questions[session.current_question]

    def answer(
        self, session: QuestionnaireSession, question_id: str, answer_text: str,
    ) -> QuestionnaireSession:
        """
        Record an answer and advance to the next question.

        Args:
            session: Current session.
            question_id: ID of the question being answered.
            answer_text: Free-text answer.

        Returns:
            Updated session.
        """
        session.answers[question_id] = answer_text
        session.current_question += 1

        if session.current_question >= len(self.questions):
            session.completed = True

        log.info(
            "questionnaire.answered",
            session_id=session.session_id,
            question_id=question_id,
            progress=f"{session.current_question}/{len(self.questions)}",
        )
        return session

    def complete(self, session: QuestionnaireSession) -> CompositeScore:
        """
        Complete the questionnaire and produce a CompositeScore.

        Args:
            session: A completed (or partially completed) session.

        Returns:
            CompositeScore from the ScoringEngine.
        """
        session.completed = True
        composite = self._scoring_engine.score_all(session.answers)
        log.info(
            "questionnaire.complete",
            session_id=session.session_id,
            overall_level=composite.overall_level,
            overall_score=composite.overall_score,
        )
        return composite
