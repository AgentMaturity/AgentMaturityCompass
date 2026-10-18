import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compilePlan, parseDeploymentProfile } from "../../../../src/catalog/compiler/compile.js";
import { evaluateControl } from "../../../../src/catalog/evidence/evaluate.js";
import { loadCatalog } from "../../../../src/catalog/loader.js";
const ids = Array.from({ length: 6 }, (_, i) => `L1-GOV-${String(i + 1).padStart(2, "0")}`);
const json = (name: string): unknown => JSON.parse(readFileSync(`docs/catalog/governance/${name}`, "utf8"));
describe("Governance actual compiled policy (P3-14)", () => {
  for (const name of ["benefits-caseworker", "legal-drafting", "defense-analyst"]) {
    it(`compiles ${name} with the actual policy and withholds credit on empty evidence`, () => {
      const catalog = loadCatalog();
      const profile = parseDeploymentProfile(json(`profile.${name}.json`));
      const plan = compilePlan({ profile, catalog, asOf: "2026-10-18T00:00:00.000Z" });
      const requirements = plan.requirements.filter((r) => ids.includes(r.controlId) && r.applicability !== "not_applicable");
      expect(requirements.length, name).toBeGreaterThan(0);
      for (const requirement of requirements) {
        const control = catalog.controls.get(requirement.controlId)!;
        const result = evaluateControl(control, [], {
          subject: { ...profile.deployment, agentId: profile.deployment.agentIds[0]!, subjectId: null },
          window: { start: "2026-10-01T00:00:00.000Z", end: "2026-10-18T00:00:00.000Z" },
          plan: { digest: plan.digest, policyDigest: plan.runtimePolicy.policyDigest,
            applicability: requirement.applicability === "applicable" ? { state: "applicable" } : { state: "unresolved", reason: requirement.reasons.join("; ") }, mode: "enforce" },
          invalidations: [], reviews: [], producers: catalog.producers
        });
        expect(result.planDigest).toBe(plan.digest);
        expect(result.dimensions.result, requirement.controlId).toBe("not_evaluated");
        expect(result.dimensions.enforcement, requirement.controlId).toEqual({ state: "none" });
        expect(result.admitted).toEqual([]);
      }
    });
  }
});
