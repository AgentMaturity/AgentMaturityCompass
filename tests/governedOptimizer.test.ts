import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { latestEnforceResourceManifestPath, type EnforceResourceManifest } from "../src/enforce/resourceManifest.js";
import {
  listGovernedOptimizerRuns,
  loadGovernedOptimizerRun,
  writeGovernedOptimizerRun,
  type GovernedOptimizerRun
} from "../src/experiments/governedOptimizer.js";
import { writeEpisodeRecord } from "../src/lifecycle/episodeRecord.js";
import { writeFixerRcaReport, type FixerRcaReport } from "../src/mechanic/fixerRca.js";
import type { DiagnosticReport } from "../src/types.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-governed-optimizer-"));
  roots.push(dir);
  return dir;
}

function diagnosticReport(runId = "trace-run-opt-1", questions = 2): DiagnosticReport {
  const questionScores = [
    {
      questionId: "AMC-1.1",
      claimedLevel: 4,
      supportedMaxLevel: 1,
      finalLevel: 1,
      confidence: 0.6,
      evidenceEventIds: ["trace-hallucinated"],
      flags: ["unsupported claim"],
      narrative: "Unsupported claim with no source citation.",
    },
    {
      questionId: "AMC-1.2",
      claimedLevel: 4,
      supportedMaxLevel: 2,
      finalLevel: 2,
      confidence: 0.7,
      evidenceEventIds: ["trace-schema"],
      flags: ["invalid json schema"],
      narrative: "Malformed JSON response missing required field.",
    },
  ].slice(0, questions);
  return {
    agentId: "default",
    runId,
    ts: Date.UTC(2026, 4, 22, 12, 0, 0),
    windowStartTs: Date.UTC(2026, 4, 22, 11, 55, 0),
    windowEndTs: Date.UTC(2026, 4, 22, 12, 0, 0),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.63,
    trustLabel: "MEDIUM TRUST",
    targetProfileId: null,
    layerScores: [{ layerName: "Agent Resilience", avgFinalLevel: 2, confidenceWeightedFinalLevel: 2 }],
    questionScores,
    inflationAttempts: [],
    unsupportedClaimCount: 1,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.5,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [],
    prioritizedUpgradeActions: ["Fix unsupported claim handling."],
    evidenceToCollectNext: ["Capture redacted trace snippets."],
    runSealSig: "sig",
    reportJsonSha256: "sha",
  };
}

function writeMutableManifest(ws: string): string {
  mkdirSync(join(ws, ".amc"), { recursive: true });
  const resourcePath = join(ws, ".amc", "prompt-addendum.md");
  writeFileSync(resourcePath, "Always cite evidence.\n");
  const manifestPath = latestEnforceResourceManifestPath(ws, "default");
  mkdirSync(dirname(manifestPath), { recursive: true });
  const manifest: EnforceResourceManifest = {
    schemaVersion: "2026-05-22",
    manifestId: "enforce-resources-optimizer-test",
    agentId: "default",
    workspace: ws,
    createdAt: new Date(Date.UTC(2026, 4, 22, 12, 0, 0)).toISOString(),
    resourcesSha256: "test-sha",
    resourceCount: 1,
    resources: [
      {
        id: "prompt:.amc/prompt-addendum.md",
        type: "prompt",
        kind: "prompt",
        path: ".amc/prompt-addendum.md",
        exists: true,
        digest: "digest",
        owner: "AMC",
        mutable: true,
        version: "v1",
        parentVersion: null,
        currentVersion: "v1",
        schema: "prompt-addendum.md",
        dependencies: [],
        lastEvaluation: null,
        validationStatus: "valid",
        lastVerifiedAt: new Date(Date.UTC(2026, 4, 22, 12, 0, 0)).toISOString(),
        rollbackTarget: "rollback://prompt-addendum/v1",
        rollbackPointer: "rollback://prompt-addendum/v1",
        evidenceRefs: [],
      },
    ],
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return resourcePath;
}

function writeRca(ws: string, runId: string, questions = 2): { report: FixerRcaReport; path: string } {
  writeEpisodeRecord({
    workspace: ws,
    report: diagnosticReport(runId, questions),
    source: "cli",
    command: "amc",
  });
  return writeFixerRcaReport({ workspace: ws, agentId: "default", selector: runId });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("governed optimizer", () => {
  test("creates isolated candidates, held-out splits, Pareto ranking, and receipts without mutating live resources", () => {
    const ws = workspace();
    const resourcePath = writeMutableManifest(ws);
    const before = readFileSync(resourcePath, "utf8");
    const rca = writeRca(ws, "trace-run-opt-success", 2);

    const written = writeGovernedOptimizerRun({
      workspace: ws,
      agentId: "default",
      rcaSelector: rca.report.reportId
    });

    expect(existsSync(written.path)).toBe(true);
    expect(written.signaturePath).toBeTruthy();
    expect(readFileSync(resourcePath, "utf8")).toBe(before);
    expect(written.run.candidateCount).toBeGreaterThanOrEqual(2);
    expect(written.run.validationReceipt.status).toBe("passed");
    expect(written.run.acceptedCandidateId).toBeTruthy();
    expect(written.run.receipts).toHaveLength(written.run.candidateCount);

    for (const candidate of written.run.candidates) {
      expect(existsSync(candidate.candidateWorkspace)).toBe(true);
      expect(existsSync(join(candidate.candidateWorkspace, "candidate.json"))).toBe(true);
      expect(candidate.liveResourceMutated).toBe(false);
      expect(candidate.split.validationTestIds.length).toBeGreaterThan(0);
      expect(candidate.split.searchTestIds.some((id) => candidate.split.validationTestIds.includes(id))).toBe(false);
      expect(candidate.leakageChecks.every((check) => check.status === "passed")).toBe(true);
      expect(Number.isFinite(candidate.metrics.scoreGain)).toBe(true);
      expect(Number.isFinite(candidate.metrics.risk)).toBe(true);
      expect(Number.isFinite(candidate.metrics.cost)).toBe(true);
      expect(Number.isFinite(candidate.metrics.latencyMs)).toBe(true);
      expect(Number.isFinite(candidate.metrics.confidence)).toBe(true);
      expect(Number.isFinite(candidate.metrics.regressionImpact)).toBe(true);
      expect(candidate.receiptId).toBeTruthy();
      expect(candidate.decisionReason.length).toBeGreaterThan(0);
    }

    const accepted = written.run.candidates.find((candidate) => candidate.candidateId === written.run.acceptedCandidateId);
    expect(accepted?.decision).toBe("accepted");
    expect(accepted?.paretoFront).toBe(true);
    expect(accepted?.rank).toBe(1);

    const listed = listGovernedOptimizerRuns({ workspace: ws, agentId: "default", redacted: true });
    expect(listed).toHaveLength(1);
    expect(listed[0]!.workspace).toBe("$WORKSPACE");

    const loaded = loadGovernedOptimizerRun({ workspace: ws, agentId: "default", selector: "latest" });
    expect(loaded.optimizerRunId).toBe(written.run.optimizerRunId);
  });

  test("rejects candidates when held-out validation cannot be created", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    const rca = writeRca(ws, "trace-run-opt-one-test", 1);

    const written = writeGovernedOptimizerRun({
      workspace: ws,
      agentId: "default",
      rcaSelector: rca.report.reportId
    });

    expect(written.run.acceptedCandidateId).toBeNull();
    expect(written.run.validationReceipt.status).toBe("blocked");
    expect(written.run.candidates).toHaveLength(1);
    expect(written.run.candidates[0]!.decision).toBe("rejected");
    expect(written.run.candidates[0]!.leakageChecks.some((check) => check.id === "heldout-validation-present" && check.status === "blocked")).toBe(true);
  });

  test("blocks leakage when candidate source references held-out validation cases", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    const rca = writeRca(ws, "trace-run-opt-leak", 2);
    const tampered: FixerRcaReport = {
      ...rca.report,
      proposals: rca.report.proposals.map((proposal, index) =>
        index === 0
          ? {
              ...proposal,
              patchSummary: `${proposal.patchSummary} validation ${rca.report.regressionTests[1]!.testId}`
            }
          : proposal
      )
    };
    writeFileSync(rca.path, `${JSON.stringify(tampered, null, 2)}\n`);

    const written = writeGovernedOptimizerRun({
      workspace: ws,
      agentId: "default",
      rcaSelector: rca.report.reportId
    });

    const leakedCandidate = written.run.candidates.find((candidate) => candidate.sourceProposalId === rca.report.proposals[0]!.proposalId);
    expect(leakedCandidate?.decision).toBe("rejected");
    expect(leakedCandidate?.leakageChecks.some((check) => check.id === "heldout-not-in-candidate-source" && check.status === "blocked")).toBe(true);
    expect(written.run.receipts.find((receipt) => receipt.candidateId === leakedCandidate?.candidateId)?.reason).toContain("held-out");
  });
});
