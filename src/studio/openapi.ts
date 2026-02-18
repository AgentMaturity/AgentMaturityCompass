/**
 * OpenAPI 3.0 Spec Generator for the full AMC Studio + Bridge + Gateway API.
 *
 * Extends the Bridge-only spec from integrationScaffold with Studio API
 * endpoints, Gateway routes, and authentication documentation.
 *
 * Usage:
 *   CLI:   amc openapi generate --out openapi.yaml
 *   HTTP:  GET /openapi.yaml from Studio server
 */

import { generateBridgeOpenApiSpec, type OpenApiSpec } from "../setup/integrationScaffold.js";
import YAML from "yaml";

// ---------------------------------------------------------------------------
// Studio API endpoint definitions
// ---------------------------------------------------------------------------

function studioEndpoints(): Record<string, Record<string, unknown>> {
  return {
    "/api/readyz": {
      get: {
        summary: "Readiness probe",
        tags: ["Studio"],
        responses: {
          "200": {
            description: "Workspace readiness status",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ReadinessResponse" } } },
          },
        },
      },
    },
    "/api/agents": {
      get: {
        summary: "List registered agents",
        tags: ["Studio", "Fleet"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: {
          "200": {
            description: "Agent list",
            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/AgentSummary" } } } },
          },
        },
      },
    },
    "/api/agents/{agentId}/status": {
      get: {
        summary: "Get agent latest status",
        tags: ["Studio", "Fleet"],
        parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string" } }],
        security: [{ adminToken: [] }, { sessionCookie: [] }, { agentToken: [] }],
        responses: { "200": { description: "Agent status with latest run" } },
      },
    },
    "/api/diagnostic/run": {
      post: {
        summary: "Run diagnostic for an agent",
        tags: ["Studio", "Diagnostic"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/DiagnosticRunRequest" } } },
        },
        responses: { "200": { description: "Diagnostic run result" } },
      },
    },
    "/api/assurance/run": {
      post: {
        summary: "Run assurance pack(s)",
        tags: ["Studio", "Assurance"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/AssuranceRunRequest" } } },
        },
        responses: { "200": { description: "Assurance run results" } },
      },
    },
    "/api/assurance/runs": {
      get: {
        summary: "List assurance run history",
        tags: ["Studio", "Assurance"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: { "200": { description: "List of assurance runs" } },
      },
    },
    "/api/cgx/build": {
      post: {
        summary: "Build Context Graph (CGX)",
        tags: ["Studio", "CGX"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: { "200": { description: "CGX build result" } },
      },
    },
    "/api/cgx/graph": {
      get: {
        summary: "Get latest CGX graph",
        tags: ["Studio", "CGX"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: { "200": { description: "Latest CGX graph JSON" } },
      },
    },
    "/api/leases/issue": {
      post: {
        summary: "Issue a lease token",
        tags: ["Studio", "Leases"],
        security: [{ adminToken: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  agentId: { type: "string" },
                  scopes: { type: "array", items: { type: "string" } },
                  durationSec: { type: "integer" },
                },
                required: ["agentId", "scopes"],
              },
            },
          },
        },
        responses: { "200": { description: "Issued lease token" } },
      },
    },
    "/api/leases/revoke": {
      post: {
        summary: "Revoke a lease",
        tags: ["Studio", "Leases"],
        security: [{ adminToken: [] }],
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { leaseId: { type: "string" } }, required: ["leaseId"] } } },
        },
        responses: { "200": { description: "Lease revoked" } },
      },
    },
    "/api/approvals": {
      get: {
        summary: "List pending approval requests",
        tags: ["Studio", "Approvals"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: { "200": { description: "List of approval requests" } },
      },
    },
    "/api/approvals/{id}/decide": {
      post: {
        summary: "Approve or reject an approval request",
        tags: ["Studio", "Approvals"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  decision: { type: "string", enum: ["APPROVE", "REJECT"] },
                  reason: { type: "string" },
                },
                required: ["decision"],
              },
            },
          },
        },
        responses: { "200": { description: "Decision recorded" } },
      },
    },
    "/api/plugins": {
      get: {
        summary: "List installed plugins",
        tags: ["Studio", "Plugins"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: { "200": { description: "Installed plugin list" } },
      },
    },
    "/api/forecast/latest": {
      get: {
        summary: "Get latest forecast",
        tags: ["Studio", "Forecast"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: { "200": { description: "Latest forecast data" } },
      },
    },
    "/openapi.yaml": {
      get: {
        summary: "Serve OpenAPI spec",
        tags: ["Meta"],
        responses: { "200": { description: "OpenAPI 3.0 YAML spec" } },
      },
    },
  };
}

function studioSchemas(): Record<string, unknown> {
  return {
    ReadinessResponse: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        reasons: { type: "array", items: { type: "string" } },
        checks: { type: "object" },
      },
    },
    AgentSummary: {
      type: "object",
      properties: {
        agentId: { type: "string" },
        latestRun: {
          type: "object",
          nullable: true,
          properties: {
            runId: { type: "string" },
            ts: { type: "integer" },
            integrityIndex: { type: "number" },
            trustLabel: { type: "string" },
            status: { type: "string" },
          },
        },
      },
    },
    DiagnosticRunRequest: {
      type: "object",
      properties: {
        agentId: { type: "string" },
        questionIds: { type: "array", items: { type: "string" } },
      },
    },
    AssuranceRunRequest: {
      type: "object",
      properties: {
        agentId: { type: "string" },
        packIds: { type: "array", items: { type: "string" } },
        all: { type: "boolean" },
      },
    },
    LeaseToken: {
      type: "object",
      properties: {
        leaseId: { type: "string" },
        token: { type: "string" },
        agentId: { type: "string" },
        scopes: { type: "array", items: { type: "string" } },
        expiresAt: { type: "string", format: "date-time" },
      },
    },
  };
}

function gatewayEndpoints(): Record<string, Record<string, unknown>> {
  return {
    "/gateway/{provider}/{path}": {
      post: {
        summary: "Proxy request through AMC Gateway to provider",
        tags: ["Gateway"],
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string" } },
          { name: "path", in: "path", required: true, schema: { type: "string" } },
        ],
        security: [{ leaseToken: [] }],
        responses: {
          "200": { description: "Proxied provider response" },
          "401": { description: "Invalid or missing lease" },
          "403": { description: "Scope/route denied" },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Full spec generator
// ---------------------------------------------------------------------------

/**
 * Generate a comprehensive OpenAPI 3.0 spec covering Studio, Bridge, and Gateway.
 */
export function generateFullOpenApiSpec(): OpenApiSpec {
  const bridgeSpec = generateBridgeOpenApiSpec();

  const allPaths = {
    ...bridgeSpec.paths,
    ...studioEndpoints(),
    ...gatewayEndpoints(),
  };

  const allSchemas = {
    ...bridgeSpec.components.schemas,
    ...studioSchemas(),
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "AMC — Agent Maturity Compass API",
      version: "1.0.0",
      description:
        "Full API reference for the AMC Studio server, Bridge proxy, and Gateway. " +
        "Includes endpoints for diagnostics, assurance, CGX, leases, approvals, " +
        "plugins, forecasting, and provider proxying.",
    },
    paths: allPaths,
    components: {
      schemas: allSchemas,
      securitySchemes: {
        adminToken: {
          type: "apiKey",
          in: "header",
          name: "x-amc-admin-token",
          description: "Bootstrap admin token for full Studio access",
        },
        agentToken: {
          type: "apiKey",
          in: "header",
          name: "x-amc-agent-token",
          description: "Agent-specific access token",
        },
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "amc-session",
          description: "Console session cookie (RBAC)",
        },
        leaseToken: {
          type: "http",
          scheme: "bearer",
          description: "Lease JWT token for scoped agent access",
        },
      },
    } as any,
  };
}

/**
 * Render the spec as YAML.
 */
export function renderOpenApiYaml(): string {
  return YAML.stringify(generateFullOpenApiSpec(), { lineWidth: 120 });
}

/**
 * CLI handler for `amc openapi generate`.
 */
export function openapiGenerateCli(options: { out?: string }): { path: string | null; spec: OpenApiSpec } {
  const spec = generateFullOpenApiSpec();

  if (options.out) {
    const { writeFileSync } = require("node:fs") as typeof import("node:fs");
    const { dirname } = require("node:path") as typeof import("node:path");
    const { mkdirSync } = require("node:fs") as typeof import("node:fs");
    try {
      mkdirSync(dirname(options.out), { recursive: true });
    } catch { /* ignore */ }

    if (options.out.endsWith(".yaml") || options.out.endsWith(".yml")) {
      writeFileSync(options.out, renderOpenApiYaml(), "utf8");
    } else {
      writeFileSync(options.out, JSON.stringify(spec, null, 2), "utf8");
    }
    return { path: options.out, spec };
  }

  return { path: null, spec };
}
