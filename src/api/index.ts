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
import { handleAgentTimelineRoute } from './agentTimelineRouter.js';
import { handleAssuranceRoute } from './assuranceRouter.js';
import { handleFleetRoute } from './fleetRouter.js';
import { handlePassportRoute } from './passportRouter.js';
import { apiError } from './apiHelpers.js';
import { buildHealthPayload } from './health.js';
import { deprecatedBridgeRoute, sdkVersionPolicy } from '../sdk/versioning.js';

export async function handleApiRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd(),
  apiToken?: string
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/')) return false;

  try {
    // Dispatch to sub-routers by prefix
    if (pathname.startsWith('/api/v1/shield/'))  return await handleShieldRoute(pathname, method, req, res);
    if (pathname.startsWith('/api/v1/enforce/')) return await handleEnforceRoute(pathname, method, req, res);
    if (pathname.startsWith('/api/v1/vault/'))   return await handleVaultRoute(pathname, method, req, res);
    if (pathname.startsWith('/api/v1/watch/'))   return await handleWatchRoute(pathname, method, req, res);
    if (pathname.startsWith('/api/v1/score/'))   return await handleScoreRoute(pathname, method, req, res, workspace);
    if (pathname.startsWith('/api/v1/product/')) return await handleProductRoute(pathname, method, req, res);
    if (pathname.startsWith('/api/v1/agents/'))  return await handleAgentTimelineRoute(pathname, method, req, res, workspace);
    if (pathname.startsWith('/api/v1/assurance/') || pathname === '/api/v1/assurance') return await handleAssuranceRoute(pathname, method, req, res, workspace);
    if (pathname.startsWith('/api/v1/fleet/'))    return await handleFleetRoute(pathname, method, req, res, workspace);
    if (pathname.startsWith('/api/v1/passport') ) return await handlePassportRoute(pathname, method, req, res, workspace);

    // Legacy bridge endpoint redirects — 308 permanent redirect with deprecation headers
    const deprecated = deprecatedBridgeRoute(pathname);
    if (deprecated) {
      const sunset = new Date(`${deprecated.sunsetOn}T00:00:00.000Z`).toUTCString();
      res.writeHead(308, {
        'Location': deprecated.replacementPath,
        'Deprecation': 'true',
        'Sunset': sunset,
        'Link': `<${sdkVersionPolicy.policyDocPath}>; rel="deprecation"`,
        'Warning': '299 - "Deprecated bridge endpoint; use ' + deprecated.replacementPath + ' instead"',
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify({
        error: 'Deprecated endpoint',
        redirect: deprecated.replacementPath,
        announcedOn: deprecated.announcedOn,
        sunsetOn: deprecated.sunsetOn,
        policy: sdkVersionPolicy.policyDocPath
      }));
      return true;
    }

    // API health check
    if (pathname === '/api/v1/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(buildHealthPayload(workspace)));
      return true;
    }

    apiError(res, 404, `API route not found: ${method} ${pathname}`);
    return true;
  } catch (err) {
    apiError(res, 500, 'Internal server error');
    return true;
  }
}
