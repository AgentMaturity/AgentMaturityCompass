/**
 * enforceRouter.ts — Enforce API routes.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from "zod";
import { bodyJsonSchema, apiSuccess, apiError, isRequestBodyError } from './apiHelpers.js';
import { PolicyFirewall } from '../enforce/policyFirewall.js';
import type { PolicyDecision, PolicyRule } from '../enforce/policyFirewall.js';

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
  context: z.record(z.unknown()).optional()
}).strict();

type EnforceEvaluateBody = z.infer<typeof enforceEvaluateBodySchema>;

export async function handleEnforceRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (pathname === '/api/v1/enforce/status' && method === 'GET') {
    apiSuccess(res, { status: 'operational', module: 'enforce', capabilities: ['policy-evaluate'] });
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

  return false;
}
