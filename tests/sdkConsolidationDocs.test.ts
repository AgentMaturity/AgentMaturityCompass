import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { describe, expect, test } from "vitest";
import { validatePythonSdkCoverage } from "../src/sdk/pythonSdkGenerator.js";

const workspace = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(workspace, path), "utf8");
}

describe("SDK consolidation documentation", () => {
  test("documents Node, Python, Go, and OpenAPI surfaces from current repo assets", () => {
    const sdkDoc = read("docs/SDK.md");
    expect(sdkDoc).toContain("## Current SDK Inventory");
    expect(sdkDoc).toContain("Node/TypeScript");
    expect(sdkDoc).toContain("Python SDK");
    expect(sdkDoc).toContain("Go SDK");
    expect(sdkDoc).toContain("OpenAPI contract");
    expect(sdkDoc).toContain("amc python-sdk --coverage");
    expect(sdkDoc).toContain("website/openapi.yaml");
    expect(sdkDoc).toContain("https://spec.openapis.org/oas/v3.0.3.html");
    expect(sdkDoc).toContain("https://typing.python.org/en/latest/spec/distributing.html");

    const nodeExports = read("src/sdk/index.ts");
    expect(nodeExports).toContain("AMCClient");
    expect(nodeExports).toContain("createAMCClientFromEnv");
    expect(nodeExports).toContain("instrumentOpenAIClient");
    expect(nodeExports).toContain("createReactNativeAMCFetch");

    expect(existsSync(resolve(workspace, "src/sdk/python/py.typed"))).toBe(true);
    expect(validatePythonSdkCoverage()).toEqual({
      covered: [
        "/bridge/openai/v1/chat/completions",
        "/bridge/openai/v1/responses",
        "/bridge/anthropic/v1/messages",
        "/bridge/gemini/v1beta/models/{model}:generateContent",
        "/bridge/openrouter/v1/chat/completions",
        "/bridge/xai/v1/chat/completions",
        "/bridge/local/v1/chat/completions",
        "/bridge/telemetry"
      ],
      missing: [],
      coverage: 1
    });

    const goClient = read("src/sdk/go/amc_client.go");
    expect(goClient).toContain("func NewClientFromEnv");
    expect(goClient).toContain("func (c *Client) OpenAIChat");
  });

  test("keeps the OpenAPI server roots aligned with SDK docs", () => {
    const spec = YAML.parse(read("website/openapi.yaml"));
    const serverUrls = spec.servers.map((server: any) => server.url);
    expect(serverUrls).toContain("http://localhost:3000/api");
    expect(serverUrls).toContain("https://{host}/api");

    const sdkDoc = read("docs/SDK.md");
    expect(sdkDoc).toContain("http://localhost:3000/api");
    expect(sdkDoc).toContain("https://{host}/api");
  });

  test("marks Roberto SDK consolidation resolved without overclaiming package publication", () => {
    const audit = read("docs/AUDIT_50_AGENTS_BATCH5.md");
    expect(audit).toContain("SDK consolidation inventory** — ✅ Resolved 2026-06-16");
    expect(audit).toContain("Node/TypeScript, Python, and Go SDK assets are repo-visible");
    expect(audit).toContain("packaged SDK publication remains open");
    expect(audit).not.toContain("No SDK for Python or TypeScript beyond the raw REST calls.");
    expect(audit).not.toContain("SDK consolidation and hosted SaaS delivery remain open");
  });
});
