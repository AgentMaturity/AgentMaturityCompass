/**
 * fleetRouter.ts — Fleet/agent management API routes.
 * Full parity with: amc fleet *, amc agent *, amc freeze *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, pathParam, queryParam } from './apiHelpers.js';
import { buildFleetHealthDashboard } from '../fleet/governance.js';

export async function handleFleetRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/fleet')) return false;

  // GET /api/v1/fleet/health
  if (pathname === '/api/v1/fleet/health' && method === 'GET') {
    const health = buildFleetHealthDashboard({ workspace });
    apiSuccess(res, health);
    return true;
  }

  // GET /api/v1/fleet/agents — list all agents
  if (pathname === '/api/v1/fleet/agents' && method === 'GET') {
    try {
      const { listAgents } = await import('../fleet/registry.js');
      const agents = listAgents(workspace);
      apiSuccess(res, { agents, total: agents.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list agents');
    }
    return true;
  }

  // POST /api/v1/fleet/agents — add agent (simplified: uses buildAgentConfig with defaults)
  if (pathname === '/api/v1/fleet/agents' && method === 'POST') {
    try {
      const body = await bodyJson<{
        agentId: string; agentName?: string; role?: string; domain?: string;
        templateId?: string; baseUrl?: string; routePrefix?: string;
        riskTier?: string;
      }>(req);
      if (!body.agentId) { apiError(res, 400, 'agentId required'); return true; }
      const { buildAgentConfig, scaffoldAgent } = await import('../fleet/registry.js');
      const config = buildAgentConfig({
        agentId: body.agentId,
        agentName: body.agentName ?? body.agentId,
        role: body.role ?? 'assistant',
        domain: body.domain ?? 'general',
        primaryTasks: [],
        stakeholders: [],
        riskTier: (body.riskTier ?? 'low') as 'low' | 'med' | 'high' | 'critical',
        templateId: body.templateId ?? 'generic',
        baseUrl: body.baseUrl ?? '',
        routePrefix: body.routePrefix ?? '/openai',
        auth: { type: 'none' },
      });
      const result = scaffoldAgent(workspace, config);
      apiSuccess(res, { created: true, ...result }, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not add agent');
    }
    return true;
  }

  // GET /api/v1/fleet/agents/:agentId — get agent config
  const agentGetParams = pathParam(pathname, '/api/v1/fleet/agents/:agentId');
  if (agentGetParams && method === 'GET') {
    try {
      const { loadAgentConfig } = await import('../fleet/registry.js');
      const config = loadAgentConfig(workspace, agentGetParams.agentId);
      apiSuccess(res, config);
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : 'Agent not found');
    }
    return true;
  }

  // DELETE /api/v1/fleet/agents/:agentId — remove agent
  const agentDelParams = pathParam(pathname, '/api/v1/fleet/agents/:agentId');
  if (agentDelParams && method === 'DELETE') {
    try {
      const { removeAgent } = await import('../fleet/registry.js');
      removeAgent(workspace, agentDelParams.agentId!);
      apiSuccess(res, { removed: true, agentId: agentDelParams.agentId });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not remove agent');
    }
    return true;
  }

  // GET /api/v1/fleet/report — fleet maturity report
  if (pathname === '/api/v1/fleet/report' && method === 'GET') {
    try {
      const format = (queryParam(req.url ?? '', 'format') ?? 'json') as 'json' | 'md';
      const window = queryParam(req.url ?? '', 'window') ?? '30d';
      const { generateFleetReport } = await import('../fleet/report.js');
      const report = await generateFleetReport({ workspace, window });
      if (format === 'md') {
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(typeof report === 'string' ? report : JSON.stringify(report, null, 2));
        return true;
      }
      apiSuccess(res, report);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Fleet report failed');
    }
    return true;
  }

  // POST /api/v1/fleet/init — initialize fleet
  if (pathname === '/api/v1/fleet/init' && method === 'POST') {
    try {
      const body = await bodyJson<{ org?: string }>(req);
      const { initFleet, defaultFleetConfig } = await import('../fleet/registry.js');
      const cfg = defaultFleetConfig(body.org ?? 'AMC Fleet');
      const result = initFleet(workspace, cfg);
      apiSuccess(res, { initialized: true, ...result });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Fleet init failed');
    }
    return true;
  }

  // GET /api/v1/fleet/freeze/status — execution freeze status
  if (pathname === '/api/v1/fleet/freeze/status' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const { activeFreezeStatus } = await import('../drift/freezeEngine.js');
      const status = activeFreezeStatus(workspace, agentId);
      apiSuccess(res, { agentId, ...status });
    } catch (err) {
      apiSuccess(res, { ok: true, active: false, agentId: queryParam(req.url ?? '', 'agentId') ?? 'default' });
    }
    return true;
  }

  // POST /api/v1/fleet/freeze/lift — lift execution freeze
  if (pathname === '/api/v1/fleet/freeze/lift' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId: string; incidentId: string; reason: string }>(req);
      if (!body.agentId || !body.incidentId || !body.reason) {
        apiError(res, 400, 'Required: agentId, incidentId, reason'); return true;
      }
      const { liftFreeze } = await import('../drift/freezeEngine.js');
      liftFreeze({ workspace, agentId: body.agentId, incidentId: body.incidentId, reason: body.reason });
      apiSuccess(res, { lifted: true, agentId: body.agentId });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Freeze lift failed');
    }
    return true;
  }

  // GET /api/v1/fleet/config — fleet config
  if (pathname === '/api/v1/fleet/config' && method === 'GET') {
    try {
      const { loadFleetConfig } = await import('../fleet/registry.js');
      const config = loadFleetConfig(workspace);
      apiSuccess(res, config);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not load fleet config');
    }
    return true;
  }

  return false;
}
