import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0935-lexrag-metric-validity.md";
const REPO = "tydreamer/LexRAG";
const URL = "https://github.com/tydreamer/LexRAG";
const TITLE = "LexRAG";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.86): QuestionScore {
  return {
    questionId: `AMC-LEXRAG-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`lexrag-metric-row-${index}`],
    flags: [],
    narrative: `LexRAG context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "lexrag-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 935).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `lexrag-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `lexrag-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 22),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0935 LexRAG metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0935");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("GitHub API repository metadata");
    expect(doc).toContain("default_branch");
    expect(doc).toContain("main");
    expect(doc).toContain("stargazers_count: 21");
    expect(doc).toContain("watchers_count: 21");
    expect(doc).toContain("forks_count: 0");
    expect(doc).toContain("open_issues_count: 0");
    expect(doc).toContain("license: null");
    expect(doc).toContain("created_at: 2026-04-03T18:58:44Z");
    expect(doc).toContain("updated_at: 2026-06-21T02:35:52Z");
    expect(doc).toContain("pushed_at: 2026-04-30T19:31:27Z");
    expect(doc).toContain(".gitignore");
    expect(doc).toContain("docker-compose.yaml");
    expect(doc).toContain("images");
    expect(doc).toContain("llm-app");
    expect(doc).toContain("orchestration");
    expect(doc).toContain("readme.md");
    expect(doc).toContain("Jupyter Notebook");
    expect(doc).toContain("Python");
    expect(doc).toContain("Dockerfile");
    expect(doc).toContain("No releases");
    expect(doc).toContain("No tags");
    expect(doc).toContain("readme.md sha fc65bda78052f5b6da59e4aed33f0ec380a44489");
    expect(doc).toContain("Retrieval-Augmented Generation");
    expect(doc).toContain("legal documents");
    expect(doc).toContain("PostgreSQL");
    expect(doc).toContain("Elasticsearch");
    expect(doc).toContain("Airflow");
    expect(doc).toContain("Grafana");
    expect(doc).toContain("Streamlit");
    expect(doc).toContain("Hit Rate");
    expect(doc).toContain("Mean Reciprocal Rank");
    expect(doc).toContain("Google BERT Scores");
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

  it("accepts LexRAG context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 18 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "lexrag-validation-table",
      "lexrag-sample-size",
      "lexrag-confidence-interval",
      "lexrag-reliability-check",
      "lexrag-regression-threshold",
      "lexrag-metric-owner",
      "lexrag-rag-eval-proof",
      "lexrag-monitoring-proof",
      "lexrag-repeatability-evidence",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "lexrag-context-agent",
        runId: "run-gap0935-lexrag-metric-validity",
        ts: Date.UTC(2026, 5, 22),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.83,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.82,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "legal-rag-construct-validity",
          "retrieval-hit-rate-reliability",
          "mrr-stability",
          "bert-score-alignment",
          "monitoring-feedback-fit",
        ].map((facetId, index) => ({
          facetId: `lexrag-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "lexrag-validation-table"],
          ["sample-size", "lexrag-sample-size"],
          ["confidence-interval", "lexrag-confidence-interval"],
          ["reliability-check", "lexrag-reliability-check"],
          ["regression-threshold", "lexrag-regression-threshold"],
          ["metric-owner", "lexrag-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `lexrag-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "lexrag-score-predicts-legal-rag-retrieval-quality",
          aligned: true,
          evidenceRefs: [
            "lexrag-rag-eval-proof",
            "lexrag-monitoring-proof",
            "lexrag-repeatability-evidence",
          ],
        }],
        sourceRefs: [URL],
        gateMode: "ci",
      },
      [
        prior("run-gap0935-baseline", Date.UTC(2026, 5, 8), 3),
        prior("run-gap0935-repeat", Date.UTC(2026, 5, 15), 2.98),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 18,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.82);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([URL]);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when LexRAG metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "lexrag-context-agent",
      runId: "run-gap0935-metadata-only",
      ts: Date.UTC(2026, 5, 22),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.2,
      correlationRatio: 0.2,
      unsupportedClaimCount: 8,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-LEXRAG-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "LexRAG repository and README metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-LEXRAG-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "lexrag-repository-metadata",
        "lexrag-readme-rag-label",
        "lexrag-legal-stack-label",
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
        processEvidenceId: `lexrag-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "lexrag-metadata-only-outcome",
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

  it("does not add LexRAG identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("lexrag_metric_validity");
    }
  });
});
