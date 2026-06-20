import { describe, expect, test } from "vitest";
import { buildLiveDriftWatchAlerts, verifyLiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";
import {
  runSkillMatchResumeLiveDrift,
  type SkillMatchResumeLiveDriftRow,
  type SkillMatchResumeSourceProof,
} from "../src/watch/skillMatchLiveDrift.js";

const sourceProof: SkillMatchResumeSourceProof = {
  sourceRefHash: "github:SubashSK777/SkillMatch-AI_Resume_Analyzer@5b3c80b83d8f2e0893120d565d013a66b24f54ea",
  repositorySnapshotHash: "tree:5b3c80b83d8f2e0893120d565d013a66b24f54ea:35-entries",
  noLicenseBoundaryHash: "github-api-license-null-2026-06-20",
  defaultBranchHash: "main@5b3c80b83d8f2e0893120d565d013a66b24f54ea",
  readmeBlobHash: "README.md@8f059d1bd1d95e5e5ae7c345b11feb62c34c5365",
  dockerfileHash: "Dockerfile@dfa235bc399a7d05eae0560311d0fc06a53a8d10",
  frontendTreeHash: "frontend@a645b3b35ee1674a843f1c719e38e5d0eb969b78",
  frontendPackageHash: "frontend/package.json@1cb194c412c3fe54493e553f909ae3da246f6b17",
  frontendLockHash: "frontend/package-lock.json@3610f5748f481e73d202d7c97cb4cee17ea162ab",
  frontendAnalyzerComponentHash: "frontend/src/components/Analyzer.jsx@af13ad753472cd0eae36d0b7beee64ac32125c57",
  frontendPdfExtractorHash: "frontend/src/utils/pdfExtractor.js@23756618358ce53a0c94cb36150c2b8a98e81cbb",
  oldVersionTreeHash: "old_version@56aa045a0661ef0aff2e5a60f652ef8a57ca0e1d",
  oldAppHash: "old_version/app.py@5e4a78ac73e6f9dac3b4a1cc93a23993460a7823",
  oldNotebookHash: "old_version/AI_Powered_Resume_Analyzer.ipynb@027069bdce893c84843aab87b45bc84850714486",
  requirementsHash: "old_version/requirements.txt@5c30cbac0027f12247ef186de583f57c66b5cf25",
  modelProviderManifestHash: "amc-skillmatch-model-provider-openai-gemini-v1",
  resumeTaskTaxonomyHash: "amc-skillmatch-resume-task-taxonomy-v1",
  ragInputCorpusManifestHash: "amc-skillmatch-rag-input-corpus-manifest-v1",
  baselineDistributionHash: "amc-skillmatch-baseline-distribution-v1",
  liveSampleManifestHash: "amc-skillmatch-live-sample-manifest-v1",
  driftStatisticHash: "amc-skillmatch-drift-statistic-v1",
  alertReceiptHash: "amc-skillmatch-alert-receipt-v1",
  replayCommandHash: "amc-skillmatch-replay-command-v1",
  ciReceiptHash: "amc-skillmatch-ci-receipt-v1",
  noSourceCopyProofHash: "amc-skillmatch-no-source-copy-proof-v1",
  noResumeCopyProofHash: "amc-skillmatch-no-resume-copy-proof-v1",
  privacyBoundaryHash: "amc-skillmatch-private-resume-boundary-v1",
};

function row(
  index: number,
  phase: "baseline" | "live",
  taskType: SkillMatchResumeLiveDriftRow["skillMatchTaskType"],
  overrides: Partial<SkillMatchResumeLiveDriftRow> = {},
): SkillMatchResumeLiveDriftRow {
  const score = phase === "baseline" ? 0.9 - index * 0.01 : 0.89 - index * 0.01;
  return {
    traceId: `${phase}-skillmatch-${index + 1}`,
    scenarioId: `skillmatch-${taskType}-${index + 1}`,
    timestamp: phase === "baseline" ? `2026-06-20T00:0${index}:00.000Z` : `2026-06-20T01:0${index}:00.000Z`,
    score0to1: score,
    passed: true,
    refused: false,
    errored: false,
    behaviorSignature: `skillmatch:${taskType}|action:resume_analysis`,
    taskCategory: "resume analysis live drift",
    domain: "agent evaluation",
    agentEvaluationDimension: "evaluation_frameworks",
    latencyMs: phase === "baseline" ? 1200 + index * 30 : 1230 + index * 30,
    costUsd: phase === "baseline" ? 0.006 + index * 0.001 : 0.0062 + index * 0.001,
    evidenceRefs: [`skillmatch-trace:${phase}-${index + 1}`],
    signedEvidenceRefs: [`skillmatch-ledger:${phase}-${index + 1}`],
    skillMatchTaskType: taskType,
    skillMatchResumeFormat: index === 0 ? "pdf" : index === 1 ? "docx" : "txt",
    skillMatchProviderRouteHash: "provider-route-openai-gemini-v1",
    skillMatchPromptPolicyHash: "skillmatch-prompt-policy-v1",
    skillMatchResumeInputHash: `private-resume-${phase}-${index + 1}`,
    skillMatchJobDescriptionHash: `job-description-${index + 1}`,
    skillMatchRagContextHash: `rag-context-${index + 1}`,
    skillMatchAnalysisOutputHash: `${phase}-analysis-output-${index + 1}`,
    skillMatchEvaluatorTraceHash: `${phase}-evaluator-trace-${index + 1}`,
    skillMatchNoResumeCopyProofHash: sourceProof.noResumeCopyProofHash,
    skillMatchNoSourceCopyProofHash: sourceProof.noSourceCopyProofHash,
    skillMatchParserAccuracy0to1: score,
    skillMatchGroundingScore0to1: score - 0.02,
    skillMatchSuggestionQuality0to1: score - 0.01,
    skillMatchPiiRedactionPassed: true,
    ...overrides,
  };
}

const baselineRows = [
  row(0, "baseline", "resume_summary"),
  row(1, "baseline", "job_match"),
  row(2, "baseline", "improvement_suggestions"),
];

const stableLiveRows = [
  row(0, "live", "resume_summary"),
  row(1, "live", "job_match"),
  row(2, "live", "improvement_suggestions"),
];

describe("runSkillMatchResumeLiveDrift", () => {
  test("approves stable SkillMatch resume live drift with source, privacy, and row proof", () => {
    const result = runSkillMatchResumeLiveDrift({
      agentId: "resume-analysis-agent",
      sourceProof,
      baselineWindow: {
        windowId: "skillmatch-baseline",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T00:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "skillmatch-live",
        startedAt: "2026-06-20T01:00:00.000Z",
        endedAt: "2026-06-20T01:10:00.000Z",
        rows: stableLiveRows,
      },
      now: new Date("2026-06-20T02:00:00.000Z"),
    });

    expect(result.skillMatchEvidenceCoverage0to1).toBe(1);
    expect(result.missingReasons).toEqual([]);
    expect(result.receipt.failClosed).toBe(false);
    expect(result.receipt.sourceRefs).toContain(sourceProof.sourceRefHash);
    expect(result.receipt.summary).toContain("SkillMatch");
    expect(result.rowProofs).toHaveLength(6);
    expect(result.rowProofs.every((proof) => proof.signedEvidenceRefs.length > 0)).toBe(true);
    expect(buildLiveDriftWatchAlerts(result.receipt)).toEqual([]);
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("fails closed when SkillMatch proof is missing even if generic drift is stable", () => {
    const result = runSkillMatchResumeLiveDrift({
      agentId: "resume-analysis-agent",
      sourceProof: {
        ...sourceProof,
        readmeBlobHash: "",
        frontendAnalyzerComponentHash: "",
        driftStatisticHash: "",
        alertReceiptHash: "",
        noResumeCopyProofHash: "",
      },
      baselineWindow: {
        windowId: "skillmatch-baseline",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T00:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "skillmatch-live",
        startedAt: "2026-06-20T01:00:00.000Z",
        endedAt: "2026-06-20T01:10:00.000Z",
        rows: stableLiveRows,
      },
      now: new Date("2026-06-20T02:00:00.000Z"),
    });

    expect(result.skillMatchEvidenceCoverage0to1).toBeLessThan(1);
    expect(result.missingReasons).toEqual(expect.arrayContaining([
      "readmeBlobHash",
      "frontendAnalyzerComponentHash",
      "driftStatisticHash",
      "alertReceiptHash",
      "noResumeCopyProofHash",
    ]));
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toContain("skillMatchEvidenceCoverage0to1");
    expect(buildLiveDriftWatchAlerts(result.receipt).map((alert) => alert.metricId)).toContain("skillMatchEvidenceCoverage0to1");
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("fails closed when live resume behavior and score drift exceed thresholds", () => {
    const driftingRows = stableLiveRows.map((sample, index): SkillMatchResumeLiveDriftRow => ({
      ...sample,
      score0to1: 0.66 - index * 0.02,
      passed: index !== 2,
      behaviorSignature: `skillmatch:${sample.skillMatchTaskType}|action:ungrounded_resume_advice`,
      skillMatchGroundingScore0to1: 0.62 - index * 0.02,
      evidenceRefs: [`skillmatch-drift-trace:${index + 1}`],
      signedEvidenceRefs: [`skillmatch-drift-ledger:${index + 1}`],
    }));

    const result = runSkillMatchResumeLiveDrift({
      agentId: "resume-analysis-agent",
      sourceProof,
      baselineWindow: {
        windowId: "skillmatch-baseline",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T00:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "skillmatch-live",
        startedAt: "2026-06-20T01:00:00.000Z",
        endedAt: "2026-06-20T01:10:00.000Z",
        rows: driftingRows,
      },
      thresholds: {
        maxScoreDrop0to1: 0.05,
        maxPassRateDrop0to1: 0.05,
      },
      now: new Date("2026-06-20T02:00:00.000Z"),
    });

    expect(result.missingReasons).toEqual([]);
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "passRate0to1",
      "behaviorSignature",
    ]));
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });
});
