/**
 * governorRouter.ts — Governor, oversight, autonomy, and mode API routes.
 * Full parity with: amc governor *, amc oversight *, amc mode *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, queryParam } from './apiHelpers.js';

export async function handleGovernorRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (
    !pathname.startsWith('/api/v1/governor') &&
    !pathname.startsWith('/api/v1/oversight') &&
    !pathname.startsWith('/api/v1/mode')
  ) return false;

  // ── Governor ────────────────────────────────────────────────────

  // POST /api/v1/governor/check — evaluate action permission
  if (pathname === '/api/v1/governor/check' && method === 'POST') {
    try {
      const body = await bodyJson<{
        action: string;
        risk: string;
        mode: string;
        agentId?: string;
      }>(req);
      if (!body.action || !body.risk || !body.mode) {
        apiError(res, 400, 'Required: action, risk, mode');
        return true;
      }
      const { normalizeActionClass } = await import('../tickets/execTicketCli.js');
      const { parseRiskTier } = await import('../workorders/workorderCli.js');
      const { runGovernorCheck } = await import('../governor/governorCli.js');
      const decision = runGovernorCheck({
        workspace,
        agentId: body.agentId,
        actionClass: normalizeActionClass(body.action),
        riskTier: parseRiskTier(body.risk),
        mode: body.mode.toUpperCase() === 'EXECUTE' ? 'EXECUTE' : 'SIMULATE',
      });
      apiSuccess(res, decision);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Governor check failed');
    }
    return true;
  }

  // POST /api/v1/governor/explain — explain policy for action class
  if (pathname === '/api/v1/governor/explain' && method === 'POST') {
    try {
      const body = await bodyJson<{ action: string; agentId?: string }>(req);
      if (!body.action) {
        apiError(res, 400, 'Required: action');
        return true;
      }
      const { normalizeActionClass } = await import('../tickets/execTicketCli.js');
      const { explainGovernorAction } = await import('../governor/governorCli.js');
      const explained = explainGovernorAction({
        workspace,
        agentId: body.agentId,
        actionClass: normalizeActionClass(body.action),
      });
      apiSuccess(res, explained);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Governor explain failed');
    }
    return true;
  }

  // GET /api/v1/governor/report — governor matrix report
  if (pathname === '/api/v1/governor/report' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? undefined;
      const format = (queryParam(req.url ?? '', 'format') ?? 'json') as 'json' | 'md';
      const { buildGovernorReport } = await import('../governor/governorCli.js');
      const report = buildGovernorReport({ workspace, agentId });
      if (format === 'md') {
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(report.markdown);
        return true;
      }
      apiSuccess(res, { markdown: report.markdown, autonomyAllowanceIndex: report.autonomyAllowanceIndex });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Governor report failed');
    }
    return true;
  }

  // POST /api/v1/governor/policy/init — initialize action policy
  if (pathname === '/api/v1/governor/policy/init' && method === 'POST') {
    try {
      const { initActionPolicy } = await import('../governor/actionPolicyEngine.js');
      const result = initActionPolicy(workspace);
      apiSuccess(res, { initialized: true, ...result });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Policy init failed');
    }
    return true;
  }

  // POST /api/v1/governor/policy/verify — verify action policy signature
  if (pathname === '/api/v1/governor/policy/verify' && method === 'POST') {
    try {
      const { verifyActionPolicySignature } = await import('../governor/actionPolicyEngine.js');
      const result = verifyActionPolicySignature(workspace);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Policy verification failed');
    }
    return true;
  }

  // ── Oversight ───────────────────────────────────────────────────

  // GET /api/v1/oversight/assess — assess human oversight quality
  if (pathname === '/api/v1/oversight/assess' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId');
      if (!agentId) {
        apiError(res, 400, 'Required query param: agentId');
        return true;
      }
      const { assessOversightQuality } = await import('../score/humanOversightQuality.js');
      const result = assessOversightQuality({ agentId: 0 });
      result.agentId = agentId;
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Oversight assessment failed');
    }
    return true;
  }

  // ── Mode ────────────────────────────────────────────────────────

  // GET /api/v1/mode — get current mode
  if (pathname === '/api/v1/mode' && method === 'GET') {
    try {
      const { getMode } = await import('../mode/mode.js');
      const current = getMode(workspace);
      apiSuccess(res, { mode: current });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not get mode');
    }
    return true;
  }

  // PUT /api/v1/mode — set mode (owner or agent)
  if (pathname === '/api/v1/mode' && method === 'PUT') {
    try {
      const body = await bodyJson<{ mode: string }>(req);
      if (!body.mode || (body.mode !== 'owner' && body.mode !== 'agent')) {
        apiError(res, 400, 'Required: mode (owner | agent)');
        return true;
      }
      const { setMode } = await import('../mode/mode.js');
      setMode(workspace, body.mode);
      apiSuccess(res, { mode: body.mode });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not set mode');
    }
    return true;
  }

  return false;
}
