import { describe, expect, test } from "vitest";
import { compilePlan } from "../../../src/catalog/compiler/compile.js";
import { AS_OF, CONTROL_IDS, createCompilerFixture, makeProfile } from "./helpers.js";

describe("compiler unknown applicability", () => {
  test("not(unknown) keeps a mandatory requirement unresolved and its enforcement applied", () => {
    const fixture = createCompilerFixture();
    try {
      const profile = makeProfile({ entityTypes: {
        value: null, provenance: "asserted", source: "fixture: entity type is unknown", reviewedBy: null
      } });
      const plan = compilePlan({ catalog: fixture.catalog, profile, asOf: AS_OF });
      const requirement = plan.requirements.find(row => row.controlId === CONTROL_IDS.jurisdiction);
      expect(requirement).toMatchObject({
        applicability: "unresolved", mandatory: true, missingFacts: ["entityTypes"], exclusion: null
      });
      expect(plan.status).toBe("blocked");
      expect(requirement!.reasons).toContain(
        'predicate: entityTypes includesAny ["hipaa_covered_entity","hipaa_business_associate"]: unknown (entityTypes is not known)'
      );
      expect(plan.runtimePolicy.toolPipeline.guards).toContainEqual({
        id: "identity-binding",
        params: { requirePrincipal: true, requireAgentLease: true },
        controlIds: [CONTROL_IDS.layer0, CONTROL_IDS.jurisdiction]
      });
      expect(plan.evidencePlan.evidenceRequests.some(row => row.controlId === CONTROL_IDS.jurisdiction)).toBe(true);
      expect(plan.evidencePlan.releaseGates).toContainEqual({
        controlId: CONTROL_IDS.jurisdiction, testId: `${CONTROL_IDS.jurisdiction}-T1`, blocking: true
      });
      expect(plan.requirements.find(row => row.controlId === CONTROL_IDS.layer0)!.citationsInScope).toEqual([]);
      expect(plan.profile.factProvenance.entityTypes).toBe("unknown");
      expect(plan.requirements.every(row => row.support === "experimental")).toBe(true);
    } finally { fixture.cleanup(); }
  });

  test("a known asserted fact stays asserted and supports planning without becoming reviewed evidence", () => {
    const fixture = createCompilerFixture();
    try {
      const profile = makeProfile({ entityTypes: {
        value: ["non_bank_financial_institution"], provenance: "asserted", source: "fixture: untrusted assertion", reviewedBy: null
      } });
      const plan = compilePlan({ catalog: fixture.catalog, profile, asOf: AS_OF });
      expect(plan.status).toBe("ready");
      expect(plan.profile.factProvenance.entityTypes).toBe("asserted");
      expect(plan.requirements.find(row => row.controlId === CONTROL_IDS.jurisdiction)).toMatchObject({
        applicability: "applicable", missingFacts: [], support: "experimental"
      });
      expect(fixture.catalog.controls.get(CONTROL_IDS.layer0)!.review).toEqual({
        status: "pending", expert: null, credential: null, reviewedAt: null, nextReview: null
      });
      expect(plan.requirements.find(row => row.controlId === CONTROL_IDS.layer0)!.citationsInScope).toEqual([]);
    } finally { fixture.cleanup(); }
  });

  test("a known matching HIPAA fixture fact scopes the citation but excludes the negated US requirement", () => {
    const fixture = createCompilerFixture();
    try {
      const profile = makeProfile({ entityTypes: {
        value: ["hipaa_covered_entity"], provenance: "asserted", source: "fixture: synthetic covered-entity value", reviewedBy: null
      } });
      const plan = compilePlan({ catalog: fixture.catalog, profile, asOf: AS_OF });
      expect(plan.requirements.find(row => row.controlId === CONTROL_IDS.jurisdiction)).toMatchObject({
        applicability: "not_applicable", missingFacts: [],
        exclusion: { source: "predicate", reason: "applicability predicate is false", exceptionId: null }
      });
      expect(plan.requirements.find(row => row.controlId === CONTROL_IDS.layer0)!.citationsInScope).toEqual(["synthetic-hipaa-scope"]);
      expect(plan.runtimePolicy.toolPipeline.guards).toEqual([{
        id: "identity-binding", params: { requirePrincipal: true }, controlIds: [CONTROL_IDS.layer0]
      }]);
      expect(plan.evidencePlan.evidenceRequests.some(row => row.controlId === CONTROL_IDS.jurisdiction)).toBe(false);
      expect(plan.status).toBe("ready");
    } finally { fixture.cleanup(); }
  });
});
