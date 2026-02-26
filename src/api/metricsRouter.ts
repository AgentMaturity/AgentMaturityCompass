/**
 * metricsRouter.ts — Metrics, SLO, and failure-risk indices API routes.
 * Full parity with: amc metrics *, amc ops slo, amc indices *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, queryParam } from './apiHelpers.js';

export async function handleMetricsRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (
    !pathname.startsWith('/api/v1/metrics') &&
    !pathname.startsWith('/api/v1/slo') &&
    !pathname.startsWith('/api/v1/indices')
  ) return false;

  // ── Metrics ─────────────────────────────────────────────────────

  // GET /api/v1/metrics/status — configured metrics endpoint bind/port
  if (pathname === '/api/v1/metrics/status' && method === 'GET') {
    try {
      const { loadStudioRuntimeConfig } = await import('../config/loadConfig.js');
      const runtime = loadStudioRuntimeConfig(process.env);
      apiSuccess(res, { host: runtime.metricsBind, port: runtime.metricsPort });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Metrics status failed');
    }
    return true;
  }

  // ── SLO ─────────────────────────────────────────────────────────

  // GET /api/v1/slo/status — governance SLO dashboard
  if (pathname === '/api/v1/slo/status' && method === 'GET') {
    try {
      const windowHours = parseFloat(queryParam(req.url ?? '', 'window') ?? '1');
      const windowMs = windowHours * 3600000;
      const format = (queryParam(req.url ?? '', 'format') ?? 'json') as 'json' | 'md';
      const slo = await import('../ops/governanceSlo.js');
      if (format === 'md') {
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(slo.renderSloStatus(windowMs));
        return true;
      }
      apiSuccess(res, {
        targets: slo.getSloTargets(),
        definitions: slo.getSloDefinitions(),
        windowMs,
      });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'SLO status failed');
    }
    return true;
  }

  // GET /api/v1/slo/targets — list configured SLO targets
  if (pathname === '/api/v1/slo/targets' && method === 'GET') {
    try {
      const slo = await import('../ops/governanceSlo.js');
      apiSuccess(res, { targets: slo.getSloTargets() });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'SLO targets failed');
    }
    return true;
  }

  // PUT /api/v1/slo/targets — update SLO targets
  if (pathname === '/api/v1/slo/targets' && method === 'PUT') {
    try {
      const body = await bodyJson<{ targets: import('../ops/governanceSlo.js').SloTarget[] }>(req);
      if (!body.targets || !Array.isArray(body.targets)) {
        apiError(res, 400, 'targets array required'); return true;
      }
      const slo = await import('../ops/governanceSlo.js');
      slo.configureSloTargets(body.targets);
      apiSuccess(res, { updated: true, targets: slo.getSloTargets() });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'SLO targets update failed');
    }
    return true;
  }

  // ── Indices ─────────────────────────────────────────────────────

  // GET /api/v1/indices/agent — failure-risk indices for a single agent run
  if (pathname === '/api/v1/indices/agent' && method === 'GET') {
    try {
      const runId = queryParam(req.url ?? '', 'runId');
      const agentId = queryParam(req.url ?? '', 'agentId');
      if (!runId) { apiError(res, 400, 'runId query parameter required'); return true; }
      const { runIndicesForAgent } = await import('../assurance/indices.js');
      const report = runIndicesForAgent({ workspace, runId, agentId });
      apiSuccess(res, report);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Indices computation failed');
    }
    return true;
  }

  // GET /api/v1/indices/fleet — failure-risk indices across fleet
  if (pathname === '/api/v1/indices/fleet' && method === 'GET') {
    try {
      const window = queryParam(req.url ?? '', 'window') ?? '30d';
      const { parseWindowToMs } = await import('../utils/time.js');
      const { runFleetIndices } = await import('../assurance/indices.js');
      const now = Date.now();
      const rows = runFleetIndices({
        workspace,
        windowStartTs: now - parseWindowToMs(window),
        windowEndTs: now,
      });
      apiSuccess(res, { window, agents: rows, total: rows.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Fleet indices failed');
    }
    return true;
  }

  return false;
}
