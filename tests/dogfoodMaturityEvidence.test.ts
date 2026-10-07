import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { assertDogfoodSeedingAllowed, generateDogfoodMaturityEvidence, DOGFOOD_MATURITY_AGENTS } from "../src/dogfood/maturityEvidence.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * P0-18 step 7: the dogfood seeder is a development tool. It used to write OBSERVED gateway events, reverse-engineered
 * from each gate, that lifted seeded agents to L3 and L5. Its events are now labelled synthetic_example and no
 * diagnostic gate counts them, so seeding never changes a level.
 */
const roots: string[] = [];
const savedFlag = process.env.AMC_DEV_DOGFOOD;

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
  if (savedFlag === undefined) delete process.env.AMC_DEV_DOGFOOD;
  else process.env.AMC_DEV_DOGFOOD = savedFlag;
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

const L5 = DOGFOOD_MATURITY_AGENTS.find((agent) => agent.targetMaturity === 5)!;

describe("dogfood maturity evidence", () => {
  test("refuses to seed without AMC_DEV_DOGFOOD=1", () => {
    const ws = workspace();
    for (const value of [undefined, "", "0", "true"]) {
      if (value === undefined) delete process.env.AMC_DEV_DOGFOOD;
      else process.env.AMC_DEV_DOGFOOD = value;
      expect(() => generateDogfoodMaturityEvidence({ workspace: ws, agent: L5 }))
        .toThrow("dogfood seeding is a development tool: set AMC_DEV_DOGFOOD=1 in a source checkout");
    }
  });

  test("refuses from an installed package even with AMC_DEV_DOGFOOD=1", () => {
    const message = "dogfood seeding is a development tool: set AMC_DEV_DOGFOOD=1 in a source checkout";
    expect(() => assertDogfoodSeedingAllowed({ AMC_DEV_DOGFOOD: "1" }, "/srv/app/node_modules/agent-maturity-compass/dist/dogfood/maturityEvidence.js"))
      .toThrow(message);
    expect(() => assertDogfoodSeedingAllowed({ AMC_DEV_DOGFOOD: "1" }, "C:\\app\\node_modules\\agent-maturity-compass\\dist\\dogfood\\maturityEvidence.js"))
      .toThrow(message);
    expect(() => assertDogfoodSeedingAllowed({ AMC_DEV_DOGFOOD: "1" }, "/home/dev/amc/src/dogfood/maturityEvidence.ts")).not.toThrow();
  });

  test("labels every seeded event synthetic_example and SELF_REPORTED", () => {
    process.env.AMC_DEV_DOGFOOD = "1";
    const ws = workspace();
    const result = generateDogfoodMaturityEvidence({ workspace: ws, agent: L5 });
    expect(result.evidenceEventCount).toBeGreaterThan(0);
    const ledger = openLedger(ws);
    try {
      const seeded = ledger.getAllEvents().map((event) => JSON.parse(event.meta_json) as Record<string, unknown>)
        .filter((meta) => meta.source === "dogfood-maturity");
      expect(seeded.length).toBeGreaterThan(result.evidenceEventCount - 1);
      for (const meta of seeded) {
        expect(meta).toMatchObject({ trustTier: "SELF_REPORTED", claimKind: "synthetic_example", provenance: "dogfood" });
      }
    } finally {
      ledger.close();
    }
  });

  test("seeded evidence never raises a diagnostic level", async () => {
    process.env.AMC_DEV_DOGFOOD = "1";
    const ws = workspace();
    const agents = [3, 5].map((target) => DOGFOOD_MATURITY_AGENTS.find((agent) => agent.targetMaturity === target)!);
    for (const agent of agents) {
      generateDogfoodMaturityEvidence({ workspace: ws, agent });
      const report = await runDiagnostic({ workspace: ws, agentId: agent.id, window: "14d", targetName: "default", claimMode: "auto" });
      expect(avgLevel(report), agent.id).toBe(0);
      expect(report.questionScores.every((score) => score.finalLevel === 0 && score.evidenceEventIds.length === 0), agent.id).toBe(true);
    }
  }, 120_000);
});
