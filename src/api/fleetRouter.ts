/**
 * fleetRouter.ts — Fleet/agent management API routes.
 * Full parity with: amc fleet *, amc agent *, amc freeze *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { KeyProviderError } from '../keys/provider.js';
import { bodyJson, apiSuccess, apiError, pathParam, queryParam } from './apiHelpers.js';
import { answerFreezeLiftError } from './driftRouter.js';
import { buildFleetHealthDashboard } from '../fleet/governance.js';

export async function handleFleetRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd(),
  revalidateAuthority?: () => boolean,
  principal?: string
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

  // GET /api/v1/fleet/graph — inspect latest typed multi-agent graph
  if (pathname === '/api/v1/fleet/graph' && method === 'GET') {
    try {
      const {
        loadLatestTypedMultiAgentGraph,
        typedMultiAgentGraphRef,
      } = await import('../fleet/typedGraph.js');
      const graph = loadLatestTypedMultiAgentGraph(workspace);
      if (!graph) {
        apiSuccess(res, { graph: null, ref: null });
        return true;
      }
      apiSuccess(res, { graph, ref: typedMultiAgentGraphRef({ workspace, graph }) });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not inspect typed graph');
    }
    return true;
  }

  // POST /api/v1/fleet/graph — write latest typed multi-agent graph
  if (pathname === '/api/v1/fleet/graph' && method === 'POST') {
    try {
      const body = await bodyJson<{ graph?: unknown }>(req);
      if (!body.graph) {
        apiError(res, 400, 'Required: graph');
        return true;
      }
      const { writeTypedMultiAgentGraph } = await import('../fleet/typedGraph.js');
      const written = writeTypedMultiAgentGraph({ workspace, graph: body.graph });
      apiSuccess(res, written, 201);
    } catch (err) {
      apiError(res, 400, err instanceof Error ? err.message : 'Could not write typed graph');
    }
    return true;
  }

  // GET /api/v1/fleet/graph/validate — validate latest typed multi-agent graph
  if (pathname === '/api/v1/fleet/graph/validate' && method === 'GET') {
    try {
      const {
        loadLatestTypedMultiAgentGraph,
        typedMultiAgentGraphRef,
        validateTypedMultiAgentGraph,
      } = await import('../fleet/typedGraph.js');
      const graph = loadLatestTypedMultiAgentGraph(workspace);
      if (!graph) {
        apiSuccess(res, {
          graph: null,
          ref: null,
          validation: {
            valid: false,
            summary: 'No typed multi-agent graph has been written.',
            issueCount: 1,
            issues: [{
              code: 'invalid_schema',
              severity: 'error',
              message: 'No typed multi-agent graph has been written.',
              evidenceRefs: []
            }]
          }
        });
        return true;
      }
      apiSuccess(res, {
        graph,
        ref: typedMultiAgentGraphRef({ workspace, graph }),
        validation: validateTypedMultiAgentGraph(graph)
      });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not validate typed graph');
    }
    return true;
  }

  // GET /api/v1/fleet/lifecycle — list parent fleet lifecycle artifacts
  if (pathname === '/api/v1/fleet/lifecycle' && method === 'GET') {
    try {
      const limit = Number.parseInt(queryParam(req.url ?? '', 'limit') ?? '20', 10);
      const redacted = queryParam(req.url ?? '', 'redacted') !== 'false';
      const { listFleetLifecycleRunArtifacts } = await import('../fleet/fleetLifecycle.js');
      const runs = listFleetLifecycleRunArtifacts({
        workspace,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
        redacted
      });
      apiSuccess(res, { runs, total: runs.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list fleet lifecycle runs');
    }
    return true;
  }

  // GET /api/v1/fleet/lifecycle/:selector — inspect parent fleet lifecycle artifact
  const fleetLifecycleParams = pathParam(pathname, '/api/v1/fleet/lifecycle/:selector');
  if (fleetLifecycleParams && method === 'GET') {
    try {
      const redacted = queryParam(req.url ?? '', 'redacted') !== 'false';
      const { loadFleetLifecycleRunArtifact } = await import('../fleet/fleetLifecycle.js');
      const run = loadFleetLifecycleRunArtifact({
        workspace,
        selector: decodeURIComponent(fleetLifecycleParams.selector!),
        redacted
      });
      apiSuccess(res, run);
    } catch (err) {
      apiError(res, 404, err instanceof Error ? err.message : 'Fleet lifecycle run not found');
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

  // GET /api/v1/fleet/inventory: one row per agent, and agents AMC has seen but nobody registered. Reads only.
  // ?format=csv answers a spreadsheet file; ?include=csv adds the same file as text to the JSON (the console's download).
  if (pathname === '/api/v1/fleet/inventory' && method === 'GET') {
    try {
      const { buildFleetInventory } = await import('../fleet/inventory.js');
      const { fleetInventoryCsv } = await import('../fleet/inventoryRender.js');
      const { fleetWindowMs } = await import('../fleet/fleetActions.js');
      const window = queryParam(req.url ?? '', 'window');
      const inventory = await buildFleetInventory(workspace, window === undefined ? {} : { costWindowMs: fleetWindowMs(window) });
      const format = queryParam(req.url ?? '', 'format');
      if (format === 'csv') {
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="amc-fleet-inventory.csv"' });
        res.end(fleetInventoryCsv(inventory));
        return true;
      }
      apiSuccess(res, queryParam(req.url ?? '', 'include') === 'csv' ? { ...inventory, csv: fleetInventoryCsv(inventory) } : inventory);
    } catch (err) {
      apiError(res, err instanceof Error && /time window/.test(err.message) ? 400 : 500, err instanceof Error ? err.message : 'Could not build the fleet inventory');
    }
    return true;
  }

  // POST /api/v1/fleet/freeze: freeze an agent now (OWNER, like every /fleet write). Stops only calls routed through AMC.
  if (pathname === '/api/v1/fleet/freeze' && method === 'POST') {
    const refused = (): never => { if (!res.headersSent) apiError(res, 403, 'Current authority no longer permits this operation'); throw new Error('Current authority no longer permits this operation'); };
    try {
      if (!principal) { apiError(res, 403, 'A freeze must name the person who asks for it; sign in and try again.'); return true; }
      const body = await bodyJson<{ agentId?: unknown; reason?: unknown }>(req);
      if (typeof body.agentId !== 'string' || typeof body.reason !== 'string' || !body.agentId.trim() || !body.reason.trim()) {
        apiError(res, 400, 'Say which agent to freeze and why: agentId and reason are both needed.'); return true;
      }
      const { freezeAgentNow, FREEZE_SCOPE_NOTE } = await import('../fleet/fleetActions.js');
      const guard = () => { if (revalidateAuthority !== undefined && !revalidateAuthority()) refused(); };
      guard();
      const incident = await freezeAgentNow({ workspace, agentId: body.agentId, reason: body.reason, frozenBy: principal, via: 'studio' }, guard);
      apiSuccess(res, {
        frozen: true, agentId: incident.agentId, incidentId: incident.incidentId, actionClasses: incident.freeze.actionClasses,
        frozenBy: principal, auditEventId: incident.auditEventId, scope: FREEZE_SCOPE_NOTE,
        lift: `A person lifts it at a terminal: amc freeze lift --agent ${incident.agentId} --incident ${incident.incidentId} --reason "<why it is safe again>"`
      }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Freeze failed';
      if (!res.headersSent) apiError(res, err instanceof KeyProviderError ? err.status : /not registered|Say why|agent mode/.test(message) ? 400 : 500,
        err instanceof KeyProviderError ? err.code : message);
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
      const freeze = await import('../drift/freezeEngine.js');
      const input = { workspace, agentId: body.agentId, incidentId: body.incidentId, reason: body.reason };
      const guard = () => { if (!revalidateAuthority?.()) { if (!res.headersSent) apiError(res, 403, 'Current authority no longer permits this operation'); throw new Error('Current authority no longer permits this operation'); } };
      if (revalidateAuthority !== undefined) guard();
      if (revalidateAuthority === undefined) freeze.liftFreeze(input); else await freeze.liftFreezeForAuthority(input, guard);
      apiSuccess(res, { lifted: true, agentId: body.agentId });
    } catch (err) {
      answerFreezeLiftError(res, err, revalidateAuthority !== undefined);
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
