/**
 * shieldRouter.ts — Shield API routes.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from "zod";
import { bodyJsonSchema, apiSuccess, apiError, isRequestBodyError, requireMethod } from './apiHelpers.js';

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
    apiSuccess(res, { status: 'operational', module: 'shield', capabilities: ['scan', 'injection-detect', 'sanitize'] });
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
