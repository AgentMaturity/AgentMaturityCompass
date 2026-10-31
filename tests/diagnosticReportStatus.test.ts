import { describe, expect, test } from "vitest";
import { explainDiagnosticReportStatus, generateReport } from "../src/diagnostic/runner.js";
import type { DiagnosticReport } from "../src/types.js";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";
import { renderClaimLegend } from "../src/claims/eligibility/render.js";

function report(overrides: Partial<DiagnosticReport> = {}): DiagnosticReport {
  return {
    agentId: "default",
    runId: "status-run",
    ts: Date.UTC(2026, 5, 16, 8, 0, 0),
    windowStartTs: Date.UTC(2026, 5, 16, 7, 0, 0),
    windowEndTs: Date.UTC(2026, 5, 16, 8, 0, 0),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.92,
    trustLabel: "HIGH TRUST",
    targetProfileId: null,
    layerScores: [],
    questionScores: [],
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.8,
    evidenceTrustCoverage: { observed: 0.7, attested: 0.2, selfReported: 0.1 },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "sig",
    reportJsonSha256: "sha",
    ...overrides,
  };
}

describe("diagnostic report status explanation", () => {
  test.each(["1.1.1", undefined])("keeps version %s legacy in the rendered report", (version) => {
    const stored = report(version ? { methodology: { ...getPublicMethodologyManifest(), amcVersion: version } } : {});
    const markdown = generateReport(stored, "md") as string;
    expect(markdown).toContain("**Claim:** Legacy (1.x), self-reported");
    expect(markdown).toContain("**Result:** not evaluated");
    expect(markdown).toContain(renderClaimLegend("markdown"));
    expect(markdown).not.toContain("**Claim:** Observed");
    expect(markdown).not.toContain("**Claim:** Independently reviewed");
    expect(markdown.split("\n").find((line) => line.startsWith("**Claim:**"))).toMatchSnapshot();
  });

  test("a current stored run needs a checked seal before its claim is observed", () => {
    const current = report({ methodology: getPublicMethodologyManifest() });
    const markdown = generateReport(current, "md") as string;
    expect(markdown).toContain("**Claim:** Self-reported · **Result:** not evaluated");
    expect(markdown).toContain("**Evidence:** untrusted");
    expect(markdown.split("\n").find((line) => line.startsWith("**Claim:**"))).toMatchSnapshot();
    expect(markdown).toContain(renderClaimLegend("markdown"));
    expect(markdown).not.toContain("**Claim:** Independently reviewed");
  });

  test("explains invalid reports instead of showing a raw unexplained status", () => {
    const invalid = report({
      status: "INVALID",
      verificationPassed: false,
      integrityIndex: 0.1,
      trustLabel: "UNRELIABLE — DO NOT USE FOR CLAIMS",
    });

    const explanation = explainDiagnosticReportStatus(invalid);
    expect(explanation.label).toContain("Unverified evidence chain");
    expect(explanation.evidenceStatus).toBe("UNVERIFIED");
    expect(explanation.claimBoundary).toContain("local diagnosis");
    expect(explanation.nextStep).toContain("verify");

    const markdown = generateReport(invalid, "md") as string;
    expect(markdown).toContain("Artifact Status: **INVALID** — Unverified evidence chain");
    expect(markdown).toContain("Evidence Readiness: **UNVERIFIED**");
    expect(markdown).toContain("Claim Boundary:");
    expect(markdown).toContain("not client-ready");
  });

  test("labels unsigned reports as local previews", () => {
    const unsigned = report({
      status: "UNSIGNED",
      verificationPassed: false,
      integrityIndex: 0.44,
      trustLabel: "LOW TRUST",
    });

    const explanation = explainDiagnosticReportStatus(unsigned);
    expect(explanation.label).toContain("Unsigned local preview");
    expect(explanation.evidenceStatus).toBe("UNVERIFIED");

    const markdown = generateReport(unsigned, "md") as string;
    expect(markdown).toContain("Artifact Status: **UNSIGNED** — Unsigned local preview");
    expect(markdown).toContain("Evidence Readiness: **UNVERIFIED**");
    expect(markdown).toContain("Vault signing was skipped");
  });

  test("states when a report is verified and claim-ready", () => {
    const verified = report();
    const explanation = explainDiagnosticReportStatus(verified);
    expect(explanation.strongClaimsAllowed).toBe(true);
    expect(explanation.label).toBe("Verified evidence chain");
    expect(explanation.evidenceStatus).toBe("READY");

    const markdown = generateReport(verified, "md") as string;
    expect(markdown).toContain("Artifact Status: **VALID** — Verified evidence chain");
    expect(markdown).toContain("Evidence Readiness: **READY**");
    expect(markdown).toContain("Claim Eligible: **YES**");
    expect(markdown).toContain("claim-eligible");
  });

  test("blocks claims when a signed report has no evidence", () => {
    const empty = report({
      integrityIndex: 0,
      trustLabel: "UNRELIABLE — DO NOT USE FOR CLAIMS",
      evidenceCoverage: 0,
      evidenceTrustCoverage: { observed: 0, attested: 0, selfReported: 0 }
    });
    const explanation = explainDiagnosticReportStatus(empty);
    expect(explanation.strongClaimsAllowed).toBe(false);
    expect(explanation.evidenceStatus).toBe("INSUFFICIENT_EVIDENCE");
    expect(explanation.claimBoundary).toContain("Signing proves integrity, not evidence sufficiency");

    const markdown = generateReport(empty, "md") as string;
    expect(markdown).toContain("Artifact Status: **VALID** — Verified evidence chain");
    expect(markdown).toContain("Evidence Readiness: **INSUFFICIENT_EVIDENCE**");
    expect(markdown).toContain("Claim Eligible: **NO**");
  });
});
