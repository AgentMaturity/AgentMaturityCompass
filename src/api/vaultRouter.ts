/**
 * vaultRouter.ts — Vault API routes.
 * Full parity with: amc vault *, amc key *
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { bodyJson, bodyJsonSchema, apiSuccess, apiError, isRequestBodyError, queryParam } from './apiHelpers.js';

const vaultRedactBodySchema = z.object({
  text: z.string().min(1),
  categories: z.array(z.string().trim().min(1)).optional()
}).strict();

const vaultClassifyBodySchema = z.object({
  content: z.string().min(1)
}).strict();

export async function handleVaultRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd(),
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/vault')) return false;

  // GET /api/v1/vault/status
  if (pathname === '/api/v1/vault/status' && method === 'GET') {
    try {
      const { vaultStatus } = await import('../vault/vault.js');
      const status = vaultStatus(workspace);
      apiSuccess(res, { module: 'vault', ...status });
    } catch {
      apiSuccess(res, { status: 'not_initialized', module: 'vault', capabilities: ['redact', 'classify', 'dlp-scan', 'keys'] });
    }
    return true;
  }

  // POST /api/v1/vault/unlock — unlock vault with passphrase
  if (pathname === '/api/v1/vault/unlock' && method === 'POST') {
    try {
      const body = await bodyJson<{ passphrase?: string }>(req);
      const { unlockVault } = await import('../vault/vault.js');
      unlockVault(workspace, body.passphrase);
      apiSuccess(res, { unlocked: true });
    } catch (err) {
      apiError(res, 401, err instanceof Error ? err.message : 'Unlock failed');
    }
    return true;
  }

  // POST /api/v1/vault/seal — lock vault
  if (pathname === '/api/v1/vault/seal' && method === 'POST') {
    try {
      const { lockVault } = await import('../vault/vault.js');
      lockVault(workspace);
      apiSuccess(res, { sealed: true });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Seal failed');
    }
    return true;
  }

  // GET /api/v1/vault/keys — list public key history
  if (pathname === '/api/v1/vault/keys' && method === 'GET') {
    try {
      const kind = (queryParam(req.url ?? '', 'kind') ?? 'monitor') as 'monitor' | 'auditor' | 'lease' | 'session';
      const { getPublicKeyHistory } = await import('../crypto/keys.js');
      const keys = getPublicKeyHistory(workspace, kind);
      apiSuccess(res, { kind, keys, count: keys.length });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list keys');
    }
    return true;
  }

  // POST /api/v1/vault/keys/rotate — rotate vault keys
  if (pathname === '/api/v1/vault/keys/rotate' && method === 'POST') {
    try {
      const { rotateMonitorKeyInVault } = await import('../vault/vault.js');
      const body = await bodyJson<{ passphrase?: string }>(req);
      const result = rotateMonitorKeyInVault(workspace, body.passphrase);
      apiSuccess(res, { rotated: true, ...result });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Key rotation failed');
    }
    return true;
  }

  // POST /api/v1/vault/secret/set — set a vault secret
  if (pathname === '/api/v1/vault/secret/set' && method === 'POST') {
    try {
      const body = await bodyJson<{ key: string; value: string }>(req);
      if (!body.key || !body.value) { apiError(res, 400, 'key and value required'); return true; }
      const { setVaultSecret } = await import('../vault/vault.js');
      setVaultSecret(workspace, body.key, body.value);
      apiSuccess(res, { set: true, key: body.key });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not set secret');
    }
    return true;
  }

  // GET /api/v1/vault/secret/:key — get a vault secret
  if (pathname.startsWith('/api/v1/vault/secret/') && method === 'GET') {
    try {
      const key = pathname.replace('/api/v1/vault/secret/', '');
      if (!key) { apiError(res, 400, 'key required'); return true; }
      const { getVaultSecret } = await import('../vault/vault.js');
      const value = getVaultSecret(workspace, key);
      if (value === null) { apiError(res, 404, 'Secret not found'); return true; }
      apiSuccess(res, { key, value });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not get secret');
    }
    return true;
  }

  // POST /api/v1/vault/redact
  if (pathname === '/api/v1/vault/redact' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, vaultRedactBodySchema);
      const { scanForPII } = await import('../vault/dlp.js');
      const result = scanForPII(body.text);
      apiSuccess(res, result);
    } catch (err) {
      if (isRequestBodyError(err)) { apiError(res, err.statusCode, err.message); return true; }
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  // POST /api/v1/vault/classify
  if (pathname === '/api/v1/vault/classify' && method === 'POST') {
    try {
      const body = await bodyJsonSchema(req, vaultClassifyBodySchema);
      const hasEmail = /[\w.-]+@[\w.-]+\.\w+/.test(body.content);
      const hasPhone = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(body.content);
      const hasSSN = /\b\d{3}-?\d{2}-?\d{4}\b/.test(body.content);
      const classification = hasSSN ? 'RESTRICTED' : (hasEmail || hasPhone) ? 'INTERNAL' : 'PUBLIC';
      apiSuccess(res, { classification, piiDetected: { email: hasEmail, phone: hasPhone, ssn: hasSSN } });
    } catch (err) {
      if (isRequestBodyError(err)) { apiError(res, err.statusCode, err.message); return true; }
      apiError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
    return true;
  }

  // POST /api/v1/vault/dlp-scan
  if (pathname === '/api/v1/vault/dlp-scan' && method === 'POST') {
    try {
      const body = await bodyJson<{ content: string }>(req);
      if (!body.content) { apiError(res, 400, 'content required'); return true; }
      const { scanForPII } = await import('../vault/dlp.js');
      const result = scanForPII(body.content);
      apiSuccess(res, result);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'DLP scan failed');
    }
    return true;
  }

  return false;
}
