/**
 * api/index.ts — Central API route dispatcher.
 *
 * Called from studioServer.ts when pathname starts with /api/v1/.
 * Full CLI parity: all CLI command domains are exposed here.
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
import { handleIncidentRoute } from './incidentRouter.js';
import { handleEvidenceRoute } from './evidenceRouter.js';
import { handleGatewayRoute } from './gatewayRouter.js';
import { handleConfigRoute } from './configRouter.js';
import { handleDriftRoute } from './driftRouter.js';
import { handleSandboxRoute } from './sandboxRouter.js';
import { handleCiRoute } from './ciRouter.js';
import { handleBenchmarkRoute } from './benchmarkRouter.js';
import { handleWorkflowRoute } from './workflowRouter.js';
import { handleGovernorRoute } from './governorRouter.js';
import { handleAdaptersRoute } from './adaptersRouter.js';
import { handleToolsRoute } from './toolsRouter.js';
import { handleSecurityRoute } from './securityRouter.js';
import { handleCanaryRoute } from './canaryRouter.js';
import { handleIdentityRoute } from './identityRouter.js';
import { handleCryptoRoute } from './cryptoRouter.js';
import { handleBomRoute } from './bomRouter.js';
import { handleComplianceRoute } from './complianceRouter.js';
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
    // ── Core scoring & diagnostics ────────────────────────────────
    if (pathname.startsWith('/api/v1/score/') || pathname === '/api/v1/score')
      return await handleScoreRoute(pathname, method, req, res, workspace);

    // ── Fleet, agent registry, freeze ────────────────────────────
    if (pathname.startsWith('/api/v1/fleet/') || pathname === '/api/v1/fleet')
      return await handleFleetRoute(pathname, method, req, res, workspace);

    // ── Evidence lifecycle ────────────────────────────────────────
    if (pathname.startsWith('/api/v1/evidence/') || pathname === '/api/v1/evidence')
      return await handleEvidenceRoute(pathname, method, req, res, workspace);

    // ── Vault, DLP, key management ───────────────────────────────
    if (pathname.startsWith('/api/v1/vault/') || pathname === '/api/v1/vault')
      return await handleVaultRoute(pathname, method, req, res, workspace);

    // ── Watch, guardrails, governor ───────────────────────────────
    if (pathname.startsWith('/api/v1/watch/') || pathname === '/api/v1/watch')
      return await handleWatchRoute(pathname, method, req, res, workspace);

    // ── Gateway / LLM proxy ───────────────────────────────────────
    if (pathname.startsWith('/api/v1/gateway/') || pathname === '/api/v1/gateway')
      return await handleGatewayRoute(pathname, method, req, res, workspace);

    // ── Runtime config + logs ─────────────────────────────────────
    if (pathname.startsWith('/api/v1/config/') || pathname === '/api/v1/config')
      return await handleConfigRoute(pathname, method, req as import('node:http').IncomingMessage, res as import('node:http').ServerResponse, workspace);

    // ── Drift, freeze, alerts ────────────────────────────────────
    if (pathname.startsWith('/api/v1/drift/') || pathname === '/api/v1/drift')
      return await handleDriftRoute(pathname, method, req, res, workspace);

    // ── Sandbox execution ─────────────────────────────────────────
    if (pathname.startsWith('/api/v1/sandbox/') || pathname === '/api/v1/sandbox')
      return await handleSandboxRoute(pathname, method, req, res, workspace);

    // ── Incidents ─────────────────────────────────────────────────
    if (pathname.startsWith('/api/v1/incidents/') || pathname === '/api/v1/incidents')
      return await handleIncidentRoute(pathname, method, req, res, workspace);

    // ── Assurance packs ───────────────────────────────────────────
    if (pathname.startsWith('/api/v1/assurance/') || pathname === '/api/v1/assurance')
      return await handleAssuranceRoute(pathname, method, req, res, workspace);

    // ── Shield ────────────────────────────────────────────────────
    if (pathname.startsWith('/api/v1/shield/'))
      return await handleShieldRoute(pathname, method, req, res);

    // ── Enforce ───────────────────────────────────────────────────
    if (pathname.startsWith('/api/v1/enforce/'))
      return await handleEnforceRoute(pathname, method, req, res);

    // ── Agent timeline ────────────────────────────────────────────
    if (pathname.startsWith('/api/v1/agents/'))
      return await handleAgentTimelineRoute(pathname, method, req, res, workspace);

    // ── Product ───────────────────────────────────────────────────
    if (pathname.startsWith('/api/v1/product/'))
      return await handleProductRoute(pathname, method, req, res);

    // ── Passport ──────────────────────────────────────────────────
    if (pathname.startsWith('/api/v1/passport'))
      return await handlePassportRoute(pathname, method, req, res, workspace, apiToken);

    // ── CI/CD gates ───────────────────────────────────────────────
    if (pathname.startsWith('/api/v1/ci/') || pathname === '/api/v1/ci')
      return await handleCiRoute(pathname, method, req, res, workspace);

    // ── Benchmarks ────────────────────────────────────────────────
    if (pathname.startsWith('/api/v1/benchmarks/') || pathname === '/api/v1/benchmarks')
      return await handleBenchmarkRoute(pathname, method, req, res, workspace);

    // ── Workflow: work orders, tickets, lifecycle ─────────────────
    if (pathname.startsWith('/api/v1/workorder') || pathname.startsWith('/api/v1/ticket') || pathname.startsWith('/api/v1/lifecycle'))
      return await handleWorkflowRoute(pathname, method, req, res, workspace);

    // ── Governor, oversight, mode ─────────────────────────────────
    if (pathname.startsWith('/api/v1/governor') || pathname.startsWith('/api/v1/oversight') || pathname.startsWith('/api/v1/mode'))
      return await handleGovernorRoute(pathname, method, req, res, workspace);

    // ── Adapters ──────────────────────────────────────────────────
    if (pathname.startsWith('/api/v1/adapters'))
      return await handleAdaptersRoute(pathname, method, req, res, workspace);

    // ── Tools, Plugins, Guardrails ────────────────────────────────
    if (pathname.startsWith('/api/v1/tools') || pathname.startsWith('/api/v1/plugins') || pathname.startsWith('/api/v1/guardrails'))
      return await handleToolsRoute(pathname, method, req, res, workspace);

    // ── Identity, SCIM tokens ─────────────────────────────────────
    if (pathname.startsWith('/api/v1/identity'))
      return await handleIdentityRoute(pathname, method, req, res, workspace);

    // ── Crypto: notary, certs, merkle, receipts ───────────────────
    if (pathname.startsWith('/api/v1/crypto'))
      return await handleCryptoRoute(pathname, method, req, res, workspace);

    // ── Security: ATO, taint, secrets, threat-intel, insider ─────
    if (pathname.startsWith('/api/v1/security'))
      return await handleSecurityRoute(pathname, method, req, res, workspace);

    // ── Canary: policy canary, micro-canary, canary mode ─────────
    if (pathname.startsWith('/api/v1/canary'))
      return await handleCanaryRoute(pathname, method, req, res, workspace);

    // ── BOM, SBOM, badge, bundle ─────────────────────────────────
    if (pathname.startsWith('/api/v1/bom') || pathname.startsWith('/api/v1/sbom') || pathname.startsWith('/api/v1/badge') || pathname.startsWith('/api/v1/bundle'))
      return await handleBomRoute(pathname, method, req, res, workspace);

    // ── Compliance, policy, waiver, regulatory ───────────────────
    if (pathname.startsWith('/api/v1/compliance') || pathname.startsWith('/api/v1/policy') || pathname.startsWith('/api/v1/waiver') || pathname.startsWith('/api/v1/regulatory'))
      return await handleComplianceRoute(pathname, method, req, res, workspace);

    // ── Legacy bridge redirects ───────────────────────────────────
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

    // ── Health check ─────────────────────────────────────────────
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
