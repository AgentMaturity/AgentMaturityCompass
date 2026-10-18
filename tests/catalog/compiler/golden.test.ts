import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { compilePlan } from "../../../src/catalog/compiler/compile.js";
import { digestOf } from "../../../src/catalog/digest.js";
import { amcVersion } from "../../../src/version.js";
import { AS_OF, CONTROL_IDS, createCompilerFixture } from "./helpers.js";

const ids = [CONTROL_IDS.layer0, CONTROL_IDS.technology, CONTROL_IDS.wealth, CONTROL_IDS.jurisdiction];
const stationIds = [CONTROL_IDS.technology, CONTROL_IDS.wealth];
const VERSION = "<amcVersion>";
type Plan = ReturnType<typeof compilePlan>;
/**
 * The golden with the AMC version replaced by a placeholder and the plan digest recomputed over that body, so a release
 * bump alone does not change it; the real versions are asserted against amcVersion separately.
 */
function versionFree(plan: Plan): string {
  const { digest: _digest, ...body } = { ...plan, compiler: { ...plan.compiler, version: VERSION },
    lock: { ...plan.lock, generatedBy: { ...plan.lock.generatedBy, version: VERSION } } };
  return `${JSON.stringify({ ...body, digest: digestOf(body) }, null, 2)}\n`;
}

describe("compiler reviewed synthetic finance contract", () => {
  test("the complete plan matches the independently reviewed frozen bytes and compiles twice identically", () => {
    const fixture = createCompilerFixture();
    try {
      const plan = compilePlan({ catalog: fixture.catalog, profile: fixture.profile, asOf: AS_OF });
      // These literal planning oracles were authored before generating the candidate golden.
      expect(plan.status).toBe("ready");
      expect(plan.requirements.map(row => row.controlId)).toEqual(ids);
      expect(plan.requirements.map(row => ({
        applicability: row.applicability, missingFacts: row.missingFacts, exclusion: row.exclusion,
        citationsInScope: row.citationsInScope, mandatory: row.mandatory, support: row.support
      }))).toEqual(ids.map(() => ({
        applicability: "applicable", missingFacts: [], exclusion: null,
        citationsInScope: [], mandatory: true, support: "experimental"
      })));
      expect(plan.requirements.map(row => row.pulledInBy)).toEqual([
        ["layer0", "station:wealth", "station:technology"], ["station:technology"], ["station:wealth"],
        ["station:wealth", "station:technology", "jurisdiction:US"]
      ]);
      expect(plan.profile.factProvenance).toEqual({
        primaryStation: "reviewed", stations: "reviewed", domains: "reviewed", jurisdictions: "reviewed",
        roles: "reviewed", entityTypes: "reviewed", riskClass: "reviewed", useCases: "reviewed", dataClasses: "reviewed"
      });
      expect(plan.conflicts).toEqual([
        { parameter: "approvals.WRITE_HIGH.requireDistinctUsers", controlIds: stationIds,
          values: [false, true], strictness: "true_wins", resolution: "stricter_applied", appliedValue: true, exceptionId: null },
        { parameter: "approvals.WRITE_HIGH.requiredApprovals", controlIds: stationIds,
          values: [1, 2], strictness: "max", resolution: "stricter_applied", appliedValue: 2, exceptionId: null },
        { parameter: "egress.allowHosts", controlIds: stationIds,
          values: [["technology.example.test"], ["wealth.example.test"]], strictness: "union",
          resolution: "stricter_applied", appliedValue: ["technology.example.test", "wealth.example.test"], exceptionId: null }
      ]);
      expect(plan.runtimePolicy.toolPipeline.guards).toEqual([{
        id: "identity-binding", params: { requireAgentLease: true, requirePrincipal: true },
        controlIds: [CONTROL_IDS.layer0, CONTROL_IDS.jurisdiction]
      }]);
      expect(plan.runtimePolicy.approvals).toEqual({ WRITE_HIGH: {
        requiredApprovals: 2, requireDistinctUsers: true, rolesAllowed: ["APPROVER", "OWNER"], ttlMinutes: 15,
        controlIds: stationIds
      } });
      expect(plan.runtimePolicy.egress).toEqual({
        mode: "deny_by_default", allowHosts: ["technology.example.test", "wealth.example.test"],
        processorAllowlist: [], controlIds: stationIds
      });
      expect(plan.runtimePolicy.deletion).toEqual({ unknownHold: "deny", retentionDays: {}, controlIds: [] });
      expect(plan.evidencePlan).toEqual({
        tests: ids.map(controlId => ({ controlId, testId: `${controlId}-T1`, type: "configuration_check", attempts: 1,
          fixtures: [`${controlId}/negative/violation.json`, `${controlId}/positive/valid.json`],
          runOn: ["activation", "deployment_version", "policy_version"] })),
        evidenceRequests: ids.map(controlId => ({ controlId, contractId: `${controlId}-E1`, producer: "amc.ledger",
          bindingFields: ["workspaceId", "controlId", "controlVersion", "policyDigest"], maxAgeDays: 30, sampling: "all, at least 1" })),
        manualDuties: [], releaseGates: ids.map(controlId => ({ controlId, testId: `${controlId}-T1`, blocking: true }))
      });
      expect(plan.crosswalkLinks).toEqual([{
        controlId: CONTROL_IDS.wealth, framework: "fixture-controls", clause: CONTROL_IDS.crosswalkTarget, relation: "equivalent"
      }]);
      expect(plan.unsupported).toEqual([]);
      const { digest, ...body } = plan;
      const { policyDigest, ...policyBody } = plan.runtimePolicy;
      expect(digest).toBe(digestOf(body));
      expect(policyDigest).toBe(digestOf(policyBody));
      expect(plan.compiler.version).toBe(amcVersion); expect(plan.lock.generatedBy.version).toBe(amcVersion);
      const expected = readFileSync(new URL("../../fixtures/catalog/compiler/golden/finance-ops-us.plan.json", import.meta.url), "utf8");
      expect(versionFree(plan)).toBe(expected);
      const repeated = compilePlan({ catalog: fixture.catalog, profile: fixture.profile, asOf: AS_OF });
      expect(`${JSON.stringify(repeated, null, 2)}\n`).toBe(`${JSON.stringify(plan, null, 2)}\n`);
      expect(versionFree(repeated)).toBe(expected);
      expect(repeated.digest).toBe(digest);
    } finally { fixture.cleanup(); }
  });
});
