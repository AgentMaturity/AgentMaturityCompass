import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { compilePlan } from "../../../src/catalog/compiler/compile.js";
import { mergeParameters } from "../../../src/catalog/compiler/merge.js";
import { CompileError, type ReviewerException } from "../../../src/catalog/compiler/types.js";
import type { Binding, ControlRecord, EnforcementPoint } from "../../../src/catalog/types.js";
import { AS_OF, CONTROL_IDS, createCompilerFixture } from "./helpers.js";

type Parameter = Binding["parameters"][number];
let fixture: ReturnType<typeof createCompilerFixture>;
let left: ControlRecord;
let right: ControlRecord;

beforeEach(() => {
  fixture = createCompilerFixture();
  // Isolate this vector from the valid fixture's unrelated default parameters.
  for (const control of fixture.catalog.controls.values()) control.binding.parameters = [];
  const wealth = fixture.catalog.controls.get(CONTROL_IDS.wealth);
  const technology = fixture.catalog.controls.get(CONTROL_IDS.technology);
  if (!wealth || !technology) throw new Error("synthetic compiler fixture lacks its two station controls");
  left = wealth;
  right = technology;
});

afterEach(() => fixture?.cleanup());

function setPair(name: string, strictness: Parameter["strictness"], a: Parameter["value"], b: Parameter["value"], point: EnforcementPoint): void {
  left.binding = { kind: "enforcement_point", points: [point], mechanism: "Synthetic compiler merge vector", parameters: [{ name, strictness, value: a }], manualDuty: null };
  right.binding = { kind: "enforcement_point", points: [point], mechanism: "Synthetic compiler merge vector", parameters: [{ name, strictness, value: b }], manualDuty: null };
}

function compile() {
  return compilePlan({ catalog: fixture.catalog, profile: fixture.profile, asOf: AS_OF });
}

function retentionPair(): void {
  setPair("deletion.retentionDays.auditLog", "none", 30, 90, "deletion_executor");
}

function retentionException(expiresAt: string): ReviewerException {
  // A synthetic profile input exercising compiler semantics, not a genuine signed approval or expert review.
  return {
    id: "synthetic-retention-choice", controlId: CONTROL_IDS.wealth,
    parameter: "deletion.retentionDays.auditLog", value: 30,
    reason: "Synthetic compiler-only choice, no legal or expert approval",
    approver: { userId: "synthetic-compiler-reviewer", role: "AUDITOR" },
    approvalRequestId: "synthetic-not-a-signed-approval", expiresAt
  };
}

describe("compiler parameter merge strictness (synthetic catalog)", () => {
  test("max keeps the stricter two-station quorum and lists the difference", () => {
    setPair("approvals.WRITE_HIGH.requiredApprovals", "max", 1, 2, "approvals");
    const plan = compile();
    // Assert the merge result before default approval-policy floors could mask a looser merge.
    expect(plan.conflicts).toEqual([{
      parameter: "approvals.WRITE_HIGH.requiredApprovals", controlIds: [CONTROL_IDS.technology, CONTROL_IDS.wealth],
      values: [1, 2], strictness: "max", resolution: "stricter_applied", appliedValue: 2, exceptionId: null
    }]);
    expect(plan.runtimePolicy.approvals.WRITE_HIGH?.requiredApprovals).toBe(2);
    expect(plan.status).toBe("ready");
  });

  test("true_wins retains the required principal guard and its conflict", () => {
    setPair("toolPipeline.requirePrincipal", "true_wins", false, true, "tool_pipeline");
    const plan = compile();
    expect(plan.conflicts).toEqual([{
      parameter: "toolPipeline.requirePrincipal", controlIds: [CONTROL_IDS.technology, CONTROL_IDS.wealth],
      values: [false, true], strictness: "true_wins", resolution: "stricter_applied", appliedValue: true, exceptionId: null
    }]);
    expect(plan.runtimePolicy.toolPipeline.guards).toEqual([{
      id: "identity-binding", params: { requirePrincipal: true }, controlIds: [CONTROL_IDS.technology, CONTROL_IDS.wealth]
    }]);
    expect(plan.status).toBe("ready");
  });

  test("union retains both egress host sets once in stable order", () => {
    setPair("egress.allowHosts", "union", ["zeta.example", "shared.example"], ["alpha.example", "shared.example"], "egress");
    const plan = compile();
    expect(plan.conflicts).toEqual([{
      parameter: "egress.allowHosts", controlIds: [CONTROL_IDS.technology, CONTROL_IDS.wealth],
      values: [["alpha.example", "shared.example"], ["shared.example", "zeta.example"]], strictness: "union",
      resolution: "stricter_applied", appliedValue: ["alpha.example", "shared.example", "zeta.example"], exceptionId: null
    }]);
    expect(plan.runtimePolicy.egress.allowHosts).toEqual(["alpha.example", "shared.example", "zeta.example"]);
    expect(plan.status).toBe("ready");
  });

  test("empty intersection remains unresolved and blocks the plan", () => {
    setPair("toolPipeline.visibleTools", "intersection", ["synthetic.alpha"], ["synthetic.beta"], "tool_pipeline");
    const plan = compile();
    expect(plan.conflicts).toEqual([{
      parameter: "toolPipeline.visibleTools", controlIds: [CONTROL_IDS.technology, CONTROL_IDS.wealth],
      values: [["synthetic.alpha"], ["synthetic.beta"]], strictness: "intersection",
      resolution: "unresolved", appliedValue: null, exceptionId: null
    }]);
    expect(plan.status).toBe("blocked");
  });

  test("none leaves differing retention values unresolved and unapplied", () => {
    retentionPair();
    const plan = compile();
    expect(plan.conflicts).toEqual([{
      parameter: "deletion.retentionDays.auditLog", controlIds: [CONTROL_IDS.technology, CONTROL_IDS.wealth],
      values: [30, 90], strictness: "none", resolution: "unresolved", appliedValue: null, exceptionId: null
    }]);
    expect(plan.runtimePolicy.deletion.retentionDays).toEqual({});
    expect(plan.status).toBe("blocked");
  });

  test("an unexpired named exception selects one retention value through compilePlan", () => {
    retentionPair();
    fixture.profile.exceptions = [retentionException("2026-10-17T00:00:00Z")];
    const plan = compile();
    expect(plan.conflicts).toEqual([{
      parameter: "deletion.retentionDays.auditLog", controlIds: [CONTROL_IDS.technology, CONTROL_IDS.wealth],
      values: [30, 90], strictness: "none", resolution: "reviewer_exception", appliedValue: 30, exceptionId: "synthetic-retention-choice"
    }]);
    expect(plan.runtimePolicy.deletion.retentionDays).toEqual({ auditLog: 30 });
    expect(plan.status).toBe("ready");
  });

  test("an exception expired before asOf cannot resolve retention", () => {
    retentionPair();
    fixture.profile.exceptions = [retentionException("2026-10-15T00:00:00Z")];
    const plan = compile();
    expect(plan.conflicts).toEqual([{
      parameter: "deletion.retentionDays.auditLog", controlIds: [CONTROL_IDS.technology, CONTROL_IDS.wealth],
      values: [30, 90], strictness: "none", resolution: "unresolved", appliedValue: null, exceptionId: null
    }]);
    expect(plan.requirements.find((r) => r.controlId === CONTROL_IDS.wealth)?.reasons).toContain(
      "reviewer exception synthetic-retention-choice expired at 2026-10-15T00:00:00Z; ignored"
    );
    expect(plan.runtimePolicy.deletion.retentionDays).toEqual({});
    expect(plan.status).toBe("blocked");
  });

  test("a mandatory Layer 0 exclusion is refused with EXCEPTION_ON_LAYER0", () => {
    fixture.profile.exceptions = [{
      ...retentionException("2026-10-17T00:00:00Z"), id: "synthetic-layer0-exclusion",
      controlId: CONTROL_IDS.layer0, parameter: null, value: null
    }];
    expect(() => compile()).toThrow(CompileError);
    expect(() => compile()).toThrow(/^EXCEPTION_ON_LAYER0:/);
  });

  test("mixed strictness is refused by both direct merge and compile validation", () => {
    setPair("approvals.WRITE_HIGH.requiredApprovals", "max", 1, 2, "approvals");
    right.binding.parameters[0]!.strictness = "min";
    expect(() => mergeParameters([left, right], [])).toThrow(CompileError);
    expect(() => mergeParameters([left, right], [])).toThrow(/^STRICTNESS_MISMATCH:/);
    expect(() => compile()).toThrow(CompileError);
    expect(() => compile()).toThrow(/^STRICTNESS_MISMATCH:/);
  });
});
