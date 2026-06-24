import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0996-swe-bench-metric-validity.md";
const SITE = "https://www.swebench.com";
const REPO = "https://github.com/SWE-bench/SWE-bench";
const API = "https://api.github.com/repos/SWE-bench/SWE-bench";
const README = "https://raw.githubusercontent.com/SWE-bench/SWE-bench/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/SWE-bench/SWE-bench/main/LICENSE";
const PYPROJECT = "https://raw.githubusercontent.com/SWE-bench/SWE-bench/main/pyproject.toml";
const DOCS = "https://swebench.com/SWE-bench/";
const HUGGINGFACE = "https://huggingface.co/collections/SWE-bench/swe-bench";
const OPENREVIEW = "https://openreview.net/forum?id=VTF8yNQM66";
const ARXIV = "https://arxiv.org/abs/2310.06770";
const MULTIMODAL_ARXIV = "https://arxiv.org/abs/2410.03859";
const HEAD = "f7bbbb2ccdf479001d6467c9e34af59e44a840f9";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.91): QuestionScore {
  return {
    questionId: `AMC-SWEBENCH-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`swebench-metric-row-${index}`],
    flags: [],
    narrative: `SWE-bench context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "swebench-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 996).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `swebench-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `swebench-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 24),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0996 SWE-bench metric-validity boundary", () => {
  it("documents live SWE-bench source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0996");
    expect(doc).toContain("SWE-bench/SWE-bench");
    expect(doc).toContain(SITE);
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(HUGGINGFACE);
    expect(doc).toContain(OPENREVIEW);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(MULTIMODAL_ARXIV);
    expect(doc).toContain(HEAD);
    expect(doc).toContain("MIT License");
    expect(doc).toContain("Python");
    expect(doc).toContain("5,247 stars");
    expect(doc).toContain("902 forks");
    expect(doc).toContain("116 open issues");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("pushed_at `2026-04-01T05:16:30Z`");
    expect(doc).toContain("updated_at `2026-06-24T12:00:26Z`");
    expect(doc).toContain("no GitHub latest release");
    expect(doc).toContain("requires-python `>=3.10`");
    expect(doc).toContain("datasets");
    expect(doc).toContain("docker");
    expect(doc).toContain("SWE-bench Verified");
    expect(doc).toContain("SWE-bench Lite");
    expect(doc).toContain("SWE-bench Multilingual");
    expect(doc).toContain("SWE-bench Multimodal");
    expect(doc).toContain("% Resolved");
    expect(doc).toContain("2294 Full");
    expect(doc).toContain("500 Verified");
    expect(doc).toContain("300 Lite & Multilingual");
    expect(doc).toContain("517 Multimodal");
    expect(doc).toContain("Docker");
    expect(doc).toContain("ICLR 2024 Oral");
    expect(doc).toContain("ICLR 2025");
    expect(doc).toContain("OpenAI Preparedness");
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

  it("accepts SWE-bench context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 26 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "swebench-validation-table",
      "swebench-sample-size",
      "swebench-confidence-interval",
      "swebench-reliability-check",
      "swebench-regression-threshold",
      "swebench-metric-owner",
      "swebench-construct-validity-proof",
      "swebench-outcome-alignment-proof",
      "swebench-eval-pack-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "swebench-context-agent",
        runId: "run-gap0996-swebench-metric-validity",
        ts: Date.UTC(2026, 5, 24),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.92,
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
          "benchmark-family-repeatability",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `swebench-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "swebench-validation-table"],
          ["sample-size", "swebench-sample-size"],
          ["confidence-interval", "swebench-confidence-interval"],
          ["reliability-check", "swebench-reliability-check"],
          ["regression-threshold", "swebench-regression-threshold"],
          ["metric-owner", "swebench-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `swebench-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "swebench-score-predicts-software-agent-evaluation-quality",
          aligned: true,
          evidenceRefs: [
            "swebench-construct-validity-proof",
            "swebench-outcome-alignment-proof",
            "swebench-eval-pack-proof",
          ],
        }],
        sourceRefs: [SITE, REPO, README, PYPROJECT, DOCS],
        gateMode: "ci",
      },
      [
        prior("run-gap0996-baseline", Date.UTC(2026, 5, 10), 3),
        prior("run-gap0996-repeat", Date.UTC(2026, 5, 17), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 26,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.9);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([SITE, REPO, README, PYPROJECT, DOCS]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when SWE-bench metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "swebench-context-agent",
      runId: "run-gap0996-swebench-metadata-only",
      ts: Date.UTC(2026, 5, 24),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.18,
      evidenceCoverage: 0.12,
      correlationRatio: 0.18,
      unsupportedClaimCount: 9,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-SWEBENCH-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.18,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "SWE-bench leaderboard metadata cannot prove AMC metric validity.",
        },
      ],
      confidenceSummary: {
        lowConfidenceFindings: 1,
        highUncertaintyFindings: 1,
        downgradedFindings: 1,
        autoFixBlockedRecommendations: 0,
        averageEvidenceSufficiency: 0.18,
        averageJudgeAgreement: 0.18,
      },
      questions: [{ id: "AMC-SWEBENCH-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "swebench-leaderboard-metadata",
        "swebench-resolved-rate-label",
        "swebench-dataset-name",
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
        processEvidenceId: `swebench-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "swebench-metadata-only-outcome",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [SITE],
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

  it("does not add SWE-bench identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("SWE-bench/SWE-bench");
      expect(source).not.toContain(SITE);
      expect(source).not.toContain("swe_bench_metric_validity");
    }
  });
});
