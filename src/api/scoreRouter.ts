/**
 * scoreRouter.ts — Score/diagnostic API routes.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, pathParam } from './apiHelpers.js';
import {
  countActiveScoreSessions,
  createScoreSession,
  getScoreSession,
  markScoreSessionCompleted,
  recordScoreAnswer,
} from './scoreStore.js';
import { queueScoreComputationMetric } from '../observability/otelExporter.js';

export async function handleScoreRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd(),
): Promise<boolean> {
  if (pathname === '/api/v1/score/status' && method === 'GET') {
    apiSuccess(res, { status: 'operational', module: 'score', activeSessions: countActiveScoreSessions(workspace) });
    return true;
  }

  // POST /api/v1/score/session — create diagnostic session
  if (pathname === '/api/v1/score/session' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId: string }>(req);
      if (!body.agentId) { apiError(res, 400, 'Missing required field: agentId'); return true; }
      const session = createScoreSession(workspace, body.agentId);
      apiSuccess(res, { sessionId: session.id, agentId: session.agentId }, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  // GET /api/v1/score/question/:sessionId
  const qParams = pathParam(pathname, '/api/v1/score/question/:sessionId');
  if (qParams && method === 'GET') {
    const session = getScoreSession(workspace, qParams.sessionId!);
    if (!session) { apiError(res, 404, 'Session not found'); return true; }
    try {
      const { questionBank } = await import('../diagnostic/questionBank.js');
      const answered = new Set(Object.keys(session.answers));
      const next = questionBank.find(q => !answered.has(q.id));
      if (!next) {
        apiSuccess(res, { complete: true, answeredCount: answered.size });
      } else {
        apiSuccess(res, { complete: false, question: next, answeredCount: answered.size, totalQuestions: questionBank.length });
      }
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  // POST /api/v1/score/answer
  if (pathname === '/api/v1/score/answer' && method === 'POST') {
    try {
      const body = await bodyJson<{ sessionId: string; questionId: string; value: number; notes?: string }>(req);
      if (!body.sessionId || !body.questionId || body.value === undefined) {
        apiError(res, 400, 'Missing required fields: sessionId, questionId, value');
        return true;
      }
      const session = recordScoreAnswer({
        workspace,
        sessionId: body.sessionId,
        questionId: body.questionId,
        value: body.value,
        notes: body.notes,
      });
      if (!session) { apiError(res, 404, 'Session not found'); return true; }
      apiSuccess(res, { recorded: true, answeredCount: Object.keys(session.answers).length });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Invalid score answer:")) {
        apiError(res, 400, err.message);
        return true;
      }
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  // GET /api/v1/score/result/:sessionId
  const rParams = pathParam(pathname, '/api/v1/score/result/:sessionId');
  if (rParams && method === 'GET') {
    const session = getScoreSession(workspace, rParams.sessionId!);
    if (!session) { apiError(res, 404, 'Session not found'); return true; }
    const answeredCount = Object.keys(session.answers).length;
    const totalScore = Object.values(session.answers).reduce((s, a) => s + a.value, 0);
    const maxPossible = answeredCount * 5;
    const percentage = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;
    const level = percentage >= 80 ? 5 : percentage >= 60 ? 4 : percentage >= 40 ? 3 : percentage >= 20 ? 2 : 1;

    apiSuccess(res, {
      sessionId: session.id,
      agentId: session.agentId,
      answeredCount,
      totalScore,
      maxPossible,
      percentage,
      level,
      createdAt: session.createdAt,
    });
    queueScoreComputationMetric({
      agentId: session.agentId,
      runId: session.id,
      sessionId: session.id,
      score: totalScore,
      maxScore: maxPossible,
      percentage,
      level,
      ts: Date.now(),
      source: "api.score.result"
    });
    markScoreSessionCompleted(workspace, session.id);
    return true;
  }

  return false;
}
