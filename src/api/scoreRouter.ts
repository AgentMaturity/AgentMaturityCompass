/**
 * scoreRouter.ts — Score/diagnostic API routes.
 * Full parity with: amc score *, amc diagnostic *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { bodyJson, bodyJsonSchema, apiSuccess, apiError, pathParam, queryParam, isRequestBodyError } from './apiHelpers.js';
import {
  countActiveScoreSessions,
  createScoreSession,
  getScoreSession,
  markScoreSessionCompleted,
  recordScoreAnswer,
} from './scoreStore.js';
import { queueScoreComputationMetric } from '../observability/otelExporter.js';
import type { RunLiveScoreBehaviorDriftInput } from '../watch/liveDriftAlerts.js';
import type { BuildJudgeCalibrationReceiptInput } from '../eval/judgeCalibration.js';

const nonEmptyStringSchema = z.string().trim().min(1);
const optionalNonEmptyStringSchema = nonEmptyStringSchema.optional();
const objectRecordSchema = z.record(z.string(), z.unknown());
const scoreLevelSchema = z.number().int().min(0).max(5);
const answersSchema = z.record(nonEmptyStringSchema, scoreLevelSchema);

const scoreRunBodySchema = z.object({
  agentId: optionalNonEmptyStringSchema,
  window: optionalNonEmptyStringSchema,
  targetName: optionalNonEmptyStringSchema,
  claimMode: z.enum(["auto", "owner", "harness"]).optional(),
  runtimeForHarness: optionalNonEmptyStringSchema,
  questionSetVersion: optionalNonEmptyStringSchema,
  applyIndustryPackWeights: z.boolean().optional(),
});
const quickscoreBodySchema = z.object({ answers: answersSchema });
const quickScoreBodySchema = z.object({
  answers: answersSchema,
  tier: z.enum(["quick", "standard", "deep"]).optional(),
});
const compareBodySchema = z.object({
  runA: nonEmptyStringSchema,
  runB: nonEmptyStringSchema,
  agentId: optionalNonEmptyStringSchema,
});
const agentWindowBodySchema = z.object({
  agentId: optionalNonEmptyStringSchema,
  window: optionalNonEmptyStringSchema,
});
const optionalAgentBodySchema = z.object({ agentId: optionalNonEmptyStringSchema });
const scoreSessionBodySchema = z.object({ agentId: nonEmptyStringSchema });
const scoreAnswerBodySchema = z.object({
  sessionId: nonEmptyStringSchema,
  questionId: nonEmptyStringSchema,
  value: scoreLevelSchema,
  notes: z.string().max(2000).optional(),
});
const industryAdjustBodySchema = z.object({
  rawDimensionScores: z.record(nonEmptyStringSchema, z.number()),
  industryId: nonEmptyStringSchema,
  lastVerifiedAt: z.number().optional(),
  observedEvidenceShare: z.number().min(0).max(1).optional(),
});
const verifyClaimBodySchema = z.object({
  claim: objectRecordSchema,
  policy: objectRecordSchema,
  sharedSecret: optionalNonEmptyStringSchema,
});
const createClaimBodySchema = z.object({
  agentId: nonEmptyStringSchema,
  publicKeyHash: nonEmptyStringSchema,
  issuingWorkspace: nonEmptyStringSchema,
  sharedSecret: optionalNonEmptyStringSchema,
  amcScore: z.number().optional(),
  amcLevel: optionalNonEmptyStringSchema,
  amcPassportId: optionalNonEmptyStringSchema,
  ttlHours: z.number().positive().optional(),
});
const transitiveTrustBodySchema = z.object({
  graph: objectRecordSchema,
  sourceAgent: nonEmptyStringSchema,
  targetAgent: nonEmptyStringSchema,
  opts: z.object({
    maxHops: z.number().int().positive().optional(),
    decayPerHop: z.number().optional(),
    now: z.number().optional(),
  }).optional(),
});
const temporalDecayBodySchema = z.object({
  originalScore: z.number(),
  establishedAt: z.number(),
  config: objectRecordSchema,
  now: z.number().optional(),
});
const inheritedTrustBodySchema = z.object({
  delegatorTrust: objectRecordSchema,
  delegateScore: z.number(),
  policy: objectRecordSchema,
  delegationDepth: z.number().int().nonnegative().optional(),
});
const safetyResearchBodySchema = z.object({
  responses: z.record(nonEmptyStringSchema, z.string()).optional(),
});

function scoreRouteError(res: ServerResponse, error: unknown, fallback: string, status = 500): void {
  if (isRequestBodyError(error)) {
    apiError(res, error.statusCode, error.message);
    return;
  }
  apiError(res, status, fallback);
}

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

  // POST /api/v1/score/live-drift — score-facing live drift receipt for production samples
  if (pathname === '/api/v1/score/live-drift' && method === 'POST') {
    try {
      const body = await bodyJson<RunLiveScoreBehaviorDriftInput>(req);
      if (!body.baselineWindow || !Array.isArray(body.baselineWindow.rows) || !body.liveWindow || !Array.isArray(body.liveWindow.rows)) {
        apiError(res, 400, 'Required: baselineWindow.rows and liveWindow.rows');
        return true;
      }
      const { runLiveScoreBehaviorDrift } = await import('../watch/liveDriftAlerts.js');
      const receipt = runLiveScoreBehaviorDrift({
        ...body,
        agentId: body.agentId ?? 'default',
      });
      apiSuccess(res, {
        receipt,
        scoreDrift: receipt.scoreDrift,
        behaviorDrift: receipt.behaviorDrift,
        failClosed: receipt.failClosed,
      });
    } catch (err) {
      scoreRouteError(res, err, 'Live drift scoring failed');
    }
    return true;
  }

  // POST /api/v1/score/judge-calibration — score-facing LLM judge calibration receipt
  if (pathname === '/api/v1/score/judge-calibration' && method === 'POST') {
    try {
      const body = await bodyJson<BuildJudgeCalibrationReceiptInput>(req);
      if (!body.rubric || !body.calibrationSet || !Array.isArray(body.calibrationSet.rows) || !Array.isArray(body.judgments)) {
        apiError(res, 400, 'Required: rubric, calibrationSet.rows, and judgments');
        return true;
      }
      const { buildJudgeCalibrationReceipt } = await import('../eval/judgeCalibration.js');
      const receipt = buildJudgeCalibrationReceipt({
        ...body,
        agentId: body.agentId ?? 'default',
        runId: body.runId ?? `judge-calibration-${Date.now()}`,
      });
      apiSuccess(res, {
        receipt,
        disagreement: receipt.disagreement,
        ciGate: receipt.ciGate,
        failClosed: receipt.failClosed,
      });
    } catch (err) {
      scoreRouteError(res, err, 'Judge calibration scoring failed');
    }
    return true;
  }

  // GET /api/v1/score/question-sets — list supported assessment question sets
  if (pathname === '/api/v1/score/question-sets' && method === 'GET') {
    try {
      const { listQuestionSets } = await import('../diagnostic/questionSets.js');
      apiSuccess(res, { questionSets: listQuestionSets() });
    } catch (err) {
      scoreRouteError(res, err, 'Could not load question sets');
    }
    return true;
  }

  // POST /api/v1/score/run — trigger a full diagnostic run (CLI: amc run)
  if (pathname === '/api/v1/score/run' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, scoreRunBodySchema);
      const agentId = body.agentId ?? 'default';
      const { runDiagnostic } = await import('../diagnostic/runner.js');
      const result = await runDiagnostic({
        workspace,
        agentId,
        window: body.window ?? '14d',
        targetName: body.targetName,
        claimMode: body.claimMode ?? 'auto',
        runtimeForHarness: body.runtimeForHarness as import('../types.js').RuntimeName | undefined,
        questionSetVersion: body.questionSetVersion,
        applyIndustryPackWeights: body.applyIndustryPackWeights === true,
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
      scoreRouteError(res, err, 'Diagnostic run failed');
    }
    return true;
  }

  // POST /api/v1/score/quickscore — rapid 5-question assessment (CLI: amc quickscore)
  if (pathname === '/api/v1/score/quickscore' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, quickscoreBodySchema);
      const { getRapidQuestions, scoreRapidAssessment } = await import('../diagnostic/rapidQuickscore.js');
      const questions = getRapidQuestions();
      const result = scoreRapidAssessment(body.answers);
      apiSuccess(res, { questions: questions.map((q: { id: string; title: string }) => ({ id: q.id, title: q.title })), result });
    } catch (err) {
      scoreRouteError(res, err, 'Quickscore failed');
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
      scoreRouteError(res, err, 'Could not load quickscore questions');
    }
    return true;
  }

  // POST /api/v1/score/quick — tiered quick score (CLI: amc score --tier)
  if (pathname === '/api/v1/score/quick' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, quickScoreBodySchema);
      const tier = body.tier ?? 'quick';
      const { getQuestionsForTier, computeQuickScore } = await import('../diagnostic/quickScore.js');
      const questions = getQuestionsForTier(tier);
      const result = computeQuickScore(body.answers, tier);
      apiSuccess(res, { tier, questions: questions.map((q: { id: string; title: string }) => ({ id: q.id, title: q.title })), result });
    } catch (err) {
      scoreRouteError(res, err, 'Quick score failed');
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
      scoreRouteError(res, err, 'Could not load questions');
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
      scoreRouteError(res, err, 'Could not load latest run');
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
      scoreRouteError(res, err, 'Could not list history');
    }
    return true;
  }

  // POST /api/v1/score/compare — compare two runs via POST body
  if (pathname === '/api/v1/score/compare' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, compareBodySchema);
      const agentId = body.agentId ?? 'default';
      const { loadRunReport, compareRuns } = await import('../diagnostic/runner.js');
      const a = loadRunReport(workspace, body.runA, agentId);
      const b = loadRunReport(workspace, body.runB, agentId);
      const comparison = compareRuns(a, b);
      apiSuccess(res, comparison);
    } catch (err) {
      scoreRouteError(res, err, 'Comparison failed');
    }
    return true;
  }

  // POST /api/v1/score/formal-spec — run full formal-spec diagnostic score
  if (pathname === '/api/v1/score/formal-spec' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, agentWindowBodySchema);
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
      scoreRouteError(res, err, 'Score failed');
    }
    return true;
  }

  // POST /api/v1/score/adversarial — test gaming resistance
  if (pathname === '/api/v1/score/adversarial' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, optionalAgentBodySchema);
      const agentId = body.agentId ?? 'default';
      // Adversarial runs a special diagnostic pass — run diagnostic with adversarial window
      const { runDiagnostic } = await import('../diagnostic/runner.js');
      const result = await runDiagnostic({ workspace, agentId, window: '7d', claimMode: 'auto' });
      apiSuccess(res, { agentId, adversarialResult: result, inflationAttempts: result.inflationAttempts ?? [], unsupportedClaims: result.unsupportedClaimCount ?? 0 });
    } catch (err) {
      scoreRouteError(res, err, 'Adversarial test failed');
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
      scoreRouteError(res, err, 'Could not list runs');
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
      scoreRouteError(res, err, 'Run not found', 404);
    }
    return true;
  }

  // GET /api/v1/score/evidence-drilldown/:runId/:questionId — UI-ready score finding receipt drilldown
  const drilldownParams = pathParam(pathname, '/api/v1/score/evidence-drilldown/:runId/:questionId');
  if (drilldownParams && method === 'GET') {
    try {
      const runId = decodeURIComponent(drilldownParams.runId ?? '');
      const questionId = decodeURIComponent(drilldownParams.questionId ?? '');
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const { loadRunReport } = await import('../diagnostic/runner.js');
      const { buildScoreEvidenceDrilldown } = await import('../diagnostic/evidenceDrilldown.js');
      const report = loadRunReport(workspace, runId, agentId);
      apiSuccess(res, buildScoreEvidenceDrilldown(report, questionId));
    } catch (err) {
      scoreRouteError(res, err, 'Evidence drilldown failed', 404);
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
      scoreRouteError(res, err, 'Comparison failed');
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
      scoreRouteError(res, err, 'Run not found', 404);
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
      scoreRouteError(res, err, 'Report generation failed');
    }
    return true;
  }

  // POST /api/v1/score/session — create interactive diagnostic session
  if (pathname === '/api/v1/score/session' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, scoreSessionBodySchema);
      const session = createScoreSession(workspace, body.agentId);
      apiSuccess(res, { sessionId: session.id, agentId: session.agentId }, 201);
    } catch (err) {
      scoreRouteError(res, err, 'Internal error');
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
      scoreRouteError(res, err, 'Internal error');
    }
    return true;
  }

  // POST /api/v1/score/answer
  if (pathname === '/api/v1/score/answer' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, scoreAnswerBodySchema);
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
        apiError(res, 400, "Invalid score answer");
        return true;
      }
      scoreRouteError(res, err, 'Internal error');
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
      const body = await bodyJsonSchema(req, industryAdjustBodySchema);
      const { computeIndustryAdjustedScore } = await import('../score/industryTrustModels.js');
      const result = computeIndustryAdjustedScore(
        body.rawDimensionScores,
        body.industryId,
        body.lastVerifiedAt ?? Date.now() - 3600000,
        body.observedEvidenceShare ?? 0.5,
      );
      apiSuccess(res, result);
    } catch (err) {
      scoreRouteError(res, err, 'Industry score adjustment failed');
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
      scoreRouteError(res, err, 'Failed to list industry models');
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
      scoreRouteError(res, err, 'Failed to get industry model');
    }
    return true;
  }

  // ── Cross-Agent Trust Routes ───────────────────────────────────────────────

  // POST /api/v1/score/trust/verify-claim — verify an agent identity claim against a policy
  if (pathname === '/api/v1/score/trust/verify-claim' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, verifyClaimBodySchema);
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
      scoreRouteError(res, err, 'verify-claim failed');
    }
    return true;
  }

  // POST /api/v1/score/trust/create-claim — create a new agent identity claim
  if (pathname === '/api/v1/score/trust/create-claim' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, createClaimBodySchema);
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
      scoreRouteError(res, err, 'create-claim failed');
    }
    return true;
  }

  // POST /api/v1/score/trust/transitive — compute transitive trust between two agents
  if (pathname === '/api/v1/score/trust/transitive' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, transitiveTrustBodySchema);
      const { computeTransitiveTrust } = await import('../score/crossAgentTrust.js');
      const result = computeTransitiveTrust(
        body.graph as unknown as import('../score/crossAgentTrust.js').TrustGraph,
        body.sourceAgent,
        body.targetAgent,
        body.opts,
      );
      apiSuccess(res, result ?? { found: false, message: 'No trust path found between agents' });
    } catch (err) {
      scoreRouteError(res, err, 'transitive trust computation failed');
    }
    return true;
  }

  // POST /api/v1/score/trust/decay — apply temporal decay to a trust score
  if (pathname === '/api/v1/score/trust/decay' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, temporalDecayBodySchema);
      const { applyTemporalDecay } = await import('../score/crossAgentTrust.js');
      const decayedScore = applyTemporalDecay(
        body.originalScore,
        body.establishedAt,
        body.config as unknown as import('../score/crossAgentTrust.js').TemporalDecayConfig,
        body.now,
      );
      apiSuccess(res, { originalScore: body.originalScore, decayedScore, decayApplied: body.originalScore - decayedScore });
    } catch (err) {
      scoreRouteError(res, err, 'temporal decay failed');
    }
    return true;
  }

  // POST /api/v1/score/trust/inherited — compute inherited trust from parent delegation
  if (pathname === '/api/v1/score/trust/inherited' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, inheritedTrustBodySchema);
      const { computeInheritedTrust } = await import('../score/crossAgentTrust.js');
      const result = computeInheritedTrust(
        body.delegatorTrust as unknown as import('../score/crossAgentTrust.js').TrustVerificationResult,
        body.delegateScore,
        body.policy as unknown as import('../score/crossAgentTrust.js').DelegationPolicy,
        body.delegationDepth,
      );
      apiSuccess(res, result);
    } catch (err) {
      scoreRouteError(res, err, 'inherited trust computation failed');
    }
    return true;
  }

  // GET /api/v1/score/trust/decay-presets — list INDUSTRY_DECAY_PRESETS
  if (pathname === '/api/v1/score/trust/decay-presets' && method === 'GET') {
    try {
      const { INDUSTRY_DECAY_PRESETS } = await import('../score/crossAgentTrust.js');
      apiSuccess(res, { presets: INDUSTRY_DECAY_PRESETS, count: Object.keys(INDUSTRY_DECAY_PRESETS).length });
    } catch (err) {
      scoreRouteError(res, err, 'Failed to load decay presets');
    }
    return true;
  }

  // POST /api/v1/score/lane/safety-research — run Safety Research Lane evaluation
  if (pathname === '/api/v1/score/lane/safety-research' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, safetyResearchBodySchema);
      const { scoreSafetyResearchLane, getSafetyResearchLaneQuestionIds } = await import('../lanes/safetyResearchLane.js');
      const responses = body.responses ?? {};
      const report = scoreSafetyResearchLane(responses);
      const questionIds = getSafetyResearchLaneQuestionIds();
      apiSuccess(res, {
        ...report,
        coverage: {
          answered: Object.keys(responses).length,
          total: questionIds.length,
          percentage: Math.round((Object.keys(responses).length / questionIds.length) * 100),
        },
      });
    } catch (err) {
      scoreRouteError(res, err, 'Safety research lane evaluation failed');
    }
    return true;
  }

  // GET /api/v1/score/lane/safety-research/questions — list all question IDs
  if (pathname === '/api/v1/score/lane/safety-research/questions' && method === 'GET') {
    try {
      const { getSafetyResearchLaneQuestionIds } = await import('../lanes/safetyResearchLane.js');
      const questionIds = getSafetyResearchLaneQuestionIds();
      apiSuccess(res, { questionIds, count: questionIds.length });
    } catch (err) {
      scoreRouteError(res, err, 'Failed to load safety research questions');
    }
    return true;
  }

  return false;
}
