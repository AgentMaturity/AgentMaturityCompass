import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { resolveRunReport, runDiagnostic } from "../src/diagnostic/runner.js";
import { latestRunSummary } from "../src/diagnostic/runReportResolution.js";
import { generateL5DeltaReport } from "../src/diagnostic/l5DeltaReport.js";
import { collectAuditBinderData } from "../src/audit/binderCollector.js";
import { loadAuditPolicy } from "../src/audit/auditPolicyStore.js";
import { loadAuditMapActive } from "../src/audit/auditMapStore.js";
import {
  aliasesForRun,
  listRunAliases,
  normalizeRunAlias,
  removeRunAlias,
  resolveRunAlias,
  saveRunAlias
} from "../src/diagnostic/runAliases.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-run-aliases-"));
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

describe("diagnostic run aliases", () => {
  test("normalizes safe names and rejects reserved or unsafe aliases", () => {
    expect(normalizeRunAlias("Q1 Client Assessment")).toBe("q1-client-assessment");
    expect(() => normalizeRunAlias("latest")).toThrow(/reserved/i);
    expect(() => normalizeRunAlias("../client")).toThrow(/path separators/i);
    expect(() => normalizeRunAlias("")).toThrow(/required/i);
  });

  test("persists aliases and resolves reports by alias without changing run IDs", async () => {
    const ws = workspace();
    const report = await runDiagnostic({
      workspace: ws,
      agentId: "default",
      window: "14d",
      targetName: "default",
      claimMode: "auto",
      noSign: true
    });

    const saved = saveRunAlias(ws, {
      alias: "Q1 Client Assessment",
      runId: report.runId,
      agentId: "default",
      now: 1234
    });

    expect(saved.alias).toBe("q1-client-assessment");
    expect(listRunAliases(ws, "default")).toHaveLength(1);
    expect(aliasesForRun(ws, report.runId, "default")).toEqual(["q1-client-assessment"]);

    const resolvedAlias = resolveRunAlias(ws, "Q1 Client Assessment", "default");
    expect(resolvedAlias?.runId).toBe(report.runId);

    const resolvedReport = resolveRunReport(ws, "Q1 Client Assessment", "default");
    expect(resolvedReport.resolvedBy).toBe("alias");
    expect(resolvedReport.alias).toBe("q1-client-assessment");
    expect(resolvedReport.resolvedRunId).toBe(report.runId);

    expect(removeRunAlias(ws, "q1-client-assessment", "default")).toBe(true);
    expect(resolveRunAlias(ws, "q1-client-assessment", "default")).toBeNull();
  });

  // P0-28: `amc up` looked in .amc/agents/default/runs, found nothing and reran the baseline on every start.
  test("latestRunSummary finds a run where the runner wrote it, so amc up does not rerun the baseline", async () => {
    const ws = workspace();
    expect(latestRunSummary(ws, "default")).toBeNull();
    const report = await runDiagnostic({ workspace: ws, agentId: "default", window: "14d", targetName: "default",
      claimMode: "auto", noSign: true });
    expect(latestRunSummary(ws, "default")?.runId).toBe(report.runId);
  });

  // P0-28: every other reader of .amc/agents/<id>/runs missed the default agent's runs the same way.
  test("the L5 delta report and the agent audit binder read the run the runner wrote", async () => {
    const ws = workspace();
    const binderNotes = async () => JSON.stringify((await collectAuditBinderData({ workspace: ws,
      scope: { type: "AGENT", id: "default" }, policy: loadAuditPolicy(ws), map: loadAuditMapActive(ws), nowTs: Date.now() })).binder);
    expect(generateL5DeltaReport({ workspace: ws, agentId: "default" }).runId).toBeNull();
    expect(await binderNotes()).toContain("No agent diagnostic runs were found.");
    const report = await runDiagnostic({ workspace: ws, agentId: "default", window: "14d", targetName: "default",
      claimMode: "auto", noSign: true });
    expect(generateL5DeltaReport({ workspace: ws, agentId: "default" }).runId).toBe(report.runId);
    expect(await binderNotes()).not.toContain("No agent diagnostic runs were found.");
  });
});
