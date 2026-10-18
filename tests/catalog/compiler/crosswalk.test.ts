import { describe, expect, test } from "vitest";
import { compilePlan } from "../../../src/catalog/compiler/compile.js";
import { AS_OF, CONTROL_IDS, createCompilerFixture, makeProfile } from "./helpers.js";

describe("compiler informational crosswalks", () => {
  test("an equivalent A-to-B link cannot add a target whose own predicate is false", () => {
    const fixture = createCompilerFixture();
    try {
      const plan = compilePlan({ catalog: fixture.catalog, profile: fixture.profile, asOf: AS_OF });
      expect(plan.requirements.map(row => row.controlId)).toEqual([
        CONTROL_IDS.layer0, CONTROL_IDS.technology, CONTROL_IDS.wealth, CONTROL_IDS.jurisdiction
      ]);
      expect(plan.crosswalkLinks).toEqual([{
        controlId: CONTROL_IDS.wealth, framework: "fixture-controls", clause: CONTROL_IDS.crosswalkTarget, relation: "equivalent"
      }]);
      expect(plan.requirements.some(row => row.controlId === CONTROL_IDS.crosswalkTarget)).toBe(false);
      expect(plan.evidencePlan.tests.some(row => row.controlId === CONTROL_IDS.crosswalkTarget)).toBe(false);
      expect(plan.evidencePlan.evidenceRequests.some(row => row.controlId === CONTROL_IDS.crosswalkTarget)).toBe(false);
      expect(plan.runtimePolicy.toolPipeline.guards[0]!.controlIds).not.toContain(CONTROL_IDS.crosswalkTarget);
    } finally { fixture.cleanup(); }
  });

  test("the same target enters through its own use-case predicate even with the crosswalk removed", () => {
    const fixture = createCompilerFixture();
    try {
      const profile = makeProfile({ useCases: {
        value: ["clinical_triage"], provenance: "asserted", source: "fixture: synthetic target use case", reviewedBy: null
      } });
      fixture.catalog.controls.get(CONTROL_IDS.wealth)!.crosswalk = [];
      const plan = compilePlan({ catalog: fixture.catalog, profile, asOf: AS_OF });
      expect(plan.crosswalkLinks).toEqual([]);
      expect(plan.requirements.find(row => row.controlId === CONTROL_IDS.crosswalkTarget)).toMatchObject({
        applicability: "applicable", missingFacts: [],
        pulledInBy: ["station:technology", "profile:amc.fixture.crosswalk-target"]
      });
      expect(plan.evidencePlan.tests.filter(row => row.controlId === CONTROL_IDS.crosswalkTarget)).toHaveLength(1);
      expect(plan.runtimePolicy.toolPipeline.guards[0]!.controlIds).toContain(CONTROL_IDS.crosswalkTarget);
    } finally { fixture.cleanup(); }
  });
});
