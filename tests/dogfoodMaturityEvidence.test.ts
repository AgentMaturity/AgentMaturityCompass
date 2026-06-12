import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { generateDogfoodMaturityEvidence, DOGFOOD_MATURITY_AGENTS } from "../src/dogfood/maturityEvidence.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-dogfood-maturity-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function avgLevel(report: Awaited<ReturnType<typeof runDiagnostic>>): number {
  return report.layerScores.reduce((sum, layer) => sum + layer.avgFinalLevel, 0) / report.layerScores.length;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("dogfood maturity evidence", () => {
  test("generates strict question-bound evidence spanning L0, L3, and L5 profiles", async () => {
    const ws = workspace();
    const agents = [
      DOGFOOD_MATURITY_AGENTS.find((agent) => agent.targetMaturity === 0)!,
      DOGFOOD_MATURITY_AGENTS.find((agent) => agent.targetMaturity === 3)!,
      DOGFOOD_MATURITY_AGENTS.find((agent) => agent.targetMaturity === 5)!
    ];

    const reports = [];
    for (const agent of agents) {
      generateDogfoodMaturityEvidence({ workspace: ws, agent });
      reports.push(await runDiagnostic({
        workspace: ws,
        agentId: agent.id,
        window: "14d",
        targetName: "default",
        claimMode: "auto"
      }));
    }

    expect(avgLevel(reports[0]!)).toBe(0);
    expect(avgLevel(reports[1]!)).toBeGreaterThanOrEqual(2.75);
    expect(avgLevel(reports[1]!)).toBeLessThan(3.25);
    expect(avgLevel(reports[2]!)).toBeGreaterThanOrEqual(4.75);

    const l5Charter = reports[2]!.questionScores.find((score) => score.questionId === "AMC-1.1");
    expect(l5Charter?.finalLevel).toBe(5);
    expect(l5Charter?.evidenceEventIds.length).toBeGreaterThan(0);
  }, 120_000);
});
