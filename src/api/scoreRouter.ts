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

  // POST /api/v1/score/industry/adjust — adjust score using industry-specific model
  if (pathname === '/api/v1/score/industry/adjust' && method === 'POST') {
    try {
      const body = await bodyJson<{
        rawDimensionScores?: Record<string, number>;
        industryId?: string;
        lastVerifiedAt?: number;
        observedEvidenceShare?: number;
      }>(req);
      if (!body.rawDimensionScores || !body.industryId) {
        apiError(res, 400, 'rawDimensionScores and industryId required'); return true;
      }
      const { computeIndustryAdjustedScore } = await import('../score/industryTrustModels.js');
      const result = computeIndustryAdjustedScore(
        body.rawDimensionScores,
        body.industryId,
        body.lastVerifiedAt ?? Date.now() - 3600000,
        body.observedEvidenceShare ?? 0.5,
      );
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Industry score adjustment failed');
    }
    return true;
  }

  // GET /api/v1/score/industry/models — list available industry models
  if (pathname === '/api/v1/score/industry/models' && method === 'GET') {
    try {
      const { INDUSTRY_TRUST_MODELS } = await import('../score/industryTrustModels.js');
      const models = Object.values(INDUSTRY_TRUST_MODELS).map(m => ({
        industryId: m.industryId,
        name: m.name,
        riskProfile: m.riskProfile,
        regulatoryFrameworks: m.regulatoryFrameworks,
      }));
      apiSuccess(res, { models, count: models.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Failed to list industry models');
    }
    return true;
  }

  // GET /api/v1/score/industry/model/:industryId — get a specific industry model
  const industryModelParams = pathParam(pathname, '/api/v1/score/industry/model/:industryId');
  if (industryModelParams && method === 'GET') {
    try {
      const { INDUSTRY_TRUST_MODELS } = await import('../score/industryTrustModels.js');
      const model = INDUSTRY_TRUST_MODELS[industryModelParams.industryId!];
      if (!model) { apiError(res, 404, `Industry model not found: ${industryModelParams.industryId}`); return true; }
      apiSuccess(res, model);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Failed to get industry model');
    }
    return true;
  }

  // ── Cross-Agent Trust Routes ───────────────────────────────────────────────

  // POST /api/v1/score/trust/verify-claim — verify an agent identity claim against a policy
  if (pathname === '/api/v1/score/trust/verify-claim' && method === 'POST') {
    try {
      const body = await bodyJson<{
        claim: unknown;
        policy: unknown;
        sharedSecret?: string;
      }>(req);
      if (!body.claim || !body.policy) {
        apiError(res, 400, 'Missing required fields: claim, policy');
        return true;
      }
      const { verifyAgentClaim } = await import('../score/crossAgentTrust.js');
      const secret = body.sharedSecret ?? process.env['AMC_TRUST_SECRET'] ?? 'amc-trust-default';
      // Dates may arrive as strings — coerce issuedAt / expiresAt
      const claim = body.claim as Record<string, unknown>;
      if (typeof claim['issuedAt'] === 'string') claim['issuedAt'] = new Date(claim['issuedAt'] as string);
      if (typeof claim['expiresAt'] === 'string') claim['expiresAt'] = new Date(claim['expiresAt'] as string);
      const result = verifyAgentClaim(
        claim as unknown as import('../score/crossAgentTrust.js').AgentIdentityClaim,
        body.policy as unknown as import('../score/crossAgentTrust.js').TrustPolicyRule,
        secret,
      );
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'verify-claim failed');
    }
    return true;
  }

  // POST /api/v1/score/trust/create-claim — create a new agent identity claim
  if (pathname === '/api/v1/score/trust/create-claim' && method === 'POST') {
    try {
      const body = await bodyJson<{
        agentId: string;
        publicKeyHash: string;
        issuingWorkspace: string;
        sharedSecret?: string;
        amcScore?: number;
        amcLevel?: string;
        amcPassportId?: string;
        ttlHours?: number;
      }>(req);
      if (!body.agentId || !body.publicKeyHash || !body.issuingWorkspace) {
        apiError(res, 400, 'Missing required fields: agentId, publicKeyHash, issuingWorkspace');
        return true;
      }
      const { createAgentClaim } = await import('../score/crossAgentTrust.js');
      const secret = body.sharedSecret ?? process.env['AMC_TRUST_SECRET'] ?? 'amc-trust-default';
      const result = createAgentClaim(
        body.agentId,
        body.publicKeyHash,
        body.issuingWorkspace,
        secret,
        {
          amcScore: body.amcScore,
          amcLevel: body.amcLevel,
          amcPassportId: body.amcPassportId,
          ttlHours: body.ttlHours,
        },
      );
      apiSuccess(res, result, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'create-claim failed');
    }
    return true;
  }

  // POST /api/v1/score/trust/transitive — compute transitive trust between two agents
  if (pathname === '/api/v1/score/trust/transitive' && method === 'POST') {
    try {
      const body = await bodyJson<{
        graph: unknown;
        sourceAgent: string;
        targetAgent: string;
        opts?: { maxHops?: number; decayPerHop?: number; now?: number };
      }>(req);
      if (!body.graph || !body.sourceAgent || !body.targetAgent) {
        apiError(res, 400, 'Missing required fields: graph, sourceAgent, targetAgent');
        return true;
      }
      const { computeTransitiveTrust } = await import('../score/crossAgentTrust.js');
      const result = computeTransitiveTrust(
        body.graph as unknown as import('../score/crossAgentTrust.js').TrustGraph,
        body.sourceAgent,
        body.targetAgent,
        body.opts,
      );
      apiSuccess(res, result ?? { found: false, message: 'No trust path found between agents' });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'transitive trust computation failed');
    }
    return true;
  }

  // POST /api/v1/score/trust/decay — apply temporal decay to a trust score
  if (pathname === '/api/v1/score/trust/decay' && method === 'POST') {
    try {
      const body = await bodyJson<{
        originalScore: number;
        establishedAt: number;
        config: unknown;
        now?: number;
      }>(req);
      if (body.originalScore === undefined || body.establishedAt === undefined || !body.config) {
        apiError(res, 400, 'Missing required fields: originalScore, establishedAt, config');
        return true;
      }
      const { applyTemporalDecay } = await import('../score/crossAgentTrust.js');
      const decayedScore = applyTemporalDecay(
        body.originalScore,
        body.establishedAt,
        body.config as unknown as import('../score/crossAgentTrust.js').TemporalDecayConfig,
        body.now,
      );
      apiSuccess(res, { originalScore: body.originalScore, decayedScore, decayApplied: body.originalScore - decayedScore });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'temporal decay failed');
    }
    return true;
  }

  // POST /api/v1/score/trust/inherited — compute inherited trust from parent delegation
  if (pathname === '/api/v1/score/trust/inherited' && method === 'POST') {
    try {
      const body = await bodyJson<{
        delegatorTrust: unknown;
        delegateScore: number;
        policy: unknown;
        delegationDepth?: number;
      }>(req);
      if (!body.delegatorTrust || body.delegateScore === undefined || !body.policy) {
        apiError(res, 400, 'Missing required fields: delegatorTrust, delegateScore, policy');
        return true;
      }
      const { computeInheritedTrust } = await import('../score/crossAgentTrust.js');
      const result = computeInheritedTrust(
        body.delegatorTrust as unknown as import('../score/crossAgentTrust.js').TrustVerificationResult,
        body.delegateScore,
        body.policy as unknown as import('../score/crossAgentTrust.js').DelegationPolicy,
        body.delegationDepth,
      );
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'inherited trust computation failed');
    }
    return true;
  }

  // GET /api/v1/score/trust/decay-presets — list INDUSTRY_DECAY_PRESETS
  if (pathname === '/api/v1/score/trust/decay-presets' && method === 'GET') {
    try {
      const { INDUSTRY_DECAY_PRESETS } = await import('../score/crossAgentTrust.js');
      apiSuccess(res, { presets: INDUSTRY_DECAY_PRESETS, count: Object.keys(INDUSTRY_DECAY_PRESETS).length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Failed to load decay presets');
    }
    return true;
  }

  return false;
}
