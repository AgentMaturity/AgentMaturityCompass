/**
 * Python SDK Generator
 *
 * Generates a pip-installable Python SDK package from the AMC Bridge API
 * specification. The generator outputs the full package structure needed
 * for `pip install .` or distribution via PyPI.
 */

import { BRIDGE_MODEL_ROUTES, matchBridgeRoute } from "../bridge/bridgeModelRouter.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface PythonSdkFile {
  path: string;
  content: string;
  description: string;
}

export interface PythonSdkPackage {
  packageName: string;
  version: string;
  files: PythonSdkFile[];
  installCommand: string;
  testCommand: string;
}

/**
 * Generate the complete Python SDK package.
 * Reads the actual Python source files from src/sdk/python/ and packages them.
 */
export function generatePythonSdkPackage(sdkDir?: string): PythonSdkPackage {
  const baseDir = sdkDir ?? join(__dirname, "python");
  const files: PythonSdkFile[] = [];

  const sourceFiles = [
    { name: "__init__.py", description: "Package init — exports public API" },
    { name: "amc_client.py", description: "Core AMC client with all provider methods" },
    { name: "amc_middleware.py", description: "Framework middleware (FastAPI, Flask, LangChain)" },
    { name: "pyproject.toml", description: "Package metadata and dependencies" },
    { name: "test_amc_client.py", description: "Unit tests for the Python SDK" },
  ];

  for (const sf of sourceFiles) {
    try {
      const content = readFileSync(join(baseDir, sf.name), "utf-8");
      files.push({ path: sf.name, content, description: sf.description });
    } catch {
      // File may not exist in test contexts — generate placeholder
      files.push({ path: sf.name, content: `# ${sf.description}\n`, description: sf.description });
    }
  }

  return {
    packageName: "amc-sdk",
    version: "0.1.0",
    files,
    installCommand: "pip install .",
    testCommand: "pytest test_amc_client.py -v",
  };
}

/**
 * List the endpoints covered by the Python SDK.
 */
export function listPythonSdkEndpoints(): Array<{
  method: string;
  path: string;
  sdkMethod: string;
  provider: string;
}> {
  return [
    { method: "POST", path: "/bridge/openai/v1/chat/completions", sdkMethod: "openai_chat", provider: "OpenAI" },
    { method: "POST", path: "/bridge/openai/v1/responses", sdkMethod: "openai_responses", provider: "OpenAI" },
    { method: "POST", path: "/bridge/anthropic/v1/messages", sdkMethod: "anthropic_messages", provider: "Anthropic" },
    { method: "POST", path: "/bridge/gemini/v1beta/models/{model}:generateContent", sdkMethod: "gemini_generate_content", provider: "Gemini" },
    { method: "POST", path: "/bridge/openrouter/v1/chat/completions", sdkMethod: "openrouter_chat", provider: "OpenRouter" },
    { method: "POST", path: "/bridge/xai/v1/chat/completions", sdkMethod: "xai_chat", provider: "xAI" },
    { method: "POST", path: "/bridge/local/v1/chat/completions", sdkMethod: "local_chat", provider: "Local" },
    { method: "POST", path: "/bridge/telemetry", sdkMethod: "report_telemetry", provider: "Telemetry" },
  ];
}

/**
 * How much of the Bridge the generated Python SDK actually reaches.
 *
 * THIS USED TO BE A TAUTOLOGY. The denominator was a hardcoded list of eight
 * paths sitting twenty lines below `listPythonSdkEndpoints`, which returned the
 * same eight — so `coverage` was 8/8 and could not be anything else, and
 * `docs/SDK.md` published it as "100% Bridge endpoint coverage".
 *
 * The denominator now comes from the router (`BRIDGE_MODEL_ROUTES`), which is
 * where the answer lives. Measured against it the real figure is 7 of 11: the
 * SDK reaches neither `batches`, `embeddings`, `images/generations` nor
 * `audio/speech`. That number is allowed to be below 1, which is the whole
 * difference between a measurement and a slogan.
 *
 * `outsideModelRouter` is the other direction: SDK endpoints the model router
 * does not match. That is NOT the same as "broken" — `/bridge/telemetry` lands
 * there and is served perfectly well by `bridgeServer.ts`, just not as a model
 * proxy. Naming it `unroutable` would have replaced one false claim with
 * another, in the opposite direction. What it is good for is catching an
 * endpoint that belongs to neither set, which is how a generated method that
 * 404s would show up.
 */
export function validatePythonSdkCoverage(): {
  covered: string[];
  missing: string[];
  outsideModelRouter: string[];
  coverage: number;
} {
  const sdkEndpoints = listPythonSdkEndpoints().map((endpoint) => endpoint.path);

  // A `{model}` placeholder is the SDK's template for a path parameter, so it is
  // filled with the router's own sample before being asked whether it routes.
  const concrete = (path: string): string =>
    path.replace("{model}", "gemini-1.5-pro");

  const covered = BRIDGE_MODEL_ROUTES.filter((route) =>
    sdkEndpoints.some((endpoint) => concrete(endpoint) === route)
  );
  const missing = BRIDGE_MODEL_ROUTES.filter((route) => !covered.includes(route));
  // Served elsewhere or not at all — this function cannot tell which, and says
  // so rather than guessing. Enumerating everything `bridgeServer` serves is a
  // different job from asking what the model router proxies.
  const outsideModelRouter = sdkEndpoints.filter(
    (endpoint) => matchBridgeRoute(concrete(endpoint)) === null
  );

  return {
    covered: [...covered],
    missing,
    outsideModelRouter,
    coverage: covered.length / BRIDGE_MODEL_ROUTES.length
  };
}
