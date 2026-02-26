/**
 * driftRouter.ts — Drift/regression detection, freeze, and alerts API routes.
 * Full parity with: amc drift *, amc freeze *, amc alerts *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, queryParam } from './apiHelpers.js';

export async function handleDriftRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd()
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/drift')) return false;

  // POST /api/v1/drift/check — run drift detection
  if (pathname === '/api/v1/drift/check' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string; against?: 'previous' }>(req);
      const { driftCheckCli } = await import('../drift/driftCli.js');
      const result = await driftCheckCli({
        workspace,
        agentId: body.agentId,
        against: body.against ?? 'previous'
      });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Drift check failed');
    }
    return true;
  }

  // GET /api/v1/drift/report — drift/regression markdown report
  if (pathname === '/api/v1/drift/report' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId');
      const format = (queryParam(req.url ?? '', 'format') ?? 'json') as 'json' | 'md';
      const { driftReportCli } = await import('../drift/driftCli.js');
      const report = await driftReportCli({ workspace, agentId });
      if (format === 'md') {
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(report.markdown);
        return true;
      }
      apiSuccess(res, { markdown: report.markdown });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Drift report failed');
    }
    return true;
  }

  // GET /api/v1/drift/summary — last drift check summary
  if (pathname === '/api/v1/drift/summary' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId');
      const { lastDriftCheckSummary } = await import('../drift/driftDetector.js');
      const summary = lastDriftCheckSummary(workspace, agentId);
      apiSuccess(res, summary);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Drift summary failed');
    }
    return true;
  }

  // GET /api/v1/drift/freeze/status — execution freeze status
  if (pathname === '/api/v1/drift/freeze/status' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId');
      const { freezeStatusCli } = await import('../drift/driftCli.js');
      const status = freezeStatusCli({ workspace, agentId });
      apiSuccess(res, status);
    } catch (err) {
      apiSuccess(res, { active: false, incidentIds: [], actionClasses: [] });
    }
    return true;
  }

  // POST /api/v1/drift/freeze/lift — lift execution freeze
  if (pathname === '/api/v1/drift/freeze/lift' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId: string; incidentId: string; reason: string }>(req);
      if (!body.agentId || !body.incidentId || !body.reason) {
        apiError(res, 400, 'Required: agentId, incidentId, reason');
        return true;
      }
      const { freezeLiftCli } = await import('../drift/driftCli.js');
      const result = freezeLiftCli({
        workspace,
        agentId: body.agentId,
        incidentId: body.incidentId,
        reason: body.reason
      });
      apiSuccess(res, { lifted: true, ...result });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Freeze lift failed');
    }
    return true;
  }

  // POST /api/v1/drift/alerts/init — initialize alerts config
  if (pathname === '/api/v1/drift/alerts/init' && method === 'POST') {
    try {
      const { initAlertsConfig } = await import('../drift/alerts.js');
      const result = initAlertsConfig(workspace);
      apiSuccess(res, { initialized: true, ...result });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Alerts init failed');
    }
    return true;
  }

  // GET /api/v1/drift/alerts/verify — verify alerts config signature
  if (pathname === '/api/v1/drift/alerts/verify' && method === 'GET') {
    try {
      const { verifyAlertsConfigSignature } = await import('../drift/alerts.js');
      const result = verifyAlertsConfigSignature(workspace);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Alerts verify failed');
    }
    return true;
  }

  // POST /api/v1/drift/alerts/test — send test alert
  if (pathname === '/api/v1/drift/alerts/test' && method === 'POST') {
    try {
      const { sendTestAlert } = await import('../drift/alerts.js');
      await sendTestAlert(workspace);
      apiSuccess(res, { sent: true });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Test alert failed');
    }
    return true;
  }

  return false;
}
