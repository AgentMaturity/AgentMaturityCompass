import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  claimKindFromClaimTier,
  claimKindFromTrustTier,
  envelopeForDiagnosticReport,
  envelopeForLegacyResult,
  envelopeForPathPresence,
  envelopeForSelfAssessment,
  envelopeForSyntheticExample,
  fromUppercaseStatus,
  type DiagnosticReportClaimInput
} from "../../src/claims/eligibility/index.js";
import type { TrustTier } from "../../src/types.js";
import type { TrustTier as IngestTrustTier } from "../../src/score/evidenceIngestion.js";
import type { ClaimTier } from "../../src/score/claimProvenance.js";
import type { ComplianceCategoryStatus } from "../../src/compliance/mappingSchema.js";

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const doc = readFileSync(new URL("../../docs/CLAIM_KINDS.md", import.meta.url), "utf8");

const trustTiers: Record<TrustTier, string> = {
  OBSERVED: "observed", OBSERVED_HARDENED: "observed", ATTESTED: "self_reported", SELF_REPORTED: "self_reported"
};
const ingestTiers: Record<IngestTrustTier, string> = {
  OBSERVED: "observed", ATTESTED: "self_reported", SELF_REPORTED: "self_reported", UNVERIFIED: "self_reported"
};
const claimTiers: Record<ClaimTier, string> = {
  USER_VERIFIED: "self_reported", DERIVED: "self_reported", HYPOTHESIS: "self_reported",
  SESSION_LOCAL: "self_reported", REFERENCE_ONLY: "self_reported"
};
const certificationStatuses: Record<"PASS" | "FAIL" | "NOT_EVALUATED", [string, string | undefined]> = {
  PASS: ["pass", undefined], FAIL: ["fail", undefined], NOT_EVALUATED: ["not_evaluated", undefined]
};
const complianceStatuses: Record<ComplianceCategoryStatus, [string, string | undefined]> = {
  SATISFIED: ["pass", undefined], PARTIAL: ["not_evaluated", "incomplete"],
  MISSING: ["not_evaluated", "incomplete"], UNKNOWN: ["not_evaluated", "incomplete"]
};

describe("tier adapters", () => {
  test.each([...Object.entries(trustTiers), ...Object.entries(ingestTiers)])("TrustTier %s -> %s", (tier, kind) => {
    const mapped = claimKindFromTrustTier(tier as TrustTier | IngestTrustTier);
    expect(mapped.claimKind).toBe(kind);
    expect(mapped.reasons).toEqual(tier === "ATTESTED" ? ["REVIEW_NOT_INDEPENDENT"] : []);
    expect(doc).toContain(`| \`${tier}\` | \`${kind}\` |`);
  });

  test.each(Object.entries(claimTiers))("ClaimTier %s -> %s", (tier, kind) => {
    expect(claimKindFromClaimTier(tier as ClaimTier).claimKind).toBe(kind);
    expect(doc).toContain(`| \`${tier}\` | \`${kind}\` |`);
  });

  test.each([...Object.entries(certificationStatuses), ...Object.entries(complianceStatuses)])(
    "uppercase status %s maps as documented", (status, [result, evidence]) => {
      const mapped = fromUppercaseStatus(status as keyof typeof certificationStatuses | ComplianceCategoryStatus);
      expect(mapped.result).toBe(result);
      expect(mapped.evidence).toBe(evidence);
      expect(doc).toContain(`| \`${status}\` | \`${result}\` | ${evidence ? `\`${evidence}\`` : "unchanged"} |`);
    });
});

describe("envelope adapters", () => {
  const report: DiagnosticReportClaimInput = {
    agentId: "agent-1",
    runId: "run-1",
    windowEndTs: NOW - 1_000,
    status: "VALID",
    trustLabel: "HIGH TRUST",
    layerScores: [
      { layerName: "Strategic Agent Operations", avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 },
      { layerName: "Leadership & Autonomy", avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }
    ],
    evidenceTrustCoverage: { observed: 0.6, attested: 0.1, selfReported: 0.3 }
  };

  test("a valid observed diagnostic keeps its real level", () => {
    const envelope = envelopeForDiagnosticReport(report, NOW);
    expect(envelope.claimKind).toBe("observed");
    expect(envelope.statusDimensions.evidence).toBe("sufficient");
    expect(envelope.eligibleLevel).toBe(3.5);
  });

  test("an UNSIGNED run is untrusted", () => {
    const envelope = envelopeForDiagnosticReport({ ...report, status: "UNSIGNED" }, NOW);
    expect(envelope.statusDimensions.evidence).toBe("untrusted");
    expect(envelope.statusDimensions.result).toBe("not_evaluated");
  });

  test("INVALID and UNRELIABLE runs are untrusted", () => {
    expect(envelopeForDiagnosticReport({ ...report, status: "INVALID" }, NOW).statusDimensions.evidence).toBe("untrusted");
    expect(envelopeForDiagnosticReport({ ...report, trustLabel: "UNRELIABLE — DO NOT USE FOR CLAIMS" }, NOW)
      .statusDimensions.evidence).toBe("untrusted");
  });

  test("a diagnostic with no observed coverage is self-reported", () => {
    const envelope = envelopeForDiagnosticReport({ ...report, evidenceTrustCoverage: { observed: 0, attested: 0.5, selfReported: 0.5 } }, NOW);
    expect(envelope.claimKind).toBe("self_reported");
  });

  test("self-assessment answers are capped and never pass a regulated control", () => {
    const envelope = envelopeForSelfAssessment({ producer: "questionnaire", answers: [5, 5, 5], regulated: true, now: NOW });
    expect(envelope.claimKind).toBe("self_reported");
    expect(envelope.eligibleLevel).toBe(1);
    expect(envelope.statusDimensions.result).toBe("not_evaluated");
  });

  test("synthetic examples are labelled and carry no level", () => {
    const envelope = envelopeForSyntheticExample({ producer: "example-mode", now: NOW });
    expect(envelope.claimKind).toBe("synthetic_example");
    expect(envelope.eligibleLevel).toBeNull();
    expect(envelope.statusDimensions.result).toBe("not_evaluated");
  });

  test("path presence is a weak method", () => {
    const envelope = envelopeForPathPresence({ producer: "scanner", found: true, level: 4, regulated: true,
      evidenceRefs: ["docs/policy.md"], now: NOW });
    expect(envelope.eligibleLevel).toBe(1);
    expect(envelope.statusDimensions.result).toBe("not_evaluated");
    expect(envelope.reasons).toContain("WEAK_METHOD");
  });

  test("legacy 1.x results are self-reported", () => {
    const envelope = envelopeForLegacyResult({ producer: "amc 1.x", version: "1.1.1", originalTier: "OBSERVED",
      method: "runtime_observation", status: "PASS", level: 4, eventCount: 12, now: NOW });
    expect(envelope.claimKind).toBe("self_reported");
    expect(envelope.provenance.legacy).toEqual({ version: "1.1.1", originalTier: "OBSERVED" });
    expect(envelope.reasons).toContain("LEGACY_1X_UNVERIFIED");
  });
});
