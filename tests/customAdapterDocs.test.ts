import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("custom adapter documentation", () => {
  test("documents the adapter authoring contract and links from adapter docs", () => {
    const root = process.cwd();
    const guide = readFileSync(join(root, "docs", "CUSTOM_ADAPTER.md"), "utf8");
    const adapters = readFileSync(join(root, "docs", "ADAPTERS.md"), "utf8");
    const compatibility = readFileSync(join(root, "docs", "ADAPTER_COMPATIBILITY.md"), "utf8");
    const adapterIndex = readFileSync(join(root, "docs", "adapters", "README.md"), "utf8");

    expect(guide).toContain("adapterDefinitionSchema");
    expect(guide).toContain("FrameworkAdapter");
    expect(guide).toContain("content/adapters/");
    expect(guide).toContain("agent_process_started");
    expect(guide).toContain("amc plugin verify");
    expect(guide).toContain("amc adapters env");
    expect(guide).toContain("Plugins are content-only");

    expect(adapters).toContain("docs/CUSTOM_ADAPTER.md");
    expect(compatibility).toContain("CUSTOM_ADAPTER.md");
    expect(adapterIndex).toContain("CUSTOM_ADAPTER.md");
  });
});
