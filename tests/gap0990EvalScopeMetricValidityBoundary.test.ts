import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0990-evalscope-metric-validity.md";
const SOURCE = "https://github.com/modelscope/evalscope";
const README = "https://raw.githubusercontent.com/modelscope/evalscope/main/README.md";
const RELEASE = "https://github.com/modelscope/evalscope/releases/tag/v1.8.1";
const PYPROJECT = "https://raw.githubusercontent.com/modelscope/evalscope/main/pyproject.toml";
const TITLE = "modelscope/evalscope";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-EVALSCOPE-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`evalscope-metric-row-${index}`],
    flags: [],
    narrative: `EvalScope context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "evalscope-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 990).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `evalscope-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `evalscope-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 24),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0990 EvalScope metric-validity boundary", () => {
  it("documents live EvalScope repository metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0990");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(README);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("Python");
    expect(doc).toContain("2977 stars");
    expect(doc).toContain("405 forks");
    expect(doc).toContain("39 open issues");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("pushed_at `2026-06-24T12:02:15Z`");
    expect(doc).toContain("v1.8.1");
    expect(doc).toContain("2026-06-16T09:51:54Z");
    expect(doc).toContain("evaluation");
    expect(doc).toContain("performance");
    expect(doc).toContain("rag");
    expect(doc).toContain("vlm");
    expect(doc).toContain("Agent Evaluation Mode");
    expect(doc).toContain("External Agent Bridge");
    expect(doc).toContain("Trie agentic trace replay");
    expect(doc).toContain("Vendor Verifier");
    expect(doc).toContain("RAGEval");
    expect(doc).toContain("OpenCompass");
    expect(doc).toContain("VLMEvalKit");
    expect(doc).toContain("requirements/sandbox.txt");
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

  it("accepts EvalScope context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 24 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "evalscope-validation-table",
      "evalscope-sample-size",
      "evalscope-confidence-interval",
      "evalscope-reliability-check",
      "evalscope-regression-threshold",
      "evalscope-metric-owner",
      "evalscope-backend-repeatability-proof",
      "evalscope-agent-trace-proof",
      "evalscope-report-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "evalscope-context-agent",
        runId: "run-gap0990-evalscope-metric-validity",
        ts: Date.UTC(2026, 5, 24),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.91,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.88,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "construct-validity",
          "inter-rater-reliability",
          "test-retest-stability",
          "benchmark-backend-repeatability",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `evalscope-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "evalscope-validation-table"],
          ["sample-size", "evalscope-sample-size"],
          ["confidence-interval", "evalscope-confidence-interval"],
          ["reliability-check", "evalscope-reliability-check"],
          ["regression-threshold", "evalscope-regression-threshold"],
          ["metric-owner", "evalscope-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `evalscope-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "evalscope-score-predicts-agent-evaluation-quality",
          aligned: true,
          evidenceRefs: [
            "evalscope-backend-repeatability-proof",
            "evalscope-agent-trace-proof",
            "evalscope-report-proof",
          ],
        }],
        sourceRefs: [SOURCE, README, RELEASE, PYPROJECT],
        gateMode: "ci",
      },
      [
        prior("run-gap0990-baseline", Date.UTC(2026, 5, 10), 3),
        prior("run-gap0990-repeat", Date.UTC(2026, 5, 17), 3.02),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 24,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.88);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([SOURCE, README, RELEASE, PYPROJECT]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when EvalScope metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "evalscope-context-agent",
      runId: "run-gap0990-evalscope-metadata-only",
      ts: Date.UTC(2026, 5, 24),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.15,
      correlationRatio: 0.2,
      unsupportedClaimCount: 8,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-EVALSCOPE-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "EvalScope repository metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-EVALSCOPE-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "evalscope-repository-metadata",
        "evalscope-benchmark-label",
        "evalscope-agent-trace-label",
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
        processEvidenceId: `evalscope-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "evalscope-metadata-only-outcome",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [SOURCE],
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

  it("does not add EvalScope identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("evalscope_metric_validity");
    }
  });
});
