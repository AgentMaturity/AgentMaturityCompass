import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addCapability,
  linkPlatform,
  loadDiscoveryRegistry,
  saveDiscoveryRegistry,
  searchCapabilities,
  discoveryRegistryPath
} from "../src/passport/agentDiscovery.js";

/**
 * G1-43: every passport discovery command built a fresh in-memory registry, so
 * `capabilities-add` reported success, the process exited, and
 * `capabilities-search` always returned [].
 */
const dirs: string[] = [];
function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-discovery-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent discovery registry persists", () => {
  it("a capability added in one load is visible in the next", () => {
    const ws = workspace();
    const first = loadDiscoveryRegistry(ws);
    addCapability(first, "agent-1", "code-review", ["evt-1"]);
    saveDiscoveryRegistry(ws, first);

    // Simulates a separate CLI invocation.
    const second = loadDiscoveryRegistry(ws);
    const results = searchCapabilities(second, { capability: "code-review", minLevel: 0 });
    expect(results).toHaveLength(1);
    expect(results[0]?.capability).toBe("code-review");
  });

  it("platform links survive a reload", () => {
    const ws = workspace();
    const reg = loadDiscoveryRegistry(ws);
    linkPlatform(reg, "agent-2", "github", "octocat");
    saveDiscoveryRegistry(ws, reg);

    const reloaded = loadDiscoveryRegistry(ws);
    expect(reloaded.agents.get("agent-2")?.platformLinks).toHaveLength(1);
  });

  it("an empty workspace loads an empty registry rather than failing", () => {
    const reg = loadDiscoveryRegistry(workspace());
    expect(reg.agents.size).toBe(0);
  });

  it("writes the registry inside the workspace", () => {
    const ws = workspace();
    expect(discoveryRegistryPath(ws)).toContain(join(".amc", "passport"));
  });
});
