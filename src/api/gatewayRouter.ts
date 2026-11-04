/**
 * gatewayRouter.ts — Gateway/LLM proxy API routes.
 * Full parity with: amc gateway *, amc provider *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import YAML from 'yaml';
import { assertOwnerMode, getMode } from '../mode/mode.js';
import { assertOrgPairsCurrent, captureOrgPairs } from '../org/preparedOrgPairs.js';
import { pathExists } from '../utils/fs.js';
import { bodyJson, apiSuccess, apiError } from './apiHelpers.js';

/** Private negatives only. Studio's original callback remains the session/role authority. */
function captureGatewayRequest(req: IncomingMessage, res: ServerResponse, workspace: string,
  pathname: string, method: string, revalidateAuthority: () => boolean) {
  const original = {
    pathname, method, requestMethod: req.method, url: req.url, workspace, root: resolve(workspace),
    noSign: process.env.AMC_NO_SIGN === '1',
    admin: structuredClone(req.headers['x-amc-admin-token']), cookie: structuredClone(req.headers.cookie)
  };
  let refused: { cause: unknown } | null = null, answeredDenial = false;
  let bodyObserved = false, body: unknown, ownedBody: unknown;
  let mode: ReturnType<typeof getMode> | null = null;
  const negatives = () => {
    if (pathname !== original.pathname || method !== original.method || workspace !== original.workspace
      || req.method !== original.requestMethod || req.url !== original.url || resolve(workspace) !== original.root
      || (process.env.AMC_NO_SIGN === '1') !== original.noSign
      || !isDeepStrictEqual(req.headers['x-amc-admin-token'], original.admin)
      || !isDeepStrictEqual(req.headers.cookie, original.cookie)
      || (bodyObserved && !isDeepStrictEqual(body, ownedBody))
      || (mode !== null && getMode(workspace) !== mode))
      throw new Error('original Gateway request inputs or mode changed before publication');
  };
  const assertCurrent = () => {
    if (refused !== null) throw refused.cause;
    try {
      negatives();
      if (!revalidateAuthority()) {
        // Only the real callback's false result can identify its already answered refusal.
        answeredDenial = res.headersSent;
        throw new Error('original Gateway request authority refused publication');
      }
      negatives();
    } catch (cause) { refused = { cause }; throw cause; }
  };
  return Object.freeze({
    useAsync: !original.noSign, assertCurrent,
    answeredDenial: () => answeredDenial,
    observeBody(value: unknown) {
      body = value; ownedBody = structuredClone(value); bodyObserved = true;
      assertCurrent();
    },
    observeMode() {
      assertCurrent(); mode = getMode(workspace); assertCurrent();
    }
  });
}

/** Acknowledge only this real returned unsigned save; no member-origin or rollback claim. */
function acknowledgeGatewaySave(workspace: string, savedPath: string, intended: Buffer, beforePublish: () => void) {
  beforePublish();
  const path = join(workspace, '.amc', 'gateway.yaml');
  if (savedPath !== path) throw new Error('Gateway save returned an unexpected destination');
  const previous = captureOrgPairs([path]);
  const body = previous.members.find(row => row.path === path);
  const signature = previous.members.find(row => row.path === `${path}.sig`);
  if (body === undefined || body.mode !== 0o644 || body.bytes === null || !body.bytes.equals(intended)
    || signature === undefined || signature.bytes !== null || signature.mode !== null)
    throw new Error('Gateway unsigned save differs from its exact intended body and absent signature');
  assertOrgPairsCurrent(previous); beforePublish(); assertOrgPairsCurrent(previous);
  return previous;
}

export async function handleGatewayRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd(),
  revalidateAuthority?: () => boolean,
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/gateway')) return false;
  const captureRequest = () => revalidateAuthority === undefined ? null
    : captureGatewayRequest(req, res, workspace, pathname, method, revalidateAuthority);

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
    let request: ReturnType<typeof captureGatewayRequest> | null = null;
    try {
      request = captureRequest(); request?.assertCurrent();
      const body = await bodyJson<{ provider?: string }>(req);
      request?.observeBody(body);
      const { initGatewayConfig, presetGatewayConfigForProvider, saveGatewayConfig, signGatewayConfig,
        defaultGatewayConfig, gatewayConfigSchema, prepareGatewayConfigPair } = await import('../gateway/config.js');
      request?.assertCurrent();
      if (!request?.useAsync) {
        const result = initGatewayConfig(workspace);
        if (body.provider) {
          const preset = presetGatewayConfigForProvider(body.provider);
          saveGatewayConfig(workspace, preset);
          signGatewayConfig(workspace);
          request?.assertCurrent();
          apiSuccess(res, { initialized: true, configPath: result.configPath, provider: body.provider });
        } else {
          request?.assertCurrent();
          apiSuccess(res, { initialized: true, configPath: result.configPath });
        }
      } else {
        assertOwnerMode(workspace, 'gateway init');
        request.observeMode();
        const bytes = Buffer.from(YAML.stringify(gatewayConfigSchema.parse(defaultGatewayConfig())));
        const beforeDefault = () => {
          request!.assertCurrent(); assertOwnerMode(workspace, 'gateway init'); request!.assertCurrent();
        };
        beforeDefault();
        const preparedDefault = await prepareGatewayConfigPair(workspace, bytes, { beforePublish: beforeDefault });
        preparedDefault.assertCurrent();
        const result = preparedDefault.publish();
        preparedDefault.assertCurrent();
        // Preserve default publication before the first provider property access, including JSON null.
        if (body.provider) {
          const preset = presetGatewayConfigForProvider(body.provider);
          const intended = Buffer.from(YAML.stringify(preset));
          preparedDefault.assertCurrent();
          const savedPath = saveGatewayConfig(workspace, preset);
          // Own save retires only the old target CAS, never the first genuine signature authority.
          const beforePreset = () => { beforeDefault(); preparedDefault.assertSignatureCurrent(); beforeDefault(); };
          const previous = acknowledgeGatewaySave(workspace, savedPath, intended, beforePreset);
          const preparedPreset = await prepareGatewayConfigPair(workspace, undefined, { previous, beforePublish: beforePreset });
          preparedPreset.assertCurrent(); preparedPreset.publish(); preparedPreset.assertCurrent();
          apiSuccess(res, { initialized: true, configPath: result.path, provider: body.provider });
          preparedPreset.assertCurrent();
        } else {
          preparedDefault.assertCurrent();
          apiSuccess(res, { initialized: true, configPath: result.path });
          preparedDefault.assertCurrent();
        }
      }
    } catch (err) {
      if (!request?.answeredDenial()) apiError(res, 500, err instanceof Error ? err.message : 'Gateway init failed');
    }
    return true;
  }

  // POST /api/v1/gateway/bind — bind agent to a route
  if (pathname === '/api/v1/gateway/bind' && method === 'POST') {
    let request: ReturnType<typeof captureGatewayRequest> | null = null;
    try {
      request = captureRequest(); request?.assertCurrent();
      const body = await bodyJson<{ agentId: string; routePrefix?: string }>(req);
      request?.observeBody(body);
      if (!body.agentId) { apiError(res, 400, 'agentId required'); return true; }
      const { loadGatewayConfig, bindAgentRoute, saveGatewayConfig, signGatewayConfig,
        prepareGatewayConfigPair } = await import('../gateway/config.js');
      request?.assertCurrent();
      const config = loadGatewayConfig(workspace);
      const updated = bindAgentRoute(config, body.routePrefix ?? '/openai', body.agentId);
      if (!request?.useAsync) {
        saveGatewayConfig(workspace, updated);
        signGatewayConfig(workspace);
        request?.assertCurrent();
        apiSuccess(res, { bound: true, agentId: body.agentId, routePrefix: body.routePrefix ?? '/openai' });
      } else {
        // HTTP bind has no workspace owner-mode or prior-signature gate.
        request.observeMode();
        const intended = Buffer.from(YAML.stringify(updated));
        request.assertCurrent();
        const savedPath = saveGatewayConfig(workspace, updated);
        const beforePublish = request.assertCurrent;
        const previous = acknowledgeGatewaySave(workspace, savedPath, intended, beforePublish);
        // Actual unsigned save precedes all private/key/provider capture for this route.
        const prepared = await prepareGatewayConfigPair(workspace, undefined, { previous, beforePublish });
        prepared.assertCurrent(); prepared.publish(); prepared.assertCurrent();
        apiSuccess(res, { bound: true, agentId: body.agentId, routePrefix: body.routePrefix ?? '/openai' });
        prepared.assertCurrent();
      }
    } catch (err) {
      if (!request?.answeredDenial()) apiError(res, 500, err instanceof Error ? err.message : 'Agent bind failed');
    }
    return true;
  }

  // POST /api/v1/gateway/sign — sign gateway config
  if (pathname === '/api/v1/gateway/sign' && method === 'POST') {
    let request: ReturnType<typeof captureGatewayRequest> | null = null;
    try {
      request = captureRequest(); request?.assertCurrent();
      const { signGatewayConfig, prepareGatewayConfigPair } = await import('../gateway/config.js');
      request?.assertCurrent();
      if (!request?.useAsync) {
        const sigPath = signGatewayConfig(workspace);
        request?.assertCurrent();
        apiSuccess(res, { signed: true, sigPath });
      } else {
        const path = join(workspace, '.amc', 'gateway.yaml');
        if (!pathExists(path)) throw new Error(`Cannot sign missing gateway config: ${path}`);
        request.observeMode();
        const prepared = await prepareGatewayConfigPair(workspace, undefined, { beforePublish: request.assertCurrent });
        prepared.assertCurrent();
        const result = prepared.publish();
        prepared.assertCurrent();
        apiSuccess(res, { signed: true, sigPath: result.sigPath });
        prepared.assertCurrent();
      }
    } catch (err) {
      if (!request?.answeredDenial()) apiError(res, 500, err instanceof Error ? err.message : 'Sign failed');
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
