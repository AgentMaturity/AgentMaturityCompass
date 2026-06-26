import { describe, expect, test } from "vitest";
import { buildLiveDriftWatchAlerts, verifyLiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";
import {
  runPaperReadSkillLiveDrift,
  type PaperReadSkillLiveDriftRow,
  type PaperReadSkillSourceProof,
} from "../src/watch/paperReadSkillLiveDrift.js";

const sourceProof: PaperReadSkillSourceProof = {
  sourceRefHash: "github:Ayanami0730/paper-read-skill@adeb38cd3a8ae3094c571ae483be19a324a767d9",
  repositorySnapshotHash: "tree:adeb38cd3a8ae3094c571ae483be19a324a767d9:17-entries",
  noLicenseBoundaryHash: "github-api-license-null-2026-06-20",
  readmeBlobHash: "README.md@2cec669abc687d21f3c61b0af75e77e7e40eba53",
  llmsManifestHash: "llms.txt@88255a6f3a54f3bb4468acf136f7c764d801c156",
  skillsTreeHash: "skills@47b0e8b06c5528ff308f1c9e405701213e99c368",
  paperAnalysisSkillHash: "skills/paper-analysis/SKILL.md@797c976aa0e8b9e96eb924fa5c0b3bdaa8678141",
  paperAnalysisPromptCatalogHash: "skills/paper-analysis/prompts@3326c99d118fec4861aeff3c1d284123d3cd9db2",
  blogReadingSkillHash: "skills/blog-reading/SKILL.md@20aedd6bc86a3d518510044e98347ec6b4eab716",
  blogReadingPromptCatalogHash: "skills/blog-reading/prompts@065fab0803523776b4c2924488bebe92cf155d83",
  benchmarkPromptHash: "skills/paper-analysis/prompts/benchmark.md@e17581e3b361b5824108fd6392152088a498510c",
  methodologyPromptHash: "skills/paper-analysis/prompts/methodology.md@2e8ac8559cfaba9a8562a764c01b6dc0b8b6194c",
  surveyOpinionPromptHash: "skills/paper-analysis/prompts/survey-opinion.md@c1c9eeb79c3a9cf2415534067ecba8d34c725134",
  routePolicyHash: "amc-paper-read-skill-route-policy-v1",
  researchTaskManifestHash: "amc-paper-read-skill-research-task-manifest-v1",
  evaluationRubricHash: "amc-paper-read-skill-eval-rubric-v1",
  baselineDistributionHash: "amc-paper-read-skill-baseline-distribution-v1",
  liveSampleManifestHash: "amc-paper-read-skill-live-sample-manifest-v1",
  driftStatisticHash: "amc-paper-read-skill-drift-statistic-v1",
  alertReceiptHash: "amc-paper-read-skill-alert-receipt-v1",
  replayCommandHash: "amc-paper-read-skill-replay-command-v1",
  ciReceiptHash: "amc-paper-read-skill-ci-receipt-v1",
  noPromptCopyProofHash: "amc-paper-read-skill-no-prompt-copy-proof-v1",
};

function row(
  index: number,
  phase: "baseline" | "live",
  route: PaperReadSkillLiveDriftRow["paperReadSkillRoute"],
  overrides: Partial<PaperReadSkillLiveDriftRow> = {},
): PaperReadSkillLiveDriftRow {
  const score = phase === "baseline" ? 0.91 - index * 0.01 : 0.9 - index * 0.01;
  return {
    traceId: `${phase}-paper-read-${index + 1}`,
    scenarioId: `paper-read-${route}-${index + 1}`,
    timestamp: phase === "baseline" ? `2026-06-19T00:0${index}:00.000Z` : `2026-06-19T01:0${index}:00.000Z`,
    score0to1: score,
    passed: true,
    refused: false,
    errored: false,
    behaviorSignature: `paper-read-skill:${route}|action:research_synthesis`,
    taskCategory: "paper reading research workflow",
    domain: "agent evaluation",
    agentEvaluationDimension: "evaluation_frameworks",
    latencyMs: phase === "baseline" ? 900 + index * 20 : 940 + index * 20,
    costUsd: phase === "baseline" ? 0.004 + index * 0.001 : 0.0042 + index * 0.001,
    evidenceRefs: [`paper-read-trace:${phase}-${index + 1}`],
    signedEvidenceRefs: [`paper-read-ledger:${phase}-${index + 1}`],
    paperReadSkillRoute: route,
    paperReadSkillTaskId: `task-${route}-${index + 1}`,
    paperReadSkillPaperCorpusHash: `paper-corpus-${index + 1}`,
    paperReadSkillPromptRouteHash: `prompt-route-${route}`,
    paperReadSkillResponseHash: `${phase}-response-${index + 1}`,
    paperReadSkillEvaluatorTraceHash: `${phase}-evaluator-${index + 1}`,
    paperReadSkillClaimExtractionScore0to1: score,
    paperReadSkillCitationGroundingScore0to1: score - 0.02,
    paperReadSkillRouteMatched: true,
    paperReadSkillNoPromptCopyProofHash: sourceProof.noPromptCopyProofHash,
    ...overrides,
  };
}

const baselineRows = [
  row(0, "baseline", "benchmark"),
  row(1, "baseline", "methodology"),
  row(2, "baseline", "survey_opinion"),
];

const stableLiveRows = [
  row(0, "live", "benchmark"),
  row(1, "live", "methodology"),
  row(2, "live", "survey_opinion"),
];

describe("runPaperReadSkillLiveDrift", () => {
  test("approves stable paper-read-skill live drift with source and row evidence proof", () => {
    const result = runPaperReadSkillLiveDrift({
      agentId: "research-agent",
      sourceProof,
      baselineWindow: {
        windowId: "paper-read-baseline",
        startedAt: "2026-06-19T00:00:00.000Z",
        endedAt: "2026-06-19T00:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "paper-read-live",
        startedAt: "2026-06-19T01:00:00.000Z",
        endedAt: "2026-06-19T01:10:00.000Z",
        rows: stableLiveRows,
      },
      now: new Date("2026-06-20T00:00:00.000Z"),
    });

    expect(result.paperReadSkillEvidenceCoverage0to1).toBe(1);
    expect(result.missingReasons).toEqual([]);
    expect(result.receipt.failClosed).toBe(false);
    expect(result.receipt.sourceRefs).toContain(sourceProof.sourceRefHash);
    expect(result.receipt.summary).toContain("paper-read-skill");
    expect(result.rowProofs).toHaveLength(6);
    expect(result.rowProofs.every((proof) => proof.signedEvidenceRefs.length > 0)).toBe(true);
    expect(buildLiveDriftWatchAlerts(result.receipt)).toEqual([]);
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("fails closed when paper-read-skill proof is missing even if generic drift is stable", () => {
    const result = runPaperReadSkillLiveDrift({
      agentId: "research-agent",
      sourceProof: {
        ...sourceProof,
        readmeBlobHash: "",
        benchmarkPromptHash: "",
        driftStatisticHash: "",
        alertReceiptHash: "",
      },
      baselineWindow: {
        windowId: "paper-read-baseline",
        startedAt: "2026-06-19T00:00:00.000Z",
        endedAt: "2026-06-19T00:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "paper-read-live",
        startedAt: "2026-06-19T01:00:00.000Z",
        endedAt: "2026-06-19T01:10:00.000Z",
        rows: stableLiveRows,
      },
      now: new Date("2026-06-20T00:00:00.000Z"),
    });

    expect(result.paperReadSkillEvidenceCoverage0to1).toBeLessThan(1);
    expect(result.missingReasons).toEqual(expect.arrayContaining([
      "readmeBlobHash",
      "benchmarkPromptHash",
      "driftStatisticHash",
      "alertReceiptHash",
    ]));
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toContain("paperReadSkillEvidenceCoverage0to1");
    expect(buildLiveDriftWatchAlerts(result.receipt).map((alert) => alert.metricId)).toContain("paperReadSkillEvidenceCoverage0to1");
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true });
  });

  test("fails closed when live paper-reading behavior and score drift exceed thresholds", () => {
    const driftingRows = stableLiveRows.map((sample, index): PaperReadSkillLiveDriftRow => ({
      ...sample,
      score0to1: 0.69 - index * 0.02,
      passed: index !== 2,
      behaviorSignature: `paper-read-skill:${sample.paperReadSkillRoute}|action:unsupported_summary`,
      evidenceRefs: [`paper-read-drift-trace:${index + 1}`],
      signedEvidenceRefs: [`paper-read-drift-ledger:${index + 1}`],
    }));

    const result = runPaperReadSkillLiveDrift({
      agentId: "research-agent",
      sourceProof,
      baselineWindow: {
        windowId: "paper-read-baseline",
        startedAt: "2026-06-19T00:00:00.000Z",
        endedAt: "2026-06-19T00:10:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "paper-read-live",
        startedAt: "2026-06-19T01:00:00.000Z",
        endedAt: "2026-06-19T01:10:00.000Z",
        rows: driftingRows,
      },
      thresholds: {
        maxScoreDrop0to1: 0.05,
        maxPassRateDrop0to1: 0.05,
      },
      now: new Date("2026-06-20T00:00:00.000Z"),
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
