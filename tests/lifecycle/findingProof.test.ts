import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildDecisionReceipts } from "../../src/lifecycle/decisionReceipt.js";
import {
  buildFindingProofs,
  exportFindingProofs,
  listFindingProofs,
  loadFindingProof,
  redactFindingProof,
  writeFindingProofs
} from "../../src/lifecycle/findingProof.js";
import type { DiagnosticReport } from "../../src/types.js";

function sampleReport(): DiagnosticReport {
  return {
    agentId: "default",
    runId: "33333333-3333-4333-8333-333333333333",
    ts: Date.UTC(2026, 4, 22, 12, 0, 0),
    windowStartTs: Date.UTC(2026, 4, 22, 11, 58, 0),
    windowEndTs: Date.UTC(2026, 4, 22, 12, 0, 0),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.72,
    trustLabel: "DEVELOPING — some evidence, needs more coverage",
    targetProfileId: null,
    layerScores: [{ layerName: "Strategic Agent Operations", avgFinalLevel: 2, confidenceWeightedFinalLevel: 2 }],
    questionScores: [
      {
        questionId: "AMC-1.1",
        claimedLevel: 2,
        supportedMaxLevel: 2,
        finalLevel: 2,
        confidence: 0.8,
        evidenceEventIds: ["ev-1"],
        flags: [],
        narrative: "Needs stronger operational evidence."
      },
      {
        questionId: "AMC-2.3",
        claimedLevel: 1,
        supportedMaxLevel: 1,
        finalLevel: 1,
        confidence: 0.3,
        evidenceEventIds: [],
        flags: ["FLAG_TOOLHUB_REQUIRED"],
        narrative: "ToolHub evidence missing."
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
    targetDiff: [
      { questionId: "AMC-1.1", current: 2, target: 4, gap: 2 },
      { questionId: "AMC-2.3", current: 1, target: 3, gap: 2 }
    ],
    prioritizedUpgradeActions: ["Improve weak controls."],
    evidenceToCollectNext: ["Capture tool approval evidence."],
    runSealSig: "sig",
    reportJsonSha256: "sha"
  };
}

describe("finding proof", () => {
  test("builds proof-backed findings with evidence and recommendation ids", () => {
    const report = sampleReport();
    const receipts = buildDecisionReceipts({
      workspace: "/tmp/amc-finding-proof",
      report,
      command: "amc",
      resourceManifestIds: ["manifest-1"]
    });
    const proofs = buildFindingProofs({
      workspace: "/tmp/amc-finding-proof",
      report,
      command: "amc",
      episodeIds: [`episode-${report.runId}`],
      resourceManifestIds: ["manifest-1"],
      decisionReceipts: receipts
    });

    expect(proofs).toHaveLength(2);
    expect(proofs[0]!.evidenceEpisodeIds).toEqual([`episode-${report.runId}`]);
    expect(proofs[0]!.recommendationIds.length).toBeGreaterThan(0);
    expect(proofs[0]!.proofRefs.some((ref) => ref.kind === "diagnostic-report" && ref.sha256 === "sha")).toBe(true);

    const unverified = proofs.find((proof) => proof.questionId === "AMC-2.3");
    expect(unverified?.surface).toBe("Enforce");
    expect(unverified?.status).toBe("unverified");
    expect(unverified?.uncertaintyNotes.join(" ")).toContain("No direct evidence");
  });

  test("writes, lists, loads, redacts, exports, and appends report links", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-finding-proof-"));
    try {
      const report = sampleReport();
      const reportDir = join(workspace, ".amc", "reports");
      mkdirSync(reportDir, { recursive: true });
      writeFileSync(join(reportDir, ".keep"), "", { flag: "w" });
      writeFileSync(join(reportDir, `${report.runId}.md`), "# Report\n\nBody\n");
      const receipts = buildDecisionReceipts({
        workspace,
        report,
        command: "amc",
        resourceManifestIds: ["manifest-1"]
      });

      const written = writeFindingProofs({
        workspace,
        report,
        command: "amc",
        episodeIds: [`episode-${report.runId}`],
        resourceManifestIds: ["manifest-1"],
        decisionReceipts: receipts
      });

      expect(existsSync(written.proofsPath)).toBe(true);
      expect(written.proofSetRef.proofCount).toBe(2);
      expect(written.markdownPath).toBe(join(reportDir, `${report.runId}.md`));
      expect(readFileSync(join(reportDir, `${report.runId}.md`), "utf8")).toContain("## Finding Proof Chain");

      const listed = listFindingProofs({ workspace, agentId: "default" });
      expect(listed).toHaveLength(2);
      const loaded = loadFindingProof({ workspace, agentId: "default", selector: "AMC-1.1" });
      expect(loaded.proofId).toContain(report.runId);
      expect(redactFindingProof(loaded).workspace).toBe("$WORKSPACE");

      const outputPath = join(workspace, "proofs.json");
      const exported = exportFindingProofs({ workspace, agentId: "default", outputPath, redacted: true });
      expect(exported.proofs).toHaveLength(2);
      expect(readFileSync(outputPath, "utf8")).toContain("$WORKSPACE");
      expect(readFileSync(outputPath, "utf8")).not.toContain(workspace);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
