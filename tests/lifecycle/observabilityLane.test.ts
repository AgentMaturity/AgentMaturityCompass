import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { enforceResourceManifestRef, writeEnforceResourceManifest } from "../../src/enforce/resourceManifest.js";
import { buildDecisionReceipts } from "../../src/lifecycle/decisionReceipt.js";
import {
  listObservabilityLaneRecords,
  loadObservabilityLaneRecord,
  redactObservabilityLaneRecord,
  writeObservabilityLaneRecord
} from "../../src/lifecycle/observabilityLane.js";
import type { DiagnosticReport } from "../../src/types.js";

function sampleReport(): DiagnosticReport {
  return {
    agentId: "default",
    runId: "55555555-5555-4555-8555-555555555555",
    ts: Date.UTC(2026, 4, 22, 12, 0, 0),
    windowStartTs: Date.UTC(2026, 4, 21, 12, 0, 0),
    windowEndTs: Date.UTC(2026, 4, 22, 12, 0, 0),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.66,
    trustLabel: "DEVELOPING — some evidence, needs more coverage",
    targetProfileId: null,
    layerScores: [],
    questionScores: [
      {
        questionId: "AMC-2.1",
        claimedLevel: 3,
        supportedMaxLevel: 1,
        finalLevel: 1,
        confidence: 0.35,
        evidenceEventIds: ["ev-trace-1"],
        flags: ["LOW_EVIDENCE"],
        narrative: "Component behavior has weak runtime evidence."
      }
    ],
    inflationAttempts: [],
    unsupportedClaimCount: 1,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.4,
    evidenceTrustCoverage: { observed: 0.5, attested: 0.25, selfReported: 0.25 },
    targetDiff: [{ questionId: "AMC-2.1", current: 1, target: 3, gap: 2 }],
    prioritizedUpgradeActions: ["Add component-level trace evidence."],
    evidenceToCollectNext: ["Capture user-visible failure and recovery evidence."],
    runSealSig: "sig",
    reportJsonSha256: "sha"
  };
}

describe("observability lane", () => {
  test("writes component attribution, experience corpus, and decision chain records", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-observability-lane-"));
    try {
      mkdirSync(join(workspace, ".amc"), { recursive: true });
      writeFileSync(join(workspace, ".amc", "agent.config.yaml"), "agentId: default\n");
      writeFileSync(join(workspace, ".amc", "guardrails.yaml"), "rules: []\n");

      const report = sampleReport();
      const resourceManifest = writeEnforceResourceManifest({ workspace, agentId: "default" });
      const resourceRef = enforceResourceManifestRef(resourceManifest);
      const decisions = buildDecisionReceipts({
        workspace,
        report,
        command: "amc",
        resourceManifestIds: [resourceRef.manifestId]
      });

      const result = writeObservabilityLaneRecord({
        workspace,
        report,
        source: "cli",
        command: "amc",
        episodeIds: [`episode-${report.runId}`],
        lifecycleReceiptIds: ["receipt-1"],
        resourceManifests: [resourceRef],
        decisionReceipts: decisions
      });

      expect(existsSync(result.recordPath)).toBe(true);
      expect(result.ref.observabilityId).toBe(`observability-${report.runId}`);
      expect(result.record.componentAttribution.some((component) => component.componentId === "score-question:AMC-2.1")).toBe(true);
      expect(result.record.componentAttribution.some((component) => component.kind === "guardrail")).toBe(true);
      expect(result.record.experienceCorpus.some((signal) => signal.source === "failed-evaluation")).toBe(true);
      expect(result.record.decisionChain).toHaveLength(2);
      expect(result.record.summary.proposedDecisionCount).toBe(2);

      const listed = listObservabilityLaneRecords({ workspace, agentId: "default" });
      expect(listed).toHaveLength(1);
      const loaded = loadObservabilityLaneRecord({ workspace, agentId: "default", selector: report.runId });
      expect(loaded.observabilityId).toBe(result.record.observabilityId);
      expect(redactObservabilityLaneRecord(loaded).workspace).toBe("$WORKSPACE");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
