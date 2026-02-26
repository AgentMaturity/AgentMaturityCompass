/**
 * scoreRouter.ts — Score/diagnostic API routes.
 * Full parity with: amc score *, amc diagnostic *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, pathParam, queryParam } from './apiHelpers.js';
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

  // GET /api/v1/score/status
  if (pathname === '/api/v1/score/status' && method === 'GET') {
    apiSuccess(res, { status: 'operational', module: 'score', activeSessions: countActiveScoreSessions(workspace) });
    return true;
  }

  // POST /api/v1/score/run — trigger a full diagnostic run (CLI: amc run)
  if (pathname === '/api/v1/score/run' && method === 'POST') {
    try {
      const body = await bodyJson<{
        agentId?: string;
        window?: string;
        targetName?: string;
        claimMode?: 'auto' | 'owner' | 'harness';
        runtimeForHarness?: string;
      }>(req);
      const agentId = body.agentId ?? 'default';
      const { runDiagnostic } = await import('../diagnostic/runner.js');
      const result = await runDiagnostic({
        workspace,
        agentId,
        window: body.window ?? '14d',
        targetName: body.targetName,
        claimMode: body.claimMode ?? 'auto',
        runtimeForHarness: body.runtimeForHarness as import('../types.js').RuntimeName | undefined,
      });
      queueScoreComputationMetric({
        agentId,
        runId: result.runId,
        sessionId: result.runId,
        score: result.layerScores?.reduce((s: number, l: { avgFinalLevel: number }) => s + l.avgFinalLevel, 0) ?? 0,
        maxScore: (result.layerScores?.length ?? 0) * 5,
        percentage: result.layerScores?.length
          ? Math.round((result.layerScores.reduce((s: number, l: { avgFinalLevel: number }) => s + l.avgFinalLevel, 0) / (result.layerScores.length * 5)) * 100)
          : 0,
        level: result.layerScores?.length
          ? Math.round(result.layerScores.reduce((s: number, l: { avgFinalLevel: number }) => s + l.avgFinalLevel, 0) / result.layerScores.length)
          : 0,
        ts: Date.now(),
        source: 'api.score.run',
      });
      apiSuccess(res, result, 200);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Diagnostic run failed');
    }
    return true;
  }

  // POST /api/v1/score/quickscore — rapid 5-question assessment (CLI: amc quickscore)
  if (pathname === '/api/v1/score/quickscore' && method === 'POST') {
    try {
      const body = await bodyJson<{ answers: Record<string, number> }>(req);
      if (!body.answers || typeof body.answers !== 'object') {
        apiError(res, 400, 'Missing required field: answers (Record<questionId, level>)');
        return true;
      }
      const { getRapidQuestions, scoreRapidAssessment } = await import('../diagnostic/rapidQuickscore.js');
      const questions = getRapidQuestions();
      const result = scoreRapidAssessment(body.answers);
      apiSuccess(res, { questions: questions.map((q: { id: string; title: string }) => ({ id: q.id, title: q.title })), result });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Quickscore failed');
    }
    return true;
  }

  // GET /api/v1/score/quickscore/questions — get the 5 rapid questions
  if (pathname === '/api/v1/score/quickscore/questions' && method === 'GET') {
    try {
      const { getRapidQuestions } = await import('../diagnostic/rapidQuickscore.js');
      const questions = getRapidQuestions();
      apiSuccess(res, { questions });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not load quickscore questions');
    }
    return true;
  }

  // POST /api/v1/score/quick — tiered quick score (CLI: amc score --tier)
  if (pathname === '/api/v1/score/quick' && method === 'POST') {
    try {
      const body = await bodyJson<{ answers: Record<string, number>; tier?: string }>(req);
      if (!body.answers || typeof body.answers !== 'object') {
        apiError(res, 400, 'Missing required field: answers (Record<questionId, level>)');
        return true;
      }
      const tier = (body.tier ?? 'quick') as 'quick' | 'standard' | 'deep';
      if (tier !== 'quick' && tier !== 'standard' && tier !== 'deep') {
        apiError(res, 400, 'Invalid tier. Use quick, standard, or deep.');
        return true;
      }
      const { getQuestionsForTier, computeQuickScore } = await import('../diagnostic/quickScore.js');
      const questions = getQuestionsForTier(tier);
      const result = computeQuickScore(body.answers, tier);
      apiSuccess(res, { tier, questions: questions.map((q: { id: string; title: string }) => ({ id: q.id, title: q.title })), result });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Quick score failed');
    }
    return true;
  }

  // GET /api/v1/score/quick/questions — get questions for a tier
  if (pathname === '/api/v1/score/quick/questions' && method === 'GET') {
    try {
      const tier = (queryParam(req.url ?? '', 'tier') ?? 'quick') as 'quick' | 'standard' | 'deep';
      if (tier !== 'quick' && tier !== 'standard' && tier !== 'deep') {
        apiError(res, 400, 'Invalid tier. Use quick, standard, or deep.');
        return true;
      }
      const { getQuestionsForTier } = await import('../diagnostic/quickScore.js');
      const questions = getQuestionsForTier(tier);
      apiSuccess(res, { tier, questions });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not load questions');
    }
    return true;
  }

  // GET /api/v1/score/latest — get latest run report (convenience)
  if (pathname === '/api/v1/score/latest' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const { getAgentPaths } = await import('../fleet/paths.js');
      const { readdirSync, existsSync } = await import('node:fs');
      const paths = getAgentPaths(workspace, agentId);
      const runsDir = paths.runsDir;
      if (!existsSync(runsDir)) { apiError(res, 404, 'No runs found'); return true; }
      const files = readdirSync(runsDir).filter((f: string) => f.endsWith('.json')).sort().reverse();
      if (files.length === 0) { apiError(res, 404, 'No runs found'); return true; }
      const latestRunId = files[0]!.replace('.json', '');
      const { loadRunReport } = await import('../diagnostic/runner.js');
      const report = loadRunReport(workspace, latestRunId, agentId);
      apiSuccess(res, report);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not load latest run');
    }
    return true;
  }

  // GET /api/v1/score/history — list run history from ledger (CLI: amc history)
  if (pathname === '/api/v1/score/history' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId');
      const limit = parseInt(queryParam(req.url ?? '', 'limit') ?? '50', 10);
      const { openLedger } = await import('../ledger/ledger.js');
      const { resolveAgentId } = await import('../fleet/paths.js');
      const { loadRunReport } = await import('../diagnostic/runner.js');
      const ledger = openLedger(workspace);
      try {
        let runs = ledger.listRuns();
        if (agentId) {
          const resolved = resolveAgentId(workspace, agentId);
          runs = runs.filter((run) => {
            try {
              const report = loadRunReport(workspace, run.run_id, agentId);
              return report.agentId === resolved;
            } catch {
              return false;
            }
          });
        }
        const limited = runs.slice(0, limit);
        apiSuccess(res, { runs: limited, total: limited.length });
      } finally {
        ledger.close();
      }
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list history');
    }
    return true;
  }

  // POST /api/v1/score/compare — compare two runs via POST body
  if (pathname === '/api/v1/score/compare' && method === 'POST') {
    try {
      const body = await bodyJson<{ runA: string; runB: string; agentId?: string }>(req);
      if (!body.runA || !body.runB) { apiError(res, 400, 'Missing required fields: runA, runB'); return true; }
      const agentId = body.agentId ?? 'default';
      const { loadRunReport, compareRuns } = await import('../diagnostic/runner.js');
      const a = loadRunReport(workspace, body.runA, agentId);
      const b = loadRunReport(workspace, body.runB, agentId);
      const comparison = compareRuns(a, b);
      apiSuccess(res, comparison);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Comparison failed');
    }
    return true;
  }

  // POST /api/v1/score/formal-spec — run full formal-spec diagnostic score
  if (pathname === '/api/v1/score/formal-spec' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string; window?: string }>(req);
      const agentId = body.agentId ?? 'default';
      const { runDiagnostic } = await import('../diagnostic/runner.js');
      const result = await runDiagnostic({ workspace, agentId, window: body.window ?? '30d' });
      const score = result.layerScores?.reduce((s: number, l: { avgFinalLevel: number }) => s + l.avgFinalLevel, 0) ?? 0;
      const max = (result.layerScores?.length ?? 0) * 5;
      queueScoreComputationMetric({
        agentId,
        runId: result.runId,
        sessionId: result.runId,
        score,
        maxScore: max,
        percentage: max > 0 ? Math.round((score / max) * 100) : 0,
        level: Math.round(score / Math.max(result.layerScores?.length ?? 1, 1)),
        ts: Date.now(),
        source: 'api.score.formal-spec',
      });
      apiSuccess(res, result, 200);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Score failed');
    }
    return true;
  }

  // POST /api/v1/score/adversarial — test gaming resistance
  if (pathname === '/api/v1/score/adversarial' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string }>(req);
      const agentId = body.agentId ?? 'default';
      // Adversarial runs a special diagnostic pass — run diagnostic with adversarial window
      const { runDiagnostic } = await import('../diagnostic/runner.js');
      const result = await runDiagnostic({ workspace, agentId, window: '7d', claimMode: 'auto' });
      apiSuccess(res, { agentId, adversarialResult: result, inflationAttempts: result.inflationAttempts ?? [], unsupportedClaims: result.unsupportedClaimCount ?? 0 });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Adversarial test failed');
    }
    return true;
  }

  // GET /api/v1/score/runs — list all runs dir for agent
  if (pathname === '/api/v1/score/runs' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const limit = parseInt(queryParam(req.url ?? '', 'limit') ?? '20', 10);
      const { getAgentPaths } = await import('../fleet/paths.js');
      const { readdirSync, existsSync } = await import('node:fs');
      const paths = getAgentPaths(workspace, agentId);
      const runsDir = paths.runsDir;
      const files = existsSync(runsDir) ? readdirSync(runsDir).filter((f: string) => f.endsWith('.json')).reverse().slice(0, limit) : [];
      const runIds = files.map((f: string) => f.replace('.json', ''));
      apiSuccess(res, { agentId, runIds, total: runIds.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list runs');
    }
    return true;
  }

  // GET /api/v1/score/run/:runId
  const runParams = pathParam(pathname, '/api/v1/score/run/:runId');
  if (runParams && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const { loadRunReport } = await import('../diagnostic/runner.js');
      const run = loadRunReport(workspace, runParams.runId!, agentId);
      apiSuccess(res, run);
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : 'Run not found');
    }
    return true;
  }

  // GET /api/v1/score/compare — compare two runs
  if (pathname === '/api/v1/score/compare' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const runA = queryParam(req.url ?? '', 'runA');
      const runB = queryParam(req.url ?? '', 'runB');
      if (!runA || !runB) { apiError(res, 400, 'runA and runB query params required'); return true; }
      const { loadRunReport, compareRuns } = await import('../diagnostic/runner.js');
      const a = loadRunReport(workspace, runA, agentId);
      const b = loadRunReport(workspace, runB, agentId);
      const comparison = compareRuns(a, b);
      apiSuccess(res, comparison);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Comparison failed');
    }
    return true;
  }

  // GET /api/v1/score/report/:runId — generate report by path param
  const reportPathParams = pathParam(pathname, '/api/v1/score/report/:runId');
  if (reportPathParams && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const format = (queryParam(req.url ?? '', 'format') ?? 'json') as 'json' | 'md';
      const { loadRunReport, generateReport } = await import('../diagnostic/runner.js');
      const report = loadRunReport(workspace, reportPathParams.runId!, agentId);
      if (format === 'md') {
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(generateReport(report, 'md'));
        return true;
      }
      apiSuccess(res, report);
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : 'Run not found');
    }
    return true;
  }

  // GET /api/v1/score/report — generate report (query param version)
  if (pathname === '/api/v1/score/report' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const runId = queryParam(req.url ?? '', 'runId');
      const format = (queryParam(req.url ?? '', 'format') ?? 'json') as 'json' | 'md';
      if (!runId) { apiError(res, 400, 'runId query param required'); return true; }
      const { loadRunReport, generateReport } = await import('../diagnostic/runner.js');
      const report = loadRunReport(workspace, runId, agentId);
      if (format === 'md') {
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(generateReport(report, 'md'));
        return true;
      }
      apiSuccess(res, report);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Report generation failed');
    }
    return true;
  }

  // POST /api/v1/score/session — create interactive diagnostic session
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
      const next = questionBank.find((q: { id: string }) => !answered.has(q.id));
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
    const totalScore = Object.values(session.answers).reduce((s, a) => s + (a as { value: number }).value, 0);
    const maxPossible = answeredCount * 5;
    const percentage = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;
    const level = percentage >= 80 ? 5 : percentage >= 60 ? 4 : percentage >= 40 ? 3 : percentage >= 20 ? 2 : 1;
    apiSuccess(res, { sessionId: session.id, agentId: session.agentId, answeredCount, totalScore, maxPossible, percentage, level, createdAt: session.createdAt });
    queueScoreComputationMetric({ agentId: session.agentId, runId: session.id, sessionId: session.id, score: totalScore, maxScore: maxPossible, percentage, level, ts: Date.now(), source: 'api.score.result' });
    markScoreSessionCompleted(workspace, session.id);
    return true;
  }

  return false;
}
