/**
 * SDK Parity & Developer Onboarding
 *
 * Provides one-command integration scaffolds, typed schemas,
 * contract tests, and an integration simulator for safe local testing.
 *
 * Key concepts:
 * - Framework-specific scaffolds (Express, FastAPI, Flask, etc.)
 * - Drop-in middleware generators
 * - Contract tests for integration correctness
 * - Integration simulator for local testing without real providers
 * - OpenAPI spec generation for Bridge endpoints
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sha256Hex } from "../utils/hash.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IntegrationFramework =
  | "express"
  | "fastapi"
  | "flask"
  | "langchain"
  | "llamaindex"
  | "generic-http"
  | "custom";

export interface IntegrationScaffold {
  scaffoldId: string;
  framework: IntegrationFramework;
  language: "typescript" | "python" | "generic";
  files: Array<{
    path: string;
    content: string;
    description: string;
  }>;
  instructions: string[];
  createdTs: number;
}

export interface ContractTestCase {
  testId: string;
  name: string;
  description: string;
  /** HTTP method */
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Endpoint path */
  path: string;
  /** Request body (if applicable) */
  requestBody?: Record<string, unknown>;
  /** Expected status code */
  expectedStatus: number;
  /** Required response fields */
  requiredFields: string[];
  /** Response validators */
  validators: Array<{
    field: string;
    rule: "exists" | "non_empty" | "type_string" | "type_number" | "type_boolean";
  }>;
}

export interface ContractTestResult {
  testId: string;
  name: string;
  passed: boolean;
  reason: string;
  actualStatus?: number;
  missingFields: string[];
  validationErrors: string[];
}

export interface ContractTestSuite {
  suiteId: string;
  framework: IntegrationFramework;
  tests: ContractTestCase[];
  ts: number;
}

export interface SimulatorConfig {
  /** Port to run simulator on */
  port: number;
  /** Simulated latency range in ms */
  latencyRange: [number, number];
  /** Probability of simulated error (0.0-1.0) */
  errorRate: number;
  /** Available simulated models */
  availableModels: string[];
}

export interface SimulatorResponse {
  requestId: string;
  model: string;
  simulatedLatencyMs: number;
  isError: boolean;
  responseBody: Record<string, unknown>;
  ts: number;
}

export interface OpenApiEndpoint {
  path: string;
  method: string;
  summary: string;
  requestBodySchema?: Record<string, unknown>;
  responseSchema: Record<string, unknown>;
  tags: string[];
}

export interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description: string };
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Scaffold generation
// ---------------------------------------------------------------------------

/**
 * Generate an integration scaffold for a specific framework.
 */
export function generateScaffold(framework: IntegrationFramework): IntegrationScaffold {
  const generators: Record<IntegrationFramework, () => IntegrationScaffold> = {
    express: generateExpressScaffold,
    fastapi: generateFastApiScaffold,
    flask: generateFlaskScaffold,
    langchain: generateLangchainScaffold,
    llamaindex: generateLlamaIndexScaffold,
    "generic-http": generateGenericHttpScaffold,
    custom: generateCustomScaffold,
  };

  return (generators[framework] ?? generators.custom)();
}

function generateExpressScaffold(): IntegrationScaffold {
  return {
    scaffoldId: `scaffold_${randomUUID().slice(0, 12)}`,
    framework: "express",
    language: "typescript",
    files: [
      {
        path: "src/middleware/amcMiddleware.ts",
        content: [
          'import { type Request, type Response, type NextFunction } from "express";',
          "",
          "export function amcEvidenceMiddleware(bridgeUrl: string) {",
          "  return async (req: Request, res: Response, next: NextFunction) => {",
          "    const start = Date.now();",
          "    const originalSend = res.send.bind(res);",
          "    res.send = function(body: any) {",
          "      const latency = Date.now() - start;",
          "      // Log evidence to AMC bridge",
          '      fetch(`${bridgeUrl}/bridge/evidence`, {',
          '        method: "POST",',
          '        headers: { "Content-Type": "application/json" },',
          "        body: JSON.stringify({",
          '          event_type: "http_request",',
          '          session_id: req.headers["x-session-id"] ?? "unknown",',
          "          payload: { method: req.method, path: req.path, status: res.statusCode, latency },",
          "        }),",
          '      }).catch(() => { /* non-blocking */ });',
          "      return originalSend(body);",
          "    };",
          "    next();",
          "  };",
          "}",
        ].join("\n"),
        description: "Express middleware for AMC evidence collection",
      },
      {
        path: "src/middleware/amcLeaseMiddleware.ts",
        content: [
          'import { type Request, type Response, type NextFunction } from "express";',
          "",
          "export function amcLeaseMiddleware(bridgeUrl: string) {",
          "  return async (req: Request, res: Response, next: NextFunction) => {",
          '    const leaseToken = req.headers["x-amc-lease"];',
          "    if (!leaseToken) {",
          '      return res.status(401).json({ error: "Missing AMC lease token" });',
          "    }",
          "    try {",
          '      const resp = await fetch(`${bridgeUrl}/bridge/lease/verify`, {',
          '        method: "POST",',
          '        headers: { "Content-Type": "application/json" },',
          "        body: JSON.stringify({ token: leaseToken }),",
          "      });",
          "      if (!resp.ok) {",
          '        return res.status(403).json({ error: "Invalid AMC lease" });',
          "      }",
          "      next();",
          "    } catch {",
          '      return res.status(502).json({ error: "AMC bridge unavailable" });',
          "    }",
          "  };",
          "}",
        ].join("\n"),
        description: "Express middleware for AMC lease verification",
      },
    ],
    instructions: [
      "npm install @anthropic-ai/amc-sdk (when available)",
      "Import amcEvidenceMiddleware in your Express app",
      "app.use(amcEvidenceMiddleware('http://localhost:4100'))",
      "Set AMC_BRIDGE_URL environment variable",
      "Run amc up to start Studio + Bridge endpoints",
    ],
    createdTs: Date.now(),
  };
}

function generateFastApiScaffold(): IntegrationScaffold {
  return {
    scaffoldId: `scaffold_${randomUUID().slice(0, 12)}`,
    framework: "fastapi",
    language: "python",
    files: [
      {
        path: "middleware/amc_middleware.py",
        content: [
          "import httpx",
          "import time",
          "import os",
          "from fastapi import Request, Response",
          "from starlette.middleware.base import BaseHTTPMiddleware",
          "",
          "AMC_BRIDGE_URL = os.getenv('AMC_BRIDGE_URL', 'http://localhost:4100')",
          "",
          "class AMCEvidenceMiddleware(BaseHTTPMiddleware):",
          "    async def dispatch(self, request: Request, call_next):",
          "        start = time.time()",
          "        response = await call_next(request)",
          "        latency_ms = int((time.time() - start) * 1000)",
          "        # Non-blocking evidence logging",
          "        try:",
          "            async with httpx.AsyncClient() as client:",
          "                await client.post(",
          "                    f'{AMC_BRIDGE_URL}/bridge/evidence',",
          "                    json={",
          "                        'event_type': 'http_request',",
          "                        'session_id': request.headers.get('x-session-id', 'unknown'),",
          "                        'payload': {",
          "                            'method': request.method,",
          "                            'path': str(request.url.path),",
          "                            'status': response.status_code,",
          "                            'latency': latency_ms,",
          "                        },",
          "                    }",
          "                )",
          "        except Exception:",
          "            pass  # Non-blocking",
          "        return response",
        ].join("\n"),
        description: "FastAPI middleware for AMC evidence collection",
      },
    ],
    instructions: [
      "pip install httpx",
      "Import AMCEvidenceMiddleware in your FastAPI app",
      "app.add_middleware(AMCEvidenceMiddleware)",
      "Set AMC_BRIDGE_URL environment variable",
      "Run amc up to start Studio + Bridge endpoints",
    ],
    createdTs: Date.now(),
  };
}

function generateFlaskScaffold(): IntegrationScaffold {
  return {
    scaffoldId: `scaffold_${randomUUID().slice(0, 12)}`,
    framework: "flask",
    language: "python",
    files: [
      {
        path: "middleware/amc_flask.py",
        content: [
          "import requests",
          "import time",
          "import os",
          "from flask import request, g",
          "",
          "AMC_BRIDGE_URL = os.getenv('AMC_BRIDGE_URL', 'http://localhost:4100')",
          "",
          "def amc_before_request():",
          "    g.amc_start_time = time.time()",
          "",
          "def amc_after_request(response):",
          "    latency_ms = int((time.time() - getattr(g, 'amc_start_time', time.time())) * 1000)",
          "    try:",
          "        requests.post(",
          "            f'{AMC_BRIDGE_URL}/bridge/evidence',",
          "            json={",
          "                'event_type': 'http_request',",
          "                'session_id': request.headers.get('X-Session-Id', 'unknown'),",
          "                'payload': {",
          "                    'method': request.method,",
          "                    'path': request.path,",
          "                    'status': response.status_code,",
          "                    'latency': latency_ms,",
          "                },",
          "            },",
          "            timeout=1,",
          "        )",
          "    except Exception:",
          "        pass",
          "    return response",
          "",
          "def init_amc(app):",
          "    app.before_request(amc_before_request)",
          "    app.after_request(amc_after_request)",
        ].join("\n"),
        description: "Flask integration for AMC evidence collection",
      },
    ],
    instructions: [
      "pip install requests",
      "from middleware.amc_flask import init_amc",
      "init_amc(app)",
      "Set AMC_BRIDGE_URL environment variable",
      "Run amc up to start Studio + Bridge endpoints",
    ],
    createdTs: Date.now(),
  };
}

function generateLangchainScaffold(): IntegrationScaffold {
  return {
    scaffoldId: `scaffold_${randomUUID().slice(0, 12)}`,
    framework: "langchain",
    language: "python",
    files: [
      {
        path: "callbacks/amc_callback.py",
        content: [
          "import httpx",
          "import os",
          "from langchain_core.callbacks import BaseCallbackHandler",
          "from typing import Any, Dict, List",
          "",
          "AMC_BRIDGE_URL = os.getenv('AMC_BRIDGE_URL', 'http://localhost:4100')",
          "",
          "class AMCCallbackHandler(BaseCallbackHandler):",
          "    def on_llm_start(self, serialized: Dict[str, Any], prompts: List[str], **kwargs):",
          "        self._log_event('llm_start', {'model': serialized.get('name', 'unknown')})",
          "",
          "    def on_llm_end(self, response, **kwargs):",
          "        self._log_event('llm_end', {'generations': len(response.generations)})",
          "",
          "    def on_tool_start(self, serialized: Dict[str, Any], input_str: str, **kwargs):",
          "        self._log_event('tool_start', {'tool': serialized.get('name', 'unknown')})",
          "",
          "    def _log_event(self, event_type: str, payload: dict):",
          "        try:",
          "            httpx.post(",
          "                f'{AMC_BRIDGE_URL}/bridge/evidence',",
          "                json={'event_type': event_type, 'payload': payload},",
          "                timeout=1,",
          "            )",
          "        except Exception:",
          "            pass",
        ].join("\n"),
        description: "LangChain callback handler for AMC evidence collection",
      },
    ],
    instructions: [
      "pip install httpx langchain-core",
      "from callbacks.amc_callback import AMCCallbackHandler",
      "llm = ChatAnthropic(callbacks=[AMCCallbackHandler()])",
      "Set AMC_BRIDGE_URL environment variable",
    ],
    createdTs: Date.now(),
  };
}

function generateLlamaIndexScaffold(): IntegrationScaffold {
  return {
    scaffoldId: `scaffold_${randomUUID().slice(0, 12)}`,
    framework: "llamaindex",
    language: "python",
    files: [
      {
        path: "callbacks/amc_llamaindex.py",
        content: [
          "import httpx",
          "import os",
          "from llama_index.core.callbacks import CallbackManager, CBEventType, LlamaDebugHandler",
          "",
          "AMC_BRIDGE_URL = os.getenv('AMC_BRIDGE_URL', 'http://localhost:4100')",
          "",
          "class AMCLlamaIndexHandler(LlamaDebugHandler):",
          "    def on_event_start(self, event_type, payload=None, event_id='', **kwargs):",
          "        self._log('start', event_type.value, payload)",
          "        return super().on_event_start(event_type, payload, event_id, **kwargs)",
          "",
          "    def on_event_end(self, event_type, payload=None, event_id='', **kwargs):",
          "        self._log('end', event_type.value, payload)",
          "        return super().on_event_end(event_type, payload, event_id, **kwargs)",
          "",
          "    def _log(self, phase, event_type, payload):",
          "        try:",
          "            httpx.post(",
          "                f'{AMC_BRIDGE_URL}/bridge/evidence',",
          "                json={'event_type': f'llamaindex_{phase}_{event_type}', 'payload': str(payload)[:500]},",
          "                timeout=1,",
          "            )",
          "        except Exception:",
          "            pass",
        ].join("\n"),
        description: "LlamaIndex callback handler for AMC evidence collection",
      },
    ],
    instructions: [
      "pip install httpx llama-index-core",
      "from callbacks.amc_llamaindex import AMCLlamaIndexHandler",
      "callback_manager = CallbackManager([AMCLlamaIndexHandler()])",
      "Set AMC_BRIDGE_URL environment variable",
    ],
    createdTs: Date.now(),
  };
}

function generateGenericHttpScaffold(): IntegrationScaffold {
  return {
    scaffoldId: `scaffold_${randomUUID().slice(0, 12)}`,
    framework: "generic-http",
    language: "generic",
    files: [
      {
        path: "amc-integration-guide.md",
        content: [
          "# AMC Integration Guide (Generic HTTP)",
          "",
          "## Evidence Endpoint",
          "POST {AMC_BRIDGE_URL}/bridge/evidence",
          '{"event_type": "...", "session_id": "...", "payload": {...}}',
          "",
          "## Lease Verification",
          "POST {AMC_BRIDGE_URL}/bridge/lease/verify",
          '{"token": "..."}',
          "",
          "## Health Check",
          "GET {AMC_BRIDGE_URL}/bridge/health",
        ].join("\n"),
        description: "Generic HTTP integration guide",
      },
    ],
    instructions: [
      "Set AMC_BRIDGE_URL environment variable",
      "POST evidence events to /bridge/evidence",
      "Verify lease tokens via /bridge/lease/verify",
      "Run amc up to start Studio + Bridge endpoints",
    ],
    createdTs: Date.now(),
  };
}

function generateCustomScaffold(): IntegrationScaffold {
  return generateGenericHttpScaffold();
}

// ---------------------------------------------------------------------------
// Contract tests
// ---------------------------------------------------------------------------

/**
 * Generate standard contract test suite for bridge API.
 */
export function generateContractTests(): ContractTestSuite {
  return {
    suiteId: `cts_${randomUUID().slice(0, 12)}`,
    framework: "generic-http",
    tests: [
      {
        testId: "ct-health",
        name: "Health check returns OK",
        description: "Bridge health endpoint should return 200 with status",
        method: "GET",
        path: "/bridge/health",
        expectedStatus: 200,
        requiredFields: ["status"],
        validators: [{ field: "status", rule: "exists" }],
      },
      {
        testId: "ct-evidence-post",
        name: "Evidence ingestion accepts valid payload",
        description: "Evidence endpoint should accept well-formed evidence",
        method: "POST",
        path: "/bridge/evidence",
        requestBody: {
          event_type: "test",
          session_id: "test-session",
          payload: { message: "contract test" },
        },
        expectedStatus: 200,
        requiredFields: ["received"],
        validators: [{ field: "received", rule: "type_boolean" }],
      },
      {
        testId: "ct-evidence-reject",
        name: "Evidence endpoint rejects empty payload",
        description: "Should return 400 for missing required fields",
        method: "POST",
        path: "/bridge/evidence",
        requestBody: {},
        expectedStatus: 400,
        requiredFields: ["error"],
        validators: [{ field: "error", rule: "non_empty" }],
      },
      {
        testId: "ct-lease-verify",
        name: "Lease verification endpoint responds",
        description: "Should accept or reject lease tokens",
        method: "POST",
        path: "/bridge/lease/verify",
        requestBody: { token: "test-token" },
        expectedStatus: 401,
        requiredFields: ["valid"],
        validators: [{ field: "valid", rule: "type_boolean" }],
      },
    ],
    ts: Date.now(),
  };
}

/**
 * Validate a contract test result against expectations.
 */
export function validateContractTest(
  testCase: ContractTestCase,
  response: { status: number; body: Record<string, unknown> },
): ContractTestResult {
  const missingFields: string[] = [];
  const validationErrors: string[] = [];

  // Check status code
  if (response.status !== testCase.expectedStatus) {
    return {
      testId: testCase.testId,
      name: testCase.name,
      passed: false,
      reason: `Expected status ${testCase.expectedStatus}, got ${response.status}`,
      actualStatus: response.status,
      missingFields: [],
      validationErrors: [],
    };
  }

  // Check required fields
  for (const field of testCase.requiredFields) {
    if (!(field in response.body)) {
      missingFields.push(field);
    }
  }

  // Run validators
  for (const v of testCase.validators) {
    const value = response.body[v.field];
    switch (v.rule) {
      case "exists":
        if (value === undefined) validationErrors.push(`${v.field}: does not exist`);
        break;
      case "non_empty":
        if (!value || (typeof value === "string" && value.length === 0))
          validationErrors.push(`${v.field}: is empty`);
        break;
      case "type_string":
        if (typeof value !== "string") validationErrors.push(`${v.field}: not a string`);
        break;
      case "type_number":
        if (typeof value !== "number") validationErrors.push(`${v.field}: not a number`);
        break;
      case "type_boolean":
        if (typeof value !== "boolean") validationErrors.push(`${v.field}: not a boolean`);
        break;
    }
  }

  const passed = missingFields.length === 0 && validationErrors.length === 0;

  return {
    testId: testCase.testId,
    name: testCase.name,
    passed,
    reason: passed ? "All checks passed" : `${missingFields.length} missing fields, ${validationErrors.length} validation errors`,
    actualStatus: response.status,
    missingFields,
    validationErrors,
  };
}

// ---------------------------------------------------------------------------
// Integration simulator
// ---------------------------------------------------------------------------

/**
 * Default simulator configuration.
 */
export function defaultSimulatorConfig(): SimulatorConfig {
  return {
    port: 4199,
    latencyRange: [50, 500],
    errorRate: 0.05,
    availableModels: ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
  };
}

/**
 * Simulate a bridge request for local testing.
 */
export function simulateBridgeRequest(
  config: SimulatorConfig,
  request: { model: string; prompt: string },
): SimulatorResponse {
  const requestId = `sim_${randomUUID().slice(0, 12)}`;
  const [minLatency, maxLatency] = config.latencyRange;
  const latency = Math.floor(minLatency + Math.random() * (maxLatency - minLatency));
  const isError = Math.random() < config.errorRate;

  if (!config.availableModels.includes(request.model)) {
    return {
      requestId,
      model: request.model,
      simulatedLatencyMs: 0,
      isError: true,
      responseBody: { error: `Model ${request.model} not available in simulator` },
      ts: Date.now(),
    };
  }

  if (isError) {
    return {
      requestId,
      model: request.model,
      simulatedLatencyMs: latency,
      isError: true,
      responseBody: { error: "Simulated server error", status: 500 },
      ts: Date.now(),
    };
  }

  return {
    requestId,
    model: request.model,
    simulatedLatencyMs: latency,
    isError: false,
    responseBody: {
      id: requestId,
      model: request.model,
      content: `[Simulated response to: ${request.prompt.slice(0, 50)}...]`,
      usage: { input_tokens: request.prompt.length, output_tokens: 100 },
    },
    ts: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// OpenAPI spec
// ---------------------------------------------------------------------------

/**
 * Generate an OpenAPI spec for Bridge endpoints.
 */
export function generateBridgeOpenApiSpec(): OpenApiSpec {
  return {
    openapi: "3.1.0",
    info: {
      title: "AMC Bridge API",
      version: "1.0.0",
      description: "Live AMC Bridge routes for lease validation, telemetry/evidence, and provider-shaped model proxying.",
    },
    paths: {
      "/bridge/health": {
        get: {
          summary: "Bridge health check",
          tags: ["system"],
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      status: { type: "string" },
                      ts: { type: "number" }
                    }
                  }
                }
              }
            }
          },
        },
      },
      "/bridge/evidence": {
        post: {
          summary: "Ingest evidence event",
          tags: ["evidence"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["event_type", "session_id", "payload"],
                  properties: {
                    event_type: { type: "string" },
                    session_id: { type: "string" },
                    payload: { type: "object" }
                  }
                }
              }
            }
          },
          responses: { "200": { description: "Evidence accepted" }, "400": { description: "Invalid payload" } },
        },
      },
      "/bridge/lease/verify": {
        post: {
          summary: "Verify lease token",
          tags: ["lease"],
          requestBody: { content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string" } } } } } },
          responses: { "200": { description: "Verification result" } },
        },
      },
      "/bridge/telemetry": {
        post: {
          summary: "Append telemetry event to bridge ledger",
          tags: ["telemetry"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["sessionId", "eventType", "payload"],
                  properties: {
                    sessionId: { type: "string" },
                    eventType: { type: "string" },
                    payload: { oneOf: [{ type: "string" }, { type: "object" }] }
                  }
                }
              }
            }
          },
          responses: { "200": { description: "Telemetry accepted" }, "400": { description: "Invalid payload" } },
        },
      },
      "/bridge/openai/v1/chat/completions": {
        post: {
          summary: "OpenAI Chat Completions (bridge passthrough)",
          tags: ["model"],
          responses: { "200": { description: "Provider response" } },
        },
      },
      "/bridge/openai/v1/responses": {
        post: {
          summary: "OpenAI Responses (bridge passthrough)",
          tags: ["model"],
          responses: { "200": { description: "Provider response" } },
        },
      },
      "/bridge/anthropic/v1/messages": {
        post: {
          summary: "Anthropic Messages (bridge passthrough)",
          tags: ["model"],
          responses: { "200": { description: "Provider response" } },
        },
      },
      "/bridge/gemini/v1beta/models/{model}:generateContent": {
        post: {
          summary: "Gemini Generate Content (bridge passthrough)",
          tags: ["model"],
          parameters: [{ name: "model", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Provider response" } },
        },
      },
      "/bridge/openrouter/v1/chat/completions": {
        post: {
          summary: "OpenRouter Chat Completions (bridge passthrough)",
          tags: ["model"],
          responses: { "200": { description: "Provider response" } },
        },
      },
      "/bridge/xai/v1/chat/completions": {
        post: {
          summary: "xAI Chat Completions (bridge passthrough)",
          tags: ["model"],
          responses: { "200": { description: "Provider response" } },
        },
      },
      "/bridge/local/v1/chat/completions": {
        post: {
          summary: "Local OpenAI-compatible Chat Completions (bridge passthrough)",
          tags: ["model"],
          responses: { "200": { description: "Provider response" } },
        },
      },
    },
    components: {
      schemas: {
        EvidenceEvent: { type: "object", properties: { event_type: { type: "string" }, session_id: { type: "string" }, payload: { type: "object" } } },
        LeaseToken: { type: "object", properties: { token: { type: "string" } } },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Available frameworks listing
// ---------------------------------------------------------------------------

export function listAvailableFrameworks(): Array<{
  id: IntegrationFramework;
  name: string;
  language: string;
  description: string;
}> {
  return [
    { id: "express", name: "Express.js", language: "TypeScript/JavaScript", description: "Node.js Express middleware" },
    { id: "fastapi", name: "FastAPI", language: "Python", description: "Python FastAPI middleware" },
    { id: "flask", name: "Flask", language: "Python", description: "Python Flask before/after request hooks" },
    { id: "langchain", name: "LangChain", language: "Python", description: "LangChain callback handler" },
    { id: "llamaindex", name: "LlamaIndex", language: "Python", description: "LlamaIndex callback handler" },
    { id: "generic-http", name: "Generic HTTP", language: "Any", description: "Generic HTTP integration guide" },
  ];
}
