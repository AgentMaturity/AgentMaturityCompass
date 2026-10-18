import { describe, expect, it } from "vitest";
import type { FixtureEnvelope } from "../../../../src/catalog/types.js";
import { EDUCATION_IDS, educationHarness, evaluateEducationFixture, evaluateEducationProduction, type EducationFixture } from "./harness.js";

// Native enforcement "observed" records admission presence, not an observed claim or an enforced boundary.
const EXPECTED_FIXTURE_ENFORCEMENT: Partial<Record<FixtureEnvelope["evidenceClass"], "observed" | "none">> = {
  valid: "observed", contradictory: "observed", violation: "observed",
  stale: "none", replayed: "none", cross_tenant: "none", empty: "none"
};
const harness = educationHarness();
describe("Education actual compiled policy and evidence admission (P3-15)", () => {
  it("selects exact US and EU draft controls through actual profile facts", () => {
    const expected: Record<string, string[]> = {
      "education-grading-assistant-us-fixture": ["L1-EDU-01", "L1-EDU-03", "L1-EDU-04"],
      "education-grading-assistant-eu-fixture": ["L1-EDU-01", "L1-EDU-02", "L1-EDU-04"]
    };
    for (const { profile, plan } of harness.plans) {
      expect(plan.requirements.filter(row => EDUCATION_IDS.includes(row.controlId) && row.applicability === "applicable")
        .map(row => row.controlId).sort()).toEqual(expected[profile.profileId]);
      for (const requirement of plan.requirements.filter(row => EDUCATION_IDS.includes(row.controlId))) expect(requirement.support).toBe("experimental");
    }
  });
  it("runs every canonical envelope through the actual compiler/evaluator adapter", () => {
    expect(harness.fixtures).toHaveLength(45);
    for (const id of EDUCATION_IDS) {
      const fixtures = harness.fixtures.filter(fixture => fixture.control.id === id);
      for (const evidenceClass of ["stale", "replayed", "contradictory", "cross_tenant", "empty"]) {
        expect(fixtures.some(fixture => fixture.envelope.evidenceClass === evidenceClass), id + ":" + evidenceClass).toBe(true);
      }
    }
  });
  for (const fixture of harness.fixtures) it(fixture.ref + ": real evidence result", () => {
    const setup = fixture.envelope.setup as { subject: { deploymentId: string } };
    const compiled = harness.plans.find(({ profile, plan }) => profile.deployment.deploymentId === setup.subject.deploymentId
      && plan.requirements.some(row => row.controlId === fixture.control.id && row.applicability === "applicable"));
    expect(compiled, fixture.ref).toBeDefined();
    const actual = evaluateEducationFixture(harness.catalog, compiled!, fixture);
    expect(actual.planDigest).toBe(compiled!.plan.digest);
    expect(actual.dimensions.result).toBe(fixture.envelope.expected.result);
    expect(actual.dimensions.result).not.toBe("pass");
    const expectedEnforcement = EXPECTED_FIXTURE_ENFORCEMENT[fixture.envelope.evidenceClass];
    expect(expectedEnforcement, fixture.ref).toBeDefined();
    expect(actual.dimensions.enforcement).toEqual({ state: expectedEnforcement });
    expect(actual.dimensions.enforcement.state).not.toBe("enforced");
    expect(actual.claimKind).toBe("self_reported");
    if (fixture.envelope.expected.reasonCode !== null) {
      expect([...actual.rejected.map(row => row.reason), actual.dimensions.evidence]).toContain(fixture.envelope.expected.reasonCode);
    }
    if (fixture.envelope.evidenceClass === "stale" || fixture.envelope.evidenceClass === "replayed" || fixture.envelope.evidenceClass === "cross_tenant") {
      expect(actual.rejected.some(row => row.reason === fixture.envelope.expected.reasonCode), fixture.ref).toBe(true);
    }
    if (fixture.envelope.evidenceClass === "contradictory") {
      expect(actual.dimensions.evidence).toBe("contradictory");
      expect(actual.admitted.length).toBeGreaterThanOrEqual(2);
      expect(actual.reasons.join(" ")).toContain("admitted records disagree");
    }
  });
  for (const compiled of harness.plans) it(compiled.profile.profileId + ": absent production support is not evaluated with no enforcement", () => {
    const selected = harness.controls.filter(control => compiled.plan.requirements.some(row => row.controlId === control.id && row.applicability === "applicable"));
    expect(selected.length).toBeGreaterThan(0);
    for (const control of selected) {
      const actual = evaluateEducationProduction(harness.catalog, compiled, control);
      expect(actual.planDigest).toBe(compiled.plan.digest);
      expect(actual.dimensions.result).toBe("not_evaluated");
      expect(actual.dimensions.enforcement).toEqual({ state: "none" });
      expect(actual.admitted).toEqual([]);
    }
  });
  it("refuses a fixture subject outside the actual compiled deployment", () => {
    const original = harness.fixtures.find(fixture => fixture.envelope.setup.educationOracle !== undefined)!;
    expect(original).toBeDefined();
    const fixture: EducationFixture = structuredClone(original);
    const setup = fixture.envelope.setup as { subject: { tenantId: string; deploymentId: string } };
    const compiled = harness.plans.find(({ profile }) => profile.deployment.deploymentId === setup.subject.deploymentId)!;
    setup.subject.tenantId = "another-fixture-tenant";
    expect(() => evaluateEducationFixture(harness.catalog, compiled, fixture)).toThrow("Fixture subject is outside compiled");
  });
});
