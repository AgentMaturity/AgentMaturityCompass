import { describe, expect, test } from "vitest";
import {
  buildDomainProofSummary,
  correctnessProofStatusSchema,
  proofClassSchema,
  requiresDomainCorrectnessProof,
} from "../src/domainProof/domainProofSchema.js";
import { validateTruthguardOutput } from "../src/truthguard/truthguardEngine.js";
import { badgeSourceReviewNotice } from "../src/badge/badgeCli.js";

describe("Domain Proof Lane proof taxonomy", () => {
  test("exposes the three AMC proof classes and fail-closed correctness statuses", () => {
    expect(proofClassSchema.options).toEqual([
      "evidence_integrity",
      "runtime_policy",
      "domain_correctness",
    ]);
    expect(correctnessProofStatusSchema.options).toEqual([
      "proven",
      "disproven",
      "unsupported",
      "not_applicable",
    ]);
  });

  test("builds an explicit unsupported domain-correctness summary instead of implying proof", () => {
    const summary = buildDomainProofSummary({
      proofClass: "domain_correctness",
      correctnessProofStatus: "unsupported",
      proofRefs: [],
      evidenceRefs: ["ev-run-1"],
      explanation: "No declared source-to-rule manifest was checked for this answer.",
    });

    expect(summary).toMatchObject({
      proofClass: "domain_correctness",
      correctnessProofStatus: "unsupported",
      proofRefs: [],
      evidenceRefs: ["ev-run-1"],
      claimBoundary: "NOT_PROVEN",
    });
  });

  test("detects domain-correctness proof claims that require checked proof artifacts", () => {
    expect(requiresDomainCorrectnessProof("We verified this tax answer is correct under the declared rules.")).toBe(true);
    expect(requiresDomainCorrectnessProof("Evidence integrity was verified with signed receipts.")).toBe(false);
  });
  test("badge/source-review notice refuses to imply domain correctness proof", () => {
    const notice = badgeSourceReviewNotice({
      id: "amc-public-methodology",
      version: "2026.06.21-test",
      hash: "a".repeat(64),
      versioningAssuranceHash: "b".repeat(64),
    });

    expect(notice).toContain("does not prove domain correctness");
    expect(notice).toContain("correctnessProofStatus");
    expect(notice).toContain("unsupported");
  });
});

describe("Truthguard domain-correctness fail-closed semantics", () => {
  test("fails closed when a claim says domain correctness is verified without a domain proof ref", () => {
    const result = validateTruthguardOutput({
      output: {
        v: 1,
        answer: "The answer is eligible.",
        claims: [
          {
            text: "We verified this benefits eligibility answer is correct under the declared rules.",
            evidenceRefs: ["ev-run-1"],
          },
        ],
      },
      allowedTools: ["*"],
      allowedModels: ["*"],
      knownEvidenceRefs: new Set(["ev-run-1"]),
    });

    expect(result.status).toBe("FAIL");
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "UNSUPPORTED_CORRECTNESS_PROOF",
          path: "claims[0]",
        }),
      ]),
    );
  });

  test("allows explicit unsupported status when no domain-correctness proof is claimed", () => {
    const result = validateTruthguardOutput({
      output: {
        v: 1,
        answer: "Evidence integrity is verified, but domain correctness is not proven.",
        claims: [
          {
            text: "Domain correctness proof is unsupported for this answer.",
            evidenceRefs: ["ev-run-1"],
            correctnessProofStatus: "unsupported",
            domainProofRefs: [],
          },
        ],
      },
      allowedTools: ["*"],
      allowedModels: ["*"],
      knownEvidenceRefs: new Set(["ev-run-1"]),
    });

    expect(result.status).toBe("PASS");
  });

  test("allows proven domain correctness only with explicit amcproof refs", () => {
    const result = validateTruthguardOutput({
      output: {
        v: 1,
        answer: "The toy governance answer follows the declared local rule set.",
        claims: [
          {
            text: "We verified this answer is correct under the declared rules.",
            evidenceRefs: ["ev-run-1"],
            correctnessProofStatus: "proven",
            domainProofRefs: ["amcproof_123"],
          },
        ],
      },
      allowedTools: ["*"],
      allowedModels: ["*"],
      knownEvidenceRefs: new Set(["ev-run-1"]),
    });

    expect(result.status).toBe("PASS");
  });
});
