import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  runReplayBenchmarkCorpus,
  type ReplayBenchmarkCorpusInput,
} from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

function question(id: string): DiagnosticQuestion {
  const found = getQuestionSet().questions.find((row) => row.id === id);
  if (!found) throw new Error(`missing test question ${id}`);
  return found;
}

function score(overrides: Partial<QuestionScore> = {}): QuestionScore {
  return {
    questionId: "AMC-1.3",
    claimedLevel: 4,
    supportedMaxLevel: 4,
    finalLevel: 4,
    confidence: 0.86,
    evidenceEventIds: ["ev-gap0641-eval-pack", "ev-gap0641-signed-ledgers", "ev-gap0641-ci"],
    flags: [],
    narrative: "Source-review metadata is bounded to AMC-owned score explainability evidence.",
    ...overrides,
  };
}

function replayInput(sourceRef: string, suffix: string, signed: boolean): ReplayBenchmarkCorpusInput {
  return {
    agentId: `gap-${suffix}-replay-agent`,
    corpusId: `gap-${suffix}-amc-owned-replay-corpus`,
    corpusVersion: "2026.06.21",
    baselineRunId: `baseline-${suffix}`,
    candidateRunId: `candidate-${suffix}`,
    sourceRefs: [sourceRef],
    rows: [
      {
        rowId: `gap-${suffix}-row-1`,
        surfaces: ["Score", "Shield", "Watch"],
        fixture: {
          task: `AMC-owned replay fixture for ${suffix}`,
          inputHash: hash("a"),
          expectedHash: hash("b"),
          seed: 640,
          fixtureHash: hash("c"),
          runtime: {
            kind: "python",
            version: "3.12",
            commandHash: hash("d"),
            dependencyHash: hash("e"),
            sandboxProfile: "amc-owned-no-upstream-copy",
          },
          outputArtifactHashes: [hash("f")],
          metadata: {
            sourceReviewBoundary: "metadata-only source refs are not replay evidence",
            noUpstreamCopy: true,
          },
        },
        baseline: {
          score0to1: 0.88,
          evidenceRefs: [`ev-${suffix}-baseline`],
          signedEvidenceRefs: signed ? [`ledger-${suffix}-baseline`] : [],
        },
        candidate: {
          score0to1: 0.9,
          evidenceRefs: [`ev-${suffix}-candidate`],
          signedEvidenceRefs: signed ? [`ledger-${suffix}-candidate`] : [],
        },
      },
    ],
  };
}

function driftRows(prefix: string, score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2].map((index) => ({
    traceId: `${prefix}-trace-${index}`,
    scenarioId: "adaptive-task-decomposition",
    timestamp: `2026-06-21T00:0${index}:00.000Z`,
    score0to1,
    behaviorSignature: `${behavior}:${index}`,
    taskCategory: "multi-agent-task-decomposition",
    agentEvaluationDimension: "behavioral_regression",
    interactionTurnCount: 8 + index,
    solutionPathCount: 4,
    offPathAttemptCount: prefix === "live" ? 3 : 1,
    divergenceMomentum0to1: prefix === "live" ? 0.31 : 0.08,
    actionFixationRate0to1: prefix === "live" ? 0.22 : 0.05,
    latencyMs: prefix === "live" ? 1600 : 900,
    costUsd: prefix === "live" ? 0.012 : 0.008,
    evidenceRefs: [`ev-gap0647-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0647-${prefix}-${index}`],
  }));
}

describe("GAP-0640..0648 AMC relevance-gated source reviews", () => {
  it("keeps irrelevant or metadata-only sources out of product code while documenting the 8-surface decision", () => {
    const expectations = [
      ["docs/source-reviews/GAP-0640-pyod-replay-corpus.md", "No PyOD runtime dependency or source-specific module was added"],
      ["docs/source-reviews/GAP-0642-hertzbeat-public-methodology.md", "no methodology version bump"],
      ["docs/source-reviews/GAP-0643-title-pending-47-live-drift.md", "skipped for product implementation"],
      ["docs/source-reviews/GAP-0646-swarm-routing-provider-drift.md", "would misclassify the gap"],
      ["docs/source-reviews/GAP-0648-clinical-agent-public-methodology.md", "not a public AMC methodology version change by itself"],
    ];

    for (const [path, phrase] of expectations) {
      const doc = readFileSync(path, "utf8");
      expect(doc).toContain("## Relevance decision");
      expect(doc).toContain("## AMC/8 surface check");
      expect(doc).toContain("No-bloat boundary");
      expect(doc).toContain(phrase);
      expect(doc).toContain("No");
    }
  });

  it("rejects GAP-0640 PyOD metadata-only replay claims and accepts GAP-0644 OpenLLMetry only through existing signed replay receipts", () => {
    const pyod = buildEvalReplayCorpusEvidenceReceipt(
      runReplayBenchmarkCorpus(replayInput("https://github.com/yzhao062/pyod", "0640-pyod", false)),
    );
    expect(pyod.status).toBe("fail_closed");
    expect(pyod.issues.join("\n")).toContain("signed evidence");
    expect(pyod.recommendation).toContain("Fail closed");

    const openllmetry = buildEvalReplayCorpusEvidenceReceipt(
      runReplayBenchmarkCorpus(replayInput("https://github.com/traceloop/openllmetry", "0644-openllmetry", true)),
    );
    expect(openllmetry.status).toBe("ready");
    expect(openllmetry.surfaces).toEqual(expect.arrayContaining(["Score", "Shield", "Watch"]));
    expect(openllmetry.sourceRefs).toEqual(["https://github.com/traceloop/openllmetry"]);
    expect(openllmetry.signedEvidenceRefCount).toBe(2);
  });

  it("binds GAP-0641 coordinated multi-agent outcome metadata to existing question-score explainability primitives", () => {
    const doi = "https://doi.org/10.65109/uqpo8536";
    const openAlex = "https://openalex.org/W4415054476";
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0641-coordinated-agent",
      runId: "run-gap-0641-multi-agent-alignment",
      generatedAt: "2026-06-21T00:00:00.000Z",
      sourceRefs: [doi, openAlex],
      rows: [
        {
          question: question("AMC-1.3"),
          score: score(),
          acceptedEvidence: [
            { id: "ev-gap0641-eval-pack", event_hash: hash("a"), writer_sig: "sig-gap0641-eval-pack", event_type: "artifact", session_id: "session-gap0641", ts: 1, trustTier: "OBSERVED_HARDENED" },
            { id: "ev-gap0641-signed-ledgers", event_hash: hash("b"), writer_sig: "sig-gap0641-signed-ledgers", event_type: "metric", session_id: "session-gap0641", ts: 2, trustTier: "OBSERVED_HARDENED" },
            { id: "ev-gap0641-ci", event_hash: hash("c"), writer_sig: "sig-gap0641-ci", event_type: "test", session_id: "session-gap0641", ts: 3, trustTier: "OBSERVED_HARDENED" },
          ],
          rejectedEvidence: [
            {
              event: { id: "ev-gap0641-paper-metadata-only", event_hash: hash("d"), writer_sig: "sig-gap0641-paper", event_type: "review", session_id: "session-gap0641-source", ts: 4, trustTier: "ATTESTED" },
              reason: "DOI/OpenAlex metadata confirms relevance only; it lacks AMC-owned role manifests, interaction traces, evaluator configs, signed evidence rows, and repair hints.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0641-coordinated-outcome-proof",
              criterionType: "objective_quality",
              status: "satisfied",
              evidenceRefs: ["ev-gap0641-eval-pack", "ev-gap0641-signed-ledgers", "ev-gap0641-ci"],
              rejectedEvidenceRefs: ["ev-gap0641-paper-metadata-only"],
              judgeRef: "judge://amc/gap-0641-coordination-outcomes",
              repairHint: "Keep source metadata bounded to AMC-owned role manifests, traces, evaluator configs, signed rows, thresholds, and no-paper-copy proof.",
            },
          ],
          multiUserBenchmarkLens: [
            {
              benchmarkId: "gap-0641-coordination-outcomes",
              sourceRef: doi,
              scenarioId: "coordinated-multi-agent-outcome",
              scenarioFamily: "shared_queue",
              capability: "sequential_coordination",
              datasetManifestHash: hash("e"),
              userRoleManifestHash: hash("f"),
              permissionPolicyHash: hash("1"),
              preferenceProfileHash: hash("2"),
              resourceQueuePolicyHash: hash("3"),
              instructionSetHash: hash("4"),
              interactionTraceHash: hash("5"),
              evaluatorConfigHash: hash("6"),
              resultArtifactHash: hash("7"),
              metricReportHash: hash("8"),
              userRoleCount: 4,
              turnCount: 12,
              privacyPassRate0to1: 0.99,
              minPrivacyPassRate0to1: 0.95,
              coordinationSuccessRate0to1: 0.92,
              minCoordinationSuccessRate0to1: 0.85,
              queueFairnessScore0to1: 0.91,
              minQueueFairnessScore0to1: 0.85,
              instructionFollowingScore0to1: 0.94,
              minInstructionFollowingScore0to1: 0.9,
              status: "satisfied",
              evidenceRefs: ["ev-gap0641-eval-pack", "ev-gap0641-signed-ledgers", "ev-gap0641-ci"],
              rejectedEvidenceRefs: ["ev-gap0641-paper-metadata-only"],
              repairHint: "Keep coordination outcome source metadata bound to AMC-owned role manifests, traces, evaluator config, thresholds, and signed rows.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap-0641-coordination-eval-score-pack",
              sourceRef: doi,
              language: "typescript",
              testFramework: "vitest",
              adapter: "generic_llm_client",
              datasetRef: "amc://gap-0641/coordinated-outcomes",
              datasetHash: hash("9"),
              testCaseId: "AMC-1.3:multi-agent-coordination-source-boundary",
              testCaseHash: hash("0"),
              evaluatorIds: ["role-manifest", "interaction-trace", "coordination-threshold", "signed-ledger"],
              evaluatorConfigHash: hash("a"),
              judgeModelRef: "judge://amc/local-eval",
              experimentRunId: "gap-0641-multi-agent-alignment",
              experimentResultHash: hash("b"),
              exportArtifactHash: hash("c"),
              ciRunId: "vitest:gap-0641-multi-agent-alignment",
              ciConfigHash: hash("d"),
              traceArtifactHash: hash("e"),
              toolCallValidationHash: hash("f"),
              agentBehaviorEvaluation: true,
              passRate0to1: 1,
              minPassRate0to1: 0.99,
              averageScore0to1: 0.94,
              threshold0to1: 0.9,
              status: "satisfied",
              evidenceRefs: ["ev-gap0641-eval-pack", "ev-gap0641-signed-ledgers", "ev-gap0641-ci"],
              rejectedEvidenceRefs: ["ev-gap0641-paper-metadata-only"],
              repairHint: "Preserve AMC-owned coordination fixtures, source refs, evaluator configs, signed evidence, and no-paper-copy proof.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    const pack = buildEvalScoreExplainabilityPack(report);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]?.multiUserBenchmarkLens[0]?.coordinationSuccessRate0to1).toBe(0.92);
    expect(pack.failClosed).toBe(false);
    expect(pack.sourceRefs).toEqual([doi, openAlex]);
    expect(pack.rows[0]?.acceptedEvidenceIds).toEqual(["ev-gap0641-eval-pack", "ev-gap0641-signed-ledgers", "ev-gap0641-ci"]);
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("metadata confirms relevance only");
  });

  it("uses existing Watch live-drift receipts for GAP-0647 adaptive task decomposition without a source-specific subsystem", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0647-adaptive-task-agent",
      baselineWindow: {
        windowId: "gap0647-baseline",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T01:00:00.000Z",
        rows: driftRows("baseline", 0.91, "stable-decomposition"),
      },
      liveWindow: {
        windowId: "gap0647-live",
        startedAt: "2026-06-21T00:00:00.000Z",
        endedAt: "2026-06-21T01:00:00.000Z",
        rows: driftRows("live", 0.76, "nonstationary-decomposition"),
      },
      sourceRefs: ["https://doi.org/10.20944/preprints202602.1841.v1", "https://openalex.org/W7131887020"],
      now: new Date("2026-06-21T02:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.sourceRefs).toContain("https://openalex.org/W7131887020");
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("scoreMean0to1");
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).length).toBeGreaterThan(0);
  });
});
