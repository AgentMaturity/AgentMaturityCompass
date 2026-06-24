import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0940-multidata-rag-project-metric-validity.md";
const REPO = "sourangshupal/multidata-rag-project";
const URL = "https://github.com/sourangshupal/multidata-rag-project";
const TITLE = "Multi-Source RAG + Text-to-SQL System";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.88): QuestionScore {
  return {
    questionId: `AMC-MULTIDATA-RAG-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`multidata-rag-metric-row-${index}`],
    flags: [],
    narrative: `multidata-rag-project context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "multidata-rag-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 940).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `multidata-rag-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `multidata-rag-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 22),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0940 multidata-rag-project metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0940");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("Star 12");
    expect(doc).toContain("Fork 29");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("66 Commits");
    expect(doc).toContain(".github/ workflows");
    expect(doc).toContain("app");
    expect(doc).toContain("data");
    expect(doc).toContain("notebooks");
    expect(doc).toContain("tests");
    expect(doc).toContain(".env.example");
    expect(doc).toContain("Dockerfile.lambda");
    expect(doc).toContain("evaluate.py");
    expect(doc).toContain("lambda_handler.py");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("trust-policy.json");
    expect(doc).toContain("FastAPI application");
    expect(doc).toContain("Document RAG");
    expect(doc).toContain("Text-to-SQL");
    expect(doc).toContain("Intelligent Query Routing");
    expect(doc).toContain("RAGAS Metrics");
    expect(doc).toContain("Faithfulness");
    expect(doc).toContain("answer relevancy");
    expect(doc).toContain("OPIK Tracking");
    expect(doc).toContain("CloudWatch Monitoring");
    expect(doc).toContain("CI/CD Pipeline");
    expect(doc).toContain("Test Deployment");
    expect(doc).toContain("health check and smoke tests");
    expect(doc).toContain("SQL Determinism Configuration");
    expect(doc).toContain("VANNA_TEMPERATURE");
    expect(doc).toContain("VANNA_TOP_P");
    expect(doc).toContain("VANNA_SEED");
    expect(doc).toContain(">95%");
    expect(doc).toContain("SQL Generation 70%+ accuracy");
    expect(doc).toContain("Query Routing 80%+ correct");
    expect(doc).toContain("RAGAS Faithfulness > 0.7");
    expect(doc).toContain("RAGAS Relevancy > 0.8");
    expect(doc).toContain("Response Time < 15 seconds");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 59.7%");
    expect(doc).toContain("Jupyter Notebook 39.8%");
    expect(doc).toContain("Dockerfile 0.5%");
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

  it("accepts multidata-rag-project context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 24 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "multidata-rag-validation-table",
      "multidata-rag-sample-size",
      "multidata-rag-confidence-interval",
      "multidata-rag-reliability-check",
      "multidata-rag-regression-threshold",
      "multidata-rag-metric-owner",
      "multidata-rag-ragas-eval-proof",
      "multidata-rag-opik-monitoring-proof",
      "multidata-rag-ci-smoke-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "multidata-rag-context-agent",
        runId: "run-gap0940-multidata-rag-metric-validity",
        ts: Date.UTC(2026, 5, 22),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.86,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.84,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "ragas-faithfulness-construct-validity",
          "answer-relevancy-reliability",
          "sql-determinism-stability",
          "query-routing-threshold-fit",
          "monitoring-regression-repeatability",
        ].map((facetId, index) => ({
          facetId: `multidata-rag-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "multidata-rag-validation-table"],
          ["sample-size", "multidata-rag-sample-size"],
          ["confidence-interval", "multidata-rag-confidence-interval"],
          ["reliability-check", "multidata-rag-reliability-check"],
          ["regression-threshold", "multidata-rag-regression-threshold"],
          ["metric-owner", "multidata-rag-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `multidata-rag-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "multidata-rag-score-predicts-production-rag-quality",
          aligned: true,
          evidenceRefs: [
            "multidata-rag-ragas-eval-proof",
            "multidata-rag-opik-monitoring-proof",
            "multidata-rag-ci-smoke-proof",
          ],
        }],
        sourceRefs: [URL],
        gateMode: "ci",
      },
      [
        prior("run-gap0940-baseline", Date.UTC(2026, 5, 8), 3),
        prior("run-gap0940-repeat", Date.UTC(2026, 5, 15), 3.02),
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
    expect(report.rows[0]?.interRaterAgreement).toBe(0.84);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([URL]);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when multidata-rag-project metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "multidata-rag-context-agent",
      runId: "run-gap0940-metadata-only",
      ts: Date.UTC(2026, 5, 22),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.2,
      correlationRatio: 0.2,
      unsupportedClaimCount: 8,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-MULTIDATA-RAG-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "multidata-rag-project repository and README metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-MULTIDATA-RAG-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "multidata-rag-repository-metadata",
        "multidata-rag-readme-ragas-label",
        "multidata-rag-ci-smoke-test-label",
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
        processEvidenceId: `multidata-rag-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "multidata-rag-metadata-only-outcome",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [URL],
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

  it("does not add multidata-rag-project identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("multidata_rag_project_metric_validity");
    }
  });
});
