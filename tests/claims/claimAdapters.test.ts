import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  claimEnvelopeSchema,
  claimKindFromClaimTier,
  claimKindFromTrustTier,
  envelopeForDiagnosticReport,
  envelopeForLegacyResult,
  envelopeForPathPresence,
  envelopeForSelfAssessment,
  envelopeForSyntheticExample,
  fromUppercaseStatus,
  REASON_TEXT,
  renderClaimLabel,
  type DiagnosticReportClaimInput
} from "../../src/claims/eligibility/index.js";
import { envelopeForStoredRun } from "../../src/claims/eligibility/adapters/results.js";
import type { DiagnosticReport, TrustTier } from "../../src/types.js";
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
  MISSING: ["not_evaluated", "incomplete"], UNKNOWN: ["not_evaluated", "incomplete"],
  NOT_EVALUATED: ["not_evaluated", undefined]
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

  test.each(["COMPLIANT", "partial", "__proto__", "constructor"])("unknown stored status %s is not evaluated", (status) => {
    const unknown = status as ComplianceCategoryStatus;
    expect(fromUppercaseStatus(unknown)).toEqual({ result: "not_evaluated", evidence: "incomplete" });
    const envelope = envelopeForLegacyResult({ producer: "amc 1.x", version: "1.1.1", method: "runtime_observation",
      status: unknown, level: 3, eventCount: 2, now: NOW });
    expect(envelope.statusDimensions.result).toBe("not_evaluated");
    expect(envelope.statusDimensions.evidence).toBe("incomplete");
    expect(claimEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });
});

describe("envelope adapters", () => {
  const report: DiagnosticReportClaimInput = {
    agentId: "agent-1",
    runId: "run-1",
    windowEndTs: NOW - 1_000,
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.9,
    evidenceCoverage: 0.8,
    contradictionCount: 0,
    trustLabel: "HIGH TRUST",
    layerScores: [
      { layerName: "Strategic Agent Operations", avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 },
      { layerName: "Leadership & Autonomy", avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }
    ],
    evidenceTrustCoverage: { observed: 0.6, attested: 0.1, selfReported: 0.3 }
  };

  test("a valid, claim-ready observed diagnostic keeps its real level", () => {
    const envelope = envelopeForDiagnosticReport(report, NOW);
    expect(envelope.claimKind).toBe("observed");
    expect(envelope.statusDimensions.result).toBe("pass");
    expect(envelope.statusDimensions.evidence).toBe("sufficient");
    expect(envelope.eligibleLevel).toBe(3.5);
    expect(envelope.reasons).toEqual([]);
  });

  test.each<[string, Partial<DiagnosticReportClaimInput>, string]>([
    ["a LOW TRUST run", { trustLabel: "LOW TRUST", integrityIndex: 0.5 }, "incomplete"],
    ["a self-reported-only run", { trustLabel: "LOW TRUST", integrityIndex: 0.5,
      evidenceTrustCoverage: { observed: 0, attested: 0, selfReported: 1 } }, "incomplete"],
    ["a run with no accepted evidence", { evidenceCoverage: 0 }, "incomplete"],
    ["a run that crossed its trust boundary", { trustBoundaryViolated: true }, "untrusted"],
    ["a run whose evidence chain did not verify", { verificationPassed: false }, "untrusted"]
  ])("%s does not pass and says why", (_name, patch, evidence) => {
    const envelope = envelopeForDiagnosticReport({ ...report, ...patch }, NOW);
    expect(envelope.statusDimensions.result).toBe("not_evaluated");
    expect(envelope.statusDimensions.evidence).toBe(evidence);
    expect(envelope.reasons).toContain("EVIDENCE_NOT_CLAIM_READY");
    expect(renderClaimLabel(envelope).line).toContain("Result: not evaluated (");
  });

  test("a claim-ready run with contradictions does not pass", () => {
    const envelope = envelopeForDiagnosticReport({ ...report, contradictionCount: 2 }, NOW);
    expect(envelope.statusDimensions.result).toBe("not_evaluated");
    expect(envelope.statusDimensions.evidence).toBe("contradictory");
    expect(envelope.reasons).toContain("CONTRADICTORY_EVIDENCE");
  });

  test("an UNSIGNED run is untrusted", () => {
    const envelope = envelopeForDiagnosticReport({ ...report, status: "UNSIGNED" }, NOW);
    expect(envelope.statusDimensions.evidence).toBe("untrusted");
    expect(envelope.statusDimensions.result).toBe("not_evaluated");
  });

  test("INVALID and UNRELIABLE runs are untrusted", () => {
    const invalid = envelopeForDiagnosticReport({ ...report, status: "INVALID" }, NOW);
    expect(invalid.statusDimensions.evidence).toBe("untrusted");
    // An invalid run's observed rows vouch for nothing: the claim is self-reported, never observed.
    expect(invalid.claimKind).toBe("self_reported");
    const unreliable = envelopeForDiagnosticReport({ ...report, trustLabel: "UNRELIABLE — DO NOT USE FOR CLAIMS" }, NOW);
    expect(unreliable.statusDimensions.evidence).toBe("untrusted");
    expect(unreliable.statusDimensions.result).toBe("not_evaluated");
    expect(unreliable.reasons).toEqual(["EVIDENCE_NOT_CLAIM_READY"]);
    expect(renderClaimLabel(unreliable).line).toContain(`Result: not evaluated (${REASON_TEXT.EVIDENCE_NOT_CLAIM_READY})`);
  });

  test("H3: a run whose only failure is an open ledger session says so: incomplete evidence, never a pass", () => {
    const run = { ...report, status: "INVALID" as const, verificationPassed: false, integrityIndex: 0,
      trustLabel: "UNRELIABLE — DO NOT USE FOR CLAIMS" as const, ledgerPrefix: { unfinalizedSessions: ["gw-1"] } };
    const open = envelopeForDiagnosticReport(run, NOW);
    expect(open.claimKind).toBe("self_reported");
    expect(open.statusDimensions).toMatchObject({ result: "not_evaluated", evidence: "incomplete" });
    expect(open.reasons).toEqual(["LEDGER_NOT_FINALIZED", "EVIDENCE_NOT_CLAIM_READY"]);
    expect(renderClaimLabel(open).line).toContain(`Result: not evaluated (${REASON_TEXT.LEDGER_NOT_FINALIZED}) · Evidence: incomplete`);
    expect(claimEnvelopeSchema.safeParse(open).success).toBe(true);
    // Any other cause, or no named session, keeps the untrusted verdict and its signature reason.
    for (const other of [{ ...run, trustBoundaryViolated: true }, { ...run, ledgerPrefix: { unfinalizedSessions: [] } }]) {
      const envelope = envelopeForDiagnosticReport(other, NOW);
      expect(envelope.statusDimensions.evidence).toBe("untrusted");
      expect(envelope.reasons).not.toContain("LEDGER_NOT_FINALIZED");
    }
    // A VALID run never reads the field.
    expect(envelopeForDiagnosticReport({ ...report, ledgerPrefix: { unfinalizedSessions: ["gw-1"] } }, NOW).reasons).toEqual([]);
  });

  test("H3: a stored run whose seal does not verify cannot vouch for an open session", () => {
    const stored = { ...report, status: "INVALID", verificationPassed: false, methodology: { amcVersion: "1.2.0" },
      ledgerPrefix: { unfinalizedSessions: ["gw-1"] } } as unknown as DiagnosticReport;
    expect(envelopeForStoredRun(stored, { sealVerified: true, now: NOW }).reasons).toContain("LEDGER_NOT_FINALIZED");
    const unsealed = envelopeForStoredRun(stored, { sealVerified: false, now: NOW });
    expect(unsealed.reasons).toContain("SIGNATURE_INVALID");
    expect(unsealed.reasons).not.toContain("LEDGER_NOT_FINALIZED");
    expect(unsealed.statusDimensions.evidence).toBe("untrusted");
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
    expect(envelope.provenance.legacy).toEqual({ version: "1.1.1", originalTier: "OBSERVED", notice: "AMC-LEGACY-2026-001 v1" });
    expect(envelope.eligibleLevel).toBe(1);
    expect(envelope.reasons).toContain("LEGACY_1X_UNVERIFIED");
  });
});
