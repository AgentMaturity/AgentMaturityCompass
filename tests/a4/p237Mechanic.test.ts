/**
 * P2-37: the Mechanic write link. A TUNE seed and an attach read the mechanic plan only when its signed pair verifies
 * under this workspace's auditor key and it is scoped to the project's agent; the mechanic's phases are recorded in its
 * own vocabulary, never as A4 stages. Real signed workspaces; the plan is a synthetic fixture saved through the
 * mechanic's own store (saveMechanicPlan), not a plan the planner computed.
 */
import { readFileSync, rmSync, writeFileSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mechanicPhaseView, mechanicPlanExecuted, readSignedMechanicPlan } from "../../src/a4/a4Mechanic.js";
import { saveMechanicPlan } from "../../src/mechanic/planStore.js";
import type { MechanicUpgradePlan } from "../../src/mechanic/upgradePlanSchema.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

const roots: string[] = [];
beforeEach(() => { vi.stubEnv("AMC_VAULT_PASSPHRASE", "p237-synthetic-only"); });
afterEach(() => { for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } vi.unstubAllEnvs(); });
function workspace(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p237-mech-")));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}
function plan(overrides: Partial<MechanicUpgradePlan> = {}): MechanicUpgradePlan {
  return { v: 1, planId: "mplan_p237", scope: { type: "AGENT", id: "default" }, generatedTs: 1_793_000_000_000,
    inputs: { targetsSha256: "a".repeat(64), measuredScorecardSha256: "b".repeat(64), bankVersion: 1, canonVersion: 1, cgxPackSha256: "c".repeat(64) },
    summary: { currentOverall: 2, targetOverall: 3, gapPointsTotal: 1, unknownQuestionsCount: 0, integrityIndex: 0.5, correlationRatio: 0.5, readiness: "NEEDS_EVIDENCE" },
    phases: [
      { phaseId: "assemble", goal: "a mechanic phase whose id spells an A4 stage", actions: [
        { id: "act-1", kind: "BUDGETS_APPLY", requiresApproval: false, effect: "budgets", evidenceToVerify: [], params: {}, executionStatus: "EXECUTED", executedTs: 1_793_000_000_100 }] },
      { phaseId: "p2", goal: "later", actions: [
        { id: "act-2", kind: "FORECAST_REFRESH", requiresApproval: false, effect: "forecast", evidenceToVerify: [], params: {}, executionStatus: "PENDING" }] }
    ],
    perQuestionPlan: [], eta: { status: "UNKNOWN" }, safety: { highRiskActionsCount: 0, requiresDualControl: false, blockedByFreeze: false, warnings: [] }, ...overrides };
}
const codeOf = (run: () => unknown): string | null => {
  try { run(); return null; } catch (error) { return (error as { code?: string }).code ?? String(error); }
};

describe("mechanic phases stay the mechanic's (P2-37)", () => {
  test("each phase is mechanic:<phaseId> with no A4 stage, whatever the id spells; action statuses as the plan states them", () => {
    expect(mechanicPhaseView(plan())).toEqual([
      { mechanicPhase: "mechanic:assemble", a4Stage: null, goal: "a mechanic phase whose id spells an A4 stage",
        actions: [{ id: "act-1", kind: "BUDGETS_APPLY", executionStatus: "EXECUTED", executedTs: 1_793_000_000_100 }] },
      { mechanicPhase: "mechanic:p2", a4Stage: null, goal: "later", actions: [{ id: "act-2", kind: "FORECAST_REFRESH", executionStatus: "PENDING", executedTs: null }] }
    ]);
    expect(mechanicPlanExecuted(plan())).toBe(true);
    expect(mechanicPlanExecuted(plan({ phases: [{ phaseId: "p1", goal: "g", actions: [{ ...plan().phases[1]!.actions[0]! }] }] }))).toBe(false);
  });
});

describe("the seed and attach read only a signed plan of this agent (P2-37)", () => {
  test("a signed plan of this agent reads; another agent's, a changed one and an unknown id are refused", () => {
    const root = workspace();
    const saved = saveMechanicPlan(root, plan());
    const read = readSignedMechanicPlan(root, "mplan_p237", "default");
    expect(read.plan.planId).toBe("mplan_p237");
    expect(read.path).toBe(saved.latestPath);
    expect(read.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(codeOf(() => readSignedMechanicPlan(root, "mplan_p237", "another-agent"))).toBe("MECHANIC_PLAN_OTHER_SCOPE");
    expect(codeOf(() => readSignedMechanicPlan(root, "mplan_unknown", "default"))).toBe("MECHANIC_PLAN_NOT_FOUND");
    // Edit both copies the mechanic wrote, keeping each parseable: the pair signature no longer matches.
    for (const path of [saved.latestPath, saved.snapshotPath]) writeFileSync(path, readFileSync(path, "utf8").replace("\"EXECUTED\"", "\"SKIPPED\""));
    expect(codeOf(() => readSignedMechanicPlan(root, "mplan_p237", "default"))).toBe("MECHANIC_PLAN_UNVERIFIED");
  });

  test("a plan with its signature removed is refused", () => {
    const root = workspace();
    const saved = saveMechanicPlan(root, plan());
    rmSync(saved.latestSigPath);
    rmSync(saved.snapshotSigPath);
    expect(codeOf(() => readSignedMechanicPlan(root, "mplan_p237", "default"))).toBe("MECHANIC_PLAN_UNVERIFIED");
  });
});
