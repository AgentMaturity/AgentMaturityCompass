import { describe, expect, test } from "vitest";
import { BRIDGE_MODEL_ROUTES } from "../src/bridge/bridgeModelRouter.js";
import {
  generatePythonSdkPackage,
  listPythonSdkEndpoints,
  validatePythonSdkCoverage,
} from "../src/sdk/pythonSdkGenerator.js";
import { join } from "node:path";

const SDK_DIR = join(__dirname, "..", "src", "sdk", "python");

// ---------------------------------------------------------------------------
// Python SDK Package Generation
// ---------------------------------------------------------------------------
describe("Python SDK package generation", () => {
  test("a missing source tree fails generation instead of emitting stubs", () => {
    // The old fallback packaged `# <description>` as each file's content, so a
    // broken path yielded a "pip-installable package" of comment stubs and a
    // success report. Regression: generation from a nonexistent dir must throw.
    expect(() => generatePythonSdkPackage(join(__dirname, "no-such-sdk-dir")))
      .toThrow(/cannot read/);
  });

  test("generates package with all required files", () => {
    const pkg = generatePythonSdkPackage(SDK_DIR);
    expect(pkg.packageName).toBe("amc-bridge-client");
    expect(pkg.version).toBe("0.1.0");
    expect(pkg.files.length).toBeGreaterThanOrEqual(5);

    const filenames = pkg.files.map((f) => f.path);
    expect(filenames).toContain("__init__.py");
    expect(filenames).toContain("amc_client.py");
    expect(filenames).toContain("amc_middleware.py");
    expect(filenames).toContain("pyproject.toml");
    expect(filenames).toContain("test_amc_client.py");
  });

  test("amc_client.py contains AMCClient class", () => {
    const pkg = generatePythonSdkPackage(SDK_DIR);
    const clientFile = pkg.files.find((f) => f.path === "amc_client.py")!;
    expect(clientFile.content).toContain("class AMCClient:");
    expect(clientFile.content).toContain("def openai_chat");
    expect(clientFile.content).toContain("def anthropic_messages");
    expect(clientFile.content).toContain("def gemini_generate_content");
    expect(clientFile.content).toContain("def openrouter_chat");
    expect(clientFile.content).toContain("def xai_chat");
    expect(clientFile.content).toContain("def local_chat");
    expect(clientFile.content).toContain("def report_telemetry");
    expect(clientFile.content).toContain("def report_output");
  });

  test("amc_client.py has self-scoring prevention", () => {
    const pkg = generatePythonSdkPackage(SDK_DIR);
    const clientFile = pkg.files.find((f) => f.path === "amc_client.py")!;
    expect(clientFile.content).toContain("_assert_no_self_scoring");
    expect(clientFile.content).toContain("Self-scoring detected");
  });

  test("amc_client.py has redaction function", () => {
    const pkg = generatePythonSdkPackage(SDK_DIR);
    const clientFile = pkg.files.find((f) => f.path === "amc_client.py")!;
    expect(clientFile.content).toContain("def redact_text");
    expect(clientFile.content).toContain("[REDACTED]");
    expect(clientFile.content).toContain("PRIVATE KEY");
  });

  test("amc_client.py has hashing function", () => {
    const pkg = generatePythonSdkPackage(SDK_DIR);
    const clientFile = pkg.files.find((f) => f.path === "amc_client.py")!;
    expect(clientFile.content).toContain("def hash_value");
    expect(clientFile.content).toContain("sha256");
  });

  test("amc_middleware.py has FastAPI middleware", () => {
    const pkg = generatePythonSdkPackage(SDK_DIR);
    const mwFile = pkg.files.find((f) => f.path === "amc_middleware.py")!;
    expect(mwFile.content).toContain("class AMCFastAPIMiddleware");
    expect(mwFile.content).toContain("ASGI middleware");
  });

  test("amc_middleware.py has Flask middleware", () => {
    const pkg = generatePythonSdkPackage(SDK_DIR);
    const mwFile = pkg.files.find((f) => f.path === "amc_middleware.py")!;
    expect(mwFile.content).toContain("class AMCFlaskMiddleware");
    expect(mwFile.content).toContain("before_request");
    expect(mwFile.content).toContain("after_request");
  });

  test("amc_middleware.py has LangChain callback", () => {
    const pkg = generatePythonSdkPackage(SDK_DIR);
    const mwFile = pkg.files.find((f) => f.path === "amc_middleware.py")!;
    expect(mwFile.content).toContain("class AMCLangChainCallback");
    expect(mwFile.content).toContain("on_llm_start");
    expect(mwFile.content).toContain("on_llm_end");
    expect(mwFile.content).toContain("on_tool_start");
    expect(mwFile.content).toContain("on_tool_end");
  });

  test("pyproject.toml has correct metadata", () => {
    const pkg = generatePythonSdkPackage(SDK_DIR);
    const toml = pkg.files.find((f) => f.path === "pyproject.toml")!;
    expect(toml.content).toContain('name = "amc-bridge-client"');
    expect(toml.content).toContain('version = "0.1.0"');
    expect(toml.content).toContain("requires-python");
    expect(toml.content).toContain("[project.optional-dependencies]");
    expect(toml.content).toContain("httpx");
    expect(toml.content).toContain("langchain");
    expect(toml.content).toContain("fastapi");
    expect(toml.content).toContain("flask");
  });

  test("test file has comprehensive tests", () => {
    const pkg = generatePythonSdkPackage(SDK_DIR);
    const testFile = pkg.files.find((f) => f.path === "test_amc_client.py")!;
    expect(testFile.content).toContain("TestAMCBridgeResponse");
    expect(testFile.content).toContain("TestClientConstruction");
    expect(testFile.content).toContain("TestRedaction");
    expect(testFile.content).toContain("TestHashing");
    expect(testFile.content).toContain("TestSelfScoring");
    expect(testFile.content).toContain("TestHeaders");
  });

  test("package has install and test commands", () => {
    const pkg = generatePythonSdkPackage(SDK_DIR);
    expect(pkg.installCommand).toContain("pip install");
    expect(pkg.testCommand).toContain("pytest");
  });
});

// ---------------------------------------------------------------------------
// Endpoint coverage
// ---------------------------------------------------------------------------
describe("Python SDK endpoint coverage", () => {
  test("lists all 8 Bridge endpoints", () => {
    const endpoints = listPythonSdkEndpoints();
    expect(endpoints.length).toBe(8);
  });

  test("covers all expected providers", () => {
    const providers = listPythonSdkEndpoints().map((e) => e.provider);
    expect(providers).toContain("OpenAI");
    expect(providers).toContain("Anthropic");
    expect(providers).toContain("Gemini");
    expect(providers).toContain("OpenRouter");
    expect(providers).toContain("xAI");
    expect(providers).toContain("Local");
    expect(providers).toContain("Telemetry");
  });

  test("all endpoints are POST", () => {
    for (const e of listPythonSdkEndpoints()) {
      expect(e.method).toBe("POST");
    }
  });

  test("measures coverage against the router, and it is not 100%", () => {
    // This asserted `coverage === 1` and `missing.length === 0` — which it could
    // not fail, because the denominator was a copy of the numerator sitting
    // twenty lines away in the same file. docs/SDK.md published that 1 as
    // "100% Bridge endpoint coverage".
    const validation = validatePythonSdkCoverage();

    expect(validation.covered.length + validation.missing.length).toBe(BRIDGE_MODEL_ROUTES.length);
    expect(validation.coverage).toBeCloseTo(
      validation.covered.length / BRIDGE_MODEL_ROUTES.length
    );

    // The measurement, as it stands. Pinned so that closing one of these gaps is
    // a deliberate edit here rather than a silent drift, in either direction.
    expect(validation.missing.sort()).toEqual([
      "/bridge/openai/v1/audio/speech",
      "/bridge/openai/v1/batches",
      "/bridge/openai/v1/embeddings",
      "/bridge/openai/v1/images/generations"
    ]);
    expect(validation.coverage).toBeLessThan(1);

    // Served by bridgeServer, not by the model router. Not a defect — see the
    // note on `outsideModelRouter`.
    expect(validation.outsideModelRouter).toEqual(["/bridge/telemetry"]);
  });

  test("every endpoint the SDK generates is one the model router matches, or telemetry", () => {
    // The direction that would be a real defect: a generated method whose path
    // belongs to neither the model router nor the bridge server would 404.
    const validation = validatePythonSdkCoverage();
    expect(validation.outsideModelRouter.every((path) => path === "/bridge/telemetry")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Python source quality checks
// ---------------------------------------------------------------------------
describe("Python SDK source quality", () => {
  test("no hardcoded secrets in non-test source files", () => {
    const pkg = generatePythonSdkPackage(SDK_DIR);
    // Exclude test files which may contain test patterns
    const sourceFiles = pkg.files.filter((f) => !f.path.startsWith("test_"));
    for (const f of sourceFiles) {
      expect(f.content).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
    }
  });

  test("amc_client.py uses stdlib only (no external deps required)", () => {
    const pkg = generatePythonSdkPackage(SDK_DIR);
    const clientFile = pkg.files.find((f) => f.path === "amc_client.py")!;
    // Should use urllib.request from stdlib, not requests/httpx as hard dep
    expect(clientFile.content).toContain("urllib.request");
    // Should not have top-level import of external libs
    expect(clientFile.content).not.toMatch(/^import (requests|httpx)/m);
  });

  test("middleware uses non-blocking telemetry", () => {
    const pkg = generatePythonSdkPackage(SDK_DIR);
    const mwFile = pkg.files.find((f) => f.path === "amc_middleware.py")!;
    // Should catch exceptions to prevent breaking the app
    expect(mwFile.content).toContain("except Exception:");
    expect(mwFile.content).toContain("pass  # Non-blocking");
  });

  test("__init__.py exports main classes", () => {
    const pkg = generatePythonSdkPackage(SDK_DIR);
    const initFile = pkg.files.find((f) => f.path === "__init__.py")!;
    expect(initFile.content).toContain("AMCClient");
    expect(initFile.content).toContain("AMCBridgeResponse");
    expect(initFile.content).toContain("create_amc_client");
    expect(initFile.content).toContain("__version__");
  });
});
