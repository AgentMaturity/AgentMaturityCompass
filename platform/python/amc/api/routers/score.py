"""
AMC API — Score Router
Exposes questionnaire lifecycle and scoring endpoints.

The current implementation stores sessions in-memory for single-process
operation and is production-ready as a clear contract stub for expansion
to Redis/DB-backed persistence.
"""
from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from amc.score.questionnaire import QuestionnaireEngine, QuestionnaireSession
from amc.score.dimensions import CompositeScore

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/score", tags=["score"])


# Stateless demo with in-memory session persistence.
_SESSIONS: dict[str, QuestionnaireSession] = {}
_engine = QuestionnaireEngine()


class ScoreSessionCreateResponse(BaseModel):
    """Response with new session id."""
    session_id: str
    total_questions: int


class ScoreQuestionResponse(BaseModel):
    """Question returned by questionnaire engine."""
    id: str
    dimension: str
    text: str
    evidence_prompt: str = ""
    scoring_rubric: dict[str, int] = Field(default_factory=dict)


class ScoreAnswerRequest(BaseModel):
    """Answer for a questionnaire question."""
    question_id: str
    answer_text: str


class ScoreAnswerResponse(BaseModel):
    """Updated session state after answering."""
    session_id: str
    current_question: int
    completed: bool


class ScoreCompleteResponse(BaseModel):
    """Final composite score payload."""
    score_id: str
    overall_level: str
    overall_score: int
    recommended_platform_modules: dict[str, list[str]]


@router.post("/session", response_model=ScoreSessionCreateResponse)
async def create_session() -> ScoreSessionCreateResponse:
    """Create a new questionnaire session and hold it in memory."""
    session = _engine.start_session()
    _SESSIONS[session.session_id] = session
    log.info("score.session.started", session_id=session.session_id)
    return ScoreSessionCreateResponse(
        session_id=session.session_id,
        total_questions=len(_engine.questions),
    )


@router.get("/question/{session_id}", response_model=ScoreQuestionResponse | None)
async def get_next_question(session_id: str) -> ScoreQuestionResponse | None:
    """Get the next unanswered question for session id."""
    session = _SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    q = _engine.next_question(session)
    if q is None:
        return None

    return ScoreQuestionResponse(**q.model_dump())


@router.post("/answer/{session_id}", response_model=ScoreAnswerResponse)
async def answer(session_id: str, req: ScoreAnswerRequest) -> ScoreAnswerResponse:
    """Submit an answer and advance the questionnaire session."""
    session = _SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    updated = _engine.answer(session, req.question_id, req.answer_text)
    _SESSIONS[session_id] = updated

    log.info(
        "score.question.answered",
        session_id=session_id,
        question_id=req.question_id,
        index=updated.current_question,
    )

    return ScoreAnswerResponse(
        session_id=session_id,
        current_question=updated.current_question,
        completed=updated.completed,
    )


@router.post("/complete/{session_id}", response_model=ScoreCompleteResponse)
async def complete(session_id: str) -> ScoreCompleteResponse:
    """Complete the session and return a composite score."""
    session = _SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    composite: CompositeScore = _engine.complete(session)
    return ScoreCompleteResponse(
        score_id=composite.score_id,
        overall_level=composite.overall_level.value,
        overall_score=composite.overall_score,
        recommended_platform_modules=composite.recommended_platform_modules,
    )
