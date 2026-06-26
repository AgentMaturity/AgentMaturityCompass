import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1047-agentboard-metric-validity.md";
const SOURCE = "https://github.com/hkust-nlp/AgentBoard";
const API = "https://api.github.com/repos/hkust-nlp/AgentBoard";
const README = "https://raw.githubusercontent.com/hkust-nlp/AgentBoard/main/README.md";
const HOMEPAGE = "https://hkust-nlp.github.io/agentboard";
const LEADERBOARD = "https://hkust-nlp.github.io/agentboard/static/leaderboard.html";
const HF_DATASET = "https://huggingface.co/datasets/hkust-nlp/agentboard";
const ARXIV = "https://arxiv.org/abs/2401.13178";
const ARXIV_API = "https://export.arxiv.org/api/query?id_list=2401.13178";
const TITLE = "hkust-nlp/AgentBoard";
const PAPER_TITLE = "AgentBoard: An Analytical Evaluation Board of Multi-turn LLM Agents";
const IDENTIFIER = "agentboard_metric_validity";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-AGENTBOARD-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`agentboard-metric-row-${index}`],
    flags: [],
    narrative: `AgentBoard context is bounded to AMC metric-validity sample ${index}.`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "agentboard-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 1047).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `agentboard-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `agentboard-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 25),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-1047 AgentBoard metric-validity boundary", () => {
  it("documents live AgentBoard repository metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1047");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(PAPER_TITLE);
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(HOMEPAGE);
    expect(doc).toContain(LEADERBOARD);
    expect(doc).toContain(HF_DATASET);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_API);
    expect(doc).toContain("An Analytical Evaluation Board of Multi-turn LLM Agents");
    expect(doc).toContain("NeurIPS 2024 (Oral)");
    expect(doc).toContain("language `SAS`");
    expect(doc).toContain("420 stars");
    expect(doc).toContain("42 forks");
    expect(doc).toContain("17 open issues");
    expect(doc).toContain("watchers_count `420`");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("license object `null`");
    expect(doc).toContain("pushed_at `2024-05-20T13:44:42Z`");
    expect(doc).toContain("updated_at `2026-06-24T11:23:41Z`");
    expect(doc).toContain("README.md sha `f047b619ed189254ccfa143c16703dd6b573b304`");
    expect(doc).toContain("requirements.txt sha `53189196d9bc101310e882be5658b9b41b7cef28`");
    expect(doc).toContain("setup.sh sha `358bc97ab3512bc9f830b962bead3bc4621066ba`");
    expect(doc).toContain("latest release endpoint returned `404`");
    expect(doc).toContain("no tags");
    expect(doc).toContain("latest commit `bb7255e2daf1989069a186dad9e53f70680961db`");
    expect(doc).toContain("Data License-GPL--2.0");
    expect(doc).toContain("Code License-Apache--2.0");
    expect(doc).toContain("9 distinct tasks");
    expect(doc).toContain("multi-round interaction");
    expect(doc).toContain("partially-observable environments");
    expect(doc).toContain("analytical evaluation");
    expect(doc).toContain("fine-grained progress rates");
    expect(doc).toContain("grounding accuracy");
    expect(doc).toContain("performance breakdown");
    expect(doc).toContain("trajectory");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("content-length: 21215");
    expect(doc).toContain("content-length: 466944");
    expect(doc).toContain("arXiv `2401.13178v2`");
    expect(doc).toContain("cs.CL");
    expect(doc).toContain("cs.AI");
    expect(doc).toContain("cs.LG");
    expect(doc).toContain("validation table");
    expect(doc).toContain("confidence interval");
    expect(doc).toContain("sample size");
    expect(doc).toContain("metric owner");
    expect(doc).toContain("construct validity");
    expect(doc).toContain("inter-rater agreement");
    expect(doc).toContain("test-retest stability");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts AgentBoard context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 30 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "agentboard-validation-table",
      "agentboard-sample-size",
      "agentboard-confidence-interval",
      "agentboard-reliability-check",
      "agentboard-regression-threshold",
      "agentboard-metric-owner",
      "agentboard-multi-turn-repeatability-proof",
      "agentboard-progress-rate-calibration-proof",
      "agentboard-grounding-accuracy-proof",
      "agentboard-trajectory-review-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];
    const sourceRefs = [SOURCE, API, README, HOMEPAGE, LEADERBOARD, HF_DATASET, ARXIV, ARXIV_API];

    const report = buildMetricValidationReport(
      {
        agentId: "agentboard-context-agent",
        runId: "run-gap1047-agentboard-metric-validity",
        ts: Date.UTC(2026, 5, 25),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.9,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.9,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "construct-validity",
          "inter-rater-reliability",
          "test-retest-stability",
          "multi-turn-repeatability",
          "progress-rate-calibration",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `agentboard-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "agentboard-validation-table"],
          ["sample-size", "agentboard-sample-size"],
          ["confidence-interval", "agentboard-confidence-interval"],
          ["reliability-check", "agentboard-reliability-check"],
          ["regression-threshold", "agentboard-regression-threshold"],
          ["metric-owner", "agentboard-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `agentboard-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "agentboard-score-predicts-multi-turn-agent-evaluation-quality",
          aligned: true,
          evidenceRefs: [
            "agentboard-multi-turn-repeatability-proof",
            "agentboard-progress-rate-calibration-proof",
            "agentboard-grounding-accuracy-proof",
            "agentboard-trajectory-review-proof",
          ],
        }],
        sourceRefs,
        gateMode: "ci",
      },
      [
        prior("run-gap1047-baseline", Date.UTC(2026, 5, 11), 3),
        prior("run-gap1047-repeat", Date.UTC(2026, 5, 18), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 30,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.9);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual(sourceRefs);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when AgentBoard metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "agentboard-context-agent",
      runId: "run-gap1047-agentboard-metadata-only",
      ts: Date.UTC(2026, 5, 25),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.22,
      evidenceCoverage: 0.14,
      correlationRatio: 0.2,
      unsupportedClaimCount: 9,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-AGENTBOARD-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "AgentBoard repository metadata cannot prove AMC metric validity.",
        },
      ],
      confidenceSummary: {
        lowConfidenceFindings: 1,
        highUncertaintyFindings: 1,
        downgradedFindings: 1,
        autoFixBlockedRecommendations: 0,
        averageEvidenceSufficiency: 0.2,
        averageJudgeAgreement: 0.2,
      },
      questions: [{ id: "AMC-AGENTBOARD-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "agentboard-repository-metadata",
        "agentboard-readme-labels",
        "agentboard-leaderboard-availability",
      ].map((facetId) => ({
        facetId,
        covered: false,
        evidenceRefs: [],
      })),
      processEvidenceChecks: [
        "validation-table",
        "sample-size",
        "confidence-interval",
        "metric-owner",
      ].map((processEvidenceId) => ({
        processEvidenceId: `agentboard-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "agentboard-metadata-only-outcome",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [SOURCE, README, HOMEPAGE, LEADERBOARD, HF_DATASET, ARXIV],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("fail");
    expect(report.ciGate.passed).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
    expect(report.evalPack.replayable).toBe(false);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add AgentBoard identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("2401.13178");
      expect(source).not.toContain("bb7255e2daf1989069a186dad9e53f70680961db");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
