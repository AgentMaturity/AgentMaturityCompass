import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1043-wildclawbench-metric-validity.md";
const SOURCE = "https://github.com/InternLM/WildClawBench";
const API = "https://api.github.com/repos/InternLM/WildClawBench";
const README = "https://raw.githubusercontent.com/InternLM/WildClawBench/main/README.md";
const HOMEPAGE = "https://internlm.github.io/WildClawBench/";
const ARXIV = "https://arxiv.org/abs/2605.10912";
const ARXIV_API = "https://export.arxiv.org/api/query?id_list=2605.10912";
const HF_DATASET = "https://huggingface.co/datasets/internlm/WildClawBench";
const PDF = "https://github.com/InternLM/WildClawBench/blob/main/WildClawBench_report.pdf";
const CITATION = "https://github.com/InternLM/WildClawBench/blob/main/CITATION.cff";
const LICENSE = "https://github.com/InternLM/WildClawBench/blob/main/LICENSE";
const TITLE = "InternLM/WildClawBench";
const PAPER_TITLE = "WildClawBench: A Benchmark for Real-World, Long-Horizon Agent Evaluation";
const IDENTIFIER = "wildclawbench_metric_validity";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-WILDCLAWBENCH-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`wildclawbench-metric-row-${index}`],
    flags: [],
    narrative: `WildClawBench context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "wildclawbench-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 1043).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `wildclawbench-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `wildclawbench-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 25),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-1043 WildClawBench metric-validity boundary", () => {
  it("documents live WildClawBench repository metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1043");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(PAPER_TITLE);
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(HOMEPAGE);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_API);
    expect(doc).toContain(HF_DATASET);
    expect(doc).toContain(PDF);
    expect(doc).toContain(CITATION);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain("MIT License");
    expect(doc).toContain("Python");
    expect(doc).toContain("450 stars");
    expect(doc).toContain("44 forks");
    expect(doc).toContain("5 open issues");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("pushed_at `2026-05-19T11:35:36Z`");
    expect(doc).toContain("86d71447413d38f38740a021cb776f64eb396ee0");
    expect(doc).toContain("2c46588a4da9d64694dbfd728017f88514abb712");
    expect(doc).toContain("e2f71de914cee6ce80eb6e47154f8495eb055188");
    expect(doc).toContain("ed6d3a0121f69b5e18b281c8558894f78b598ca5");
    expect(doc).toContain("9f47988f85ac910ac7a19cc12e2c80cc8d497f9d");
    expect(doc).toContain("latest release endpoint returned `404`");
    expect(doc).toContain("no tags");
    expect(doc).toContain("60 tasks");
    expect(doc).toContain("6 categories");
    expect(doc).toContain("OpenClaw");
    expect(doc).toContain("Claude Code");
    expect(doc).toContain("Codex CLI");
    expect(doc).toContain("Hermes Agent");
    expect(doc).toContain("Docker");
    expect(doc).toContain("Hugging Face");
    expect(doc).toContain("arXiv `2605.10912`");
    expect(doc).toContain("chat.jsonl");
    expect(doc).toContain("agent.log");
    expect(doc).toContain("gateway.log");
    expect(doc).toContain("Brave Search API");
    expect(doc).toContain("judge model");
    expect(doc).toContain("validation table");
    expect(doc).toContain("confidence interval");
    expect(doc).toContain("sample size");
    expect(doc).toContain("metric owner");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts WildClawBench context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 30 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "wildclawbench-validation-table",
      "wildclawbench-sample-size",
      "wildclawbench-confidence-interval",
      "wildclawbench-reliability-check",
      "wildclawbench-regression-threshold",
      "wildclawbench-metric-owner",
      "wildclawbench-harness-repeatability-proof",
      "wildclawbench-trajectory-review-proof",
      "wildclawbench-safety-alignment-proof",
      "wildclawbench-docker-isolation-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "wildclawbench-context-agent",
        runId: "run-gap1043-wildclawbench-metric-validity",
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
          averageJudgeAgreement: 0.89,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "construct-validity",
          "inter-rater-reliability",
          "test-retest-stability",
          "harness-repeatability",
          "trajectory-leakage-control",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `wildclawbench-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "wildclawbench-validation-table"],
          ["sample-size", "wildclawbench-sample-size"],
          ["confidence-interval", "wildclawbench-confidence-interval"],
          ["reliability-check", "wildclawbench-reliability-check"],
          ["regression-threshold", "wildclawbench-regression-threshold"],
          ["metric-owner", "wildclawbench-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `wildclawbench-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "wildclawbench-score-predicts-real-world-agent-evaluation-quality",
          aligned: true,
          evidenceRefs: [
            "wildclawbench-harness-repeatability-proof",
            "wildclawbench-trajectory-review-proof",
            "wildclawbench-safety-alignment-proof",
            "wildclawbench-docker-isolation-proof",
          ],
        }],
        sourceRefs: [SOURCE, API, README, HOMEPAGE, ARXIV, ARXIV_API, HF_DATASET, PDF, CITATION, LICENSE],
        gateMode: "ci",
      },
      [
        prior("run-gap1043-baseline", Date.UTC(2026, 5, 11), 3),
        prior("run-gap1043-repeat", Date.UTC(2026, 5, 18), 3.01),
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
    expect(report.rows[0]?.interRaterAgreement).toBe(0.89);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([SOURCE, API, README, HOMEPAGE, ARXIV, ARXIV_API, HF_DATASET, PDF, CITATION, LICENSE]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when WildClawBench metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "wildclawbench-context-agent",
      runId: "run-gap1043-wildclawbench-metadata-only",
      ts: Date.UTC(2026, 5, 25),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.22,
      evidenceCoverage: 0.14,
      correlationRatio: 0.2,
      unsupportedClaimCount: 9,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-WILDCLAWBENCH-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "WildClawBench repository metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-WILDCLAWBENCH-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "wildclawbench-repository-metadata",
        "wildclawbench-leaderboard-label",
        "wildclawbench-docker-label",
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
        processEvidenceId: `wildclawbench-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "wildclawbench-metadata-only-outcome",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [SOURCE, README, ARXIV],
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

  it("does not add WildClawBench identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain("2605.10912");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
