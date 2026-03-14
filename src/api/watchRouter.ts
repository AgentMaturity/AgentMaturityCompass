/**
 * watchRouter.ts — Watch/observability/guardrails API routes.
 * Full parity with: amc watch *, amc governor *, amc guardrails *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError, queryParam } from './apiHelpers.js';

export async function handleWatchRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd(),
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/watch')) return false;

  // GET /api/v1/watch/status
  if (pathname === '/api/v1/watch/status' && method === 'GET') {
    apiSuccess(res, { status: 'operational', module: 'watch' });
    return true;
  }

  // POST /api/v1/watch/guard — run guardrail check against proposed output
  if (pathname === '/api/v1/watch/guard' && method === 'POST') {
    try {
      const body = await bodyJson<{
        agentId?: string;
        proposedOutput: string;
        riskTier?: string;
        actionType?: string;
      }>(req);
      if (!body.proposedOutput) { apiError(res, 400, 'proposedOutput required'); return true; }
      const agentId = body.agentId ?? 'default';
      // Load context graph and target profile for guard check
      const { loadContextGraph } = await import('../context/contextGraph.js');
      const { loadTargetProfile } = await import('../targets/targetProfile.js');
      const { guardCheck } = await import('../guardrails/guardEngine.js');
      const contextGraph = loadContextGraph(workspace, agentId);
      const targetProfile = loadTargetProfile(workspace, 'default', agentId);
      const result = guardCheck({
        contextGraph,
        signedTargetProfile: targetProfile,
        proposedActionOrOutput: body.proposedOutput,
        taskMetadata: { riskTier: body.riskTier as 'low' | 'med' | 'high' | 'critical' | undefined, actionType: body.actionType },
      });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Guard check failed');
    }
    return true;
  }

  // POST /api/v1/watch/attest — attest agent output via ledger
  if (pathname === '/api/v1/watch/attest' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string; output: string; sessionId?: string }>(req);
      if (!body.output) { apiError(res, 400, 'output required'); return true; }
      const agentId = body.agentId ?? 'default';
      const { openLedger } = await import('../ledger/ledger.js');
      const ledger = openLedger(workspace);
      try {
        const sessionId = body.sessionId ?? `attest_${Date.now()}`;
        const eventId = ledger.appendEvidence({
          sessionId,
          runtime: 'unknown',
          eventType: 'audit',
          payload: body.output,
          payloadExt: 'txt',
        });
        apiSuccess(res, { attested: true, agentId, eventId, sessionId });
      } finally {
        ledger.close();
      }
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Attestation failed');
    }
    return true;
  }

  // POST /api/v1/watch/safety-test — run safety assurance pack
  if (pathname === '/api/v1/watch/safety-test' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string; packId?: string; window?: string }>(req);
      const agentId = body.agentId ?? 'default';
      const { runAssurance } = await import('../assurance/assuranceRunner.js');
      const result = await runAssurance({
        workspace,
        agentId,
        packId: body.packId ?? 'all',
        mode: 'supervise',
        window: body.window ?? '30d',
      });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Safety test failed');
    }
    return true;
  }

  // POST /api/v1/watch/explain — explainability packet for a run
  if (pathname === '/api/v1/watch/explain' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string; runId: string }>(req);
      if (!body.runId) { apiError(res, 400, 'runId required'); return true; }
      const agentId = body.agentId ?? 'default';
      const { loadRunReport, generateReport } = await import('../diagnostic/runner.js');
      const report = loadRunReport(workspace, body.runId, agentId);
      const md = generateReport(report, 'md');
      apiSuccess(res, {
        agentId,
        runId: body.runId,
        trustLabel: report.trustLabel,
        integrityIndex: report.integrityIndex,
        inflationAttempts: report.inflationAttempts ?? [],
        markdown: md,
      });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Explain failed');
    }
    return true;
  }

  // GET /api/v1/watch/governor — autonomy governor status check
  if (pathname === '/api/v1/watch/governor' && method === 'GET') {
    try {
      const agentId = queryParam(req.url ?? '', 'agentId') ?? 'default';
      const actionClass = (queryParam(req.url ?? '', 'actionClass') ?? 'READ_ONLY') as import('../types.js').ActionClass;
      const riskTier = (queryParam(req.url ?? '', 'riskTier') ?? 'low') as import('../types.js').RiskTier;
      const mode = (queryParam(req.url ?? '', 'mode') ?? 'SIMULATE') as import('../types.js').ExecutionMode;
      const { runGovernorCheck } = await import('../governor/governorCli.js');
      const result = runGovernorCheck({ workspace, agentId, actionClass, riskTier, mode });
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Governor check failed');
    }
    return true;
  }

  // GET /api/v1/watch/host-hardening — host hardening status
  if (pathname === '/api/v1/watch/host-hardening' && method === 'GET') {
    try {
      const { runDoctorCli } = await import('../doctor/doctorCli.js');
      const result = await runDoctorCli(workspace);
      apiSuccess(res, result);
    } catch {
      apiSuccess(res, { ok: true, checks: [], message: 'Doctor module unavailable' });
    }
    return true;
  }

  // POST /api/v1/watch/oversight — log an oversight event
  if (pathname === '/api/v1/watch/oversight' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string; event: string; metadata?: unknown }>(req);
      if (!body.event) { apiError(res, 400, 'event required'); return true; }
      const { openLedger } = await import('../ledger/ledger.js');
      const ledger = openLedger(workspace);
      try {
        const eventId = ledger.appendEvidence({
          sessionId: `oversight_${Date.now()}`,
          runtime: 'unknown',
          eventType: 'audit',
          payload: JSON.stringify({ event: body.event, metadata: body.metadata }),
          payloadExt: 'json',
        });
        apiSuccess(res, { logged: true, eventId });
      } finally {
        ledger.close();
      }
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Oversight log failed');
    }
    return true;
  }

  // POST /api/v1/watch/profiler/event — submit a behavioral event
  if (pathname === '/api/v1/watch/profiler/event' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId?: string; eventType?: string; latencyMs?: number; toolName?: string; metadata?: Record<string, unknown> }>(req);
      if (!body.agentId || !body.eventType) { apiError(res, 400, 'agentId and eventType required'); return true; }
      const { BehavioralProfiler } = await import('../watch/behavioralProfiler.js');
      const profiler = new BehavioralProfiler();
      const anomalies = profiler.ingest({
        agentId: body.agentId,
        eventType: body.eventType as 'tool_call' | 'decision' | 'response' | 'error' | 'escalation',
        latencyMs: body.latencyMs,
        toolName: body.toolName,
        metadata: body.metadata,
        timestamp: Date.now(),
      });
      apiSuccess(res, { recorded: true, agentId: body.agentId, eventType: body.eventType, anomaliesDetected: anomalies.length, anomalies });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Behavioral event recording failed');
    }
    return true;
  }

  // GET /api/v1/watch/profiler/profile/:agentId — get an agent's behavioral profile
  const profilerProfileParams = pathname.match(/^\/api\/v1\/watch\/profiler\/profile\/([^/]+)$/);
  if (profilerProfileParams && method === 'GET') {
    try {
      const agentId = decodeURIComponent(profilerProfileParams[1] ?? '');
      const { BehavioralProfiler } = await import('../watch/behavioralProfiler.js');
      const profiler = new BehavioralProfiler();
      const profile = profiler.getProfile(agentId);
      if (!profile) { apiSuccess(res, { agentId, profile: null, message: 'No profile yet — submit events first' }); return true; }
      apiSuccess(res, profile);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Profile retrieval failed');
    }
    return true;
  }

  // GET /api/v1/watch/profiler/anomalies/:agentId — get detected anomalies (submit a probe event)
  const profilerAnomalyParams = pathname.match(/^\/api\/v1\/watch\/profiler\/anomalies\/([^/]+)$/);
  if (profilerAnomalyParams && method === 'GET') {
    try {
      const agentId = decodeURIComponent(profilerAnomalyParams[1] ?? '');
      const { BehavioralProfiler } = await import('../watch/behavioralProfiler.js');
      const profiler = new BehavioralProfiler();
      // Probe with a neutral event; return any detected anomalies
      const anomalies = profiler.ingest({ agentId, eventType: 'response', timestamp: Date.now() });
      apiSuccess(res, { agentId, anomalies });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Anomaly retrieval failed');
    }
    return true;
  }

  return false;
}
