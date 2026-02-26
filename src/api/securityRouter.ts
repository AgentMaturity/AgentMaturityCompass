/**
 * securityRouter.ts — Security-focused API routes.
 * Covers: ato-detect, blind-secrets, taint, threat-intel,
 * sleeper-detection, gaming-resistance, insider-risk-*
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, queryParam } from './apiHelpers.js';

export async function handleSecurityRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd(),
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/security')) return false;

  // POST /api/v1/security/ato-detect — detect account takeover attempts
  if (pathname === '/api/v1/security/ato-detect' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId: string; events?: Array<{ type: string; ts: number; metadata?: Record<string, unknown> }> }>(req);
      if (!body.agentId) { apiError(res, 400, 'agentId required'); return true; }
      const { detectAto } = await import('../enforce/atoDetection.js');
      const events = body.events ?? [{ type: 'login', ts: Date.now() }];
      const result = detectAto(events);
      apiSuccess(res, { agentId: body.agentId, ...result });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'ATO detection failed');
    }
    return true;
  }

  // POST /api/v1/security/blind-secrets — redact secrets from text
  if (pathname === '/api/v1/security/blind-secrets' && method === 'POST') {
    try {
      const body = await bodyJson<{ text: string }>(req);
      if (!body.text) { apiError(res, 400, 'text required'); return true; }
      const { blindSecrets } = await import('../enforce/secretBlind.js');
      const result = blindSecrets(body.text);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Secret blinding failed');
    }
    return true;
  }

  // POST /api/v1/security/taint — track tainted input
  if (pathname === '/api/v1/security/taint' && method === 'POST') {
    try {
      const body = await bodyJson<{ input: string; source?: string }>(req);
      if (!body.input) { apiError(res, 400, 'input required'); return true; }
      const { TaintTracker } = await import('../enforce/taintTracker.js');
      const tracker = new TaintTracker();
      tracker.markTainted(body.input, body.input, body.source ?? 'api');
      const result = tracker.check(body.input);
      apiSuccess(res, { input: body.input, tainted: !!result, details: result ?? null });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Taint tracking failed');
    }
    return true;
  }

  // POST /api/v1/security/threat-intel — check threat intelligence
  if (pathname === '/api/v1/security/threat-intel' && method === 'POST') {
    try {
      const body = await bodyJson<{ input: string }>(req);
      if (!body.input) { apiError(res, 400, 'input required'); return true; }
      const { checkThreatIntel } = await import('../shield/threatIntel.js');
      const result = checkThreatIntel(body.input);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Threat intel check failed');
    }
    return true;
  }

  // POST /api/v1/security/detect-injection — detect prompt injection
  if (pathname === '/api/v1/security/detect-injection' && method === 'POST') {
    try {
      const body = await bodyJson<{ text: string }>(req);
      if (!body.text) { apiError(res, 400, 'text required'); return true; }
      const { detectInjection } = await import('../shield/detector.js');
      const result = detectInjection(body.text);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Injection detection failed');
    }
    return true;
  }

  // GET /api/v1/security/sleeper-detection — detect behavioral inconsistencies
  if (pathname === '/api/v1/security/sleeper-detection' && method === 'GET') {
    try {
      const { scoreSleeperDetection } = await import('../score/sleeperDetection.js');
      const result = scoreSleeperDetection(workspace);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Sleeper detection failed');
    }
    return true;
  }

  // GET /api/v1/security/gaming-resistance — test adversarial evidence injection
  if (pathname === '/api/v1/security/gaming-resistance' && method === 'GET') {
    try {
      const { scoreGamingResistance } = await import('../score/gamingResistance.js');
      const result = scoreGamingResistance(workspace);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Gaming resistance check failed');
    }
    return true;
  }

  // GET /api/v1/security/insider/report — insider risk report
  if (pathname === '/api/v1/security/insider/report' && method === 'GET') {
    try {
      const window = queryParam(req.url ?? '', 'window') ?? '7';
      const windowMs = parseInt(window, 10) * 86400000;
      const ir = await import('../audit/insiderRisk.js');
      const report = ir.generateInsiderRiskReport(Date.now() - windowMs, Date.now());
      const format = queryParam(req.url ?? '', 'format') ?? 'json';
      if (format === 'md') {
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(ir.renderInsiderRiskMarkdown(report));
        return true;
      }
      apiSuccess(res, report);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Insider risk report failed');
    }
    return true;
  }

  // GET /api/v1/security/insider/alerts — insider risk alerts
  if (pathname === '/api/v1/security/insider/alerts' && method === 'GET') {
    try {
      const actorId = queryParam(req.url ?? '', 'actorId');
      const ir = await import('../audit/insiderRisk.js');
      const alerts = ir.getInsiderAlerts(actorId);
      apiSuccess(res, { alerts, total: alerts.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Insider alerts failed');
    }
    return true;
  }

  // POST /api/v1/security/insider/alerts/ack — acknowledge insider alert
  if (pathname === '/api/v1/security/insider/alerts/ack' && method === 'POST') {
    try {
      const body = await bodyJson<{ alertId: string }>(req);
      if (!body.alertId) { apiError(res, 400, 'alertId required'); return true; }
      const ir = await import('../audit/insiderRisk.js');
      const result = ir.acknowledgeInsiderAlert(body.alertId);
      apiSuccess(res, { acknowledged: result, alertId: body.alertId });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Alert acknowledgement failed');
    }
    return true;
  }

  // GET /api/v1/security/insider/scores — insider risk scores by actor
  if (pathname === '/api/v1/security/insider/scores' && method === 'GET') {
    try {
      const ir = await import('../audit/insiderRisk.js');
      const scores = ir.computeInsiderRiskScores();
      apiSuccess(res, { scores, total: scores.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Insider risk scores failed');
    }
    return true;
  }

  // POST /api/v1/security/advanced-threats — run advanced threats pack
  if (pathname === '/api/v1/security/advanced-threats' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId: string }>(req);
      if (!body.agentId) { apiError(res, 400, 'agentId required'); return true; }
      const { runAdvancedThreatsPack } = await import('../lab/packs/advancedThreatsPack.js');
      const result = await runAdvancedThreatsPack(body.agentId);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Advanced threats pack failed');
    }
    return true;
  }

  // POST /api/v1/security/compound-threats — run compound threat pack
  if (pathname === '/api/v1/security/compound-threats' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId: string }>(req);
      if (!body.agentId) { apiError(res, 400, 'agentId required'); return true; }
      const { runCompoundThreatPack } = await import('../lab/packs/compoundThreatPack.js');
      const result = await runCompoundThreatPack(body.agentId);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Compound threats pack failed');
    }
    return true;
  }

  // POST /api/v1/security/adversarial — test gaming resistance of scoring
  if (pathname === '/api/v1/security/adversarial' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId: string; answers?: Record<string, string> }>(req);
      if (!body.agentId) { apiError(res, 400, 'agentId required'); return true; }
      const { testGamingResistance } = await import('../score/adversarial.js');
      const result = testGamingResistance(body.answers ?? { q1: body.agentId });
      apiSuccess(res, { agentId: body.agentId, ...result });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Adversarial test failed');
    }
    return true;
  }

  return false;
}
