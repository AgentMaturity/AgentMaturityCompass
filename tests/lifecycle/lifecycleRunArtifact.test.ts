import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { verifyArtifactFileSignature } from "../../src/lifecycle/artifactSignature.js";
import { buildLifecycleRunArtifact, exportLifecycleRunArtifact, listLifecycleRunArtifacts, loadLifecycleRunArtifact, writeLifecycleRunArtifact } from "../../src/lifecycle/lifecycleRunArtifact.js";
import type { DiagnosticReport } from "../../src/types.js";

function sampleReport(): DiagnosticReport {
  return {
    agentId: "default",
    runId: "11111111-1111-4111-8111-111111111111",
    ts: Date.UTC(2026, 4, 22, 12, 0, 0),
    windowStartTs: Date.UTC(2026, 4, 21, 12, 0, 0),
    windowEndTs: Date.UTC(2026, 4, 22, 12, 0, 0),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.9,
    trustLabel: "HIGH TRUST",
    targetProfileId: null,
    layerScores: [
      { layerName: "Strategic Agent Operations", avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 },
      { layerName: "Leadership & Autonomy", avgFinalLevel: 2, confidenceWeightedFinalLevel: 2 }
    ],
    questionScores: [
      {
        questionId: "AMC-1.1",
        claimedLevel: 3,
        supportedMaxLevel: 3,
        finalLevel: 3,
        confidence: 0.8,
        evidenceEventIds: ["ev-1"],
        flags: [],
        narrative: "Evidence-backed."
      }
    ],
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.5,
    evidenceTrustCoverage: {
      observed: 1,
      attested: 0,
      selfReported: 0
    },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "sig",
    reportJsonSha256: "sha"
  };
}

describe("lifecycle run artifact", () => {
  test("maps a diagnostic report into all AMC surfaces", () => {
    const artifact = buildLifecycleRunArtifact({
      workspace: "/tmp/amc-lifecycle-test",
      report: sampleReport(),
      source: "cli",
      command: "amc",
      elapsedMs: 1234,
      signed: true,
      episodeRecords: [{ episodeId: "episode-1", path: "/tmp/episode-1.json" }],
      decisionReceipts: [{ receiptId: "decision-1", path: "/tmp/decision-1.json" }],
      resourceManifests: [{
        manifestId: "enforce-resources-test",
        path: "/tmp/manifest.json",
        resourcesSha256: "sha256",
        resourceCount: 2
      }]
    });

    expect(Object.keys(artifact.surfaces)).toEqual([
      "Score",
      "Shield",
      "Enforce",
      "Vault",
      "Watch",
      "Comply",
      "Fleet",
      "Passport"
    ]);
    expect(artifact.surfaces.Score.status).toBe("complete");
    expect(artifact.evidence.diagnosticReport.runId).toBe(sampleReport().runId);
    expect(artifact.evidence.episodeRecords).toEqual([{ episodeId: "episode-1", path: "/tmp/episode-1.json" }]);
    expect(artifact.evidence.decisionReceipts).toEqual([{ receiptId: "decision-1", path: "/tmp/decision-1.json" }]);
    expect(artifact.evidence.resourceManifests).toEqual([{
      manifestId: "enforce-resources-test",
      path: "/tmp/manifest.json",
      resourcesSha256: "sha256",
      resourceCount: 2
    }]);
    expect(artifact.elapsedMs).toBe(1234);
  });

  test("keeps a valid seal separate from insufficient evidence", () => {
    const report = sampleReport();
    report.integrityIndex = 0;
    report.trustLabel = "UNRELIABLE — DO NOT USE FOR CLAIMS";
    report.evidenceCoverage = 0;
    report.evidenceTrustCoverage = { observed: 0, attested: 0, selfReported: 0 };
    report.questionScores = report.questionScores.map((score) => ({ ...score, evidenceEventIds: [] }));

    const artifact = buildLifecycleRunArtifact({
      workspace: "/tmp/amc-lifecycle-insufficient",
      report,
      source: "cli",
      command: "amc",
      signed: true
    });

    expect(artifact.surfaces.Score.status).toBe("partial");
    expect(artifact.surfaces.Score.summary).toContain("not claim-ready");
    expect(artifact.surfaces.Vault.status).toBe("complete");
    expect(artifact.evidence.diagnosticReport).toMatchObject({
      artifactStatus: "VALID",
      evidenceStatus: "INSUFFICIENT_EVIDENCE",
      claimEligible: false
    });
  });

  test("writes the artifact beside agent lifecycle outputs", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-lifecycle-artifact-"));
    try {
      const result = writeLifecycleRunArtifact({
        workspace,
        report: sampleReport(),
        source: "cli",
        command: "amc",
        createdWorkspace: true,
        createdAgentContext: true
      });

      expect(existsSync(result.artifactPath)).toBe(true);
      expect(result.signaturePath ? existsSync(result.signaturePath) : false).toBe(true);
      expect(verifyArtifactFileSignature({ workspace, path: result.artifactPath }).valid).toBe(true);
      const parsed = JSON.parse(readFileSync(result.artifactPath, "utf8")) as { runId?: string; setup?: { createdWorkspace?: boolean } };
      expect(parsed.runId).toBe(sampleReport().runId);
      expect(parsed.setup?.createdWorkspace).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("lists, loads, and exports a redacted artifact", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-lifecycle-artifact-export-"));
    try {
      const result = writeLifecycleRunArtifact({
        workspace,
        report: sampleReport(),
        source: "cli",
        command: "amc",
        episodeRecords: [{ episodeId: "episode-1", path: join(workspace, ".amc", "episodes", "episode-1.json") }],
        decisionReceipts: [{ receiptId: "decision-1", path: join(workspace, ".amc", "decision-receipts", "run.json") }],
        resourceManifests: [{
          manifestId: "enforce-resources-test",
          path: join(workspace, ".amc", "enforce", "resources", "manifest.json"),
          resourcesSha256: "sha256",
          resourceCount: 2
        }]
      });

      const listed = listLifecycleRunArtifacts({ workspace, agentId: "default" });
      expect(listed).toHaveLength(1);
      const loaded = loadLifecycleRunArtifact({ workspace, agentId: "default", selector: result.artifact.lifecycleRunId });
      expect(loaded.runId).toBe(sampleReport().runId);

      const outPath = join(workspace, "lifecycle-redacted.json");
      const exported = exportLifecycleRunArtifact({
        workspace,
        agentId: "default",
        selector: sampleReport().runId,
        outputPath: outPath,
        redacted: true
      });
      const body = readFileSync(outPath, "utf8");
      expect(exported.redacted).toBe(true);
      expect(body).toContain("$WORKSPACE/");
      expect(body).not.toContain(workspace);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
