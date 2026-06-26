import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0944-arize-phoenix-metric-validity.md";
const SOURCE = "https://phoenix.arize.com";
const CANONICAL = "https://arize.com/phoenix/";
const DOCS = "https://arize.com/docs/phoenix";
const EVALS = "https://arize.com/docs/phoenix/evaluation/llm-evals";
const TUTORIAL = "https://arize.com/docs/phoenix/evaluation/tutorials/run-evals-with-built-in-evals";
const REPO = "https://github.com/Arize-ai/phoenix/";
const TITLE = "Arize Phoenix";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.89): QuestionScore {
  return {
    questionId: `AMC-PHOENIX-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`phoenix-metric-row-${index}`],
    flags: [],
    narrative: `Phoenix context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "phoenix-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 944).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `phoenix-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `phoenix-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 22),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0944 Arize Phoenix metric-validity boundary", () => {
  it("documents live Phoenix metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0944");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(CANONICAL);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(EVALS);
    expect(doc).toContain(REPO);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live Phoenix homepage");
    expect(doc).toContain("Trace the Exponential");
    expect(doc).toContain("open-source platform for agent development and evaluation");
    expect(doc).toContain("Talk with your traces");
    expect(doc).toContain("Investigate issues, add annotations, run experiments");
    expect(doc).toContain("Get visibility into your agents");
    expect(doc).toContain("Measure and improve agent quality");
    expect(doc).toContain("Build evals that score outputs and catch issues before they reach your users");
    expect(doc).toContain("Test changes with evidence");
    expect(doc).toContain("Create datasets from traces");
    expect(doc).toContain("A systematic way to improve AI quality");
    expect(doc).toContain("OBSERVE");
    expect(doc).toContain("ANNOTATE");
    expect(doc).toContain("HYPOTHESIZE");
    expect(doc).toContain("EXPERIMENT");
    expect(doc).toContain("MEASURE");
    expect(doc).toContain("prompts, retrievals, tool calls, outputs");
    expect(doc).toContain("human review or LLM-as-judge");
    expect(doc).toContain("benchmark performance");
    expect(doc).toContain("Score output across cost, latency, and performance");
    expect(doc).toContain("OSS Core");
    expect(doc).toContain("ELv2 licensed");
    expect(doc).toContain("9k+ GitHub stars");
    expect(doc).toContain("Native OpenTelemetry support");
    expect(doc).toContain("Vendor Agnostic");
    expect(doc).toContain("3M+ Downloads");
    expect(doc).toContain("10k+ Github Stars");
    expect(doc).toContain("22M+ OTEL Instrumentation Monthly Downloads");
    expect(doc).toContain("AI Observability and Evaluation");
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("OpenInference");
    expect(doc).toContain("LLM-based evaluators");
    expect(doc).toContain("code-based checks");
    expect(doc).toContain("human labels");
    expect(doc).toContain("Ragas");
    expect(doc).toContain("Deepeval");
    expect(doc).toContain("Cleanlab");
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

  it("accepts Phoenix context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 25 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "phoenix-validation-table",
      "phoenix-sample-size",
      "phoenix-confidence-interval",
      "phoenix-reliability-check",
      "phoenix-regression-threshold",
      "phoenix-metric-owner",
      "phoenix-trace-eval-proof",
      "phoenix-dataset-experiment-proof",
      "phoenix-human-judge-alignment-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "phoenix-context-agent",
        runId: "run-gap0944-phoenix-metric-validity",
        ts: Date.UTC(2026, 5, 22),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.87,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.86,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "trace-eval-construct-validity",
          "llm-judge-code-human-reliability",
          "dataset-experiment-stability",
          "otel-openinference-repeatability",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `phoenix-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "phoenix-validation-table"],
          ["sample-size", "phoenix-sample-size"],
          ["confidence-interval", "phoenix-confidence-interval"],
          ["reliability-check", "phoenix-reliability-check"],
          ["regression-threshold", "phoenix-regression-threshold"],
          ["metric-owner", "phoenix-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `phoenix-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "phoenix-score-predicts-agent-eval-quality",
          aligned: true,
          evidenceRefs: [
            "phoenix-trace-eval-proof",
            "phoenix-dataset-experiment-proof",
            "phoenix-human-judge-alignment-proof",
          ],
        }],
        sourceRefs: [SOURCE, CANONICAL, DOCS, EVALS, TUTORIAL],
        gateMode: "ci",
      },
      [
        prior("run-gap0944-baseline", Date.UTC(2026, 5, 8), 3),
        prior("run-gap0944-repeat", Date.UTC(2026, 5, 15), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 25,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.86);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([SOURCE, CANONICAL, DOCS, EVALS, TUTORIAL]);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when Phoenix metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "phoenix-context-agent",
      runId: "run-gap0944-metadata-only",
      ts: Date.UTC(2026, 5, 22),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.2,
      correlationRatio: 0.2,
      unsupportedClaimCount: 8,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-PHOENIX-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "Phoenix product and docs metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-PHOENIX-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "phoenix-product-page-metadata",
        "phoenix-docs-evaluation-label",
        "phoenix-otel-openinference-label",
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
        processEvidenceId: `phoenix-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "phoenix-metadata-only-outcome",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [SOURCE, CANONICAL, DOCS],
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
    expect(report.warnings.join(" ")).toContain("signed evidence refs are required");
  });

  it("does not add Phoenix identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("https://phoenix.arize.com");
      expect(source).not.toContain("https://arize.com/phoenix/");
      expect(source).not.toContain("arize_phoenix_metric_validity");
    }
  });
});
