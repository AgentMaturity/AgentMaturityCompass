/**
 * gatewayRouter.ts — Gateway/LLM proxy API routes.
 * Full parity with: amc gateway *, amc provider *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { bodyJson, apiSuccess, apiError } from './apiHelpers.js';

export async function handleGatewayRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd(),
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/gateway')) return false;

  // GET /api/v1/gateway/status
  if (pathname === '/api/v1/gateway/status' && method === 'GET') {
    try {
      const { gatewayStatus } = await import('../gateway/server.js');
      const status = await gatewayStatus(workspace);
      apiSuccess(res, status);
    } catch {
      apiSuccess(res, { running: false, module: 'gateway' });
    }
    return true;
  }

  // GET /api/v1/gateway/config — get gateway config (redacted)
  if (pathname === '/api/v1/gateway/config' && method === 'GET') {
    try {
      const { loadGatewayConfig } = await import('../gateway/config.js');
      const config = loadGatewayConfig(workspace);
      // Redact API keys from upstreams
      const safe = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
      if (safe.upstreams && typeof safe.upstreams === 'object') {
        for (const up of Object.values(safe.upstreams) as Record<string, unknown>[]) {
          if (up.apiKey) up.apiKey = '[REDACTED]';
          if (up.authHeaderValue) up.authHeaderValue = '[REDACTED]';
        }
      }
      apiSuccess(res, safe);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not load gateway config');
    }
    return true;
  }

  // POST /api/v1/gateway/init — initialize gateway with defaults
  if (pathname === '/api/v1/gateway/init' && method === 'POST') {
    try {
      const body = await bodyJson<{ provider?: string }>(req);
      const { initGatewayConfig, presetGatewayConfigForProvider, saveGatewayConfig } = await import('../gateway/config.js');
      const result = initGatewayConfig(workspace);
      if (body.provider) {
        const preset = presetGatewayConfigForProvider(body.provider);
        saveGatewayConfig(workspace, preset);
        apiSuccess(res, { initialized: true, configPath: result.configPath, provider: body.provider });
      } else {
        apiSuccess(res, { initialized: true, configPath: result.configPath });
      }
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Gateway init failed');
    }
    return true;
  }

  // POST /api/v1/gateway/bind — bind agent to a route
  if (pathname === '/api/v1/gateway/bind' && method === 'POST') {
    try {
      const body = await bodyJson<{ agentId: string; routePrefix?: string }>(req);
      if (!body.agentId) { apiError(res, 400, 'agentId required'); return true; }
      const { loadGatewayConfig, bindAgentRoute, saveGatewayConfig } = await import('../gateway/config.js');
      const config = loadGatewayConfig(workspace);
      const updated = bindAgentRoute(config, body.routePrefix ?? '/openai', body.agentId);
      saveGatewayConfig(workspace, updated);
      apiSuccess(res, { bound: true, agentId: body.agentId, routePrefix: body.routePrefix ?? '/openai' });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Agent bind failed');
    }
    return true;
  }

  // POST /api/v1/gateway/sign — sign gateway config
  if (pathname === '/api/v1/gateway/sign' && method === 'POST') {
    try {
      const { signGatewayConfig } = await import('../gateway/config.js');
      const sigPath = signGatewayConfig(workspace);
      apiSuccess(res, { signed: true, sigPath });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Sign failed');
    }
    return true;
  }

  // GET /api/v1/gateway/verify — verify gateway config signature
  if (pathname === '/api/v1/gateway/verify' && method === 'GET') {
    try {
      const { verifyGatewayConfigSignature } = await import('../gateway/config.js');
      const result = verifyGatewayConfigSignature(workspace);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Verify failed');
    }
    return true;
  }

  // GET /api/v1/gateway/providers — list available provider templates
  if (pathname === '/api/v1/gateway/providers' && method === 'GET') {
    try {
      const { listProviderTemplates } = await import('../providers/providerTemplates.js');
      const providers = listProviderTemplates();
      apiSuccess(res, { providers });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list providers');
    }
    return true;
  }

  return false;
}
