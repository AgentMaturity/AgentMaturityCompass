import { describe, expect, test } from "vitest";
import {
  generateScaffold,
  listAvailableFrameworks,
  generateContractTests,
  validateContractTest,
  defaultSimulatorConfig,
  simulateBridgeRequest,
  generateBridgeOpenApiSpec,
  type IntegrationFramework,
  type ContractTestCase,
} from "../src/setup/integrationScaffold.js";

// ---------------------------------------------------------------------------
// Scaffold generation
// ---------------------------------------------------------------------------
describe("scaffold generation", () => {
  const frameworks: IntegrationFramework[] = [
    "express",
    "fastapi",
    "flask",
    "langchain",
    "llamaindex",
    "generic-http",
    "custom",
  ];

  test("generates scaffold for every framework", () => {
    for (const fw of frameworks) {
      const scaffold = generateScaffold(fw);
      expect(scaffold.scaffoldId).toMatch(/^scaffold_/);
      expect(scaffold.framework).toBeDefined();
      expect(scaffold.files.length).toBeGreaterThan(0);
      expect(scaffold.instructions.length).toBeGreaterThan(0);
      expect(scaffold.createdTs).toBeGreaterThan(0);
    }
  });

  test("express scaffold is TypeScript", () => {
    const s = generateScaffold("express");
    expect(s.framework).toBe("express");
    expect(s.language).toBe("typescript");
    expect(s.files.length).toBe(2); // middleware + lease middleware
    expect(s.files[0]!.path).toContain(".ts");
  });

  test("fastapi scaffold is Python", () => {
    const s = generateScaffold("fastapi");
    expect(s.framework).toBe("fastapi");
    expect(s.language).toBe("python");
    expect(s.files[0]!.path).toContain(".py");
  });

  test("flask scaffold is Python", () => {
    const s = generateScaffold("flask");
    expect(s.framework).toBe("flask");
    expect(s.language).toBe("python");
    expect(s.files[0]!.content).toContain("flask");
  });

  test("langchain scaffold has callback handler", () => {
    const s = generateScaffold("langchain");
    expect(s.framework).toBe("langchain");
    expect(s.files[0]!.content).toContain("BaseCallbackHandler");
  });

  test("llamaindex scaffold has callback handler", () => {
    const s = generateScaffold("llamaindex");
    expect(s.framework).toBe("llamaindex");
    expect(s.files[0]!.content).toContain("LlamaDebugHandler");
  });

  test("generic-http scaffold is generic language", () => {
    const s = generateScaffold("generic-http");
    expect(s.language).toBe("generic");
  });

  test("custom scaffold delegates to generic", () => {
    const s = generateScaffold("custom");
    expect(s.language).toBe("generic");
  });

  test("scaffold files have non-empty content", () => {
    for (const fw of frameworks) {
      const scaffold = generateScaffold(fw);
      for (const f of scaffold.files) {
        expect(f.content.length).toBeGreaterThan(10);
        expect(f.description.length).toBeGreaterThan(0);
        expect(f.path.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Available frameworks listing
// ---------------------------------------------------------------------------
describe("available frameworks listing", () => {
  test("returns all supported frameworks", () => {
    const list = listAvailableFrameworks();
    expect(list.length).toBe(6); // express, fastapi, flask, langchain, llamaindex, generic-http
    const ids = list.map((f) => f.id);
    expect(ids).toContain("express");
    expect(ids).toContain("fastapi");
    expect(ids).toContain("flask");
    expect(ids).toContain("langchain");
    expect(ids).toContain("llamaindex");
    expect(ids).toContain("generic-http");
  });

  test("each framework has name, language, and description", () => {
    const list = listAvailableFrameworks();
    for (const f of list) {
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.language.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Contract tests
// ---------------------------------------------------------------------------
describe("contract tests", () => {
  test("generates a test suite with 4 standard tests", () => {
    const suite = generateContractTests();
    expect(suite.suiteId).toMatch(/^cts_/);
    expect(suite.tests.length).toBe(4);
    expect(suite.ts).toBeGreaterThan(0);
  });

  test("suite includes health and bridge auth tests", () => {
    const suite = generateContractTests();
    const ids = suite.tests.map((t) => t.testId);
    expect(ids).toContain("ct-health");
    expect(ids).toContain("ct-bridge-chat-auth");
    expect(ids).toContain("ct-telemetry-auth");
    expect(ids).toContain("ct-bridge-route-missing");
  });

  test("validates passing contract test", () => {
    const suite = generateContractTests();
    const healthTest = suite.tests.find((t) => t.testId === "ct-health")!;
    const result = validateContractTest(healthTest, {
      status: 200,
      body: { ok: true },
    });
    expect(result.passed).toBe(true);
    expect(result.missingFields.length).toBe(0);
    expect(result.validationErrors.length).toBe(0);
  });

  test("validates failing contract test — wrong status", () => {
    const suite = generateContractTests();
    const healthTest = suite.tests.find((t) => t.testId === "ct-health")!;
    const result = validateContractTest(healthTest, {
      status: 500,
      body: { status: "error" },
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Expected status 200, got 500");
  });

  test("validates failing contract test — missing fields", () => {
    const suite = generateContractTests();
    const healthTest = suite.tests.find((t) => t.testId === "ct-health")!;
    const result = validateContractTest(healthTest, {
      status: 200,
      body: {},
    });
    expect(result.passed).toBe(false);
    expect(result.missingFields).toContain("ok");
  });

  test("validates bridge-chat-auth response shape", () => {
    const suite = generateContractTests();
    const authTest = suite.tests.find((t) => t.testId === "ct-bridge-chat-auth")!;
    const result = validateContractTest(authTest, {
      status: 401,
      body: { error: "missing lease token" },
    });
    expect(result.passed).toBe(true);
  });

  test("validates bridge-chat-auth fails when error is empty", () => {
    const suite = generateContractTests();
    const authTest = suite.tests.find((t) => t.testId === "ct-bridge-chat-auth")!;
    const result = validateContractTest(authTest, {
      status: 401,
      body: { error: "" },
    });
    expect(result.passed).toBe(false);
    expect(result.validationErrors.length).toBeGreaterThan(0);
  });

  test("validates telemetry-auth with non_empty check", () => {
    const suite = generateContractTests();
    const rejectTest = suite.tests.find((t) => t.testId === "ct-telemetry-auth")!;
    const result = validateContractTest(rejectTest, {
      status: 401,
      body: { error: "missing lease token" },
    });
    expect(result.passed).toBe(true);
  });

  test("validates telemetry-auth fails on empty error", () => {
    const suite = generateContractTests();
    const rejectTest = suite.tests.find((t) => t.testId === "ct-telemetry-auth")!;
    const result = validateContractTest(rejectTest, {
      status: 401,
      body: { error: "" },
    });
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration simulator
// ---------------------------------------------------------------------------
describe("integration simulator", () => {
  test("defaultSimulatorConfig returns valid config", () => {
    const config = defaultSimulatorConfig();
    expect(config.port).toBe(4199);
    expect(config.latencyRange[0]).toBeLessThan(config.latencyRange[1]);
    expect(config.errorRate).toBeGreaterThanOrEqual(0);
    expect(config.errorRate).toBeLessThanOrEqual(1);
    expect(config.availableModels.length).toBeGreaterThan(0);
  });

  test("simulates successful request", () => {
    const config = defaultSimulatorConfig();
    config.errorRate = 0; // force no errors
    const result = simulateBridgeRequest(config, {
      model: "claude-3-sonnet",
      prompt: "Hello world",
    });
    expect(result.requestId).toMatch(/^sim_/);
    expect(result.isError).toBe(false);
    expect(result.model).toBe("claude-3-sonnet");
    expect(result.simulatedLatencyMs).toBeGreaterThanOrEqual(config.latencyRange[0]);
    expect(result.simulatedLatencyMs).toBeLessThanOrEqual(config.latencyRange[1]);
    expect(result.responseBody).toHaveProperty("content");
  });

  test("rejects unavailable model", () => {
    const config = defaultSimulatorConfig();
    const result = simulateBridgeRequest(config, {
      model: "gpt-nonexistent",
      prompt: "Hello",
    });
    expect(result.isError).toBe(true);
    expect(result.simulatedLatencyMs).toBe(0);
    expect(result.responseBody).toHaveProperty("error");
  });

  test("simulates errors at 100% error rate", () => {
    const config = defaultSimulatorConfig();
    config.errorRate = 1.0; // force errors
    const result = simulateBridgeRequest(config, {
      model: "claude-3-sonnet",
      prompt: "Hello",
    });
    expect(result.isError).toBe(true);
    expect(result.responseBody).toHaveProperty("error");
  });

  test("response includes timestamp", () => {
    const config = defaultSimulatorConfig();
    config.errorRate = 0;
    const before = Date.now();
    const result = simulateBridgeRequest(config, {
      model: "claude-3-sonnet",
      prompt: "Test",
    });
    expect(result.ts).toBeGreaterThanOrEqual(before);
  });
});

// ---------------------------------------------------------------------------
// OpenAPI spec
// ---------------------------------------------------------------------------
describe("OpenAPI spec generation", () => {
  test("generates valid OpenAPI 3.1.0 spec", () => {
    const spec = generateBridgeOpenApiSpec();
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("AMC Bridge API");
    expect(spec.info.version).toBe("1.0.0");
  });

  test("includes all bridge endpoints", () => {
    const spec = generateBridgeOpenApiSpec();
    expect(spec.paths).toHaveProperty("/healthz");
    expect(spec.paths).toHaveProperty("/bridge/telemetry");
    expect(spec.paths).toHaveProperty("/bridge/openai/v1/chat/completions");
    expect(spec.paths).toHaveProperty("/bridge/openai/v1/responses");
    expect(spec.paths).toHaveProperty("/bridge/openai/v1/batches");
  });

  test("includes component schemas", () => {
    const spec = generateBridgeOpenApiSpec();
    expect(spec.components.schemas).toHaveProperty("TelemetryEvent");
    expect(spec.components.schemas).toHaveProperty("BridgeChatRequest");
  });

  test("health endpoint uses GET method", () => {
    const spec = generateBridgeOpenApiSpec();
    const healthPath = spec.paths["/healthz"] as Record<string, any>;
    expect(healthPath).toHaveProperty("get");
    expect(healthPath.get.summary).toBe("Health check");
  });

  test("telemetry endpoint uses POST method", () => {
    const spec = generateBridgeOpenApiSpec();
    const telemetryPath = spec.paths["/bridge/telemetry"] as Record<string, any>;
    expect(telemetryPath).toHaveProperty("post");
    expect(telemetryPath.post.tags).toContain("telemetry");
  });
});
