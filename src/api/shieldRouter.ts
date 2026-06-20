/**
 * shieldRouter.ts — Shield API routes.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from "zod";
import { bodyJson, bodyJsonSchema, apiSuccess, apiError, isRequestBodyError, requireMethod } from './apiHelpers.js';
import type { ReplayBenchmarkCiReceipt, ReplayBenchmarkCorpusManifest } from '../benchmarks/replayBenchmarkCorpus.js';
import type { LiveDriftReceipt } from '../watch/liveDriftAlerts.js';
import type { JudgeCalibrationReceipt } from '../eval/judgeCalibration.js';
import type { RunPromptLayerProviderDriftInput } from '../benchmarks/promptLayerProviderDrift.js';
import type { RunPromptfooProviderDriftInput } from '../benchmarks/promptfooProviderDrift.js';

const shieldScanBodySchema = z.object({
  code: z.string().min(1),
  language: z.string().trim().min(1).optional()
}).strict();

const shieldInputBodySchema = z.object({
  input: z.string().min(1)
}).strict();

export async function handleShieldRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (pathname === '/api/v1/shield/status' && method === 'GET') {
    apiSuccess(res, {
      status: 'operational',
      module: 'shield',
      capabilities: ['scan', 'injection-detect', 'sanitize', 'score-explainability-receipts', 'replay-corpus-ci-receipts', 'live-drift-receipts', 'judge-calibration-receipts', 'provider-drift-fail-closed-receipts', 'promptfoo-provider-drift-receipts']
    });
    return true;
  }

  if (pathname === '/api/v1/shield/replay-corpus/verify' && method === 'POST') {
    try {
      const body = await bodyJson<{
        manifest?: ReplayBenchmarkCorpusManifest;
        ciReceipt?: ReplayBenchmarkCiReceipt;
      }>(req);
      if (!body.manifest || !body.ciReceipt) {
        apiError(res, 400, 'Required: manifest and ciReceipt');
        return true;
      }
      const { verifyReplayBenchmarkCorpusReceipt } = await import('../benchmarks/replayBenchmarkCorpus.js');
      const verification = verifyReplayBenchmarkCorpusReceipt(body.manifest, body.ciReceipt);
      apiSuccess(res, {
        verification,
        failClosed: body.ciReceipt.failClosed,
        manifestHash: body.manifest.manifestHash,
        receiptHash: body.ciReceipt.receiptHash,
      });
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : 'Replay corpus receipt verification failed');
    }
    return true;
  }

  if (pathname === '/api/v1/shield/live-drift/verify' && method === 'POST') {
    try {
      const body = await bodyJson<{ receipt?: LiveDriftReceipt }>(req);
      if (!body.receipt) {
        apiError(res, 400, 'Required: receipt');
        return true;
      }
      const { verifyLiveDriftReceipt } = await import('../watch/liveDriftAlerts.js');
      const verification = verifyLiveDriftReceipt(body.receipt);
      apiSuccess(res, {
        verification,
        failClosed: body.receipt.failClosed,
        receiptHash: body.receipt.receiptHash,
      });
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : 'Live drift receipt verification failed');
    }
    return true;
  }

  if (pathname === '/api/v1/shield/judge-calibration/verify' && method === 'POST') {
    try {
      const body = await bodyJson<{ receipt?: JudgeCalibrationReceipt }>(req);
      if (!body.receipt) {
        apiError(res, 400, 'Required: receipt');
        return true;
      }
      const { verifyJudgeCalibrationReceipt } = await import('../eval/judgeCalibration.js');
      const verification = verifyJudgeCalibrationReceipt(body.receipt);
      apiSuccess(res, {
        verification,
        failClosed: body.receipt.failClosed,
        receiptHash: body.receipt.receiptHash,
      });
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : 'Judge calibration receipt verification failed');
    }
    return true;
  }

  if (pathname === '/api/v1/shield/provider-drift/verify' && method === 'POST') {
    try {
      const body = await bodyJson<RunPromptLayerProviderDriftInput>(req);
      if (!Array.isArray(body.baseline) || !Array.isArray(body.candidate) || !body.promptLayer) {
        apiError(res, 400, 'Required: baseline[], candidate[], and promptLayer metadata');
        return true;
      }
      const { runPromptLayerProviderDrift } = await import('../benchmarks/promptLayerProviderDrift.js');
      const result = runPromptLayerProviderDrift({
        ...body,
        agentId: body.agentId ?? 'default',
      });
      apiSuccess(res, {
        verification: result.ciGate.passed ? 'passed' : 'blocked',
        ciGate: result.ciGate,
        promptLayerEvidenceHash: result.promptLayerEvidenceHash,
        failClosed: result.report.failClosed,
        activeAlerts: result.report.alerts.filter((alert) => !alert.waived).map((alert) => alert.alertId),
        waivedAlerts: result.report.alerts.filter((alert) => alert.waived).map((alert) => alert.alertId),
      });
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : 'Provider drift receipt verification failed');
    }
    return true;
  }

  if (pathname === '/api/v1/shield/promptfoo-provider-drift/verify' && method === 'POST') {
    try {
      const body = await bodyJson<RunPromptfooProviderDriftInput>(req);
      if (!Array.isArray(body.baseline) || !Array.isArray(body.candidate) || !body.promptfoo) {
        apiError(res, 400, 'Required: baseline[], candidate[], and promptfoo metadata');
        return true;
      }
      const { runPromptfooProviderDrift } = await import('../benchmarks/promptfooProviderDrift.js');
      const result = runPromptfooProviderDrift({
        ...body,
        agentId: body.agentId ?? 'default',
      });
      apiSuccess(res, {
        verification: result.ciGate.passed ? 'passed' : 'blocked',
        ciGate: result.ciGate,
        promptfooEvidenceHash: result.promptfooEvidenceHash,
        failClosed: result.report.failClosed,
        activeAlerts: result.report.alerts.filter((alert) => !alert.waived).map((alert) => alert.alertId),
        waivedAlerts: result.report.alerts.filter((alert) => alert.waived).map((alert) => alert.alertId),
      });
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : 'promptfoo provider drift receipt verification failed');
    }
    return true;
  }

  const scoreExplainabilityParams = /^\/api\/v1\/shield\/score-explainability\/([^/]+)$/.exec(pathname);
  if (scoreExplainabilityParams && method === 'GET') {
    try {
      const runId = decodeURIComponent(scoreExplainabilityParams[1]!);
      const url = new URL(req.url ?? pathname, 'http://localhost');
      const agentId = url.searchParams.get('agentId') ?? 'default';
      const { loadRunReport } = await import('../diagnostic/runner.js');
      const report = loadRunReport(workspace, runId, agentId);
      apiSuccess(res, {
        agentId,
        runId,
        trustLabel: report.trustLabel,
        integrityIndex: report.integrityIndex,
        questionExplainability: report.questionExplainability ?? null,
        failClosed: report.questionExplainability?.failClosed ?? true
      });
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : 'Question explainability receipt not found');
    }
    return true;
  }

  if (pathname === '/api/v1/shield/scan/skill' && method === 'POST') {
    if (!requireMethod(req, res, 'POST')) return true;
    try {
      const body = await bodyJsonSchema(req, shieldScanBodySchema);
      // Dynamic import to avoid hard dependency
      const { analyzeSkill } = await import('../shield/analyzer.js');
      const result = analyzeSkill(body.code);
      apiSuccess(res, result);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  if (pathname === '/api/v1/shield/detect/injection' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, shieldInputBodySchema);
      const { detectInjection } = await import('../shield/detector.js');
      const result = detectInjection(body.input);
      apiSuccess(res, result);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  if (pathname === '/api/v1/shield/sanitize' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, shieldInputBodySchema);
      const { sanitize } = await import('../shield/sanitizer.js');
      const result = sanitize(body.input);
      apiSuccess(res, result);
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  // POST /api/v1/shield/red-team/run — run a red team campaign
  if (pathname === '/api/v1/shield/red-team/run' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, z.object({
        targetProfile: z.record(z.string(), z.unknown()).optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      }).strict());
      const { ContinuousRedTeam } = await import('../shield/continuousRedTeam.js');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rt = new ContinuousRedTeam(body.config as unknown as any);
      const report = rt.generateReport();
      apiSuccess(res, { status: 'initiated', report, targetProfile: body.targetProfile });
    } catch (err) {
      if (isRequestBodyError(err)) { apiError(res, err.statusCode, err.message); return true; }
      apiError(res, 500, err instanceof Error ? err.message : 'Red team run failed');
    }
    return true;
  }

  // GET /api/v1/shield/red-team/status — get red team status/capabilities
  if (pathname === '/api/v1/shield/red-team/status' && method === 'GET') {
    apiSuccess(res, {
      status: 'operational',
      module: 'continuous-red-team',
      capabilities: ['attack-generation', 'evolutionary-mutation', 'crossover', 'regression-detection'],
    });
    return true;
  }

  if (pathname === '/api/v1/shield/exploit-confirmation/scopes' && method === 'GET') {
    try {
      const { listExploitConfirmationScopes } = await import('../shield/exploitConfirmation.js');
      const scopes = listExploitConfirmationScopes(workspace);
      apiSuccess(res, { scopes, total: scopes.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list exploit confirmation scopes');
    }
    return true;
  }

  if (pathname === '/api/v1/shield/exploit-confirmation/scopes' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, z.object({
        scope: z.unknown()
      }).strict());
      const { writeExploitConfirmationScope } = await import('../shield/exploitConfirmation.js');
      const written = writeExploitConfirmationScope({ workspace, scope: body.scope });
      apiSuccess(res, written, 201);
    } catch (err) {
      if (isRequestBodyError(err)) { apiError(res, err.statusCode, err.message); return true; }
      apiError(res, 400, err instanceof Error ? err.message : 'Could not write exploit confirmation scope');
    }
    return true;
  }

  const exploitScopeParams = /^\/api\/v1\/shield\/exploit-confirmation\/scopes\/([^/]+)$/.exec(pathname);
  if (exploitScopeParams && method === 'GET') {
    try {
      const { loadExploitConfirmationScope } = await import('../shield/exploitConfirmation.js');
      const scope = loadExploitConfirmationScope(workspace, decodeURIComponent(exploitScopeParams[1]!));
      if (!scope) {
        apiError(res, 404, 'Exploit confirmation scope not found');
        return true;
      }
      apiSuccess(res, { scope });
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : 'Exploit confirmation scope not found');
    }
    return true;
  }

  if (pathname === '/api/v1/shield/exploit-confirmation/run' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, z.object({
        scopeId: z.string().min(1).optional(),
        task: z.unknown(),
        nowTs: z.number().int().optional()
      }).strict());
      const { runExploitConfirmation } = await import('../shield/exploitConfirmation.js');
      const result = runExploitConfirmation({
        workspace,
        scopeId: body.scopeId,
        task: body.task,
        nowTs: body.nowTs
      });
      apiSuccess(res, { result }, result.status === 'BLOCKED' ? 200 : 201);
    } catch (err) {
      if (isRequestBodyError(err)) { apiError(res, err.statusCode, err.message); return true; }
      apiError(res, 400, err instanceof Error ? err.message : 'Exploit confirmation failed');
    }
    return true;
  }

  if (pathname === '/api/v1/shield/exploit-confirmation/proofs' && method === 'GET') {
    try {
      const { listExploitConfirmationProofs } = await import('../shield/exploitConfirmation.js');
      const proofs = listExploitConfirmationProofs(workspace);
      apiSuccess(res, { proofs, total: proofs.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list exploit confirmation proofs');
    }
    return true;
  }

  const exploitProofExportParams = /^\/api\/v1\/shield\/exploit-confirmation\/proofs\/([^/]+)\/export$/.exec(pathname);
  if (exploitProofExportParams && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, z.object({
        outPath: z.string().min(1).optional(),
        redacted: z.boolean().optional()
      }).strict());
      const { exportExploitConfirmationProof } = await import('../shield/exploitConfirmation.js');
      const exported = exportExploitConfirmationProof({
        workspace,
        proofId: decodeURIComponent(exploitProofExportParams[1]!),
        outPath: body.outPath,
        redacted: body.redacted !== false
      });
      apiSuccess(res, exported);
    } catch (err) {
      if (isRequestBodyError(err)) { apiError(res, err.statusCode, err.message); return true; }
      apiError(res, 400, err instanceof Error ? err.message : 'Could not export exploit confirmation proof');
    }
    return true;
  }

  // POST /api/v1/shield/trust-pipeline/run — run end-to-end trust pipeline
  if (pathname === '/api/v1/shield/trust-pipeline/run' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, z.object({
        agentId: z.string().min(1),
        action: z.string().min(1),
        toolName: z.string().min(1),
        parameters: z.record(z.string(), z.unknown()).default({}),
        sessionId: z.string().min(1),
        workspaceId: z.string().min(1),
      }));
      const { runTrustPipeline } = await import('../shield/trustPipeline.js');
      const result = await runTrustPipeline({ ...body, parameters: body.parameters ?? {} });
      apiSuccess(res, result);
    } catch (err) {
      if (isRequestBodyError(err)) { apiError(res, err.statusCode, err.message); return true; }
      apiError(res, 500, err instanceof Error ? err.message : 'Trust pipeline failed');
    }
    return true;
  }

  // POST /api/v1/shield/red-team/attack — generate a single attack
  if (pathname === '/api/v1/shield/red-team/attack' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, z.object({
        targetProfile: z.record(z.string(), z.unknown()).optional(),
        attackType: z.string().optional(),
      }).strict());
      const { DynamicAttackGenerator } = await import('../shield/dynamicAttackGenerator.js');
      const generator = new DynamicAttackGenerator();
      const attacks = await generator.generateAttacks({
        targetSystem: String(body.targetProfile?.systemPurpose ?? 'general'),
        systemPurpose: String(body.targetProfile?.systemPurpose ?? 'general'),
        knownVulnerabilities: [],
        previousAttempts: [],
        riskProfile: 'medium',
      }, 'crescendo', 1);
      apiSuccess(res, { attack: attacks[0] ?? null, generated: attacks.length });
    } catch (err) {
      if (isRequestBodyError(err)) { apiError(res, err.statusCode, err.message); return true; }
      apiError(res, 500, err instanceof Error ? err.message : 'Attack generation failed');
    }
    return true;
  }

  return false;
}
