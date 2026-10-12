import { describe, expect, it } from "vitest";
import { evaluateControl } from "../../../src/catalog/evidence/evaluate.js";
import type { EvaluationContext, EvidenceItem } from "../../../src/catalog/evidence/types.js";
import { sha256Hex } from "../../../src/utils/hash.js";
import { canonicalize } from "../../../src/utils/json.js";
import { catalog, controls, fixturesFor } from "./harness.js";

/**
 * Every Layer 0 evidence fixture runs through P1-11's evaluateControl (P1-14). A negative fixture never passes; each
 * result and reason is the one the fixture states, so a producer that ships, or an admission rule that changes, shows
 * up here as a fixture to update rather than as a silent pass.
 */
interface EvidenceSetup {
  window: EvaluationContext["window"];
  subject: EvaluationContext["subject"];
  plan: { applicability: "applicable"; policyDigest: string; mode: "enforce" | "warn" };
  items: Array<Omit<EvidenceItem, "claimedAt" | "ref"> & { ref: Omit<EvidenceItem["ref"], "sha256"> }>;
  priorUses: NonNullable<EvaluationContext["priorUses"]>;
}

function evaluate(setup: EvidenceSetup, controlId: string) {
  const control = catalog.controls.get(controlId);
  if (!control) throw new Error(`no control ${controlId}`);
  const items: EvidenceItem[] = setup.items.map((row) => ({ ...row, claimedAt: null, ref: { ...row.ref, sha256: sha256Hex(canonicalize(row)) } }));
  return evaluateControl(control, items, {
    subject: setup.subject, window: setup.window, invalidations: [], reviews: [], producers: catalog.producers, priorUses: setup.priorUses,
    plan: { digest: "sha256:fixture-plan", policyDigest: setup.plan.policyDigest, applicability: { state: setup.plan.applicability }, mode: setup.plan.mode }
  });
}

const fixtures = fixturesFor("evidence");

describe("Layer 0 evidence fixtures through evaluateControl (P1-11)", () => {
  it("every catalog control has evidence fixtures", () => {
    expect(new Set(fixtures.map((f) => f.control.id))).toEqual(new Set(controls.map((c) => c.id)));
  });

  for (const f of fixtures) {
    it(`${f.ref} gives ${f.envelope.expected.result}${f.envelope.expected.reasonCode ? ` (${f.envelope.expected.reasonCode})` : ""}`, () => {
      const result = evaluate(f.envelope.setup as unknown as EvidenceSetup, f.control.id);
      if (f.envelope.polarity === "negative") expect(result.dimensions.result, "a negative fixture never passes").not.toBe("pass");
      expect(result.dimensions.result).toBe(f.envelope.expected.result);
      const reason = f.envelope.expected.reasonCode;
      if (reason !== null) expect([...result.rejected.map((r) => r.reason), result.dimensions.evidence]).toContain(reason);
      if (result.dimensions.result === "pass") expect(result.claimKind, "a pass is observed, never self-reported").toBe("observed");
    });
  }
});
