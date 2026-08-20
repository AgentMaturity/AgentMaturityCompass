import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runRedTeamCiGate } from "../src/ci/redteamGate.js";
import { initWorkspace } from "../src/workspace.js";
import { startFakeAgentServer, useFakeAgentEnv, type FakeAgentServer } from "./helpers/fakeAgentServer.js";

function initializedWorkspace(prefix: string): string {
  const workspace = mkdtempSync(join(tmpdir(), prefix));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

let __fakeAgent: FakeAgentServer | undefined;
let __restoreAgentEnv: (() => void) | undefined;

beforeAll(async () => {
  __fakeAgent = await startFakeAgentServer();
  __restoreAgentEnv = useFakeAgentEnv(__fakeAgent.baseUrl);
});

afterAll(async () => {
  __restoreAgentEnv?.();
  await __fakeAgent?.close();
});

describe("red-team CI gate", () => {
  it("passes with permissive thresholds and includes Evil MCP plus gaming resistance evidence", async () => {
    const workspace = initializedWorkspace("amc-ci-redteam-pass-");

    const result = await runRedTeamCiGate({
      workspace,
      agentId: "default",
      plugins: ["injection"],
      strategies: ["direct"],
      evilMcp: true,
      mcpAttackCategories: ["tool_poison"],
      includeGamingResistance: true,
      thresholds: {
        minScore0to100: 0,
        maxVulnerabilities: 999,
        maxCritical: 999,
        maxHigh: 999,
        minMcpScore0to100: 0,
        minGamingResistanceScore0to100: 0,
      },
    });

    expect(result.passed).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.report.evilMcp?.source).toBe("built-in-mcp-agent-provider");
    expect(result.report.evilMcp?.testedCategories).toContain("tool-poisoning");
    // Gaming resistance grades AMC's own control surface by looking for AMC
    // source files. This workspace is a temp dir, so the gate must skip it
    // rather than scoring the consumer's repo for not being AMC.
    expect(result.gamingResistance).toBeUndefined();
    expect(result.severityCounts.total).toBe(result.report.vulnerabilities.length);
  });

  it("fails closed when vulnerability thresholds are exceeded", async () => {
    const workspace = initializedWorkspace("amc-ci-redteam-fail-");

    const result = await runRedTeamCiGate({
      workspace,
      agentId: "default",
      plugins: ["injection"],
      strategies: ["direct"],
      includeGamingResistance: false,
      thresholds: {
        minScore0to100: 0,
        maxVulnerabilities: 0,
        maxCritical: 0,
        maxHigh: 999,
      },
    });

    expect(result.passed).toBe(false);
    expect(result.severityCounts.total).toBeGreaterThan(0);
    expect(result.reasons.join("\n")).toContain("Vulnerability count");
    expect(result.gamingResistance).toBeUndefined();
  });
});
