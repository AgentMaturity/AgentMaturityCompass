/**
 * OpenAPI 3.0 Spec Generator for the full AMC Studio + Bridge + Gateway API.
 *
 * Extends the Bridge-only spec from integrationScaffold with Studio API
 * endpoints, Gateway routes, and authentication documentation.
 *
 * Usage:
 *   CLI:   amc openapi-generate --out openapi.yaml
 *   HTTP:  GET /openapi.yaml from Studio server
 */

import { generateBridgeOpenApiSpec, type OpenApiSpec } from "../setup/integrationScaffold.js";
import YAML from "yaml";

interface OpenApiOperation {
  summary?: string;
  tags?: string[];
  security?: Array<Record<string, unknown[]>>;
  parameters?: Array<Record<string, unknown>>;
  requestBody?: Record<string, unknown>;
  responses?: Record<string, unknown>;
}

export interface OpenApiContractIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
  method?: string;
}

function okJson(description: string, schemaRef: string, example?: Record<string, unknown>): Record<string, unknown> {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: schemaRef },
        ...(example ? { example } : {}),
      },
    },
  };
}

function errJson(description = "Request failed"): Record<string, unknown> {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" },
        example: { error: "forbidden", message: "Missing or invalid credentials" },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Studio API endpoint definitions
// ---------------------------------------------------------------------------

function studioEndpoints(): Record<string, Record<string, OpenApiOperation>> {
  return {
    "/api/readyz": {
      get: {
        summary: "Readiness probe",
        tags: ["Studio"],
        responses: {
          "200": okJson("Workspace readiness status", "#/components/schemas/ReadinessResponse", {
            ok: true,
            reasons: [],
            checks: { workspace: "ok", db: "ok" },
          }),
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
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/AgentSummary" } },
              },
            },
          },
          "401": errJson("Unauthorized"),
        },
      },
    },
    "/api/agents/{agentId}/status": {
      get: {
        summary: "Get agent latest status",
        tags: ["Studio", "Fleet"],
        parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string" } }],
        security: [{ adminToken: [] }, { sessionCookie: [] }, { agentToken: [] }],
        responses: {
          "200": okJson("Agent status with latest run", "#/components/schemas/AgentSummary"),
          "401": errJson("Unauthorized"),
          "404": errJson("Agent not found"),
        },
      },
    },
    "/api/diagnostic/run": {
      post: {
        summary: "Run diagnostic for an agent",
        tags: ["Studio", "Diagnostic"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/DiagnosticRunRequest" } } },
        },
        responses: {
          "200": okJson("Diagnostic run result", "#/components/schemas/RunAcceptedResponse"),
          "400": errJson("Invalid request"),
        },
      },
    },
    "/api/assurance/run": {
      post: {
        summary: "Run assurance pack(s)",
        tags: ["Studio", "Assurance"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AssuranceRunRequest" } } },
        },
        responses: {
          "200": okJson("Assurance run results", "#/components/schemas/RunAcceptedResponse"),
          "400": errJson("Invalid request"),
        },
      },
    },
    "/api/assurance/runs": {
      get: {
        summary: "List assurance run history",
        tags: ["Studio", "Assurance"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: {
          "200": okJson("List of assurance runs", "#/components/schemas/RunHistoryResponse"),
        },
      },
    },
    "/api/cgx/build": {
      post: {
        summary: "Build Context Graph (CGX)",
        tags: ["Studio", "CGX"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: {
          "200": okJson("CGX build result", "#/components/schemas/RunAcceptedResponse"),
        },
      },
    },
    "/api/cgx/graph": {
      get: {
        summary: "Get latest CGX graph",
        tags: ["Studio", "CGX"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: {
          "200": okJson("Latest CGX graph JSON", "#/components/schemas/CgxGraphResponse"),
        },
      },
    },
    "/api/leases/issue": {
      post: {
        summary: "Issue a lease token",
        tags: ["Studio", "Leases"],
        security: [{ adminToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  agentId: { type: "string" },
                  scopes: { type: "array", items: { type: "string" } },
                  durationSec: { type: "integer", minimum: 1 },
                },
                required: ["agentId", "scopes"],
              },
            },
          },
        },
        responses: { "200": okJson("Issued lease token", "#/components/schemas/LeaseToken") },
      },
    },
    "/api/leases/revoke": {
      post: {
        summary: "Revoke a lease",
        tags: ["Studio", "Leases"],
        security: [{ adminToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { leaseId: { type: "string" } },
                required: ["leaseId"],
              },
            },
          },
        },
        responses: { "200": okJson("Lease revoked", "#/components/schemas/LeaseRevocationResponse") },
      },
    },
    "/api/approvals": {
      get: {
        summary: "List pending approval requests",
        tags: ["Studio", "Approvals"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: { "200": okJson("List of approval requests", "#/components/schemas/ApprovalListResponse") },
      },
    },
    "/api/approvals/{id}/decide": {
      post: {
        summary: "Approve or reject an approval request",
        tags: ["Studio", "Approvals"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        requestBody: {
          required: true,
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
        responses: { "200": okJson("Decision recorded", "#/components/schemas/DecisionResponse") },
      },
    },
    "/api/plugins": {
      get: {
        summary: "List installed plugins",
        tags: ["Studio", "Plugins"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: { "200": okJson("Installed plugin list", "#/components/schemas/PluginListResponse") },
      },
    },
    "/api/forecast/latest": {
      get: {
        summary: "Get latest forecast",
        tags: ["Studio", "Forecast"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: { "200": okJson("Latest forecast data", "#/components/schemas/ForecastResponse") },
      },
    },
    "/openapi.yaml": {
      get: {
        summary: "Serve OpenAPI spec",
        tags: ["Meta"],
        responses: {
          "200": {
            description: "OpenAPI 3.1 YAML spec",
            content: { "text/yaml": { schema: { type: "string" } } },
          },
        },
      },
    },
  };
}

function studioSchemas(): Record<string, unknown> {
  return {
    ErrorResponse: {
      type: "object",
      properties: {
        error: { type: "string" },
        message: { type: "string" },
      },
      required: ["error"],
    },
    ReadinessResponse: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        reasons: { type: "array", items: { type: "string" } },
        checks: { type: "object" },
      },
      required: ["ok", "reasons", "checks"],
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
      required: ["agentId"],
    },
    DiagnosticRunRequest: {
      type: "object",
      properties: {
        agentId: { type: "string" },
        questionIds: { type: "array", items: { type: "string" } },
      },
      required: ["agentId"],
    },
    AssuranceRunRequest: {
      type: "object",
      properties: {
        agentId: { type: "string" },
        packIds: { type: "array", items: { type: "string" } },
        all: { type: "boolean" },
      },
      required: ["agentId"],
    },
    RunAcceptedResponse: {
      type: "object",
      properties: {
        accepted: { type: "boolean" },
        runId: { type: "string" },
      },
      required: ["accepted"],
    },
    RunHistoryResponse: {
      type: "object",
      properties: {
        runs: { type: "array", items: { type: "object" } },
      },
      required: ["runs"],
    },
    CgxGraphResponse: {
      type: "object",
      properties: {
        nodes: { type: "array", items: { type: "object" } },
        edges: { type: "array", items: { type: "object" } },
      },
      required: ["nodes", "edges"],
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
      required: ["leaseId", "token", "agentId", "scopes", "expiresAt"],
    },
    LeaseRevocationResponse: {
      type: "object",
      properties: {
        revoked: { type: "boolean" },
        leaseId: { type: "string" },
      },
      required: ["revoked", "leaseId"],
    },
    ApprovalListResponse: {
      type: "object",
      properties: {
        approvals: { type: "array", items: { type: "object" } },
      },
      required: ["approvals"],
    },
    DecisionResponse: {
      type: "object",
      properties: {
        recorded: { type: "boolean" },
      },
      required: ["recorded"],
    },
    PluginListResponse: {
      type: "object",
      properties: {
        plugins: { type: "array", items: { type: "object" } },
      },
      required: ["plugins"],
    },
    ForecastResponse: {
      type: "object",
      properties: {
        forecast: { type: "object" },
      },
      required: ["forecast"],
    },
  };
}

function gatewayEndpoints(): Record<string, Record<string, OpenApiOperation>> {
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
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description: "Provider-specific payload forwarded by gateway.",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Proxied provider response",
            content: { "application/json": { schema: { type: "object" } } },
          },
          "401": errJson("Invalid or missing lease"),
          "403": errJson("Scope/route denied"),
        },
      },
    },
  };
}

function extractPathParams(path: string): string[] {
  const out: string[] = [];
  const matches = path.matchAll(/\{([^}]+)\}/g);
  for (const m of matches) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

/**
 * Perform lightweight consistency checks against the generated OpenAPI contract.
 */
export function validateOpenApiContractConsistency(spec: OpenApiSpec): OpenApiContractIssue[] {
  const issues: OpenApiContractIssue[] = [];
  const schemas = spec.components?.schemas ?? {};
  const schemaNames = new Set(Object.keys(schemas));

  const json = JSON.stringify(spec);
  const refs = [...json.matchAll(/"\$ref":"#\/components\/schemas\/([^"}]+)"/g)].map((m) => m[1]);
  for (const refName of refs) {
    if (!refName || !schemaNames.has(refName)) {
      issues.push({
        severity: "error",
        code: "missing_schema_ref",
        message: `Schema reference not found: ${String(refName)}`,
      });
    }
  }

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const [method, operationUnknown] of Object.entries(pathItem)) {
      const operation = operationUnknown as OpenApiOperation;
      const pathParams = new Set(extractPathParams(path));
      const declaredParams = new Set(
        (operation.parameters ?? [])
          .filter((p) => p.in === "path")
          .map((p) => String(p.name))
      );

      for (const name of pathParams) {
        if (!declaredParams.has(name)) {
          issues.push({
            severity: "error",
            code: "missing_path_param",
            path,
            method,
            message: `Path parameter '{${name}}' is not declared in operation parameters`,
          });
        }
      }

      if (!operation.responses || Object.keys(operation.responses).length === 0) {
        issues.push({
          severity: "error",
          code: "missing_responses",
          path,
          method,
          message: "Operation must declare at least one response",
        });
      }

      if (operation.security && operation.security.length > 0) {
        const responses = operation.responses ?? {};
        if (!responses["401"] && !responses["403"]) {
          issues.push({
            severity: "warning",
            code: "secured_endpoint_missing_auth_error",
            path,
            method,
            message: "Secured operation should usually document 401 and/or 403 responses",
          });
        }
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Full spec generator
// ---------------------------------------------------------------------------

/**
 * Generate a comprehensive OpenAPI 3.1 spec covering Studio, Bridge, and Gateway.
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
      version: "1.1.0",
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
    } as OpenApiSpec["components"] & { securitySchemes: Record<string, unknown> },
  };
}

/**
 * Render the spec as YAML.
 */
export function renderOpenApiYaml(): string {
  return YAML.stringify(generateFullOpenApiSpec(), { lineWidth: 120 });
}

/**
 * CLI handler for `amc openapi-generate`.
 */
export function openapiGenerateCli(options: { out?: string }): { path: string | null; spec: OpenApiSpec } {
  const spec = generateFullOpenApiSpec();

  if (options.out) {
    const { writeFileSync } = require("node:fs") as typeof import("node:fs");
    const { dirname } = require("node:path") as typeof import("node:path");
    const { mkdirSync } = require("node:fs") as typeof import("node:fs");
    try {
      mkdirSync(dirname(options.out), { recursive: true });
    } catch {
      // ignore
    }

    if (options.out.endsWith(".yaml") || options.out.endsWith(".yml")) {
      writeFileSync(options.out, renderOpenApiYaml(), "utf8");
    } else {
      writeFileSync(options.out, JSON.stringify(spec, null, 2), "utf8");
    }
    return { path: options.out, spec };
  }

  return { path: null, spec };
}
