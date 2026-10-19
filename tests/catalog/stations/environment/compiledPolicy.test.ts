import { describe, expect, it } from "vitest";
import type { FixtureEnvelope } from "../../../../src/catalog/types.js";
import { ENVIRONMENT_IDS, environmentHarness, evaluateEnvironmentFixture, evaluateEnvironmentProduction, type EnvironmentFixture } from "./harness.js";

// Native observed means admitted records are present; it is neither observed trust nor an enforced boundary.
const EXPECTED_FIXTURE_ENFORCEMENT: Partial<Record<FixtureEnvelope["evidenceClass"], "observed" | "none">> = {
  valid: "observed", contradictory: "observed", violation: "observed", stale: "none", replayed: "none", cross_tenant: "none", empty: "none"
};
const harness = environmentHarness();
describe("Environment actual compiled policy and admission (P3-16)", () => {
  it("selects the exact US grid, India grid and food draft requirement sets", () => {
    const expected: Record<string, string[]> = {
      "environment-grid-operations-us-fixture": ["L1-ENV-01", "L1-ENV-02"],
      "environment-grid-operations-in-fixture": ["L1-ENV-01", "L1-ENV-02", "L1-ENV-03"],
      "environment-food-lot-release-fixture": ["L1-ENV-04", "L1-ENV-05", "L1-ENV-06"]
    };
    expect(harness.plans).toHaveLength(3);
    for (const { profile, plan } of harness.plans) {
      expect(plan.requirements.filter(row => ENVIRONMENT_IDS.includes(row.controlId) && row.applicability === "applicable")
        .map(row => row.controlId).sort()).toEqual(expected[profile.deployment.deploymentId]);
      for (const row of plan.requirements.filter(row => ENVIRONMENT_IDS.includes(row.controlId))) expect(row.support).toBe("experimental");
      expect(plan.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(plan.runtimePolicy.policyDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });
  it("declares Grid and utility Technology composition with only scoped draft requirements", () => {
    const expected: Record<string, { stations: string[]; domains: string[]; technology: string[]; cra: string }> = {
      "environment-grid-operations-us-fixture": { stations: ["environment", "technology"],
        domains: ["environment.energy-utilities-water", "technology.platforms-data"], technology: ["L1-TECH-03", "L1-TECH-04", "L1-TECH-08"], cra: "not_applicable" },
      "environment-grid-operations-in-fixture": { stations: ["environment", "technology"],
        domains: ["environment.energy-utilities-water", "technology.platforms-data"], technology: [], cra: "absent" },
      "environment-food-lot-release-fixture": { stations: ["environment"],
        domains: ["environment.food-textiles-manufacturing"], technology: [], cra: "absent" }
    };
    for (const compiled of harness.plans) {
      const wanted = expected[compiled.profile.deployment.deploymentId]!;
      expect(wanted).toBeDefined();
      expect(compiled.profile.stations).toMatchObject({ value: wanted.stations, provenance: "asserted", reviewedBy: null });
      expect(compiled.profile.domains).toMatchObject({ value: wanted.domains, provenance: "asserted", reviewedBy: null });
      const selected = compiled.plan.requirements.filter(row => row.controlId.startsWith("L1-TECH-") && row.applicability === "applicable");
      expect(selected.map(row => row.controlId).sort()).toEqual(wanted.technology);
      expect(compiled.plan.requirements.find(row => row.controlId === "L1-TECH-02")?.applicability ?? "absent").toBe(wanted.cra);
      // Declared composition selects draft scope; empty records establish no production boundary or legal scope.
      for (const row of selected) {
        expect(row.support).toBe("experimental");
        const control = harness.catalog.controls.get(row.controlId)!; expect(control).toBeDefined();
        const actual = evaluateEnvironmentProduction(harness.catalog, compiled, control);
        expect(actual.planDigest).toBe(compiled.plan.digest); expect(actual.claimKind).toBe("self_reported");
        expect(actual.dimensions.result).toBe("not_evaluated"); expect(actual.dimensions.enforcement).toEqual({ state: "none" });
        expect(actual.admitted).toEqual([]);
      }
    }
  });
  it("captures all 70 unique envelopes and five actual evidence-negative classes for each control", () => {
    expect(harness.fixtures).toHaveLength(70); expect(new Set(harness.fixtures.map(row => row.ref)).size).toBe(70);
    for (const id of ENVIRONMENT_IDS) for (const evidenceClass of ["stale", "replayed", "contradictory", "cross_tenant", "empty"]) {
      expect(harness.fixtures.some(row => row.control.id === id && row.envelope.evidenceClass === evidenceClass), id + ":" + evidenceClass).toBe(true);
    }
  });
  for (const fixture of harness.fixtures) it(fixture.ref + ": actual evidence outcome", () => {
    const setup = fixture.envelope.setup as { subject: { deploymentId: string } };
    const compiled = harness.plans.find(({ profile, plan }) => profile.deployment.deploymentId === setup.subject.deploymentId
      && plan.requirements.some(row => row.controlId === fixture.control.id && row.applicability === "applicable"));
    expect(compiled, fixture.ref).toBeDefined();
    const actual = evaluateEnvironmentFixture(harness.catalog, compiled!, fixture);
    expect(actual.planDigest).toBe(compiled!.plan.digest);
    expect(actual.dimensions.result).toBe(fixture.envelope.expected.result); expect(actual.dimensions.result).not.toBe("pass");
    const expectedEnforcement = EXPECTED_FIXTURE_ENFORCEMENT[fixture.envelope.evidenceClass]; expect(expectedEnforcement).toBeDefined();
    expect(actual.dimensions.enforcement).toEqual({ state: expectedEnforcement });
    expect(actual.dimensions.enforcement.state).not.toBe("enforced"); expect(actual.claimKind).toBe("self_reported");
    if (fixture.envelope.expected.reasonCode !== null) expect([...actual.rejected.map(row => row.reason), actual.dimensions.evidence]).toContain(fixture.envelope.expected.reasonCode);
    if (["stale", "replayed", "cross_tenant"].includes(fixture.envelope.evidenceClass)) {
      expect(actual.rejected.some(row => row.reason === fixture.envelope.expected.reasonCode), fixture.ref).toBe(true);
    }
    if (fixture.envelope.evidenceClass === "contradictory") {
      expect(actual.dimensions.evidence).toBe("contradictory"); expect(actual.admitted.length).toBeGreaterThanOrEqual(2);
      expect(actual.reasons.join(" ")).toContain("admitted records disagree");
    }
  });
  for (const compiled of harness.plans) it(compiled.profile.profileId + ": empty production stays not evaluated with none enforcement", () => {
    const selected = harness.controls.filter(control => compiled.plan.requirements.some(row => row.controlId === control.id && row.applicability === "applicable"));
    expect(selected.length).toBeGreaterThan(0);
    for (const control of selected) {
      const actual = evaluateEnvironmentProduction(harness.catalog, compiled, control);
      expect(actual.planDigest).toBe(compiled.plan.digest); expect(actual.dimensions.result).toBe("not_evaluated");
      expect(actual.dimensions.enforcement).toEqual({ state: "none" }); expect(actual.admitted).toEqual([]);
    }
  });
  it("recompiles identical source bytes to the same actual plan and evidence digests", () => {
    const repeated = environmentHarness();
    expect(repeated.plans.map(row => [row.plan.digest, row.plan.runtimePolicy.policyDigest])).toEqual(harness.plans.map(row => [row.plan.digest, row.plan.runtimePolicy.policyDigest]));
    const fixture = harness.fixtures[0]!;
    const deploymentId = (fixture.envelope.setup as { subject: { deploymentId: string } }).subject.deploymentId;
    const first = harness.plans.find(row => row.profile.deployment.deploymentId === deploymentId)!;
    const second = repeated.plans.find(row => row.profile.deployment.deploymentId === deploymentId)!;
    expect(evaluateEnvironmentFixture(harness.catalog, first, fixture).digest).toBe(evaluateEnvironmentFixture(repeated.catalog, second, repeated.fixtures.find(row => row.ref === fixture.ref)!).digest);
  });
  it("refuses every fixture subject outside the actual compiled deployment", () => {
    const original = harness.fixtures.find(row => row.envelope.setup.environmentOracle !== undefined)!; expect(original).toBeDefined();
    for (const field of ["tenantId", "workspaceId", "deploymentId", "agentId"] as const) {
      const fixture: EnvironmentFixture = structuredClone(original);
      const setup = fixture.envelope.setup as { subject: { tenantId: string; workspaceId: string; deploymentId: string; agentId: string } };
      const compiled = harness.plans.find(row => row.profile.deployment.deploymentId === setup.subject.deploymentId)!;
      setup.subject[field] = "outside-profile";
      expect(() => evaluateEnvironmentFixture(harness.catalog, compiled, fixture)).toThrow("Fixture subject is outside compiled");
    }
  });
  it("refuses a control outside the actual compiled profile requirements", () => {
    const compiled = harness.plans.find(row => row.profile.deployment.deploymentId === "environment-grid-operations-us-fixture")!;
    const fixture: EnvironmentFixture = structuredClone(harness.fixtures.find(row => row.control.id === "L1-ENV-06")!);
    const setup = fixture.envelope.setup as { subject: { tenantId: string; workspaceId: string; deploymentId: string; agentId: string } };
    const { tenantId, workspaceId, deploymentId, agentIds } = compiled.profile.deployment;
    Object.assign(setup.subject, { tenantId, workspaceId, deploymentId, agentId: agentIds[0]! });
    expect(compiled.plan.requirements.find(row => row.controlId === fixture.control.id)).toMatchObject({ applicability: "not_applicable" });
    expect(() => evaluateEnvironmentFixture(harness.catalog, compiled, fixture)).toThrow("does not select");
  });
});
