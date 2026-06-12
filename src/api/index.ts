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
import { handleFixerRoute } from './fixerRouter.js';
import { handleGatewayRoute } from './gatewayRouter.js';
import { handleConfigRoute } from './configRouter.js';
import { handleDriftRoute } from './driftRouter.js';
import { handleSandboxRoute } from './sandboxRouter.js';
import { handleCiRoute } from './ciRouter.js';
import { handleBenchmarkRoute } from './benchmarkRouter.js';
import { handleWorkflowRoute } from './workflowRouter.js';
import { handleOrgRunRoute } from './orgRunRouter.js';
import { handleFirewallRoute } from './firewallRouter.js';
import { handleRuntimeRoute } from './runtimeRouter.js';
import { handleImporterRoute } from './importerRouter.js';
import { handleStrategyRoute } from './strategyRouter.js';
import { handleGovernorRoute } from './governorRouter.js';
import { handleAdaptersRoute } from './adaptersRouter.js';
import { handleToolsRoute } from './toolsRouter.js';
import { handleSecurityRoute } from './securityRouter.js';
import { handleCanaryRoute } from './canaryRouter.js';
import { handleIdentityRoute } from './identityRouter.js';
import { handleCryptoRoute } from './cryptoRouter.js';
import { handleBomRoute } from './bomRouter.js';
import { handleComplianceRoute } from './complianceRouter.js';
import { handleMemoryRoute } from './memoryRouter.js';
import { handleMetricsRoute } from './metricsRouter.js';
import { handleExportRoute } from './exportRouter.js';
import { apiError } from './apiHelpers.js';
import { buildHealthPayload } from './health.js';
import { deprecatedBridgeRoute, sdkVersionPolicy } from '../sdk/versioning.js';
import { handleMarketplaceRoute } from '../marketplace/marketplaceRouter.js';

export type ApiAuthPolicy = 'public' | 'protected';
export type ApiValidationPolicy = 'schema-validated' | 'router-local' | 'passthrough';

export interface ApiRouteContext {
  workspace: string;
  apiToken?: string;
}

export type ApiRouteHandler = (
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  context: ApiRouteContext
) => Promise<boolean>;

export interface ApiRouteDefinition {
  id: string;
  description: string;
  prefixes: readonly string[];
  methods: readonly string[];
  auth: ApiAuthPolicy;
  validationPolicy: ApiValidationPolicy;
  handler: ApiRouteHandler;
}

function workspaceRoute(
  handler: (
    pathname: string,
    method: string,
    req: IncomingMessage,
    res: ServerResponse,
    workspace: string
  ) => Promise<boolean>
): ApiRouteHandler {
  return (pathname, method, req, res, context) => handler(pathname, method, req, res, context.workspace);
}

export const PUBLIC_API_V1_PATHS = new Set<string>([
  '/api/v1/health',
  '/api/v1/chat/completions',
  '/api/v1/completions',
  '/api/v1/embeddings'
]);

export const API_ROUTE_REGISTRY: readonly ApiRouteDefinition[] = [
  {
    id: 'score',
    description: 'Scoring, diagnostics, quickscore, and trust scoring',
    prefixes: ['/api/v1/score'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'schema-validated',
    handler: workspaceRoute(handleScoreRoute)
  },
  {
    id: 'fleet',
    description: 'Fleet registry, lifecycle, health, and governance',
    prefixes: ['/api/v1/fleet'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleFleetRoute)
  },
  {
    id: 'org',
    description: 'Org runner and lifecycle workspace operations',
    prefixes: ['/api/v1/org'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleOrgRunRoute)
  },
  {
    id: 'evidence',
    description: 'Evidence lifecycle and artifact export APIs',
    prefixes: ['/api/v1/evidence'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleEvidenceRoute)
  },
  {
    id: 'fixer',
    description: 'RCA and repair proposal APIs',
    prefixes: ['/api/v1/fixer'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleFixerRoute)
  },
  {
    id: 'vault',
    description: 'Vault, DLP, and key management',
    prefixes: ['/api/v1/vault'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleVaultRoute)
  },
  {
    id: 'watch',
    description: 'Watch, guardrails, and monitoring APIs',
    prefixes: ['/api/v1/watch'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleWatchRoute)
  },
  {
    id: 'gateway',
    description: 'Gateway and LLM proxy controls',
    prefixes: ['/api/v1/gateway'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleGatewayRoute)
  },
  {
    id: 'firewall',
    description: 'Runtime firewall protection controls',
    prefixes: ['/api/v1/firewall'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleFirewallRoute)
  },
  {
    id: 'runtime',
    description: 'Runtime run manager APIs',
    prefixes: ['/api/v1/runtime'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleRuntimeRoute)
  },
  {
    id: 'imports',
    description: 'Neutral importers for traces, runs, graphs, configs, memory, and evals',
    prefixes: ['/api/v1/imports'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleImporterRoute)
  },
  {
    id: 'strategy',
    description: 'Inference strategy comparisons and governed receipts',
    prefixes: ['/api/v1/strategy'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleStrategyRoute)
  },
  {
    id: 'config',
    description: 'Runtime config and logs',
    prefixes: ['/api/v1/config'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleConfigRoute)
  },
  {
    id: 'drift',
    description: 'Drift, freeze, and alerts',
    prefixes: ['/api/v1/drift'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleDriftRoute)
  },
  {
    id: 'sandbox',
    description: 'Sandbox execution APIs',
    prefixes: ['/api/v1/sandbox'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleSandboxRoute)
  },
  {
    id: 'incidents',
    description: 'Incident operations and dispatch workflows',
    prefixes: ['/api/v1/incidents'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleIncidentRoute)
  },
  {
    id: 'assurance',
    description: 'Assurance packs and control-plane APIs',
    prefixes: ['/api/v1/assurance'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleAssuranceRoute)
  },
  {
    id: 'shield',
    description: 'Shield security scanning APIs',
    prefixes: ['/api/v1/shield'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleShieldRoute)
  },
  {
    id: 'enforce',
    description: 'Policy enforcement APIs',
    prefixes: ['/api/v1/enforce'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleEnforceRoute)
  },
  {
    id: 'agents',
    description: 'Agent timeline APIs',
    prefixes: ['/api/v1/agents'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleAgentTimelineRoute)
  },
  {
    id: 'product',
    description: 'Product value signal APIs',
    prefixes: ['/api/v1/product'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: (pathname, method, req, res) => handleProductRoute(pathname, method, req, res)
  },
  {
    id: 'passport',
    description: 'Agent passport APIs',
    prefixes: ['/api/v1/passport', '/api/v1/passports'],
    methods: ['GET', 'POST', 'DELETE'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: (pathname, method, req, res, context) => handlePassportRoute(pathname, method, req, res, context.workspace, context.apiToken)
  },
  {
    id: 'ci',
    description: 'CI/CD gate helpers',
    prefixes: ['/api/v1/ci'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleCiRoute)
  },
  {
    id: 'benchmarks',
    description: 'Benchmark APIs',
    prefixes: ['/api/v1/benchmarks'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleBenchmarkRoute)
  },
  {
    id: 'workflow',
    description: 'Work orders, tickets, and lifecycle APIs',
    prefixes: ['/api/v1/workorder', '/api/v1/workorders', '/api/v1/ticket', '/api/v1/tickets', '/api/v1/lifecycle'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleWorkflowRoute)
  },
  {
    id: 'governor',
    description: 'Governor, oversight, and mode APIs',
    prefixes: ['/api/v1/governor', '/api/v1/oversight', '/api/v1/mode'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleGovernorRoute)
  },
  {
    id: 'adapters',
    description: 'Adapter integration APIs',
    prefixes: ['/api/v1/adapters'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleAdaptersRoute)
  },
  {
    id: 'tools',
    description: 'Tools, plugins, and guardrails APIs',
    prefixes: ['/api/v1/tools', '/api/v1/plugins', '/api/v1/guardrails'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleToolsRoute)
  },
  {
    id: 'identity',
    description: 'Identity and SCIM token APIs',
    prefixes: ['/api/v1/identity'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleIdentityRoute)
  },
  {
    id: 'crypto',
    description: 'Notary, certificates, merkle, and receipts APIs',
    prefixes: ['/api/v1/crypto'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleCryptoRoute)
  },
  {
    id: 'security',
    description: 'ATO, taint, secrets, threat-intel, and insider APIs',
    prefixes: ['/api/v1/security'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleSecurityRoute)
  },
  {
    id: 'canary',
    description: 'Policy canary and micro-canary APIs',
    prefixes: ['/api/v1/canary'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleCanaryRoute)
  },
  {
    id: 'bom',
    description: 'BOM, SBOM, badge, and bundle APIs',
    prefixes: ['/api/v1/bom', '/api/v1/sbom', '/api/v1/badge', '/api/v1/bundle'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleBomRoute)
  },
  {
    id: 'compliance',
    description: 'Compliance, policy, waiver, and regulatory APIs',
    prefixes: ['/api/v1/compliance', '/api/v1/policy', '/api/v1/waiver', '/api/v1/regulatory'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleComplianceRoute)
  },
  {
    id: 'memory',
    description: 'Maturity, integrity, and correction memory APIs',
    prefixes: ['/api/v1/memory'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleMemoryRoute)
  },
  {
    id: 'metrics',
    description: 'Metrics, SLO, and failure-risk index APIs',
    prefixes: ['/api/v1/metrics', '/api/v1/slo', '/api/v1/indices'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleMetricsRoute)
  },
  {
    id: 'export',
    description: 'Export and attestation APIs',
    prefixes: ['/api/v1/export', '/api/v1/attest'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleExportRoute)
  },
  {
    id: 'marketplace',
    description: 'Marketplace APIs',
    prefixes: ['/api/v1/marketplace'],
    methods: ['GET', 'POST'],
    auth: 'protected',
    validationPolicy: 'router-local',
    handler: workspaceRoute(handleMarketplaceRoute)
  },
  {
    id: 'health',
    description: 'Server health and version payload',
    prefixes: ['/api/v1/health'],
    methods: ['GET'],
    auth: 'public',
    validationPolicy: 'passthrough',
    handler: async (_pathname, _method, _req, res, context) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(buildHealthPayload(context.workspace)));
      return true;
    }
  }
];

function matchesApiPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function matchApiRoute(pathname: string): ApiRouteDefinition | undefined {
  return API_ROUTE_REGISTRY.find((route) => route.prefixes.some((prefix) => matchesApiPrefix(pathname, prefix)));
}

export function isPublicApiRoute(pathname: string): boolean {
  if (PUBLIC_API_V1_PATHS.has(pathname)) {
    return true;
  }
  return matchApiRoute(pathname)?.auth === 'public';
}

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
    const route = matchApiRoute(pathname);
    if (route) {
      return await route.handler(pathname, method, req, res, { workspace, apiToken });
    }

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

    apiError(res, 404, `API route not found: ${method} ${pathname}`);
    return true;
  } catch {
    apiError(res, 500, 'Internal server error');
    return true;
  }
}
