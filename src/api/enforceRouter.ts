/**
 * enforceRouter.ts — Enforce API routes.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from "zod";
import { bodyJsonSchema, apiSuccess, apiError, isRequestBodyError, queryParam } from './apiHelpers.js';
import { PolicyFirewall } from '../enforce/policyFirewall.js';
import type { PolicyDecision, PolicyRule } from '../enforce/policyFirewall.js';
import {
  isEnforceResourceIntegrityError,
  projectEnforceResourcePublicValue,
} from '../enforce/resourceManifest.js';

const DEFAULT_POLICY_RULES: PolicyRule[] = [
  {
    id: 'api-deny-destructive-shell',
    pattern: '\\b(rm\\s+-rf|del\\s+/f|format\\b|shutdown\\b|drop\\s+table)\\b',
    action: 'deny',
    riskTier: 'critical',
  },
  {
    id: 'api-deny-data-exfiltration',
    pattern: '\\b(exfiltrate|dump\\s+database|export\\s+all\\s+data|credential\\s+harvest)\\b',
    action: 'deny',
    riskTier: 'critical',
  },
  {
    id: 'api-stepup-privileged-ops',
    pattern: '\\b(deploy|production|billing|payment|transfer|wire)\\b',
    action: 'stepup',
    riskTier: 'high',
  },
  {
    id: 'api-sanitize-secrets',
    pattern: '\\b(password|secret|token|api[_-]?key|credential)\\b',
    action: 'sanitize',
    riskTier: 'medium',
  },
  {
    id: 'api-quarantine-suspicious-fetch',
    pattern: '\\b(curl\\s+http://|wget\\s+http://|powershell\\s+-enc|bash\\s+-c)\\b',
    action: 'quarantine',
    riskTier: 'high',
  },
];

const policyEngine = new PolicyFirewall();
for (const rule of DEFAULT_POLICY_RULES) {
  policyEngine.addRule(rule);
}

const enforceEvaluateBodySchema = z.object({
  action: z.string().trim().min(1),
  tool: z.string().trim().min(1).optional(),
  agentId: z.string().trim().min(1).optional(),
  context: z.record(z.string(), z.unknown()).optional()
}).strict();

type EnforceEvaluateBody = z.infer<typeof enforceEvaluateBodySchema>;

const resourceRestoreBodySchema = z.object({
  agentId: z.string().trim().min(1).optional(),
  manifestPath: z.string().trim().min(1).optional(),
  resource: z.string().trim().min(1).optional(),
  apply: z.boolean().optional(),
  includeImmutable: z.boolean().optional(),
  confirmManifestId: z.string().regex(/^enforce-resources-[a-f0-9]{16}$/).optional(),
}).strict();

const resourceApplyBodySchema = z.object({
  agentId: z.string().trim().min(1).optional(),
  manifestPath: z.string().trim().min(1).optional(),
  dryRun: z.boolean().optional(),
  force: z.boolean().optional(),
  confirmManifestId: z.string().regex(/^enforce-resources-[a-f0-9]{16}$/).optional(),
}).strict();

function resourceApiError(
  res: ServerResponse,
  error: unknown,
  fallbackStatus: number,
  fallbackMessage: string,
): void {
  if (isEnforceResourceIntegrityError(error)) {
    apiError(res, 409, error.code);
    return;
  }
  apiError(res, fallbackStatus, fallbackMessage);
}

export async function handleEnforceRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd(),
): Promise<boolean> {
  const resourceSuccess = (data: unknown, status = 200): void => {
    apiSuccess(res, projectEnforceResourcePublicValue(data, workspace), status);
  };

  if (pathname === '/api/v1/enforce/status' && method === 'GET') {
    apiSuccess(res, { status: 'operational', module: 'enforce', capabilities: ['policy-evaluate', 'resource-manifest', 'resource-lifecycle-protocol'] });
    return true;
  }

  if (pathname === '/api/v1/enforce/evaluate' && method === 'POST') {
    try {
      const body: EnforceEvaluateBody = await bodyJsonSchema(req, enforceEvaluateBodySchema);
      const action = body.action;

      const toolName = body.tool ?? action;
      const context = body.context ?? {};
      const evaluation = policyEngine.evaluate(
        toolName,
        { ...context, action },
        { ...context, agentId: body.agentId ?? 'unknown' },
      );

      const decision: PolicyDecision = evaluation.decision;
      apiSuccess(res, {
        action,
        tool: toolName,
        agentId: body.agentId ?? 'unknown',
        decision,
        reasons: evaluation.reasons,
        matchedRules: evaluation.matchedRules,
        stepUpRequired: evaluation.stepUpRequired,
        evaluatedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  // GET /api/v1/enforce/resources/status — one signed active/previous/rollback projection
  if (pathname === '/api/v1/enforce/resources/status' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const { projectEnforceResourceLifecycleStatus } = await import('../enforce/resourceManifest.js');
      resourceSuccess(projectEnforceResourceLifecycleStatus({ workspace, agentId }));
    } catch (err) {
      resourceApiError(res, err, 500, 'Could not project Enforce resource status');
    }
    return true;
  }

  // POST /api/v1/enforce/resources/snapshot — write the latest Enforce resource manifest and rollback bundle
  if (pathname === '/api/v1/enforce/resources/snapshot' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, z.object({
        agentId: z.string().trim().min(1).optional(),
      }).strict());
      const { writeEnforceResourceManifest } = await import('../enforce/resourceManifest.js');
      const result = writeEnforceResourceManifest({ workspace, agentId: body.agentId });
      resourceSuccess(result, 201);
    } catch (err) {
      if (isRequestBodyError(err)) { apiError(res, err.statusCode, err.message); return true; }
      resourceApiError(res, err, 500, 'Could not write Enforce resource manifest');
    }
    return true;
  }

  // GET /api/v1/enforce/resources — list resources in the latest Enforce manifest
  if (pathname === '/api/v1/enforce/resources' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const manifestPath = queryParam(req.url ?? '', 'manifestPath');
      const { latestEnforceResourceManifestPath, listEnforceResources } = await import('../enforce/resourceManifest.js');
      const path = manifestPath ?? latestEnforceResourceManifestPath(workspace, agentId);
      const resources = listEnforceResources({ workspace, agentId, manifestPath: path });
      resourceSuccess({ agentId, manifestPath: path, resources, total: resources.length });
    } catch (err) {
      resourceApiError(res, err, 404, 'Enforce resource manifest not found');
    }
    return true;
  }

  // GET /api/v1/enforce/resources/manifest — inspect the latest manifest
  if (pathname === '/api/v1/enforce/resources/manifest' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const manifestPath = queryParam(req.url ?? '', 'manifestPath');
      const { loadEnforceResourceManifest, verifyEnforceResourceManifest } = await import('../enforce/resourceManifest.js');
      const verification = verifyEnforceResourceManifest({ workspace, agentId, manifestPath });
      if (!verification.integrity.valid) {
        apiError(res, 409, verification.integrity.reasonCodes[0] ?? 'MANIFEST_SIGNATURE_INVALID');
        return true;
      }
      const manifest = loadEnforceResourceManifest(verification.manifestPath);
      resourceSuccess({ manifestPath: verification.manifestPath, manifest });
    } catch (err) {
      resourceApiError(res, err, 404, 'Enforce resource manifest not found');
    }
    return true;
  }

  // GET /api/v1/enforce/resources/inspect?resource=... — inspect one resource by id or path
  if (pathname === '/api/v1/enforce/resources/inspect' && method === 'GET') {
    try {
      const resource = queryParam(req.url ?? '', 'resource');
      if (!resource) { apiError(res, 400, 'resource query parameter required'); return true; }
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const manifestPath = queryParam(req.url ?? '', 'manifestPath');
      const { inspectEnforceResource } = await import('../enforce/resourceManifest.js');
      const entry = inspectEnforceResource({ workspace, agentId, manifestPath, selector: resource });
      resourceSuccess(entry);
    } catch (err) {
      resourceApiError(res, err, 404, 'Enforce resource not found');
    }
    return true;
  }

  // GET /api/v1/enforce/resources/verify — compare the latest manifest against current workspace state
  if (pathname === '/api/v1/enforce/resources/verify' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const manifestPath = queryParam(req.url ?? '', 'manifestPath');
      const { verifyEnforceResourceManifest } = await import('../enforce/resourceManifest.js');
      const result = verifyEnforceResourceManifest({ workspace, agentId, manifestPath });
      resourceSuccess(result, result.valid ? 200 : 409);
    } catch (err) {
      resourceApiError(res, err, 404, 'Enforce resource manifest not found');
    }
    return true;
  }

  // GET /api/v1/enforce/resources/diff — return added/removed/changed resources
  if (pathname === '/api/v1/enforce/resources/diff' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const manifestPath = queryParam(req.url ?? '', 'manifestPath');
      const { verifyEnforceResourceManifest } = await import('../enforce/resourceManifest.js');
      const result = verifyEnforceResourceManifest({ workspace, agentId, manifestPath });
      resourceSuccess(result.diff);
    } catch (err) {
      resourceApiError(res, err, 404, 'Enforce resource manifest not found');
    }
    return true;
  }

  // POST /api/v1/enforce/resources/restore — dry-run or apply rollback from the latest snapshot bundle
  if (pathname === '/api/v1/enforce/resources/restore' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, resourceRestoreBodySchema);
      const { restoreEnforceResourceSnapshot } = await import('../enforce/resourceManifest.js');
      const restoreInput = {
        workspace,
        agentId: body.agentId,
        manifestPath: body.manifestPath,
        resource: body.resource,
        includeImmutable: body.includeImmutable,
        confirmManifestId: body.confirmManifestId,
      };
      const preview = restoreEnforceResourceSnapshot({ ...restoreInput, apply: false });
      if (body.apply === true && body.confirmManifestId !== preview.targetManifestId) {
        apiError(res, 400, 'ROLLBACK_CONFIRMATION_REQUIRED');
        return true;
      }
      const result = body.apply === true
        ? restoreEnforceResourceSnapshot({ ...restoreInput, apply: true })
        : preview;
      resourceSuccess(result);
    } catch (err) {
      if (isRequestBodyError(err)) { apiError(res, err.statusCode, err.message); return true; }
      resourceApiError(res, err, 409, 'Could not restore Enforce resources');
    }
    return true;
  }

  // GET /api/v1/enforce/resources/get?resource=... — protocol alias for inspect
  if (pathname === '/api/v1/enforce/resources/get' && method === 'GET') {
    try {
      const resource = queryParam(req.url ?? '', 'resource');
      if (!resource) { apiError(res, 400, 'resource query parameter required'); return true; }
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const manifestPath = queryParam(req.url ?? '', 'manifestPath');
      const { inspectEnforceResource } = await import('../enforce/resourceManifest.js');
      const entry = inspectEnforceResource({ workspace, agentId, manifestPath, selector: resource });
      resourceSuccess(entry);
    } catch (err) {
      resourceApiError(res, err, 404, 'Enforce resource not found');
    }
    return true;
  }

  // GET /api/v1/enforce/resources/contract — neutral lifecycle contract for governed resources
  if (pathname === '/api/v1/enforce/resources/contract' && method === 'GET') {
    try {
      const { enforceResourceLifecycleContract } = await import('../enforce/resourceManifest.js');
      resourceSuccess(enforceResourceLifecycleContract());
    } catch (err) {
      resourceApiError(res, err, 500, 'Could not load resource lifecycle contract');
    }
    return true;
  }

  // GET /api/v1/enforce/resources/history — manifests, snapshots, and signed resource receipts
  if (pathname === '/api/v1/enforce/resources/history' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const { listEnforceResourceHistory } = await import('../enforce/resourceManifest.js');
      const entries = listEnforceResourceHistory({ workspace, agentId });
      resourceSuccess({ agentId, entries, total: entries.length });
    } catch (err) {
      resourceApiError(res, err, 500, 'Could not load Enforce resource history');
    }
    return true;
  }

  // GET /api/v1/enforce/resources/validate — validate resource lifecycle gates
  if (pathname === '/api/v1/enforce/resources/validate' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const manifestPath = queryParam(req.url ?? '', 'manifestPath');
      const { validateEnforceResourceLifecycle } = await import('../enforce/resourceManifest.js');
      const result = validateEnforceResourceLifecycle({ workspace, agentId, manifestPath });
      resourceSuccess(result, result.status === 'blocked' ? 409 : 200);
    } catch (err) {
      resourceApiError(res, err, 404, 'Enforce resource manifest not found');
    }
    return true;
  }

  // GET /api/v1/enforce/resources/propose — dry-run resource lifecycle proposal
  if (pathname === '/api/v1/enforce/resources/propose' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const manifestPath = queryParam(req.url ?? '', 'manifestPath');
      const { proposeEnforceResourceLifecycle } = await import('../enforce/resourceManifest.js');
      const result = proposeEnforceResourceLifecycle({ workspace, agentId, manifestPath });
      resourceSuccess(result);
    } catch (err) {
      resourceApiError(res, err, 404, 'Enforce resource manifest not found');
    }
    return true;
  }

  // GET /api/v1/enforce/resources/evaluate — policy decision for a resource proposal
  if (pathname === '/api/v1/enforce/resources/evaluate' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const manifestPath = queryParam(req.url ?? '', 'manifestPath');
      const { evaluateEnforceResourceLifecycle } = await import('../enforce/resourceManifest.js');
      const result = evaluateEnforceResourceLifecycle({ workspace, agentId, manifestPath });
      resourceSuccess(result, result.decision === 'block' ? 409 : 200);
    } catch (err) {
      resourceApiError(res, err, 404, 'Enforce resource manifest not found');
    }
    return true;
  }

  // POST /api/v1/enforce/resources/apply — accept current resources as the new signed manifest; dry-run by default
  if (pathname === '/api/v1/enforce/resources/apply' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, resourceApplyBodySchema);
      const { applyEnforceResourceLifecycle } = await import('../enforce/resourceManifest.js');
      const applyInput = {
        workspace,
        agentId: body.agentId,
        manifestPath: body.manifestPath,
        force: body.force,
        confirmManifestId: body.confirmManifestId,
      };
      const preview = applyEnforceResourceLifecycle({ ...applyInput, dryRun: true });
      if (body.dryRun === false && body.confirmManifestId !== preview.proposal.currentManifestId) {
        apiError(res, 400, 'ACTIVATION_CONFIRMATION_REQUIRED');
        return true;
      }
      const result = body.dryRun === false
        ? applyEnforceResourceLifecycle({ ...applyInput, dryRun: false })
        : preview;
      resourceSuccess(result, result.applied ? 201 : 200);
    } catch (err) {
      if (isRequestBodyError(err)) { apiError(res, err.statusCode, err.message); return true; }
      resourceApiError(res, err, 409, 'Could not apply Enforce resource proposal');
    }
    return true;
  }

  // POST /api/v1/enforce/resources/rollback — protocol alias for restore
  if (pathname === '/api/v1/enforce/resources/rollback' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, resourceRestoreBodySchema);
      const {
        resolveEnforceResourceRollbackTarget,
        restoreEnforceResourceSnapshot,
      } = await import('../enforce/resourceManifest.js');
      const rollbackTarget = body.manifestPath
        ? null
        : resolveEnforceResourceRollbackTarget({ workspace, agentId: body.agentId });
      const restoreInput = {
        workspace,
        agentId: body.agentId,
        manifestPath: body.manifestPath ?? rollbackTarget?.ref,
        resource: body.resource,
        includeImmutable: body.includeImmutable,
        confirmManifestId: body.confirmManifestId,
      };
      const preview = restoreEnforceResourceSnapshot({ ...restoreInput, apply: false });
      if (body.apply === true && body.confirmManifestId !== preview.targetManifestId) {
        apiError(res, 400, 'ROLLBACK_CONFIRMATION_REQUIRED');
        return true;
      }
      const result = body.apply === true
        ? restoreEnforceResourceSnapshot({ ...restoreInput, apply: true })
        : preview;
      resourceSuccess(result);
    } catch (err) {
      if (isRequestBodyError(err)) { apiError(res, err.statusCode, err.message); return true; }
      resourceApiError(res, err, 409, 'Could not rollback Enforce resources');
    }
    return true;
  }

  // POST /api/v1/enforce/formal/verify — verify a property formally
  if (pathname === '/api/v1/enforce/formal/verify' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, z.object({
        property: z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          formula: z.string(),
          kind: z.string(),
          severity: z.string(),
        }).passthrough().optional(),
        agentState: z.record(z.string(), z.unknown()).optional(),
      }));
      const { boundedModelCheck, CORE_SAFETY_PROPERTIES } = await import('../enforce/formalVerification.js');
      const property = (body.property as unknown as Parameters<typeof boundedModelCheck>[0]) ?? CORE_SAFETY_PROPERTIES[0]!;
      const state = body.agentState as unknown as Parameters<typeof boundedModelCheck>[1] | undefined;
      const cert = boundedModelCheck(property, state as Parameters<typeof boundedModelCheck>[1]);
      apiSuccess(res, cert);
    } catch (err) {
      if (isRequestBodyError(err)) { apiError(res, err.statusCode, err.message); return true; }
      apiError(res, 500, err instanceof Error ? err.message : 'Formal verification failed');
    }
    return true;
  }

  // POST /api/v1/enforce/formal/tla-spec — generate TLA+ spec
  if (pathname === '/api/v1/enforce/formal/tla-spec' && method === 'POST') {
    try {
      const { generateTLASpec } = await import('../enforce/formalVerification.js');
      const spec = generateTLASpec();
      apiSuccess(res, { spec });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'TLA+ spec generation failed');
    }
    return true;
  }

  // POST /api/v1/enforce/formal/certificate — verify a proof certificate
  if (pathname === '/api/v1/enforce/formal/certificate' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, z.object({
        certificate: z.record(z.string(), z.unknown()),
      }));
      const { verifyCertificate } = await import('../enforce/formalVerification.js');
      const result = verifyCertificate(body.certificate as unknown as Parameters<typeof verifyCertificate>[0]);
      apiSuccess(res, result);
    } catch (err) {
      if (isRequestBodyError(err)) { apiError(res, err.statusCode, err.message); return true; }
      apiError(res, 500, err instanceof Error ? err.message : 'Certificate verification failed');
    }
    return true;
  }

  return false;
}
