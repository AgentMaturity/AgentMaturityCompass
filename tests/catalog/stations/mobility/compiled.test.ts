import { describe, expect, it } from "vitest";
import { compilePlan, parseDeploymentProfile } from "../../../../src/catalog/compiler/compile.js";
import type { FixtureEnvelope } from "../../../../src/catalog/types.js";
import { MOBILITY_IDS, mobilityHarness, evaluateMobilityFixture, evaluateMobilityProduction, type MobilityFixture } from "./harness.js";

const EXPECTED_ENFORCEMENT: Partial<Record<FixtureEnvelope["evidenceClass"], "observed" | "none">> = {
  valid: "observed", contradictory: "observed", violation: "observed", stale: "none", replayed: "none", cross_tenant: "none", empty: "none"
};
const harness = mobilityHarness();
describe("Mobility real compiled policy and native evidence admission (P3-17)", () => {
  it("selects exact port, tenant and fleet Mobility requirement sets", () => {
    const expected: Record<string, string[]> = {
      "mobility-port-operations-fixture": ["L1-MOB-01", "L1-MOB-03"],
      "mobility-tenant-screening-fixture": ["L1-MOB-02"],
      "mobility-fleet-software-fixture": ["L1-MOB-04", "L1-MOB-05", "L1-MOB-06"]
    };
    expect(harness.plans).toHaveLength(3);
    for (const { profile, plan } of harness.plans) {
      expect(plan.requirements.filter(row => MOBILITY_IDS.includes(row.controlId) && row.applicability === "applicable").map(row => row.controlId).sort()).toEqual(expected[profile.deployment.deploymentId]);
      for (const row of plan.requirements.filter(row => MOBILITY_IDS.includes(row.controlId))) expect(row.support).toBe("experimental");
      expect(plan.digest).toMatch(/^sha256:[a-f0-9]{64}$/); expect(plan.runtimePolicy.policyDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });
  it("composes actual Mobility and Technology requirements from asserted fleet facts", () => {
    const compiled = harness.plans.find(row => row.profile.deployment.deploymentId === "mobility-fleet-software-fixture")!;
    expect(compiled.profile.stations.value).toEqual(["mobility", "technology"]);
    expect(compiled.profile.domains.value).toEqual(expect.arrayContaining(["mobility.vehicles-aviation", "technology.platforms-data"]));
    const expected: Record<string, string> = { "L1-TECH-01": "not_applicable", "L1-TECH-02": "applicable", "L1-TECH-03": "applicable", "L1-TECH-04": "applicable",
      "L1-TECH-05": "not_applicable", "L1-TECH-06": "applicable", "L1-TECH-07": "applicable", "L1-TECH-08": "applicable" };
    expect(Object.fromEntries(compiled.plan.requirements.filter(row => row.controlId.startsWith("L1-TECH-")).map(row => [row.controlId, row.applicability]))).toEqual(expected);
    expect(compiled.profile.jurisdictions.value).toEqual(expect.arrayContaining(["US", "EU"]));
    for (const id of Object.keys(expected).filter(id => expected[id] === "applicable")) {
      const control = harness.catalog.controls.get(id)!; expect(control).toBeDefined();
      const actual = evaluateMobilityProduction(harness.catalog, compiled, control);
      expect(actual.dimensions.result).toBe("not_evaluated"); expect(actual.dimensions.enforcement).toEqual({ state: "none" }); expect(actual.admitted).toEqual([]);
    }
  });
  it("loads82 unique canonical envelopes with six independent five-negative evidence sets", () => {
    expect(harness.fixtures).toHaveLength(82); expect(new Set(harness.fixtures.map(row => row.ref)).size).toBe(82);
    expect(harness.fixtures.filter(row => row.envelope.setup.mobilityOracle !== undefined)).toHaveLength(40);
    for (const id of MOBILITY_IDS) for (const evidenceClass of ["stale", "replayed", "contradictory", "cross_tenant", "empty"]) {
      expect(harness.fixtures.some(row => row.control.id === id && row.envelope.evidenceClass === evidenceClass), id + ":" + evidenceClass).toBe(true);
    }
  });
  for (const fixture of harness.fixtures) it(fixture.ref + ": actual admission and result, distinct from synthetic oracle", () => {
    const setup = fixture.envelope.setup as { subject: { deploymentId: string } };
    const compiled = harness.plans.find(({ profile, plan }) => profile.deployment.deploymentId === setup.subject.deploymentId
      && plan.requirements.some(row => row.controlId === fixture.control.id && row.applicability === "applicable"));
    expect(compiled, fixture.ref).toBeDefined();
    const actual = evaluateMobilityFixture(harness.catalog, compiled!, fixture);
    expect(actual.planDigest).toBe(compiled!.plan.digest); expect(actual.dimensions.result).toBe(fixture.envelope.expected.result); expect(actual.dimensions.result).not.toBe("pass");
    expect(actual.claimKind).toBe("self_reported"); expect(actual.dimensions.enforcement).toEqual({ state: EXPECTED_ENFORCEMENT[fixture.envelope.evidenceClass] });
    expect(actual.dimensions.enforcement.state).not.toBe("enforced");
    if (fixture.envelope.expected.reasonCode !== null) expect([...actual.rejected.map(row => row.reason), actual.dimensions.evidence]).toContain(fixture.envelope.expected.reasonCode);
    if (["stale", "replayed", "cross_tenant"].includes(fixture.envelope.evidenceClass)) expect(actual.rejected.some(row => row.reason === fixture.envelope.expected.reasonCode)).toBe(true);
    if (fixture.envelope.evidenceClass === "contradictory") {
      expect(actual.dimensions.evidence).toBe("contradictory"); expect(actual.admitted.length).toBeGreaterThanOrEqual(2); expect(actual.reasons.join(" ")).toContain("admitted records disagree");
    }
    if (fixture.envelope.setup.mobilityOracle !== undefined) {
      expect(actual.dimensions.result).toBe("not_evaluated"); expect(actual.dimensions.enforcement).toEqual({ state: "none" }); expect(actual.admitted).toEqual([]);
    }
  });
  for (const compiled of harness.plans) it(compiled.profile.profileId + ": empty actual production never becomes synthetic enforcement", () => {
    const controls = harness.controls.filter(control => compiled.plan.requirements.some(row => row.controlId === control.id && row.applicability === "applicable"));
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      const actual = evaluateMobilityProduction(harness.catalog, compiled, control);
      expect(actual.planDigest).toBe(compiled.plan.digest); expect(actual.dimensions.result).toBe("not_evaluated"); expect(actual.dimensions.enforcement).toEqual({ state: "none" }); expect(actual.admitted).toEqual([]);
    }
  });
  it("leaves unknown domain facts unresolved and empty production not evaluated", () => {
    const original = harness.plans.find(row => row.profile.deployment.deploymentId === "mobility-port-operations-fixture")!;
    const profile = parseDeploymentProfile({ ...original.profile, domains: { ...original.profile.domains, value: null } });
    const plan = compilePlan({ profile, catalog: harness.catalog, asOf: "2026-10-19T00:00:00.000Z" });
    for (const id of ["L1-MOB-01", "L1-MOB-03"]) {
      const requirement = plan.requirements.find(row => row.controlId === id)!;
      expect(requirement.applicability).toBe("unresolved"); expect(requirement.missingFacts).toContain("domains");
      const actual = evaluateMobilityProduction(harness.catalog, { profile, plan }, harness.catalog.controls.get(id)!);
      expect(actual.dimensions.result).toBe("not_evaluated"); expect(actual.dimensions.enforcement).toEqual({ state: "none" });
    }
  });
  it("recompiles identical bytes into the same actual plan and evidence digests", () => {
    const repeated = mobilityHarness();
    expect(repeated.plans.map(row => [row.plan.digest, row.plan.runtimePolicy.policyDigest])).toEqual(harness.plans.map(row => [row.plan.digest, row.plan.runtimePolicy.policyDigest]));
    const fixture = harness.fixtures[0]!; const deploymentId = (fixture.envelope.setup as { subject: { deploymentId: string } }).subject.deploymentId;
    const first = harness.plans.find(row => row.profile.deployment.deploymentId === deploymentId)!;
    const second = repeated.plans.find(row => row.profile.deployment.deploymentId === deploymentId)!;
    expect(evaluateMobilityFixture(harness.catalog, first, fixture).digest).toBe(evaluateMobilityFixture(repeated.catalog, second, repeated.fixtures.find(row => row.ref === fixture.ref)!).digest);
  });
  it("refuses every fixture subject outside the actual compiled profile", () => {
    const original = harness.fixtures.find(row => row.envelope.setup.mobilityOracle !== undefined)!;
    for (const field of ["tenantId", "workspaceId", "deploymentId", "agentId"] as const) {
      const fixture: MobilityFixture = structuredClone(original);
      const setup = fixture.envelope.setup as { subject: { tenantId: string; workspaceId: string; deploymentId: string; agentId: string } };
      const compiled = harness.plans.find(row => row.profile.deployment.deploymentId === setup.subject.deploymentId)!;
      setup.subject[field] = "outside-profile";
      expect(() => evaluateMobilityFixture(harness.catalog, compiled, fixture)).toThrow("Fixture subject is outside compiled");
    }
  });
  it("refuses an unselected Mobility control even when its subject matches the profile", () => {
    const compiled = harness.plans.find(row => row.profile.deployment.deploymentId === "mobility-port-operations-fixture")!;
    expect(compiled.plan.requirements.find(row => row.controlId === "L1-MOB-06")).toMatchObject({ applicability: "not_applicable" });
    const fixture: MobilityFixture = structuredClone(harness.fixtures.find(row => row.control.id === "L1-MOB-06")!);
    const setup = fixture.envelope.setup as { subject: { tenantId: string; workspaceId: string; deploymentId: string; agentId: string } };
    const { tenantId, workspaceId, deploymentId, agentIds } = compiled.profile.deployment;
    Object.assign(setup.subject, { tenantId, workspaceId, deploymentId, agentId: agentIds[0]! });
    expect(() => evaluateMobilityFixture(harness.catalog, compiled, fixture)).toThrow("does not select");
  });
});
