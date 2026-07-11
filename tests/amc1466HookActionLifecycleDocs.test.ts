import { readFileSync } from "node:fs";
import YAML from "yaml";
import { describe, expect, test } from "vitest";
import { generateFullOpenApiSpec } from "../src/studio/openapi.js";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("AMC-1466 public lifecycle contract", () => {
  test("documents the operator path and removes request-only capability claims", () => {
    const readme = read("README.md");
    const compatibility = read("docs/ADAPTER_COMPATIBILITY.md");
    const adapters = read("docs/ADAPTERS.md");
    const website = read("website/docs/adapters.html");
    const cli = read("website/docs/cli.html");

    for (const body of [readme, compatibility, adapters]) {
      expect(body).toContain("amc connect hooks lifecycle --agent my-agent --action <action-id>");
      expect(body).toContain("requested");
      expect(body).toContain("completed");
      expect(body).toContain("failed");
      expect(body).toContain("fail closed");
    }
    expect(website).toContain("amc connect hooks lifecycle --agent my-agent --action &lt;action-id&gt;");
    for (const word of ["requested", "completed", "failed", "fail closed"]) expect(website).toContain(word);
    expect(cli).toContain("amc connect hooks lifecycle --agent &lt;id&gt; --action &lt;id&gt;");
    expect(compatibility).not.toContain("Managed hook covers pinned `PreToolUse`, not every lifecycle hook");
  });

  test("publishes the Watch lifecycle API in both OpenAPI contracts and CLI inventories", () => {
    const published = YAML.parse(read("website/openapi.yaml")) as any;
    const generated = generateFullOpenApiSpec();
    expect(published.paths["/v1/watch/hook-actions/{actionId}"]?.get).toBeDefined();
    expect(published.components.schemas.HookActionLifecycle).toBeDefined();
    expect(generated.paths["/api/v1/watch/hook-actions/{actionId}"]?.get).toBeDefined();
    expect(generated.components.schemas.HookActionLifecycleResponse).toBeDefined();

    for (const inventory of [read("docs/CLI_COMMAND_INVENTORY.md"), read("docs/API_REFERENCE.md")]) {
      expect(inventory).toContain("amc connect hooks lifecycle");
      expect(inventory).toContain("--action <actionId>");
    }
  });

  test("records primary-source pins, fail-closed boundaries, and competitive backlog closure", () => {
    const sourceReview = read("docs/source-reviews/AMC-1466-hook-action-lifecycle-correlation.md");
    for (const required of [
      "2583cff9380f8f0a459d52c7112b6105c46496ed",
      "e94e721874efc802248a7808e35ac917306088c5eaada2aa21e1def3fecc32e1",
      "f354eebaf43b25bacb176007e449bb9a638fd101",
      "103bab9f0f8fd7251b97d06c6b7c4e52752427bf23cbacd1379f2aecaaf26e4c",
      "83188b62c63e2b4ff9ada87048fd99605184ee5a",
      "No-bloat boundary",
      "Fail-closed rule",
      "no AEP conformance claim",
    ]) {
      expect(sourceReview).toContain(required);
    }
    expect(read("docs/internal/agent-control-agentapprove-competitive-response.md"))
      .toContain("Shipped in AMC-1466");
  });
});
