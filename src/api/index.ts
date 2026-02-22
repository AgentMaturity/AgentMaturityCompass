/**
 * api/index.ts — Central API route dispatcher.
 *
 * Called from studioServer.ts when pathname starts with /api/v1/.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleShieldRoute } from './shieldRouter.js';
import { handleEnforceRoute } from './enforceRouter.js';
import { handleVaultRoute } from './vaultRouter.js';
import { handleWatchRoute } from './watchRouter.js';
import { handleScoreRoute } from './scoreRouter.js';
import { handleProductRoute } from './productRouter.js';
import { apiError } from './apiHelpers.js';

export async function handleApiRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace?: string,
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/')) return false;

  try {
    // Dispatch to sub-routers by prefix
    if (pathname.startsWith('/api/v1/shield/'))  return await handleShieldRoute(pathname, method, req, res);
    if (pathname.startsWith('/api/v1/enforce/')) return await handleEnforceRoute(pathname, method, req, res);
    if (pathname.startsWith('/api/v1/vault/'))   return await handleVaultRoute(pathname, method, req, res);
    if (pathname.startsWith('/api/v1/watch/'))   return await handleWatchRoute(pathname, method, req, res, { workspace });
    if (pathname.startsWith('/api/v1/score/'))   return await handleScoreRoute(pathname, method, req, res);
    if (pathname.startsWith('/api/v1/product/')) return await handleProductRoute(pathname, method, req, res);

    // API health check
    if (pathname === '/api/v1/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: '1.0.0', timestamp: new Date().toISOString() }));
      return true;
    }

    apiError(res, 404, `API route not found: ${method} ${pathname}`);
    return true;
  } catch (err) {
    apiError(res, 500, err instanceof Error ? err.message : 'Internal server error');
    return true;
  }
}
