import { describe, expect, test } from "vitest";
import {
  buildDomainProofArtifact,
  domainProofArtifactSchema,
  verifyDomainProofArtifact,
} from "../src/domainProof/domainProofArtifact.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function validArtifactInput() {
  return {
    proofId: "amcproof_toy_governance_001",
    generatedTs: 1_800_000_000_000,
    proofClass: "domain_correctness" as const,
    domainId: "governance" as const,
    claimText: "The toy applicant is eligible under the declared local rule set.",
    sourceManifestHash: HASH_A,
    formalSpecHash: HASH_B,
    ruleRefs: [
      {
        sourceId: "toy-governance-rules",
        clauseId: "TG-1",
        effectiveDate: "2026-06-21",
        url: "file://fixtures/domain-proof/toy-governance/source-rules.md",
        hash: HASH_C,
      },
    ],
    assumptions: ["Applicant facts are complete for the toy rule set."],
    constraintsChecked: ["age >= 18", "residency == local"],
    result: "proven" as const,
    humanReview: {
      status: "not_required" as const,
      reviewerRole: "toy-fixture",
      notes: "Local non-legal fixture for AMC proof plumbing only.",
    },
    evidenceRefs: ["ev-run-1"],
    signedEvidenceRefs: ["ev-run-1"],
  };
}

describe("amcproof artifact schema", () => {
  test("builds a canonical amcproof artifact and verifies its hash binding", () => {
    const artifact = buildDomainProofArtifact(validArtifactInput());

    expect(artifact.v).toBe(1);
    expect(artifact.proofId).toBe("amcproof_toy_governance_001");
    expect(artifact.proofBindings.canonicalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(domainProofArtifactSchema.parse(artifact)).toEqual(artifact);
    expect(verifyDomainProofArtifact(artifact)).toEqual({ ok: true, errors: [] });
  });

  test("rejects tampered artifacts whose canonical hash no longer matches", () => {
    const artifact = buildDomainProofArtifact(validArtifactInput());
    const tampered = {
      ...artifact,
      claimText: "The answer was changed after signing.",
    };

    const verify = verifyDomainProofArtifact(tampered);
    expect(verify.ok).toBe(false);
    expect(verify.errors.join("\n")).toContain("canonicalSha256 mismatch");
  });

  test("requires proven domain-correctness artifacts to bind at least one rule ref", () => {
    expect(() => buildDomainProofArtifact({
      ...validArtifactInput(),
      ruleRefs: [],
    })).toThrow(/ruleRefs/);
  });
});
