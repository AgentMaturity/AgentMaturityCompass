import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { compareModels, generateReport, loadRunReport, runDiagnostic } from "../src/diagnostic/runner.js";
import { renderFailureRiskMarkdown, runFleetIndices, runIndicesForAgent } from "../src/assurance/indices.js";
import { applyAssurancePatchKit, listAssuranceHistory, runAssurance, verifyAssuranceRun } from "../src/assurance/assuranceRunner.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-diagnostic-assurance-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("diagnostic and assurance coverage expansion", () => {
  test("compareModels returns deterministic comparison between two model baselines", async () => {
    const ws = workspace();
    const a = await runDiagnostic({ workspace: ws, agentId: "default", window: "14d", targetName: "default", claimMode: "auto" });
    const b = await runDiagnostic({ workspace: ws, agentId: "default", window: "7d", targetName: "default", claimMode: "auto" });
    const cmp = await compareModels(ws, ["gpt-4o-mini@2024-11", "gpt-4o-mini@2025-01"], {
      agentId: "default",
      window: "14d",
      targetName: "default"
    });
    expect(cmp.models).toHaveLength(2);
    expect(cmp.comparisonMatrix[0]?.model).toContain("gpt-4o-mini");
    expect(typeof cmp.comparisonMatrix[0]?.overallScore).toBe("number");
  });

  test("generateReport renders markdown and loadRunReport reloads saved run", async () => {
    const ws = workspace();
    const report = await runDiagnostic({ workspace: ws, agentId: "default", window: "14d", targetName: "default", claimMode: "auto" });
    const reloaded = loadRunReport(ws, report.runId, "default");
    const markdown = generateReport(reloaded, "md");
    expect(reloaded.runId).toBe(report.runId);
    expect(markdown).toContain("#");
    expect(markdown.toLowerCase()).toContain("trust");
  });

  test("assurance run verifies, patch history is tracked, and indices render markdown", async () => {
    const ws = workspace();
    const diagnostic = await runDiagnostic({ workspace: ws, agentId: "default", window: "14d", targetName: "default", claimMode: "auto" });
    const assurance = await runAssurance({
      workspace: ws,
      agentId: "default",
      packId: "injection",
      mode: "supervise",
      window: "30d"
    });
    expect(assurance.assuranceRunId).toBeTruthy();

    const verified = await verifyAssuranceRun({ workspace: ws, assuranceRunId: assurance.assuranceRunId });
    expect(typeof verified.ok).toBe("boolean");

    const patch = await applyAssurancePatchKit({
      workspace: ws,
      assuranceRunId: assurance.assuranceRunId,
      agentId: "default"
    });
    expect(Array.isArray(patch.changedFiles)).toBe(true);
    expect(patch.changedFiles.length).toBeGreaterThan(0);

    const history = listAssuranceHistory({ workspace: ws });
    expect(history.length).toBeGreaterThan(0);

    const agentIndices = runIndicesForAgent({ workspace: ws, runId: diagnostic.runId, agentId: "default" });
    expect(agentIndices.agentId ?? "default").toBeTruthy();

    const fleetIndices = runFleetIndices({
      workspace: ws,
      windowStartTs: Date.now() - 30 * 24 * 60 * 60 * 1000,
      windowEndTs: Date.now()
    });
    expect(Array.isArray(fleetIndices)).toBe(true);

    const md = renderFailureRiskMarkdown(agentIndices as Parameters<typeof renderFailureRiskMarkdown>[0]);
    expect(md).toContain("Failure-Risk Indices");
  });
});
