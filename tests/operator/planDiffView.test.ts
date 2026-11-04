/**
 * P2-22 plan diff and activation. Diff cases use the P1-10 synthetic compiler catalog (no legal review, no deployment);
 * activation uses the shipped catalog's L0-IDN-01 fixture profile, signed and reviewed in a temporary workspace.
 */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { decideApprovalForIntent } from "../../src/approvals/approvalEngine.js";
import { approvalRequestBindingDigest, loadApprovalRequestRecord } from "../../src/approvals/approvalChainStore.js";
import { initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import { activeControlPlan } from "../../src/catalog/compiler/activate.js";
import { compilePlan, parseDeploymentProfile } from "../../src/catalog/compiler/compile.js";
import { signPlan } from "../../src/catalog/compiler/sign.js";
import type { CompiledPlan, SignedPlan } from "../../src/catalog/compiler/types.js";
import { activateOperatorPlan, listOperatorPlans, OperatorPlanError, operatorPlanDiff, type PlanCandidate, type PlanSource } from "../../src/operator/planDiffView.js";
import { initWorkspace } from "../../src/workspace.js";
import { AS_OF, CONTROL_IDS, createCompilerFixture, makeProfile } from "../catalog/compiler/helpers.js";
import { catalog } from "../catalog/l0/harness.js";

vi.setConfig({ testTimeout: 120_000 });
let workspace: string;
let checkpoints: string;

beforeEach(() => {
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-p222-plan-")));
  checkpoints = realpathSync(mkdtempSync(join(tmpdir(), "amc-p222-ckpt-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", checkpoints);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initApprovalPolicy(workspace);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(workspace, { recursive: true, force: true });
  rmSync(checkpoints, { recursive: true, force: true });
});

const candidate = (signed: Pick<SignedPlan, "plan" | "signature" | "compiledAt"> | null, plan: CompiledPlan, revisionNo = 1): PlanCandidate =>
  ({ plan, signed, previousPlanDigest: null, source: { kind: "a4", projectId: "a4p_00000000000000000000000000000001", revisionNo, agentId: "default" } });
const sourcesOf = (candidates: PlanCandidate[]): Record<string, PlanSource> => ({ fixture: () => candidates });
const signed = (plan: CompiledPlan, reviewAgentId: string | null = null) => signPlan({ workspace, plan, previous: null, reviewAgentId, allowWeakening: true }).signed;

function refusal(run: () => unknown): { status: number; code: string } {
  try {
    run();
  } catch (error) {
    if (error instanceof OperatorPlanError) return { status: error.status, code: error.code };
    throw error;
  }
  throw new Error("expected a refusal");
}

describe("operator plan diff", () => {
  test("two compiled plans: the changed requirement with the compiler's reason, a conflict with its resolution", () => {
    const fixture = createCompilerFixture();
    try {
      const before = compilePlan({ catalog: fixture.catalog, profile: fixture.profile, asOf: AS_OF });
      const after = compilePlan({ catalog: fixture.catalog, asOf: AS_OF, profile: makeProfile({ entityTypes: {
        value: ["hipaa_covered_entity"], provenance: "asserted", source: "fixture: synthetic entity change", reviewedBy: null } }) });
      const wealth = fixture.catalog.controls.get(CONTROL_IDS.wealth)!;
      const technology = fixture.catalog.controls.get(CONTROL_IDS.technology)!;
      for (const [record, value] of [[wealth, 1], [technology, 2]] as const) {
        record.binding = { kind: "enforcement_point", points: ["approvals"], mechanism: "Synthetic merge vector", manualDuty: null,
          parameters: [{ name: "approvals.WRITE_HIGH.requiredApprovals", strictness: "max", value }] };
      }
      const conflicted = compilePlan({ catalog: fixture.catalog, profile: fixture.profile, asOf: AS_OF });
      const sources = sourcesOf([before, after, conflicted].map((plan, index) => candidate(signed(plan), plan, index + 1)));

      const { diff, markdown } = operatorPlanDiff(workspace, before.digest, after.digest, Date.now(), sources);
      expect(diff.requirements).toEqual([{ controlId: CONTROL_IDS.jurisdiction, change: "applicability", before: "applicable", after: "not_applicable",
        reason: "applicability predicate is false" }]);
      expect(markdown).toContain("(applicability predicate is false)");

      const conflicts = operatorPlanDiff(workspace, before.digest, conflicted.digest, Date.now(), sources).diff.conflicts ?? [];
      // Every conflict the plans resolve differently is listed with its resolution on each side.
      expect(before.conflicts.length).toBeGreaterThan(0);
      for (const row of before.conflicts) {
        const now = conflicted.conflicts.find((other) => other.parameter === row.parameter)?.resolution ?? null;
        if (now !== row.resolution) expect(conflicts).toContainEqual({ path: `[${row.parameter}].resolution`, before: row.resolution, after: now });
      }
      expect(conflicts.some((row) => row.path.endsWith("].resolution"))).toBe(true);

      const listed = listOperatorPlans(workspace, Date.now(), sources);
      expect(listed.sources).toEqual({ fixture: "ok" });
      expect(listed.plans.map((plan) => plan.signature)).toEqual(["verified", "verified", "verified"]);
    } finally {
      fixture.cleanup();
    }
  });

  test("identical plans give an empty diff", () => {
    const fixture = createCompilerFixture();
    try {
      const plan = compilePlan({ catalog: fixture.catalog, profile: fixture.profile, asOf: AS_OF });
      const { diff } = operatorPlanDiff(workspace, plan.digest, plan.digest, Date.now(), sourcesOf([candidate(signed(plan), plan)]));
      expect(diff).toEqual({ previousDigest: plan.digest, requirements: [], runtimePolicy: [], evidencePlan: [], conflicts: [], mergeRules: [], mergeExceptionRejected: [] });
    } finally {
      fixture.cleanup();
    }
  });

  test("a source that fails is named unavailable, never dropped", () => {
    const listed = listOperatorPlans(workspace, Date.now(), { broken: () => { throw new Error("unreadable"); } });
    expect(listed).toMatchObject({ plans: [], sources: { broken: "unavailable" } });
  });
});

describe("operator plan activation", () => {
  const profile = () => parseDeploymentProfile((catalog.fixtures.get("L0-IDN-01/positive/lease-and-principal.json")!.envelope!.setup as { profile: unknown }).profile);
  const shippedPlan = (profileId?: string) => compilePlan({ profile: profileId ? { ...profile(), profileId } : profile(), catalog, asOf: new Date().toISOString() });
  const approve = (approvalId: string, userId: string, bound = true) => {
    const request = loadApprovalRequestRecord({ workspace, agentId: "default", approvalRequestId: approvalId, requireValidSignature: true });
    decideApprovalForIntent({ workspace, agentId: "default", approvalId, decision: "APPROVED", mode: "EXECUTE", reason: "P2-22 fixture plan review",
      userId, username: userId, userRoles: ["OWNER"], ...(bound ? { expectedRequestDigestSha256: approvalRequestBindingDigest(request) } : {}) });
  };

  test("refuses without an approval, with one for another plan, with an unsigned plan, and with unbound or self decisions", () => {
    const plan = shippedPlan();
    const other = shippedPlan("layer0-identity-fixture-other");
    expect(other.digest).not.toBe(plan.digest);
    const mine = signed(plan, "default");
    const theirs = signed(other, "default");
    approve(theirs.review.approvalRequestId!, "approver-1");
    approve(theirs.review.approvalRequestId!, "approver-2");
    const sources = sourcesOf([candidate(mine, plan), candidate(theirs, other, 2)]);
    const activate = (approvalId: string | undefined, caller = "owner", digest = plan.digest, from = sources) =>
      refusal(() => activateOperatorPlan({ workspace, planDigest: digest, approvalId, caller, sources: from }));

    expect(activate(undefined)).toEqual({ status: 403, code: "APPROVAL_REQUIRED" });
    expect(activate(theirs.review.approvalRequestId!)).toEqual({ status: 403, code: "PLAN_REVIEW_NOT_APPROVED" });
    expect(activate(mine.review.approvalRequestId!, "owner", plan.digest, sourcesOf([candidate(null, plan)]))).toEqual({ status: 409, code: "PLAN_UNSIGNED" });
    const forged = { ...mine, signature: { ...mine.signature, signature: Buffer.alloc(64).toString("base64") } };
    expect(activate(mine.review.approvalRequestId!, "owner", plan.digest, sourcesOf([candidate(forged, plan)]))).toEqual({ status: 409, code: "PLAN_UNSIGNED" });

    // Decisions recorded without the request digest count for nothing, and the caller never counts as an approver.
    approve(mine.review.approvalRequestId!, "approver-1", false);
    approve(mine.review.approvalRequestId!, "approver-2");
    expect(activate(mine.review.approvalRequestId!, "owner")).toEqual({ status: 403, code: "APPROVAL_NOT_BOUND" });
    const again = signed(plan, "default").review.approvalRequestId!;
    approve(again, "owner");
    approve(again, "approver-2");
    expect(activate(again, "owner")).toEqual({ status: 403, code: "APPROVAL_NOT_BOUND" });
    expect(activeControlPlan(workspace)).toBeNull();
  });

  test("activates with approvals bound to the review request's digest", () => {
    const plan = shippedPlan();
    const mine = signed(plan, "default");
    approve(mine.review.approvalRequestId!, "approver-1");
    approve(mine.review.approvalRequestId!, "approver-2");
    const result = activateOperatorPlan({ workspace, planDigest: plan.digest, approvalId: mine.review.approvalRequestId!, caller: "owner",
      sources: sourcesOf([candidate(mine, plan)]) });
    expect(result).toMatchObject({ revision: 1, approvers: ["approver-1", "approver-2"] });
    expect(activeControlPlan(workspace)?.digest).toBe(plan.digest);
    // The review is consumed: a second activation with it is refused.
    expect(refusal(() => activateOperatorPlan({ workspace, planDigest: plan.digest, approvalId: mine.review.approvalRequestId!, caller: "owner",
      sources: sourcesOf([candidate(mine, plan)]) })).status).toBe(403);
  });
});
