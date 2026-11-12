/**
 * pending-checks P1-14 (Adapt copy): a plan activated before a catalog change fails the lock check when the active policy
 * is loaded. That is not an unreadable plan a restore fixes: loadActiveCompiledPolicy throws ACTIVE_PLAN_LOCK_MISMATCH,
 * Understand records that code as the active plan, and Adapt's readiness names it with "recompile and re-approve".
 * The catalog change is simulated: verifyCatalogLock answers a mismatch once `catalogMoved` is set.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { pendingExecutors } from "../../src/a4/a4Gates.js";
import { activePlanRecord } from "../../src/a4/adaptPolicy.js";
import { attempt } from "../../src/a4/stages/common.js";
import { decideApprovalForIntent } from "../../src/approvals/approvalEngine.js";
import { initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import { activateControlPlan, loadActiveCompiledPolicy } from "../../src/catalog/compiler/activate.js";
import { compilePlan, parseDeploymentProfile } from "../../src/catalog/compiler/compile.js";
import { signPlan } from "../../src/catalog/compiler/sign.js";
import { catalog } from "../catalog/l0/harness.js";
import { newWorkspace } from "../catalog/l0/workspaces.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { ADAPT_ANSWERS, ASSEMBLE_ANSWERS, Journey } from "./a4Journey.js";

const moved = vi.hoisted(() => ({ catalog: false }));
vi.mock("../../src/catalog/lockfile.js", async (original) => {
  const real = await original<typeof import("../../src/catalog/lockfile.js")>();
  return { ...real, verifyCatalogLock: (...args: Parameters<typeof real.verifyCatalogLock>) => moved.catalog
    ? { ok: false, mismatches: [{ path: "controls.L0-IDN-01.sha256", expected: "a".repeat(64), actual: "b".repeat(64) }] } : real.verifyCatalogLock(...args) };
});

vi.setConfig({ testTimeout: 300_000 });
afterEach(() => {
  moved.catalog = false;
  pendingExecutors.clear();
  cleanupGovernanceFixtures();
});

/** A ready plan activated as the L0 fixtures do it (two OWNER decisions on its plan review). */
function activate(ws: string): void {
  initApprovalPolicy(ws);
  const profile = (catalog.fixtures.get("L0-IDN-01/positive/lease-and-principal.json")?.envelope?.setup as { profile: unknown }).profile;
  const plan = compilePlan({ profile: parseDeploymentProfile(profile), catalog, asOf: new Date().toISOString() });
  const { signed } = signPlan({ workspace: ws, plan, previous: null, reviewAgentId: "default" });
  const approvalId = signed.review.approvalRequestId!;
  for (const userId of ["owner-1", "owner-2"]) {
    decideApprovalForIntent({ reviewerAuthentication: "authenticated", workspace: ws, agentId: "default", approvalId, decision: "APPROVED", mode: "EXECUTE", reason: "lock fixture plan review",
      userId, username: userId, userRoles: ["OWNER"] });
  }
  activateControlPlan({ workspace: ws, signed, approvalRequestId: approvalId, reviewAgentId: "default" });
}

describe("an active plan that fails the catalog lock check", () => {
  test("loading it throws ACTIVE_PLAN_LOCK_MISMATCH, which Understand's read records as the active plan", () => {
    const ws = newWorkspace();
    activate(ws);
    expect(loadActiveCompiledPolicy(ws)).not.toBeNull();
    moved.catalog = true;
    expect(() => loadActiveCompiledPolicy(ws)).toThrow(expect.objectContaining({ code: "ACTIVE_PLAN_LOCK_MISMATCH", message: expect.stringMatching(/recompile and reactivate/) }));
    expect(attempt(() => activePlanRecord(ws))).toEqual({ error: "ACTIVE_PLAN_LOCK_MISMATCH" });
  });

  test("Adapt's readiness names it with its own reason code and says recompile and re-approve", async () => {
    const j = await Journey.start();
    await j.throughAspire();
    await j.stage("assemble", ASSEMBLE_ANSWERS);
    activate(j.t.workspace);
    moved.catalog = true;
    // Understand reads the active plan (the project is regulated from here, so the fixture's acknowledgements do not apply).
    const answers = Object.entries(ADAPT_ANSWERS).map(([questionId, value]) => ({ questionId, value }));
    await j.p.ok(j.t.alice, "/stages/adapt/answers", { answers });
    await j.p.ok(j.t.alice, "/stages/adapt/understand");
    const item = (await j.p.get(j.t.alice, "/readiness?stage=adapt")).body.data!.items as Array<{ id: string; status: string; reasonCodes: string[];
      mandatory: boolean; nextAction?: { label: string } }>;
    const lock = item.find((entry) => entry.id === "active_plan_lock");
    expect(lock).toMatchObject({ status: "WAITING", reasonCodes: ["ACTIVE_PLAN_LOCK_MISMATCH"], mandatory: false });
    expect(lock!.nextAction!.label).toMatch(/recompile and re-approve/);
    expect(item.some((entry) => entry.reasonCodes.includes("ACTIVE_PLAN_UNREADABLE"))).toBe(false);
  });
});
