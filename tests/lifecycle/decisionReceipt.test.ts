import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildDecisionReceipts,
  listDecisionReceipts,
  loadDecisionReceipt,
  observeDecisionOutcomes,
  writeDecisionReceipts
} from "../../src/lifecycle/decisionReceipt.js";
import type { DiagnosticReport } from "../../src/types.js";

function sampleReport(): DiagnosticReport {
  return {
    agentId: "default",
    runId: "33333333-3333-4333-8333-333333333333",
    ts: Date.UTC(2026, 4, 22, 12, 0, 0),
    windowStartTs: Date.UTC(2026, 4, 21, 12, 0, 0),
    windowEndTs: Date.UTC(2026, 4, 22, 12, 0, 0),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.75,
    trustLabel: "DEVELOPING — some evidence, needs more coverage",
    targetProfileId: null,
    layerScores: [],
    questionScores: [
      {
        questionId: "AMC-1.1",
        claimedLevel: 2,
        supportedMaxLevel: 1,
        finalLevel: 1,
        confidence: 0.4,
        evidenceEventIds: ["ev-1"],
        flags: [],
        narrative: "Needs evidence."
      }
    ],
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.25,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [{ questionId: "AMC-1.1", current: 1, target: 3, gap: 2 }],
    prioritizedUpgradeActions: ["Improve AMC-1.1"],
    evidenceToCollectNext: ["Collect observed runtime evidence."],
    runSealSig: "sig",
    reportJsonSha256: "sha"
  };
}

describe("decision receipts", () => {
  test("builds recommendation and evidence-request receipts", () => {
    const receipts = buildDecisionReceipts({
      workspace: "/tmp/amc-decision-test",
      report: sampleReport(),
      command: "amc",
      resourceManifestIds: ["enforce-resources-test"]
    });

    expect(receipts).toHaveLength(2);
    expect(receipts[0]).toMatchObject({
      receiptId: `decision-${sampleReport().runId}-AMC-1.1`,
      surface: "Score",
      decisionType: "score-recommendation",
      owner: "Score",
      evidenceRefs: ["ev-1"]
    });
    expect(receipts[0]?.subject.resourceManifestIds).toEqual(["enforce-resources-test"]);
    expect(receipts[0]?.subject.componentIds).toContain("score-question:AMC-1.1");
    expect(receipts[0]?.rollbackPointer).toBe("enforce-resources-test");
    expect(receipts[1]).toMatchObject({
      surface: "Enforce",
      decisionType: "evidence-request",
      owner: "Enforce"
    });
  });

  test("writes, lists, and loads receipts", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-decision-receipts-"));
    try {
      const written = writeDecisionReceipts({
        workspace,
        report: sampleReport(),
        command: "amc"
      });

      expect(existsSync(written.receiptsPath)).toBe(true);
      expect(JSON.parse(readFileSync(written.receiptsPath, "utf8"))).toHaveLength(2);
      const listed = listDecisionReceipts({ workspace, agentId: "default" });
      expect(listed).toHaveLength(2);
      const loaded = loadDecisionReceipt({ workspace, agentId: "default", selector: listed[0]!.receiptId });
      expect(loaded.runId).toBe(sampleReport().runId);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("updates proposed receipts with observed outcomes from a later run", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-decision-observed-"));
    try {
      const first = sampleReport();
      writeDecisionReceipts({
        workspace,
        report: first,
        command: "amc"
      });

      const later: DiagnosticReport = {
        ...sampleReport(),
        runId: "44444444-4444-4444-8444-444444444444",
        ts: Date.UTC(2026, 4, 23, 12, 0, 0),
        questionScores: [{
          ...sampleReport().questionScores[0]!,
          finalLevel: 3,
          confidence: 0.9,
          evidenceEventIds: ["ev-2"]
        }],
        evidenceCoverage: 0.75,
        unsupportedClaimCount: 0
      };

      const result = observeDecisionOutcomes({ workspace, agentId: "default", report: later });
      expect(result.updatedCount).toBe(2);

      const listed = listDecisionReceipts({ workspace, agentId: "default" });
      expect(listed.every((receipt) => receipt.status === "observed")).toBe(true);
      expect(listed[0]?.observedRunId).toBe(later.runId);
      expect(listed.find((receipt) => receipt.subject.questionId === "AMC-1.1")?.evidenceRefs).toContain("ev-2");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
