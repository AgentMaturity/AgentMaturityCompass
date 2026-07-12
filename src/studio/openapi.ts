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
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
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
    "/onboarding/status": {
      get: {
        summary: "Read setup detail and verified first-run activation outcomes",
        tags: ["Studio", "Watch", "Enforce"],
        security: [{ adminToken: [] }, { sessionCookie: [] }, { agentToken: [] }],
        parameters: [
          { name: "agentId", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": okJson("Workspace setup state and read-only activation projection", "#/components/schemas/OnboardingStatusResponse"),
          "400": errJson("Invalid agent ID"),
          "401": errJson("Unauthorized"),
          "403": errJson("Agent scope denied"),
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
    "/runs/{runId}/report": {
      get: {
        summary: "Load a diagnostic report with derived evidence readiness",
        tags: ["Studio", "Diagnostic", "Score", "Vault"],
        parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string" } }],
        security: [{ adminToken: [] }, { sessionCookie: [] }, { agentToken: [] }],
        responses: {
          "200": okJson("Diagnostic report", "#/components/schemas/DiagnosticReport"),
          "403": errJson("Agent scope does not include this report"),
          "404": errJson("Diagnostic report not found"),
        },
      },
    },
    "/api/v1/score/evidence-drilldown/{runId}/{questionId}": {
      get: {
        summary: "Load a UI-ready Score evidence drilldown",
        tags: ["Studio", "Score", "Shield", "Watch"],
        parameters: [
          { name: "runId", in: "path", required: true, schema: { type: "string" } },
          { name: "questionId", in: "path", required: true, schema: { type: "string" } },
          { name: "agentId", in: "query", required: false, schema: { type: "string", default: "default" } },
        ],
        responses: {
          "200": okJson("Evidence drilldown with source artifact links, evidence previews, and fail-closed empty/error state metadata", "#/components/schemas/ScoreEvidenceDrilldownResponse"),
          "404": errJson("Evidence drilldown not found"),
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
    "/approvals/requests": {
      get: {
        summary: "List canonical approval requests",
        tags: ["Studio", "Approvals", "Enforce"],
        parameters: [
          { name: "agentId", in: "query", required: false, schema: { type: "string" } },
          {
            name: "status",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["PENDING", "QUORUM_MET", "DENIED", "EXPIRED", "CANCELLED", "CONSUMED"]
            }
          }
        ],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: {
          "200": okJson("List of canonical approval requests", "#/components/schemas/ApprovalListResponse"),
          "401": errJson("Unauthorized")
        },
      },
    },
    "/approvals/requests/{id}": {
      get: {
        summary: "Get a canonical approval request",
        tags: ["Studio", "Approvals", "Enforce"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: {
          "200": okJson("Canonical approval request", "#/components/schemas/ApprovalDetailResponse"),
          "401": errJson("Unauthorized"),
          "404": errJson("Approval request not found")
        }
      }
    },
    "/approvals/requests/{id}/decide": {
      post: {
        summary: "Record a canonical approval decision",
        tags: ["Studio", "Approvals", "Enforce"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  decision: { type: "string", enum: ["APPROVE_EXECUTE", "APPROVE_SIMULATE", "DENY"] },
                  mode: { type: "string", enum: ["SIMULATE", "EXECUTE"] },
                  reason: { type: "string", minLength: 1, maxLength: 1000 },
                },
                required: ["decision"],
              },
            },
          },
        },
        responses: {
          "200": okJson("Decision recorded", "#/components/schemas/DecisionResponse"),
          "400": errJson("Invalid decision"),
          "401": errJson("Unauthorized"),
          "403": errJson("Reviewer role is not allowed"),
          "409": errJson("Approval request is no longer pending")
        },
      },
    },
    "/approvals/requests/{id}/cancel": {
      post: {
        summary: "Cancel a pending canonical approval request",
        tags: ["Studio", "Approvals", "Enforce"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: {
          "200": okJson("Approval request cancelled", "#/components/schemas/ApprovalCancelResponse"),
          "401": errJson("Unauthorized"),
          "403": errJson("Owner role required"),
          "404": errJson("Approval request not found"),
          "409": errJson("Approval request is no longer pending")
        }
      },
    },
    "/api/v1/adapters/capability-receipts": {
      post: {
        summary: "Issue a signed adapter capability receipt",
        tags: ["Studio", "Adapters", "Passport"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  agentId: { type: "string" },
                  adapterId: { type: "string" },
                },
                required: ["adapterId"],
              },
            },
          },
        },
        responses: {
          "201": okJson("Signed declaration, effective-state, lossiness, and verification receipt", "#/components/schemas/AdapterCapabilityReceiptResponse"),
          "400": errJson("Invalid adapter receipt request"),
          "401": errJson("Unauthorized"),
          "404": errJson("Adapter not found"),
        },
      },
    },
    "/api/v1/policy/controls": {
      get: {
        summary: "Project existing signed controls as Scope, When, Then, and Status",
        tags: ["Studio", "Enforce", "Policy"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: {
          "200": okJson("Read-only verified control projection", "#/components/schemas/ControlProjectionResponse"),
          "401": errJson("Unauthorized"),
          "500": errJson("Control projection failed"),
        },
      },
    },
    "/api/v1/policy/action/evidence-logic": {
      get: {
        summary: "Inspect declared Action Policy evidence gates and effective logic",
        tags: ["Studio", "Enforce", "Policy"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        parameters: [{
          name: "actionClass",
          in: "query",
          required: true,
          schema: { $ref: "#/components/schemas/ActionClass" },
        }],
        responses: {
          "200": okJson("Read-only evidence-logic inspection", "#/components/schemas/ActionEvidenceLogicInspectionResponse"),
          "400": errJson("Unknown Action Policy rule"),
          "401": errJson("Unauthorized"),
          "409": errJson("Current signed Action Policy baseline is untrusted or changed"),
          "500": errJson("Evidence-logic inspection failed"),
        },
      },
    },
    "/api/v1/policy/action/evidence-logic/compile": {
      post: {
        summary: "Compile bounded Action Policy evidence logic without writing",
        tags: ["Studio", "Enforce", "Policy"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ActionEvidenceLogicCompileRequest" } } },
        },
        responses: {
          "200": okJson("Deterministic read-only evidence-logic preview", "#/components/schemas/ActionEvidenceLogicCompilationResponse"),
          "400": errJson("Invalid tree, gate coverage, or Action Policy rule"),
          "401": errJson("Unauthorized"),
          "409": errJson("Current signed Action Policy baseline is untrusted or changed"),
          "500": errJson("Evidence-logic compilation failed"),
        },
      },
    },
    "/api/v1/policy/action/evidence-logic/apply": {
      post: {
        summary: "Apply Action Policy evidence logic after exact confirmation",
        tags: ["Studio", "Enforce", "Policy"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ActionEvidenceLogicApplyRequest" } } },
        },
        responses: {
          "200": okJson("No-op or signed evidence-logic apply result", "#/components/schemas/ActionEvidenceLogicApplyResponse"),
          "400": errJson("Invalid tree, gate coverage, or Action Policy rule"),
          "401": errJson("Unauthorized"),
          "403": errJson("Owner role required or read-only mode active"),
          "409": errJson("Exact compile confirmation, acknowledgement, or trusted baseline is unavailable"),
          "423": errJson("Another Action Policy evidence-logic operation holds the writer lock"),
          "500": errJson("Policy write, sign, or post-verification failed"),
        },
      },
    },
    "/api/v1/policy/scope-templates": {
      get: {
        summary: "List immutable AMC action-class scope templates",
        tags: ["Studio", "Enforce", "Fleet", "Policy"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        responses: {
          "200": okJson("Bounded scope template catalog", "#/components/schemas/ScopeTemplateCatalogResponse"),
          "401": errJson("Unauthorized"),
          "500": errJson("Scope template catalog unavailable"),
        },
      },
    },
    "/api/v1/policy/scope-templates/compile": {
      post: {
        summary: "Compile a selected action-class scope without writing policy",
        tags: ["Studio", "Enforce", "Fleet", "Policy"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ScopeTemplateCompileRequest" } } },
        },
        responses: {
          "200": okJson("Deterministic read-only scope preview", "#/components/schemas/ScopeTemplateCompilationResponse"),
          "400": errJson("Unknown template, Policy Pack, or invalid policy schema"),
          "401": errJson("Unauthorized"),
          "409": errJson("Current signed policy baseline is untrusted or changed"),
          "500": errJson("Scope template compilation failed"),
        },
      },
    },
    "/api/v1/policy/scope-templates/apply": {
      post: {
        summary: "Apply a scope preview after exact compile-ID confirmation",
        tags: ["Studio", "Enforce", "Fleet", "Policy"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ScopeTemplateApplyRequest" } } },
        },
        responses: {
          "200": okJson("No-op or signed scope apply result", "#/components/schemas/ScopeTemplateApplyResponse"),
          "400": errJson("Unknown template, Policy Pack, or invalid policy schema"),
          "401": errJson("Unauthorized"),
          "403": errJson("Owner role required or read-only mode active"),
          "409": errJson("Exact compile confirmation or trusted baseline is unavailable"),
          "423": errJson("Another policy scope operation holds the writer lock"),
          "500": errJson("Policy write, sign, or post-verification failed"),
        },
      },
    },
    "/api/v1/enforce/resources/status": {
      get: {
        summary: "Read the signed active, previous, rollback, drift, and integrity state",
        tags: ["Studio", "Enforce"],
        security: [{ adminToken: [] }, { sessionCookie: [] }, { agentToken: [] }],
        parameters: [
          { name: "agentId", in: "query", required: false, schema: { type: "string", default: "default" } },
        ],
        responses: {
          "200": okJson("Bounded signed resource lifecycle status", "#/components/schemas/EnforceResourceLifecycleStatusResponse"),
          "401": errJson("Unauthorized"),
        },
      },
    },
    "/api/v1/enforce/resources/verify": {
      get: {
        summary: "Verify a canonical signed resource manifest against current workspace state",
        tags: ["Studio", "Enforce"],
        security: [{ adminToken: [] }, { sessionCookie: [] }, { agentToken: [] }],
        parameters: [
          { name: "agentId", in: "query", required: false, schema: { type: "string", default: "default" } },
          { name: "manifestPath", in: "query", required: false, schema: { type: "string", description: "Workspace-relative canonical manifest reference" } },
        ],
        responses: {
          "200": okJson("Manifest and workspace state match", "#/components/schemas/EnforceResourceVerificationResponse"),
          "401": errJson("Unauthorized"),
          "409": errJson("Manifest integrity failed or workspace drift was detected"),
        },
      },
    },
    "/api/v1/enforce/resources/apply": {
      post: {
        summary: "Preview or activate the current resource state; dry-run by default",
        tags: ["Studio", "Enforce"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { $ref: "#/components/schemas/EnforceResourceApplyRequest" } } },
        },
        responses: {
          "200": okJson("Activation preview", "#/components/schemas/EnforceResourceMutationResponse"),
          "201": okJson("Signed resource version activated", "#/components/schemas/EnforceResourceMutationResponse"),
          "400": errJson("Exact activation manifest confirmation required"),
          "401": errJson("Unauthorized"),
          "403": errJson("Owner role required"),
          "409": errJson("Resource integrity or lifecycle gate failed"),
        },
      },
    },
    "/api/v1/enforce/resources/rollback": {
      post: {
        summary: "Preview or activate a canonical signed rollback target; dry-run by default",
        tags: ["Studio", "Enforce"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { $ref: "#/components/schemas/EnforceResourceRollbackRequest" } } },
        },
        responses: {
          "200": okJson("Rollback preview or signed rollback result", "#/components/schemas/EnforceResourceMutationResponse"),
          "400": errJson("Exact rollback manifest confirmation required"),
          "401": errJson("Unauthorized"),
          "403": errJson("Owner role required"),
          "409": errJson("Manifest, signature, snapshot, digest, or race integrity failed"),
        },
      },
    },
    "/api/v1/policy/simulate": {
      post: {
        summary: "Simulate one projected control through its production evaluator without recording",
        tags: ["Studio", "Enforce", "Policy"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ControlSimulationRequest" } },
          },
        },
        responses: {
          "200": okJson("Read-only evaluator-backed control simulation", "#/components/schemas/ControlSimulationResponse"),
          "400": errJson("Invalid control simulation request"),
          "401": errJson("Unauthorized"),
          "500": errJson("Control simulation failed"),
        },
      },
    },
    "/api/v1/watch/hook-actions/{actionId}": {
      get: {
        summary: "Verify one provider hook action lifecycle",
        tags: ["Studio", "Watch", "Hooks"],
        security: [{ adminToken: [] }, { sessionCookie: [] }],
        parameters: [
          { name: "actionId", in: "path", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } },
          { name: "agentId", in: "query", required: false, schema: { type: "string", default: "default", minLength: 1, maxLength: 160 } },
        ],
        responses: {
          "200": okJson("Verified request, decision, and terminal lifecycle projection", "#/components/schemas/HookActionLifecycleResponse"),
          "400": errJson("Invalid agent or action identifier"),
          "401": errJson("Unauthorized"),
        },
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
    OnboardingSetupDetail: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemaVersion: { type: "string", const: "2026-05-22" },
        agentId: { type: "string" },
        mode: { type: "string", enum: ["cli", "studio"] },
        status: { type: "string", enum: ["not_started", "in_progress", "complete", "failed"] },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        provider: { oneOf: [{ type: "string" }, { type: "null" }] },
        detectedFrameworks: { type: "array", items: { type: "string" } },
        refs: {
          type: "object",
          additionalProperties: false,
          properties: {
            runId: { oneOf: [{ type: "string" }, { type: "null" }] },
            reportReady: { type: "boolean" },
            lifecycleReady: { type: "boolean" },
            episodeReady: { type: "boolean" },
            studioEvidenceReady: { type: "boolean" },
          },
          required: ["runId", "reportReady", "lifecycleReady", "episodeReady", "studioEvidenceReady"],
        },
        steps: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string", enum: ["detect", "workspace", "provider", "score", "studio"] },
              label: { type: "string" },
              status: { type: "string", enum: ["pending", "running", "complete", "skipped", "failed"] },
              summary: { oneOf: [{ type: "string" }, { type: "null" }] },
              updatedAt: { oneOf: [{ type: "string", format: "date-time" }, { type: "null" }] },
            },
            required: ["id", "label", "status", "summary", "updatedAt"],
          },
        },
        errorPresent: { type: "boolean" },
      },
      required: ["schemaVersion", "agentId", "mode", "status", "createdAt", "updatedAt", "provider", "detectedFrameworks", "refs", "steps", "errorPresent"],
    },
    OnboardingActivationEvidenceRef: {
      type: "object",
      additionalProperties: false,
      properties: {
        eventId: { type: "string" },
        eventType: { type: "string", enum: ["llm_request", "tool_action", "audit"] },
        receiptId: { type: "string" },
        receiptSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        observedAt: { type: "string", format: "date-time" },
        source: { type: "string", enum: ["gateway", "hook", "hook_control", "toolhub"] },
        studioPath: { type: "string", pattern: "^/console/evidence\\?" },
      },
      required: ["eventId", "eventType", "receiptId", "receiptSha256", "observedAt", "source", "studioPath"],
    },
    OnboardingActivationMilestone: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", enum: ["connected_agent", "observed_action", "control_decision", "signed_proof"] },
        label: { type: "string" },
        status: { type: "string", enum: ["WAITING", "READY", "COMPLETE", "BLOCKED"] },
        summary: { type: "string" },
        evidence: {
          oneOf: [
            { $ref: "#/components/schemas/OnboardingActivationEvidenceRef" },
            { type: "null" },
          ],
        },
      },
      required: ["id", "label", "status", "summary", "evidence"],
    },
    OnboardingActivation: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemaVersion: { type: "string", const: "2026-07-11" },
        agentId: { type: "string" },
        status: { type: "string", enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "BLOCKED"] },
        progress: {
          type: "object",
          additionalProperties: false,
          properties: {
            completed: { type: "integer", minimum: 0, maximum: 4 },
            total: { type: "integer", const: 4 },
            percent: { type: "integer", minimum: 0, maximum: 100 },
          },
          required: ["completed", "total", "percent"],
        },
        milestones: {
          type: "array",
          minItems: 4,
          maxItems: 4,
          items: { $ref: "#/components/schemas/OnboardingActivationMilestone" },
        },
        nextAction: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: { label: { type: "string" }, command: { type: "string" } },
              required: ["label", "command"],
            },
            { type: "null" },
          ],
        },
        integrity: {
          type: "object",
          additionalProperties: false,
          properties: {
            valid: { type: "boolean" },
            reasonCodes: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "ADAPTER_CONFIG_INVALID",
                  "EVIDENCE_CHAIN_INVALID",
                  "EVIDENCE_METADATA_INVALID",
                  "EVIDENCE_RECEIPT_INVALID",
                  "HOOK_AGENT_MISMATCH",
                  "HOOK_INTEGRATION_INVALID",
                ],
              },
            },
          },
          required: ["valid", "reasonCodes"],
        },
        claimBoundary: { type: "string" },
      },
      required: ["schemaVersion", "agentId", "status", "progress", "milestones", "nextAction", "integrity", "claimBoundary"],
    },
    OnboardingStatusResponse: {
      type: "object",
      additionalProperties: false,
      properties: {
        state: { $ref: "#/components/schemas/OnboardingSetupDetail" },
        activation: { $ref: "#/components/schemas/OnboardingActivation" },
      },
      required: ["state", "activation"],
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
            status: { type: "string", enum: ["VALID", "INVALID", "UNSIGNED"], description: "Artifact status, not evidence sufficiency." },
            evidenceStatus: { type: "string", enum: ["READY", "LIMITED", "INSUFFICIENT_EVIDENCE", "UNVERIFIED"] },
            claimEligible: { type: "boolean" },
          },
        },
      },
      required: ["agentId"],
    },
    AdapterCapabilityReceiptResponse: {
      type: "object",
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        data: {
          type: "object",
          additionalProperties: false,
          properties: {
            receipt: {
              type: "object",
              additionalProperties: false,
              properties: {
                receiptVersion: { type: "string", const: "amc.adapter-capability-receipt.v1" },
                receiptId: { type: "string" },
                issuedAt: { type: "string", format: "date-time" },
                subject: { type: "object" },
                adapter: { type: "object" },
                inspection: { type: "object" },
                effective: { type: "object" },
                verification: {
                  type: "object",
                  properties: {
                    status: { type: "string", enum: ["verified", "partial", "fail_closed"] },
                    reasons: { type: "array", items: { type: "string" } },
                  },
                  required: ["status", "reasons"],
                },
                receiptHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
                signature: { type: "object" },
              },
              required: [
                "receiptVersion",
                "receiptId",
                "issuedAt",
                "subject",
                "adapter",
                "inspection",
                "effective",
                "verification",
                "receiptHash",
                "signature",
              ],
            },
          },
          required: ["receipt"],
        },
      },
      required: ["ok", "data"],
    },
    ControlProjectionSource: {
      type: "object",
      additionalProperties: false,
      properties: {
        sourceId: { type: "string", enum: ["runtime-firewall-policy", "guardrail-control-state", "action-policy", "approval-policy"] },
        ownerModule: { type: "string" },
        configPath: { type: "string" },
        signaturePath: { type: "string" },
        integrity: { type: "string", enum: ["trusted", "uninitialized", "invalid"] },
        configured: { type: "boolean" },
        revision: { type: ["integer", "null"] },
        reason: { type: "string" },
        remediation: { type: ["string", "null"] },
      },
      required: ["sourceId", "ownerModule", "configPath", "signaturePath", "integrity", "configured", "revision", "reason", "remediation"],
    },
    ProjectedControl: {
      type: "object",
      additionalProperties: false,
      properties: {
        controlId: { type: "string" },
        label: { type: "string" },
        scope: { type: "string" },
        when: { type: "array", items: { type: "string" } },
        requestedAction: { type: "string", enum: ["observe", "warn", "block", "execute", "simulate", "deny", "require_approval", "allow", "inactive", "unavailable"] },
        effectiveAction: { type: "string", enum: ["observe", "warn", "block", "execute", "simulate", "deny", "require_approval", "allow", "inactive", "unavailable"] },
        status: { type: "string", enum: ["active", "inactive", "fail_closed", "unavailable"] },
        trusted: { type: "boolean" },
        scopeTemplateIds: {
          type: "array",
          maxItems: 1,
          items: { type: "string", enum: ["read-only", "workspace-change", "release-external", "privileged-sensitive"] },
        },
        sourceRefs: { type: "array", items: { type: "string", enum: ["runtime-firewall-policy", "guardrail-control-state", "action-policy", "approval-policy"] } },
        reasons: { type: "array", items: { type: "string" } },
      },
      required: ["controlId", "label", "scope", "when", "requestedAction", "effectiveAction", "status", "trusted", "scopeTemplateIds", "sourceRefs", "reasons"],
    },
    ControlFamilyProjection: {
      type: "object",
      additionalProperties: false,
      properties: {
        familyId: { type: "string", enum: ["runtime-traffic", "action-policy", "approval-policy"] },
        label: { type: "string" },
        ownerModule: { type: "string" },
        integrity: { type: "string", enum: ["trusted", "uninitialized", "invalid"] },
        sources: { type: "array", items: { $ref: "#/components/schemas/ControlProjectionSource" } },
        controls: { type: "array", items: { $ref: "#/components/schemas/ProjectedControl" } },
        unboundGuardrails: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              category: { type: "string" },
              description: { type: "string" },
              status: { type: "string", const: "unbound" },
              reason: { type: "string" },
            },
            required: ["name", "category", "description", "status", "reason"],
          },
        },
        reasons: { type: "array", items: { type: "string" } },
      },
      required: ["familyId", "label", "ownerModule", "integrity", "sources", "controls", "unboundGuardrails", "reasons"],
    },
    ControlProjection: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemaVersion: { type: "string", const: "2026-07-11" },
        projectedAt: { type: "string", format: "date-time" },
        status: { type: "string", enum: ["trusted", "partial", "uninitialized", "fail_closed"] },
        counts: {
          type: "object",
          additionalProperties: false,
          properties: {
            families: { type: "integer", minimum: 0 },
            controls: { type: "integer", minimum: 0 },
            active: { type: "integer", minimum: 0 },
            inactive: { type: "integer", minimum: 0 },
            failClosed: { type: "integer", minimum: 0 },
            unavailable: { type: "integer", minimum: 0 },
            trusted: { type: "integer", minimum: 0 },
            unboundGuardrails: { type: "integer", minimum: 0 },
          },
          required: ["families", "controls", "active", "inactive", "failClosed", "unavailable", "trusted", "unboundGuardrails"],
        },
        families: { type: "array", items: { $ref: "#/components/schemas/ControlFamilyProjection" } },
        reasons: { type: "array", items: { type: "string" } },
      },
      required: ["schemaVersion", "projectedAt", "status", "counts", "families", "reasons"],
    },
    ControlProjectionResponse: {
      type: "object",
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        data: { $ref: "#/components/schemas/ControlProjection" },
      },
      required: ["ok", "data"],
    },
    ActionClass: {
      type: "string",
      enum: ["READ_ONLY", "WRITE_LOW", "WRITE_HIGH", "DEPLOY", "SECURITY", "FINANCIAL", "NETWORK_EXTERNAL", "DATA_EXPORT", "IDENTITY"],
    },
    PolicyEvidenceLogic: {
      description: "Strict gate/all/any tree. The server additionally enforces depth 6, 64 total nodes, 16 children per group, 8,192 serialized bytes, and at most 60 declared gates.",
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: { gate: { type: "string", pattern: "^(maturity|assurance):(?:[A-Za-z0-9][A-Za-z0-9._-]*|~[a-f0-9]{64})$", maxLength: 128 } },
          required: ["gate"],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: { all: { type: "array", minItems: 2, maxItems: 16, items: { $ref: "#/components/schemas/PolicyEvidenceLogic" } } },
          required: ["all"],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: { any: { type: "array", minItems: 2, maxItems: 16, items: { $ref: "#/components/schemas/PolicyEvidenceLogic" } } },
          required: ["any"],
        },
      ],
    },
    ActionEvidenceGate: {
      type: "object",
      additionalProperties: false,
      properties: {
        gateId: { type: "string", maxLength: 128 },
        family: { type: "string", enum: ["maturity", "assurance"] },
        label: { type: "string" },
      },
      required: ["gateId", "family", "label"],
    },
    ActionEvidencePolicyHash: {
      type: "object",
      additionalProperties: false,
      properties: { actionPolicySha256: { type: "string", pattern: "^[a-f0-9]{64}$" } },
      required: ["actionPolicySha256"],
    },
    ActionEvidenceLogicCompileRequest: {
      type: "object",
      additionalProperties: false,
      properties: {
        actionClass: { $ref: "#/components/schemas/ActionClass" },
        logic: { $ref: "#/components/schemas/PolicyEvidenceLogic" },
      },
      required: ["actionClass", "logic"],
    },
    ActionEvidenceLogicApplyRequest: {
      type: "object",
      additionalProperties: false,
      properties: {
        actionClass: { $ref: "#/components/schemas/ActionClass" },
        logic: { $ref: "#/components/schemas/PolicyEvidenceLogic" },
        confirmCompileId: { type: "string", pattern: "^action-logic-compile-[a-f0-9]{16}$" },
        acknowledgeAlternatives: { type: "boolean", default: false },
      },
      required: ["actionClass", "logic", "confirmCompileId", "acknowledgeAlternatives"],
    },
    ActionEvidenceLogicInspection: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemaVersion: { type: "string", const: "2026-07-11" },
        actionClass: { $ref: "#/components/schemas/ActionClass" },
        configured: { type: "boolean" },
        gateCount: { type: "integer", minimum: 0, maximum: 60 },
        gates: { type: "array", maxItems: 60, items: { $ref: "#/components/schemas/ActionEvidenceGate" } },
        effectiveLogic: { oneOf: [{ $ref: "#/components/schemas/PolicyEvidenceLogic" }, { type: "null" }] },
        effectiveLogicSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        hasAlternatives: { type: "boolean" },
        mandatoryGates: { type: "array", minItems: 9, maxItems: 9, items: { type: "string" } },
        baseline: { $ref: "#/components/schemas/ActionEvidencePolicyHash" },
      },
      required: ["schemaVersion", "actionClass", "configured", "gateCount", "gates", "effectiveLogic", "effectiveLogicSha256", "hasAlternatives", "mandatoryGates", "baseline"],
    },
    ActionEvidenceLogicCompilation: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemaVersion: { type: "string", const: "2026-07-11" },
        compileId: { type: "string", pattern: "^action-logic-compile-[a-f0-9]{16}$" },
        actionClass: { $ref: "#/components/schemas/ActionClass" },
        status: { type: "string", enum: ["ready", "no_changes"] },
        canApply: { type: "boolean" },
        hasAlternatives: { type: "boolean" },
        requiresAlternativeAcknowledgement: { type: "boolean" },
        gateCount: { type: "integer", minimum: 1, maximum: 60 },
        gates: { type: "array", minItems: 1, maxItems: 60, items: { $ref: "#/components/schemas/ActionEvidenceGate" } },
        mandatoryGates: { type: "array", minItems: 9, maxItems: 9, items: { type: "string" } },
        baseline: { $ref: "#/components/schemas/ActionEvidencePolicyHash" },
        candidate: { $ref: "#/components/schemas/ActionEvidencePolicyHash" },
        logic: {
          type: "object",
          additionalProperties: false,
          properties: {
            configuredBefore: { type: "boolean" },
            current: { oneOf: [{ $ref: "#/components/schemas/PolicyEvidenceLogic" }, { type: "null" }] },
            candidate: { oneOf: [{ $ref: "#/components/schemas/PolicyEvidenceLogic" }, { type: "null" }] },
            currentSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
            candidateSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
          },
          required: ["configuredBefore", "current", "candidate", "currentSha256", "candidateSha256"],
        },
      },
      required: ["schemaVersion", "compileId", "actionClass", "status", "canApply", "hasAlternatives", "requiresAlternativeAcknowledgement", "gateCount", "gates", "mandatoryGates", "baseline", "candidate", "logic"],
    },
    ActionEvidenceLogicApplyResult: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemaVersion: { type: "string", const: "2026-07-11" },
        applied: { type: "boolean" },
        reason: { type: ["string", "null"], enum: ["NO_CHANGES", null] },
        compileId: { type: "string", pattern: "^action-logic-compile-[a-f0-9]{16}$" },
        compilation: { $ref: "#/components/schemas/ActionEvidenceLogicCompilation" },
        transparencyHash: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
        auditEventId: { type: ["string", "null"] },
      },
      required: ["schemaVersion", "applied", "reason", "compileId", "compilation", "transparencyHash", "auditEventId"],
    },
    ActionEvidenceLogicInspectionResponse: {
      type: "object",
      additionalProperties: false,
      properties: { ok: { type: "boolean", const: true }, data: { $ref: "#/components/schemas/ActionEvidenceLogicInspection" } },
      required: ["ok", "data"],
    },
    ActionEvidenceLogicCompilationResponse: {
      type: "object",
      additionalProperties: false,
      properties: { ok: { type: "boolean", const: true }, data: { $ref: "#/components/schemas/ActionEvidenceLogicCompilation" } },
      required: ["ok", "data"],
    },
    ActionEvidenceLogicApplyResponse: {
      type: "object",
      additionalProperties: false,
      properties: { ok: { type: "boolean", const: true }, data: { $ref: "#/components/schemas/ActionEvidenceLogicApplyResult" } },
      required: ["ok", "data"],
    },
    ScopeTemplate: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemaVersion: { type: "string", const: "2026-07-11" },
        templateId: { type: "string", enum: ["read-only", "workspace-change", "release-external", "privileged-sensitive"] },
        version: { type: "integer", const: 1 },
        label: { type: "string", minLength: 1, maxLength: 80 },
        description: { type: "string", minLength: 1, maxLength: 240 },
        actionClasses: {
          type: "array",
          minItems: 1,
          maxItems: 9,
          uniqueItems: true,
          items: { type: "string", enum: ["READ_ONLY", "WRITE_LOW", "WRITE_HIGH", "DEPLOY", "SECURITY", "FINANCIAL", "NETWORK_EXTERNAL", "DATA_EXPORT", "IDENTITY"] },
        },
      },
      required: ["schemaVersion", "templateId", "version", "label", "description", "actionClasses"],
    },
    ScopeTemplateCompileRequest: {
      type: "object",
      additionalProperties: false,
      properties: {
        templateId: { type: "string", enum: ["read-only", "workspace-change", "release-external", "privileged-sensitive"] },
        packId: { type: "string", pattern: "^[a-z0-9][a-z0-9.-]*$", maxLength: 120 },
      },
      required: ["templateId", "packId"],
    },
    ScopeTemplateApplyRequest: {
      type: "object",
      additionalProperties: false,
      properties: {
        templateId: { type: "string", enum: ["read-only", "workspace-change", "release-external", "privileged-sensitive"] },
        packId: { type: "string", pattern: "^[a-z0-9][a-z0-9.-]*$", maxLength: 120 },
        confirmCompileId: { type: "string", pattern: "^scope-compile-[a-f0-9]{16}$" },
      },
      required: ["templateId", "packId", "confirmCompileId"],
    },
    ScopeTemplatePolicyChange: {
      type: "object",
      additionalProperties: false,
      properties: {
        actionClass: { type: "string", enum: ["READ_ONLY", "WRITE_LOW", "WRITE_HIGH", "DEPLOY", "SECURITY", "FINANCIAL", "NETWORK_EXTERNAL", "DATA_EXPORT", "IDENTITY"] },
        actionPolicy: { $ref: "#/components/schemas/ScopeTemplatePolicyChangeCell" },
        approvalPolicy: { $ref: "#/components/schemas/ScopeTemplatePolicyChangeCell" },
      },
      required: ["actionClass", "actionPolicy", "approvalPolicy"],
    },
    ScopeTemplatePolicyChangeCell: {
      type: "object",
      additionalProperties: false,
      properties: {
        changed: { type: "boolean" },
        beforeSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        afterSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
      },
      required: ["changed", "beforeSha256", "afterSha256"],
    },
    ScopeTemplateCompilation: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemaVersion: { type: "string", const: "2026-07-11" },
        compileId: { type: "string", pattern: "^scope-compile-[a-f0-9]{16}$" },
        scope: { type: "string", const: "workspace" },
        fleetBoundary: { type: "string" },
        template: { $ref: "#/components/schemas/ScopeTemplate" },
        pack: {
          type: "object",
          additionalProperties: false,
          properties: {
            packId: { type: "string" },
            name: { type: "string" },
            riskTier: { type: "string", enum: ["low", "medium", "high", "critical"] },
          },
          required: ["packId", "name", "riskTier"],
        },
        status: { type: "string", enum: ["ready", "no_changes"] },
        canApply: { type: "boolean" },
        baseline: { $ref: "#/components/schemas/ScopeTemplatePolicyHashes" },
        candidate: { $ref: "#/components/schemas/ScopeTemplatePolicyHashes" },
        changes: { type: "array", minItems: 1, maxItems: 4, items: { $ref: "#/components/schemas/ScopeTemplatePolicyChange" } },
      },
      required: ["schemaVersion", "compileId", "scope", "fleetBoundary", "template", "pack", "status", "canApply", "baseline", "candidate", "changes"],
    },
    ScopeTemplatePolicyHashes: {
      type: "object",
      additionalProperties: false,
      properties: {
        actionPolicySha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        approvalPolicySha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
      },
      required: ["actionPolicySha256", "approvalPolicySha256"],
    },
    ScopeTemplateApplyResult: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemaVersion: { type: "string", const: "2026-07-11" },
        applied: { type: "boolean" },
        reason: { type: ["string", "null"], enum: ["NO_CHANGES", null] },
        compileId: { type: "string", pattern: "^scope-compile-[a-f0-9]{16}$" },
        compilation: { $ref: "#/components/schemas/ScopeTemplateCompilation" },
        transparencyHash: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
        auditEventId: { type: ["string", "null"] },
      },
      required: ["schemaVersion", "applied", "reason", "compileId", "compilation", "transparencyHash", "auditEventId"],
    },
    ScopeTemplateCatalogResponse: {
      type: "object",
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        data: {
          type: "object",
          additionalProperties: false,
          properties: { templates: { type: "array", minItems: 4, maxItems: 4, items: { $ref: "#/components/schemas/ScopeTemplate" } } },
          required: ["templates"],
        },
      },
      required: ["ok", "data"],
    },
    ScopeTemplateCompilationResponse: {
      type: "object",
      additionalProperties: false,
      properties: { ok: { type: "boolean", const: true }, data: { $ref: "#/components/schemas/ScopeTemplateCompilation" } },
      required: ["ok", "data"],
    },
    ScopeTemplateApplyResponse: {
      type: "object",
      additionalProperties: false,
      properties: { ok: { type: "boolean", const: true }, data: { $ref: "#/components/schemas/ScopeTemplateApplyResult" } },
      required: ["ok", "data"],
    },
    EnforceResourceIntegrity: {
      type: "object",
      additionalProperties: false,
      properties: {
        valid: { type: "boolean" },
        reasonCodes: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "MANIFEST_MISSING",
              "MANIFEST_SCHEMA_INVALID",
              "MANIFEST_HASH_INVALID",
              "MANIFEST_ID_INVALID",
              "MANIFEST_COUNT_INVALID",
              "MANIFEST_DUPLICATE_RESOURCE",
              "MANIFEST_SIGNATURE_INVALID",
              "MANIFEST_SCOPE_INVALID",
              "MANIFEST_PATH_INVALID",
              "SNAPSHOT_MISSING",
              "SNAPSHOT_MANIFEST_INVALID",
              "SNAPSHOT_SIGNATURE_INVALID",
              "SNAPSHOT_RESOURCE_INVALID",
              "ACTIVATION_CONFIRMATION_REQUIRED",
              "ROLLBACK_CONFIRMATION_REQUIRED",
              "ROLLBACK_TARGET_MISSING",
              "ROLLBACK_STATE_CHANGED",
              "RESOURCE_STATE_CHANGED",
              "RESOURCE_STATE_BUSY",
              "RECEIPT_SIGNATURE_INVALID",
            ],
          },
        },
      },
      required: ["valid", "reasonCodes"],
    },
    EnforceResourceDiffEntry: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        kind: { type: "string" },
        path: { type: "string" },
        beforeDigest: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
        afterDigest: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
      },
      required: ["id", "kind", "path"],
    },
    EnforceResourceDiff: {
      type: "object",
      additionalProperties: false,
      properties: {
        added: { type: "array", items: { $ref: "#/components/schemas/EnforceResourceDiffEntry" } },
        removed: { type: "array", items: { $ref: "#/components/schemas/EnforceResourceDiffEntry" } },
        changed: { type: "array", items: { $ref: "#/components/schemas/EnforceResourceDiffEntry" } },
        unchanged: { type: "integer", minimum: 0 },
      },
      required: ["added", "removed", "changed", "unchanged"],
    },
    EnforceResourceVersionRef: {
      type: "object",
      additionalProperties: false,
      properties: {
        manifestId: { type: "string", pattern: "^enforce-resources-[a-f0-9]{16}$" },
        version: { type: "string" },
        resourcesSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        resourceCount: { type: "integer", minimum: 0 },
        createdAt: { type: "string", format: "date-time" },
        ref: { type: "string", description: "Workspace-relative canonical manifest reference" },
      },
      required: ["manifestId", "version", "resourcesSha256", "resourceCount", "createdAt", "ref"],
    },
    EnforceResourceLifecycleStatus: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemaVersion: { type: "string", const: "2026-07-11" },
        agentId: { type: "string" },
        state: { type: "string", enum: ["NOT_INITIALIZED", "ACTIVE", "DRIFTED", "BLOCKED"] },
        active: { oneOf: [{ $ref: "#/components/schemas/EnforceResourceVersionRef" }, { type: "null" }] },
        previous: { oneOf: [{ $ref: "#/components/schemas/EnforceResourceVersionRef" }, { type: "null" }] },
        rollbackTarget: { oneOf: [{ $ref: "#/components/schemas/EnforceResourceVersionRef" }, { type: "null" }] },
        pendingDiff: { $ref: "#/components/schemas/EnforceResourceDiff" },
        integrity: { $ref: "#/components/schemas/EnforceResourceIntegrity" },
        nextAction: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: { label: { type: "string" }, command: { type: "string" } },
              required: ["label", "command"],
            },
            { type: "null" },
          ],
        },
        claimBoundary: { type: "string" },
      },
      required: ["schemaVersion", "agentId", "state", "active", "previous", "rollbackTarget", "pendingDiff", "integrity", "nextAction", "claimBoundary"],
    },
    EnforceResourceLifecycleStatusResponse: {
      type: "object",
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        data: { $ref: "#/components/schemas/EnforceResourceLifecycleStatus" },
      },
      required: ["ok", "data"],
    },
    EnforceResourceVerificationResponse: {
      type: "object",
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        data: {
          type: "object",
          additionalProperties: false,
          properties: {
            valid: { type: "boolean" },
            manifestPath: { type: "string" },
            expectedManifestId: { type: "string" },
            currentManifestId: { type: "string" },
            diff: { $ref: "#/components/schemas/EnforceResourceDiff" },
            signature: { type: "object" },
            integrity: { $ref: "#/components/schemas/EnforceResourceIntegrity" },
          },
          required: ["valid", "manifestPath", "expectedManifestId", "currentManifestId", "diff", "signature", "integrity"],
        },
      },
      required: ["ok", "data"],
    },
    EnforceResourceApplyRequest: {
      type: "object",
      additionalProperties: false,
      properties: {
        agentId: { type: "string" },
        manifestPath: { type: "string", description: "Workspace-relative canonical baseline reference" },
        dryRun: { type: "boolean", default: true },
        force: { type: "boolean", default: false, description: "Cannot bypass signature, scope, path, schema, hash, or snapshot integrity" },
        confirmManifestId: { type: "string", pattern: "^enforce-resources-[a-f0-9]{16}$", description: "Required when dryRun is false; must equal the preview currentManifestId" },
      },
    },
    EnforceResourceRollbackRequest: {
      type: "object",
      additionalProperties: false,
      properties: {
        agentId: { type: "string" },
        manifestPath: { type: "string", description: "Workspace-relative canonical signed snapshot reference" },
        resource: { type: "string" },
        apply: { type: "boolean", default: false },
        includeImmutable: { type: "boolean", default: false },
        confirmManifestId: { type: "string", pattern: "^enforce-resources-[a-f0-9]{16}$", description: "Required when apply is true; must equal the selected targetManifestId" },
      },
    },
    EnforceResourceMutationResponse: {
      type: "object",
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        data: { type: "object", description: "Bounded activation preview/result or rollback preview/result" },
      },
      required: ["ok", "data"],
    },
    ControlSimulationRequest: {
      type: "object",
      additionalProperties: false,
      properties: {
        controlId: { type: "string", minLength: 1, maxLength: 100, description: "Control ID returned by amc policy controls" },
        content: { type: "string", minLength: 1, maxLength: 250000, description: "Runtime Firewall input; transient and never returned or recorded" },
        direction: { type: "string", enum: ["request", "response"] },
        agentId: { type: "string", minLength: 1, maxLength: 200 },
        riskTier: { type: "string", enum: ["low", "med", "high", "critical"] },
        requestedMode: { type: "string", enum: ["SIMULATE", "EXECUTE"] },
        hasExecTicket: { type: "boolean" },
      },
      required: ["controlId"],
    },
    ControlSimulationCondition: {
      type: "object",
      additionalProperties: false,
      properties: {
        conditionId: { type: "string" },
        label: { type: "string" },
        passed: { type: ["boolean", "null"] },
        actual: { type: ["string", "number", "boolean", "null"] },
        expected: { type: ["string", "number", "boolean", "null"] },
        reason: { type: "string" },
      },
      required: ["conditionId", "label", "passed", "actual", "expected", "reason"],
    },
    ControlSimulation: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemaVersion: { type: "string", const: "2026-07-11" },
        simulatedAt: { type: "string", format: "date-time" },
        familyId: { type: "string", enum: ["runtime-traffic", "action-policy", "approval-policy"] },
        controlId: { type: "string" },
        label: { type: "string" },
        sourceIntegrity: { type: "string", enum: ["trusted", "uninitialized", "invalid"] },
        evaluator: { type: "string", enum: ["runtime-firewall", "action-policy", "approval-policy"] },
        evaluatorParity: { type: "string", const: "production" },
        outcome: { type: "string", enum: ["observe", "warn", "block", "execute", "simulate", "deny", "require_approval", "allow"] },
        matched: { type: "boolean" },
        matchedRuleIds: { type: "array", items: { type: "string" } },
        matchedControlIds: { type: "array", items: { type: "string" } },
        conditions: { type: "array", items: { $ref: "#/components/schemas/ControlSimulationCondition" } },
        reasons: { type: "array", items: { type: "string" } },
        inputSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        simulationOnly: { type: "boolean", const: true },
        recorded: { type: "boolean", const: false },
        proofEligible: { type: "boolean", const: false },
        failClosed: { type: "boolean" },
      },
      required: [
        "schemaVersion", "simulatedAt", "familyId", "controlId", "label", "sourceIntegrity", "evaluator",
        "evaluatorParity", "outcome", "matched", "matchedRuleIds", "matchedControlIds", "conditions", "reasons",
        "inputSha256", "simulationOnly", "recorded", "proofEligible", "failClosed",
      ],
    },
    ControlSimulationResponse: {
      type: "object",
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        data: { $ref: "#/components/schemas/ControlSimulation" },
      },
      required: ["ok", "data"],
    },
    HookActionLifecycleResponse: {
      type: "object",
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        data: {
          type: "object",
          additionalProperties: false,
          properties: {
            schemaVersion: { type: "string", const: "2026-07-12" },
            agentId: { type: "string" },
            actionId: { type: "string" },
            provider: { type: ["string", "null"], enum: ["claude-code", "gemini-cli", null] },
            status: { type: "string", enum: ["requested", "awaiting_terminal", "completed", "failed", "denied", "steered", "fail_closed"] },
            valid: { type: "boolean" },
            failClosed: { type: "boolean" },
            reasonCodes: { type: "array", items: { type: "string" } },
            phases: {
              type: "object",
              additionalProperties: false,
              properties: {
                requested: {
                  type: "object",
                  nullable: true,
                  additionalProperties: false,
                  description: "Receipt-bound provider action request phase, or null when the request is missing.",
                  properties: {
                    eventId: { type: "string" },
                    eventHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
                    receiptId: { type: "string" },
                    receiptSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
                    observedAt: { type: "string", format: "date-time" },
                    type: { type: "string", const: "action.requested" },
                  },
                  required: ["eventId", "eventHash", "receiptId", "receiptSha256", "observedAt", "type"],
                },
                decision: {
                  type: "object",
                  nullable: true,
                  additionalProperties: false,
                  properties: {
                    eventId: { type: "string" },
                    eventHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
                    receiptId: { type: "string" },
                    receiptSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
                    observedAt: { type: "string", format: "date-time" },
                    decision: { type: "string", enum: ["allow", "deny", "ask"] },
                    requestedDecision: { type: "string", enum: ["allow", "deny", "ask", "steer"] },
                    effectiveOutcome: { type: "string", enum: ["allow", "deny", "ask", "steer"] },
                    providerMapping: { type: "string", enum: ["native", "corrective_deny", "fail_closed_deny"] },
                  },
                  required: [
                    "eventId", "eventHash", "receiptId", "receiptSha256", "observedAt",
                    "decision", "requestedDecision", "effectiveOutcome", "providerMapping",
                  ],
                },
                terminal: {
                  type: "object",
                  nullable: true,
                  additionalProperties: false,
                  description: "Receipt-bound provider terminal phase, or null when the current call was blocked or remains unresolved.",
                  properties: {
                    eventId: { type: "string" },
                    eventHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
                    receiptId: { type: "string" },
                    receiptSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
                    observedAt: { type: "string", format: "date-time" },
                    type: { type: "string", enum: ["action.completed", "action.failed", "action.denied"] },
                    status: {
                      oneOf: [
                        { type: "string", enum: ["success", "failure", "timeout", "cancelled"] },
                        { type: "null" },
                      ],
                    },
                  },
                  required: ["eventId", "eventHash", "receiptId", "receiptSha256", "observedAt", "type", "status"],
                },
              },
              required: ["requested", "decision", "terminal"],
            },
            evidenceEventIds: { type: "array", items: { type: "string" } },
            receiptIds: { type: "array", items: { type: "string" } },
            rawProviderPayloadStored: { type: "boolean", const: false },
            claimBoundary: { type: "string" },
          },
          required: ["schemaVersion", "agentId", "actionId", "provider", "status", "valid", "failClosed", "reasonCodes", "phases", "evidenceEventIds", "receiptIds", "rawProviderPayloadStored", "claimBoundary"],
        },
      },
      required: ["ok", "data"],
    },
    EvidenceReadiness: {
      type: "object",
      properties: {
        schemaVersion: { type: "string", const: "2026-07-10" },
        status: { type: "string", enum: ["READY", "LIMITED", "INSUFFICIENT_EVIDENCE", "UNVERIFIED"] },
        claimEligible: { type: "boolean" },
        label: { type: "string" },
        reasonCodes: { type: "array", items: { type: "string" } },
        claimBoundary: { type: "string" },
        nextStep: { type: "string" },
        thresholds: {
          type: "object",
          properties: {
            readyIntegrity: { type: "number", const: 0.6 },
            insufficientIntegrityBelow: { type: "number", const: 0.4 },
          },
          required: ["readyIntegrity", "insufficientIntegrityBelow"],
        },
      },
      required: ["schemaVersion", "status", "claimEligible", "label", "reasonCodes", "claimBoundary", "nextStep", "thresholds"],
    },
    DiagnosticReport: {
      type: "object",
      properties: {
        runId: { type: "string" },
        agentId: { type: "string" },
        status: { type: "string", enum: ["VALID", "INVALID", "UNSIGNED"], description: "Artifact status, not evidence sufficiency." },
        verificationPassed: { type: "boolean" },
        integrityIndex: { type: "number" },
        trustLabel: { type: "string" },
        evidenceCoverage: { type: "number" },
        evidenceReadiness: { $ref: "#/components/schemas/EvidenceReadiness" },
      },
      required: ["runId", "agentId", "status", "verificationPassed", "integrityIndex", "trustLabel", "evidenceCoverage", "evidenceReadiness"],
      additionalProperties: true,
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
    ScoreEvidenceDrilldownResponse: {
      type: "object",
      properties: {
        state: { type: "string", enum: ["ready", "empty", "error"] },
        agentId: { type: "string" },
        runId: { type: "string" },
        questionId: { type: "string" },
        surfaces: { type: "array", items: { type: "string", enum: ["Score", "Shield", "Watch"] } },
        sourceArtifacts: { type: "array", items: { type: "object" } },
        evidencePreview: { type: "object" },
        scorableStudioDrilldownPreview: { type: "array", items: { type: "object" } },
        obsStudioDrilldownPreview: { type: "array", items: { type: "object" } },
        failClosed: { type: "boolean" },
        replayable: { type: "boolean" },
      },
      required: ["state", "agentId", "runId", "questionId", "surfaces", "sourceArtifacts", "evidencePreview", "scorableStudioDrilldownPreview", "obsStudioDrilldownPreview", "failClosed", "replayable"],
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
        agentId: { type: "string" },
        requests: { type: "array", items: { type: "object" } },
      },
      required: ["agentId", "requests"],
    },
    ApprovalDetailResponse: {
      type: "object",
      properties: {
        request: { type: "object" },
        decisions: { type: "array", items: { type: "object" } },
        quorum: { type: "object" },
        status: { type: "string" },
        requestIntegrity: { type: "object" },
        contextIntegrity: { type: "object" },
        executionReady: { type: "boolean" },
      },
      required: ["request", "decisions", "quorum", "status", "requestIntegrity", "contextIntegrity", "executionReady"],
    },
    DecisionResponse: {
      type: "object",
      properties: {
        approval: { type: "object" },
        approvalDelivery: { type: "object" },
      },
      required: ["approval", "approvalDelivery"],
    },
    ApprovalCancelResponse: {
      type: "object",
      properties: {
        request: { type: "object" },
        approvalDelivery: { type: "object" },
      },
      required: ["request", "approvalDelivery"],
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
          name: "amc_session",
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
