import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  buildToyGovernanceSourceRuleManifest,
  TOY_GOVERNANCE_SOURCE_RULES,
} from "../src/domainProof/toyGovernanceRules.js";
import {
  sourceRuleManifestSchema,
  verifySourceRuleManifest,
} from "../src/domainProof/sourceRuleManifestSchema.js";

const fixtureSourcePath = "fixtures/domain-proof/toy-governance/source-rules.md";
const fixtureManifestPath = "fixtures/domain-proof/toy-governance/source-rule-manifest.json";

describe("source-to-rule manifest", () => {
  test("builds a reviewed source-to-rule manifest for the toy governance domain", () => {
    const manifest = buildToyGovernanceSourceRuleManifest({ retrievedAt: "2026-06-21T00:00:00.000Z" });

    expect(manifest.domainId).toBe("governance");
    expect(manifest.jurisdiction).toBe("LOCAL_TOY");
    expect(manifest.sourceTitle).toContain("Toy Governance");
    expect(manifest.proofCoverage).toEqual({
      sourceClauseCount: 3,
      formalizedCount: 3,
      reviewedCount: 3,
    });
    expect(manifest.clauses.map((clause) => clause.formalClauseId)).toEqual([
      "toy.age.minimum",
      "toy.residency.local",
      "toy.review.required_for_missing_facts",
    ]);
    expect(sourceRuleManifestSchema.parse(manifest)).toEqual(manifest);
  });

  test("fixture source and manifest verify without depending on external competitor material", () => {
    const sourceText = readFileSync(fixtureSourcePath, "utf8");
    const manifest = sourceRuleManifestSchema.parse(JSON.parse(readFileSync(fixtureManifestPath, "utf8")));

    expect(sourceText).toBe(TOY_GOVERNANCE_SOURCE_RULES);
    expect(JSON.stringify(manifest).toLowerCase()).not.toContain("pramaana");
    expect(verifySourceRuleManifest(manifest, { sourceText })).toEqual({ ok: true, errors: [] });
  });

  test("fails closed when source text drifts from the manifest hash", () => {
    const manifest = buildToyGovernanceSourceRuleManifest({ retrievedAt: "2026-06-21T00:00:00.000Z" });
    const verify = verifySourceRuleManifest(manifest, { sourceText: `${TOY_GOVERNANCE_SOURCE_RULES}\nTampered.` });

    expect(verify.ok).toBe(false);
    expect(verify.errors.join("\n")).toContain("sourceHash mismatch");
  });
});
