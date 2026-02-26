/**
 * canaryRouter.ts — Canary deployment API routes.
 * Covers: canary-start/stop/status/report, micro-canary-*,
 * policy-canary-start/report
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, queryParam } from './apiHelpers.js';

export async function handleCanaryRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  _workspace = process.cwd(),
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/canary')) return false;

  // ── Policy Canary (A/B enforcement) ─────────────────────────────

  // POST /api/v1/canary/start — start a policy canary
  if (pathname === '/api/v1/canary/start' && method === 'POST') {
    try {
      const body = await bodyJson<{
        candidateSha: string;
        stableSha: string;
        enforcePct?: number;
        duration?: number;
        failureThreshold?: number;
        autoPromote?: boolean;
      }>(req);
      if (!body.candidateSha || !body.stableSha) {
        apiError(res, 400, 'candidateSha and stableSha required');
        return true;
      }
      const { startCanary } = await import('../governor/policyCanary.js');
      const enforcePct = body.enforcePct ?? 10;
      const config = startCanary({
        enforcePercentage: enforcePct,
        logOnlyPercentage: 100 - enforcePct,
        enabled: true,
        candidatePolicySha256: body.candidateSha,
        stablePolicySha256: body.stableSha,
        startedTs: Date.now(),
        durationMs: body.duration ?? 3600000,
        autoPromote: body.autoPromote ?? false,
        failureThresholdRatio: body.failureThreshold ?? 0.1,
      });
      apiSuccess(res, config, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Canary start failed');
    }
    return true;
  }

  // GET /api/v1/canary/status — current canary status and stats
  if (pathname === '/api/v1/canary/status' && method === 'GET') {
    try {
      const { getCanaryConfig, computeCanaryStats } = await import('../governor/policyCanary.js');
      const config = getCanaryConfig();
      if (!config) {
        apiSuccess(res, { active: false });
        return true;
      }
      const stats = computeCanaryStats();
      apiSuccess(res, { active: true, config, stats: stats ?? null });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Canary status failed');
    }
    return true;
  }

  // POST /api/v1/canary/stop — stop the active canary
  if (pathname === '/api/v1/canary/stop' && method === 'POST') {
    try {
      const { stopCanary } = await import('../governor/policyCanary.js');
      stopCanary();
      apiSuccess(res, { stopped: true });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Canary stop failed');
    }
    return true;
  }

  // GET /api/v1/canary/report — full policy canary report
  if (pathname === '/api/v1/canary/report' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const format = queryParam(req.url ?? '', 'format') ?? 'json';
      const { generatePolicyCanaryReport, renderPolicyCanaryMarkdown } = await import('../governor/policyCanary.js');
      const report = generatePolicyCanaryReport(agentId);
      if (format === 'md') {
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(renderPolicyCanaryMarkdown(report));
        return true;
      }
      apiSuccess(res, report);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Canary report failed');
    }
    return true;
  }

  // ── Micro-Canary ────────────────────────────────────────────────

  // POST /api/v1/canary/micro/run — run all micro-canary probes
  if (pathname === '/api/v1/canary/micro/run' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string }>(req);
      const mc = await import('../assurance/microCanary.js');
      mc.registerBuiltInProbes();
      const agentId = body.agentId ?? 'default';
      const ctx: import('../assurance/microCanary.js').MicroCanaryContext = {
        ts: Date.now(),
        agentId,
        recentEventHashes: [],
        auditCounts: {},
        configSignatures: {},
        metadata: {},
      };
      const results = mc.runAllProbes(ctx);
      const passed = results.filter((r) => r.result.status === 'PASS').length;
      apiSuccess(res, { results, passed, total: results.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Micro-canary run failed');
    }
    return true;
  }

  // GET /api/v1/canary/micro/report — micro-canary status report
  if (pathname === '/api/v1/canary/micro/report' && method === 'GET') {
    try {
      const window = queryParam(req.url ?? '', 'window') ?? '1';
      const sinceTs = Date.now() - parseInt(window, 10) * 3600000;
      const format = queryParam(req.url ?? '', 'format') ?? 'json';
      const mc = await import('../assurance/microCanary.js');
      const report = mc.generateMicroCanaryReport(sinceTs);
      if (format === 'md') {
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(mc.renderMicroCanaryMarkdown(report));
        return true;
      }
      apiSuccess(res, report);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Micro-canary report failed');
    }
    return true;
  }

  // GET /api/v1/canary/micro/alerts — active micro-canary alerts
  if (pathname === '/api/v1/canary/micro/alerts' && method === 'GET') {
    try {
      const mc = await import('../assurance/microCanary.js');
      const alerts = mc.getActiveAlerts();
      apiSuccess(res, { alerts, total: alerts.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Micro-canary alerts failed');
    }
    return true;
  }

  // POST /api/v1/canary/micro/alerts/ack — acknowledge all micro-canary alerts
  if (pathname === '/api/v1/canary/micro/alerts/ack' && method === 'POST') {
    try {
      const mc = await import('../assurance/microCanary.js');
      const count = mc.acknowledgeAllAlerts();
      apiSuccess(res, { acknowledged: count });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Micro-canary alert ack failed');
    }
    return true;
  }

  // ── Policy Canary Mode (observation-only) ───────────────────────

  // POST /api/v1/canary/policy-mode/start — start policy canary mode
  if (pathname === '/api/v1/canary/policy-mode/start' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string; packId: string; duration?: string }>(req);
      if (!body.packId) { apiError(res, 400, 'packId required'); return true; }
      const { startCanaryMode } = await import('../governor/policyCanaryMode.js');
      const agentId = body.agentId ?? 'default';
      // Parse duration string like "7d" to ms; default 7 days
      let durationMs = 7 * 86400000;
      if (body.duration) {
        const match = body.duration.match(/^(\d+)([dhms])$/);
        if (match) {
          const val = parseInt(match[1]!, 10);
          const unit = match[2];
          if (unit === 'd') durationMs = val * 86400000;
          else if (unit === 'h') durationMs = val * 3600000;
          else if (unit === 'm') durationMs = val * 60000;
          else if (unit === 's') durationMs = val * 1000;
        }
      }
      const config = startCanaryMode(agentId, body.packId, durationMs);
      apiSuccess(res, config, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Policy canary mode start failed');
    }
    return true;
  }

  // GET /api/v1/canary/policy-mode/report — policy canary mode report
  if (pathname === '/api/v1/canary/policy-mode/report' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const format = queryParam(req.url ?? '', 'format') ?? 'json';
      const { generateCanaryReportForAgent, renderCanaryModeReportMarkdown } = await import('../governor/policyCanaryMode.js');
      const report = generateCanaryReportForAgent(agentId);
      if (!report) {
        apiSuccess(res, { active: false, agentId });
        return true;
      }
      if (format === 'md') {
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(renderCanaryModeReportMarkdown(report));
        return true;
      }
      apiSuccess(res, report);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Policy canary mode report failed');
    }
    return true;
  }

  return false;
}
