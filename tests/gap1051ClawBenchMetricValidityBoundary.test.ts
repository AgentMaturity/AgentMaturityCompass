import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1051-clawbench-metric-validity.md";
const SOURCE = "https://github.com/TIGER-AI-Lab/ClawBench";
const API = "https://api.github.com/repos/TIGER-AI-Lab/ClawBench";
const README = "https://raw.githubusercontent.com/TIGER-AI-Lab/ClawBench/main/README.md";
const HOMEPAGE = "https://claw-bench.com";
const HF_SPACE = "https://huggingface.co/spaces/TIGER-Lab/ClawBench";
const HF_DATASET = "https://huggingface.co/datasets/TIGER-Lab/ClawBench";
const HF_V2_TRACE = "https://huggingface.co/datasets/TIGER-Lab/ClawBenchV2Trace";
const ARXIV = "https://arxiv.org/abs/2604.08523";
const ARXIV_API = "https://export.arxiv.org/api/query?id_list=2604.08523";
const SCORING = "https://github.com/TIGER-AI-Lab/ClawBench/blob/main/eval/scoring.md";
const TITLE = "TIGER-AI-Lab/ClawBench";
const PAPER_TITLE = "ClawBench: Can AI Agents Complete Everyday Online Tasks?";
const IDENTIFIER = "clawbench_metric_validity";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-CLAWBENCH-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`clawbench-metric-row-${index}`],
    flags: [],
    narrative: `ClawBench context is bounded to AMC metric-validity sample ${index}.`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "clawbench-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 1051).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `clawbench-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `clawbench-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 24),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-1051 ClawBench metric-validity boundary", () => {
  it("documents live ClawBench repository metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1051");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(PAPER_TITLE);
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(HOMEPAGE);
    expect(doc).toContain(HF_SPACE);
    expect(doc).toContain(HF_DATASET);
    expect(doc).toContain(HF_V2_TRACE);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_API);
    expect(doc).toContain(SCORING);
    expect(doc).toContain("Open-source benchmark for browser AI agents on daily tasks");
    expect(doc).toContain("language `Python`");
    expect(doc).toContain("419 stars");
    expect(doc).toContain("25 forks");
    expect(doc).toContain("34 open issues");
    expect(doc).toContain("watchers_count `419`");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("main branch protected `true`");
    expect(doc).toContain("license `Apache-2.0`");
    expect(doc).toContain("created_at `2026-04-10T01:59:17Z`");
    expect(doc).toContain("pushed_at `2026-06-23T18:59:16Z`");
    expect(doc).toContain("updated_at `2026-06-24T16:21:11Z`");
    expect(doc).toContain("latest main commit `fb0e5876fe3f43059738613ae805b7719946e5be`");
    expect(doc).toContain("README.md sha `600c09d2716d41bcd9f618e018b8cdcbd0ea2806`");
    expect(doc).toContain("CITATION.cff sha `47cdb01152bf9395946fd5cabacf2e1481016cce`");
    expect(doc).toContain("pyproject.toml sha `a3226b8f090c512376b37328699dcba5bcaabf0d`");
    expect(doc).toContain("eval/scoring.md sha `67d71aa44acc30f5c191033a96bea1f133a643fb`");
    expect(doc).toContain("test-cases/task.schema.json sha `aa66ba1997815d9798922693a550e628e6448fa1`");
    expect(doc).toContain("release `v0.7.0`");
    expect(doc).toContain("published_at `2026-06-22T23:17:33Z`");
    expect(doc).toContain("tag commit `376db393278fb6de065d3f39b8c98aff2b50231e`");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("content-length: 64390");
    expect(doc).toContain("content-length: 49380");
    expect(doc).toContain("arXiv `2604.08523v1`");
    expect(doc).toContain("cs.CL");
    expect(doc).toContain("cs.AI");
    expect(doc).toContain("V1 `153` tasks");
    expect(doc).toContain("V2 `130` tasks");
    expect(doc).toContain("144 live websites");
    expect(doc).toContain("15 life categories");
    expect(doc).toContain("five-layer recording");
    expect(doc).toContain("human reference");
    expect(doc).toContain("request interception");
    expect(doc).toContain("LLM judge");
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

  it("accepts ClawBench context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 30 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "clawbench-validation-table",
      "clawbench-sample-size",
      "clawbench-confidence-interval",
      "clawbench-reliability-check",
      "clawbench-regression-threshold",
      "clawbench-metric-owner",
      "clawbench-browser-task-repeatability-proof",
      "clawbench-interceptor-calibration-proof",
      "clawbench-human-reference-agreement-proof",
      "clawbench-trace-outcome-alignment-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];
    const sourceRefs = [SOURCE, API, README, HOMEPAGE, HF_SPACE, HF_DATASET, HF_V2_TRACE, ARXIV, ARXIV_API, SCORING];

    const report = buildMetricValidationReport(
      {
        agentId: "clawbench-context-agent",
        runId: "run-gap1051-clawbench-metric-validity",
        ts: Date.UTC(2026, 5, 24),
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
          "browser-task-repeatability",
          "interceptor-calibration",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `clawbench-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "clawbench-validation-table"],
          ["sample-size", "clawbench-sample-size"],
          ["confidence-interval", "clawbench-confidence-interval"],
          ["reliability-check", "clawbench-reliability-check"],
          ["regression-threshold", "clawbench-regression-threshold"],
          ["metric-owner", "clawbench-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `clawbench-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "clawbench-score-predicts-browser-agent-task-success-quality",
          aligned: true,
          evidenceRefs: [
            "clawbench-browser-task-repeatability-proof",
            "clawbench-interceptor-calibration-proof",
            "clawbench-human-reference-agreement-proof",
            "clawbench-trace-outcome-alignment-proof",
          ],
        }],
        sourceRefs,
        gateMode: "ci",
      },
      [
        prior("run-gap1051-baseline", Date.UTC(2026, 5, 10), 3),
        prior("run-gap1051-repeat", Date.UTC(2026, 5, 17), 3.01),
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

  it("fails closed when ClawBench metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "clawbench-context-agent",
      runId: "run-gap1051-clawbench-metadata-only",
      ts: Date.UTC(2026, 5, 24),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.22,
      evidenceCoverage: 0.14,
      correlationRatio: 0.2,
      unsupportedClaimCount: 9,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-CLAWBENCH-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "ClawBench repository metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-CLAWBENCH-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "clawbench-repository-metadata",
        "clawbench-readme-labels",
        "clawbench-homepage-leaderboard",
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
        processEvidenceId: `clawbench-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "clawbench-metadata-only-outcome",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [SOURCE, README, HOMEPAGE, HF_SPACE, HF_DATASET, ARXIV],
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

  it("does not add ClawBench identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("2604.08523");
      expect(source).not.toContain("fb0e5876fe3f43059738613ae805b7719946e5be");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
