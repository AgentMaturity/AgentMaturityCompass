import { describe, expect, test } from "vitest";
import { explainDiagnosticReportStatus, generateReport } from "../src/diagnostic/runner.js";
import type { DiagnosticReport } from "../src/types.js";

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
  test("explains invalid reports instead of showing a raw unexplained status", () => {
    const invalid = report({
      status: "INVALID",
      verificationPassed: false,
      integrityIndex: 0.1,
      trustLabel: "UNRELIABLE — DO NOT USE FOR CLAIMS",
    });

    const explanation = explainDiagnosticReportStatus(invalid);
    expect(explanation.label).toContain("Unverified evidence chain");
    expect(explanation.claimBoundary).toContain("local diagnosis");
    expect(explanation.nextStep).toContain("verify");

    const markdown = generateReport(invalid, "md") as string;
    expect(markdown).toContain("Status: **INVALID** — Unverified evidence chain");
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

    const markdown = generateReport(unsigned, "md") as string;
    expect(markdown).toContain("Status: **UNSIGNED** — Unsigned local preview");
    expect(markdown).toContain("Vault signing was skipped");
  });

  test("states when a report is verified and client-ready", () => {
    const verified = report();
    const explanation = explainDiagnosticReportStatus(verified);
    expect(explanation.strongClaimsAllowed).toBe(true);
    expect(explanation.label).toBe("Verified evidence chain");

    const markdown = generateReport(verified, "md") as string;
    expect(markdown).toContain("Status: **VALID** — Verified evidence chain");
    expect(markdown).toContain("client-ready");
  });
});
