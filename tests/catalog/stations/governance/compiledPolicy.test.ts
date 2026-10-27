import { describe, expect, it } from "vitest";
import type { GovernanceFixture } from "./harness.js";
import { evaluateGovernanceFixture, evaluateGovernanceProduction, governanceHarness, GOVERNANCE_IDS } from "./harness.js";

const harness = governanceHarness();
describe("Governance actual compiled policy (P3-14)", () => {
  it("selects all six controls across the three actual draft profiles", () => {
    const intended: Record<string, string[]> = {
      "governance-benefits-caseworker-draft": ["L1-GOV-01", "L1-GOV-02", "L1-GOV-03", "L1-GOV-05"],
      "governance-legal-drafting-draft": ["L1-GOV-04", "L1-GOV-05"],
      "governance-defense-analyst-draft": ["L1-GOV-06"]
    };
    for (const { profile, plan } of harness.plans) {
      expect(intended[profile.profileId], profile.profileId).toBeDefined();
      for (const id of intended[profile.profileId]!) {
        expect(plan.requirements.find((r) => r.controlId === id)?.applicability, `${profile.profileId}:${id}`).toBe("applicable");
      }
    }
    const selected = new Set(harness.plans.flatMap(({ plan }) => plan.requirements
      .filter((r) => GOVERNANCE_IDS.includes(r.controlId) && r.applicability === "applicable").map((r) => r.controlId)));
    expect([...selected].sort()).toEqual(GOVERNANCE_IDS);
  });
  for (const compiled of harness.plans) {
    it(`${compiled.profile.profileId}: missing production evidence is not evaluated with no enforcement`, () => {
      const selected = harness.controls.filter((control) => compiled.plan.requirements
        .some((r) => r.controlId === control.id && r.applicability === "applicable"));
      expect(selected.length).toBeGreaterThan(0);
      for (const control of selected) {
        const result = evaluateGovernanceProduction(harness.catalog, compiled, control);
        expect(result.planDigest).toBe(compiled.plan.digest);
        expect(result.dimensions.result, control.id).toBe("not_evaluated");
        expect(result.dimensions.enforcement, control.id).toEqual({ state: "none" });
        expect(result.admitted).toEqual([]);
      }
    });
  }
  for (const fixture of harness.fixtures) {
    it(`${fixture.ref}: actual compiled-policy evidence result is ${fixture.envelope.expected.result}`, () => {
      const setup = fixture.envelope.setup as { subject: { deploymentId: string } };
      const compiled = harness.plans.find(({ profile, plan }) => profile.deployment.deploymentId === setup.subject.deploymentId
        && plan.requirements.some((r) => r.controlId === fixture.control.id && r.applicability === "applicable"));
      expect(compiled, fixture.ref).toBeDefined();
      const actual = evaluateGovernanceFixture(harness.catalog, compiled!, fixture);
      expect(actual.dimensions.result).toBe(fixture.envelope.expected.result);
      expect(actual.dimensions.result).not.toBe("pass");
      expect(actual.dimensions.enforcement.state).not.toBe("enforced");
      const reason = fixture.envelope.expected.reasonCode;
      if (reason !== null) expect([...actual.rejected.map((r) => r.reason), actual.dimensions.evidence]).toContain(reason);
    });
  }
  it("refuses a nonselected requirement with a matching compiled subject", () => {
    const compiled = harness.plans.find(({ profile }) => profile.profileId === "governance-defense-analyst-draft")!;
    const control = harness.controls.find(row => row.id === "L1-GOV-01")!;
    expect(compiled).toBeDefined(); expect(control).toBeDefined();
    expect(compiled.plan.requirements.find(row => row.controlId === control.id)?.applicability).toBe("not_applicable");
    expect(() => evaluateGovernanceProduction(harness.catalog, compiled, control))
      .toThrow(`${compiled.profile.profileId} does not select ${control.id}`);
  });
  it("refuses a fixture subject outside the actual compiled deployment", () => {
    const original = harness.fixtures.find((f) => f.envelope.setup.governanceOracle !== undefined)!;
    expect(original).toBeDefined();
    const fixture: GovernanceFixture = structuredClone(original);
    const setup = fixture.envelope.setup as { subject: { tenantId: string; deploymentId: string } };
    const compiled = harness.plans.find(({ profile }) => profile.deployment.deploymentId === setup.subject.deploymentId)!;
    setup.subject.tenantId = "another-fixture-tenant";
    expect(() => evaluateGovernanceFixture(harness.catalog, compiled, fixture)).toThrow("Fixture subject is outside compiled");
  });
});
