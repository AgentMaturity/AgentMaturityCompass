import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { verifyArtifactFileSignature } from "../../src/lifecycle/artifactSignature.js";
import { buildDecisionReceipts } from "../../src/lifecycle/decisionReceipt.js";
import {
  buildLifecycleChangeReceipts,
  exportLifecycleChangeReceipts,
  listLifecycleChangeReceipts,
  loadLifecycleChangeReceipt,
  writeLifecycleChangeReceipts,
  writeRollbackLifecycleReceipt
} from "../../src/lifecycle/changeReceipt.js";
import type { DiagnosticReport } from "../../src/types.js";

function sampleReport(overrides: Partial<DiagnosticReport> = {}): DiagnosticReport {
  const report: DiagnosticReport = {
    agentId: "default",
    runId: "44444444-4444-4444-8444-444444444444",
    ts: Date.UTC(2026, 4, 22, 12, 0, 0),
    windowStartTs: Date.UTC(2026, 4, 22, 11, 58, 0),
    windowEndTs: Date.UTC(2026, 4, 22, 12, 0, 0),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.84,
    trustLabel: "HIGH TRUST",
    targetProfileId: null,
    layerScores: [{ layerName: "Strategic Agent Operations", avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
    questionScores: [
      {
        questionId: "AMC-1.1",
        claimedLevel: 2,
        supportedMaxLevel: 2,
        finalLevel: 2,
        confidence: 0.8,
        evidenceEventIds: ["ev-1"],
        flags: [],
        narrative: "Needs stronger controls."
      }
    ],
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.5,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [{ questionId: "AMC-1.1", current: 2, target: 4, gap: 2 }],
    prioritizedUpgradeActions: ["Improve weak controls."],
    evidenceToCollectNext: ["Capture approval evidence."],
    runSealSig: "sig",
    reportJsonSha256: "sha"
  };
  return { ...report, ...overrides };
}

describe("lifecycle change receipts", () => {
  test("builds proposal, validation, accepted commit, and monitor receipts when validation passes", () => {
    const report = sampleReport();
    const decisions = buildDecisionReceipts({
      workspace: "/tmp/amc-change-receipts",
      report,
      command: "amc",
      resourceManifestIds: ["manifest-1"]
    });
    const receipts = buildLifecycleChangeReceipts({
      workspace: "/tmp/amc-change-receipts",
      report,
      command: "amc",
      resourceManifestIds: ["manifest-1"],
      decisionReceipts: decisions,
      findingProofs: [{ proofSetId: "proofs-1", path: "/tmp/proofs.json", proofCount: 1, verifiedCount: 1 }]
    });

    expect(receipts.map((receipt) => receipt.receiptType)).toEqual(["proposal", "validation", "commit", "monitor"]);
    expect(receipts.find((receipt) => receipt.receiptType === "validation")?.status).toBe("accepted");
    expect(receipts.find((receipt) => receipt.receiptType === "commit")?.subject.resourceManifestIds).toEqual(["manifest-1"]);
    expect(receipts.find((receipt) => receipt.receiptType === "monitor")?.monitor.health).toBe("healthy");
  });

  test("blocks commit when validation fails", () => {
    const report = sampleReport({
      status: "UNSIGNED",
      evidenceCoverage: 0,
      reportJsonSha256: "unsigned-sha"
    });
    const receipts = buildLifecycleChangeReceipts({
      workspace: "/tmp/amc-change-receipts",
      report,
      command: "amc",
      resourceManifestIds: []
    });

    expect(receipts.map((receipt) => receipt.receiptType)).toEqual(["proposal", "validation", "monitor"]);
    expect(receipts.find((receipt) => receipt.receiptType === "validation")?.status).toBe("blocked");
    expect(receipts.some((receipt) => receipt.receiptType === "commit")).toBe(false);
  });

  test("blocks promotion when an intact artifact is not evidence-ready", () => {
    const report = sampleReport({
      integrityIndex: 0.62,
      trustLabel: "LOW TRUST",
      evidenceCoverage: 0.5
    });
    const receipts = buildLifecycleChangeReceipts({
      workspace: "/tmp/amc-change-receipts",
      report,
      command: "amc",
      resourceManifestIds: ["manifest-1"]
    });

    const validation = receipts.find((receipt) => receipt.receiptType === "validation");
    expect(validation?.status).toBe("blocked");
    expect(validation?.evaluationEvidence).toMatchObject({
      diagnosticStatus: "VALID",
      evidenceStatus: "LIMITED",
      claimEligible: false
    });
    expect(validation?.policyChecks).toContainEqual(expect.objectContaining({
      policyId: "evidence-claim-readiness",
      passed: false
    }));
    expect(receipts.some((receipt) => receipt.receiptType === "commit")).toBe(false);
    expect(receipts.find((receipt) => receipt.receiptType === "monitor")?.monitor.health).toBe("warning");
  });

  test("writes signed receipt bundles and redacted exports", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-change-receipts-"));
    try {
      const report = sampleReport();
      const written = writeLifecycleChangeReceipts({
        workspace,
        report,
        command: "amc",
        resourceManifestIds: ["manifest-1"]
      });

      expect(existsSync(written.receiptsPath)).toBe(true);
      expect(written.signaturePath ? verifyArtifactFileSignature({ workspace, path: written.receiptsPath }).valid : false).toBe(true);
      expect(written.refs).toHaveLength(4);

      const listed = listLifecycleChangeReceipts({ workspace, agentId: "default" });
      expect(listed).toHaveLength(4);
      const loaded = loadLifecycleChangeReceipt({ workspace, agentId: "default", selector: written.receipts[1]!.receiptId });
      expect(loaded.receiptType).toBe("validation");

      const outPath = join(workspace, "receipts-redacted.json");
      const exported = exportLifecycleChangeReceipts({ workspace, agentId: "default", outputPath: outPath, redacted: true });
      expect(exported.receipts).toHaveLength(4);
      const body = readFileSync(outPath, "utf8");
      expect(body).toContain("$WORKSPACE");
      expect(body).not.toContain(workspace);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("writes rollback receipt with exact target manifest", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-rollback-receipt-"));
    try {
      const written = writeRollbackLifecycleReceipt({
        workspace,
        agentId: "default",
        command: "amc enforce resources restore",
        targetManifestId: "manifest-rollback",
        restoreReceiptPath: join(workspace, ".amc", "restore.json"),
        reason: "restore requested",
        refs: ["resource-1"]
      });

      expect(existsSync(written.receiptPath)).toBe(true);
      expect(written.receipt.receiptType).toBe("rollback");
      expect(written.receipt.rollback.targetManifestId).toBe("manifest-rollback");
      expect(written.signaturePath ? verifyArtifactFileSignature({ workspace, path: written.receiptPath }).valid : false).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
