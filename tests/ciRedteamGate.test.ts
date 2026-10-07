import { mkdirSync, mkdtempSync } from "node:fs";
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
  it("passes the selected red-team and Evil MCP gates when gaming resistance is explicitly disabled", async () => {
    const workspace = initializedWorkspace("amc-ci-redteam-pass-");

    const result = await runRedTeamCiGate({
      workspace,
      agentId: "default",
      plugins: ["injection"],
      strategies: ["direct"],
      evilMcp: true,
      mcpAttackCategories: ["tool_poison"],
      includeGamingResistance: false,
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
    // An explicit opt-out supplies no gaming-resistance assurance.
    expect(result.gamingResistance).toBeUndefined();
    expect(result.severityCounts.total).toBe(result.report.vulnerabilities.length);
  });

  it.each([false, true])("fails a requested gaming gate with unavailable evidence, source markers=%s", async (spoofSource) => {
    const workspace = initializedWorkspace("amc-ci-redteam-inventory-");
    if (spoofSource) {
      // Even empty directories with source-file names earned a perfect score
      // before source inventory was separated from behavioral evidence.
      for (const path of [
        "src/score", "src/diagnostic", "src/ledger", "src/evidence", "src/vault",
        "src/score/evidenceCoverageGap.ts", "src/diagnostic/questionBank.ts",
        "src/score/operationalIndependence.ts", "src/score/claimExpiry.ts",
        "src/score/confidenceDrift.ts", "src/gateway", "src/assurance/packs",
        "src/score/behavioralTransparency.ts", "tests", "src/score/simplicityScoring.ts",
        "src/score/predictiveValidity.ts",
      ]) mkdirSync(join(workspace, path), { recursive: true });
    }
    const result = await runRedTeamCiGate({
      workspace,
      agentId: "default",
      plugins: ["injection"],
      strategies: ["direct"],
      // The default is a required gaming-resistance gate.
      thresholds: {
        minScore0to100: 0,
        maxVulnerabilities: 999,
        maxCritical: 999,
        maxHigh: 999,
        minGamingResistanceScore0to100: 0,
      },
    });

    expect(result.passed).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(/gaming-resistance gate cannot pass without measured evidence/);
    expect(result.gamingResistance?.assessmentStatus).toBe("not_measured");
    expect(result.gamingResistance?.score).toBeNull();
    expect(result.gamingResistance?.level).toBeNull();
    expect(result.gamingResistance?.controlInventory.applicable).toBe(spoofSource);
    // P0-15: the inventory is a path list, never a number a spoofed source tree could raise.
    expect(result.gamingResistance?.controlInventory).not.toHaveProperty("score");
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
