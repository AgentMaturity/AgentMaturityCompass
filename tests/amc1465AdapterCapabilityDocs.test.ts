import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { describe, expect, test } from "vitest";
import { generateFullOpenApiSpec } from "../src/studio/openapi.js";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("AMC-1465 adapter capability publication", () => {
  test("documents one authoritative registry and the fail-closed receipt boundary", () => {
    const sourceReview = read("docs/source-reviews/AMC-1465-signed-adapter-capability-receipts.md");
    const compatibility = read("docs/ADAPTER_COMPATIBILITY.md");
    const adapters = read("docs/ADAPTERS.md");
    const passport = read("docs/AGENT_PASSPORT.md");
    const custom = read("docs/CUSTOM_ADAPTER.md");

    expect(sourceReview).toContain("2583cff9380f8f0a459d52c7112b6105c46496ed");
    expect(sourceReview).toContain("83188b62c63e2b4ff9ada87048fd99605184ee5a");
    expect(sourceReview).toContain("No second adapter registry");
    expect(compatibility).not.toContain("✅ Tested");
    expect(compatibility).toContain("host runtime");
    expect(compatibility).toContain("does not prove");
    expect(adapters).toContain("amc adapters capabilities");
    expect(passport).toContain("amc.adapter-capability-receipt.v1");
    expect(custom).toContain("verification.status: unverified");
  });

  test("publishes canonical commands and honest capability language on GitHub and the website", () => {
    const readme = read("README.md");
    const website = read("website/docs/adapters.html");
    const homepage = read("website/index.html");
    const llms = read("website/llms.txt");

    for (const id of [
      "autogen-cli",
      "claude-cli",
      "crewai-cli",
      "gemini-cli",
      "generic-cli",
      "langchain-node",
      "langchain-python",
      "langgraph-python",
      "llamaindex-python",
      "openai-agents-sdk",
      "openclaw-cli",
      "openhands-cli",
      "python-amc-sdk",
      "semantic-kernel"
    ]) {
      expect(readme).toContain(`\`${id}\``);
    }
    expect(website).toContain("amc adapters capabilities");
    expect(website).toContain("POST /api/v1/adapters/capability-receipts");
    expect(homepage).toContain("portable signed receipts");
    expect(llms).toContain("metadata-only adapters fail closed");
  });

  test("keeps live and published OpenAPI plus CLI inventory in sync", () => {
    const generated = generateFullOpenApiSpec() as any;
    const published = YAML.parse(read("website/openapi.yaml")) as any;
    const inventory = read("docs/CLI_COMMAND_INVENTORY.md");

    expect(generated.paths["/api/v1/adapters/capability-receipts"]?.post).toBeDefined();
    expect(published.paths["/v1/adapters/capability-receipts"]?.post).toBeDefined();
    expect(inventory).toContain("`amc adapters capabilities`");
  });

  test("does not retain a second hand-authored capability catalog", () => {
    const standardization = read("src/adapters/adapterStandardization.ts");
    expect(standardization).toContain("listBuiltInAdapters().map(profileFor)");
    expect(standardization).not.toMatch(/adapterId:\s*"(?:langchain|claude|gemini|crewai)/);
    expect(standardization).not.toContain("nativeRedTeam: true");
  });
});
