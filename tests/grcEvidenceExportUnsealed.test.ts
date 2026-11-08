import { expect, test } from "vitest";
import type { DiagnosticReportClaimInput } from "../src/claims/eligibility/index.js";
import { buildGrcEvidenceManifest } from "../src/exports/grcEvidenceExport.js";

/**
 * S2 (LIVE-INTEGRITY-03): a run file whose seal does not verify vouches for nothing in a GRC export either. The export
 * strips the report's self-asserted fields through the one gate envelopeForStoredRun uses (distrustUnsealedReport), so a
 * field the report carries about itself, such as r2-c's removed open-session marker, can never soften the verdict.
 */
const NOW = 1_700_000_100_000;
const validReport = {
  agentId: "agent-a", runId: "run-1", windowEndTs: 1_700_000_000_000,
  status: "VALID", verificationPassed: true, trustBoundaryViolated: false, trustBoundaryMessage: null,
  integrityIndex: 0.82, trustLabel: "HIGH TRUST", evidenceCoverage: 1,
  evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
  layerScores: [{ layerName: "Strategic Agent Operations", avgFinalLevel: 4.2, confidenceWeightedFinalLevel: 4.2 }],
  contradictionCount: 0,
  // The report's own claim that only open ledger sessions stood in its way: an unsealed file cannot make it.
  ledgerPrefix: { unfinalizedSessions: ["gw-1"] }
} as DiagnosticReportClaimInput;

test("S2: an unsealed VALID report exports untrusted and self-reported, with SIGNATURE_INVALID on every claim", () => {
  const manifest = buildGrcEvidenceManifest("SOC2", validReport, { sealVerified: false, now: NOW });
  expect(manifest.run.claim.statusDimensions.evidence).toBe("untrusted");
  expect(manifest.run.claim.claimKind).toBe("self_reported");
  expect(manifest.run.claim.reasons).toContain("SIGNATURE_INVALID");
  expect(manifest.controls.length).toBeGreaterThan(0);
  for (const control of manifest.controls) expect(control.claim.reasons).toContain("SIGNATURE_INVALID");
  expect(manifest.run.signals.find((signal) => signal.name === "verification")?.value).toBe(false);
});

test("a sealed VALID report keeps its observed claim", () => {
  const manifest = buildGrcEvidenceManifest("SOC2", validReport, { sealVerified: true, now: NOW });
  expect(manifest.run.claim.claimKind).toBe("observed");
  expect(manifest.run.claim.reasons).not.toContain("SIGNATURE_INVALID");
});
