import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { resolveRunReport, runDiagnostic } from "../src/diagnostic/runner.js";
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
});
