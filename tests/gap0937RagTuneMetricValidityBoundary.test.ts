import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0937-ragtune-metric-validity.md";
const REPO = "metawake/ragtune";
const URL = "https://github.com/metawake/ragtune";
const TITLE = "RagTune";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.87): QuestionScore {
  return {
    questionId: `AMC-RAGTUNE-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`ragtune-metric-row-${index}`],
    flags: [],
    narrative: `RagTune context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "ragtune-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 937).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `ragtune-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `ragtune-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 22),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0937 RagTune metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0937");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("Star 12");
    expect(doc).toContain("Fork 1");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("21 Commits");
    expect(doc).toContain("MIT license");
    expect(doc).toContain(".github");
    expect(doc).toContain("assets");
    expect(doc).toContain("benchmarks");
    expect(doc).toContain("cmd/ ragtune");
    expect(doc).toContain("data");
    expect(doc).toContain("docs");
    expect(doc).toContain("examples");
    expect(doc).toContain("internal");
    expect(doc).toContain("runs/ needle-experiment");
    expect(doc).toContain("scripts");
    expect(doc).toContain(".goreleaser.yaml");
    expect(doc).toContain("Makefile");
    expect(doc).toContain("README.md");
    expect(doc).toContain("go.mod");
    expect(doc).toContain("go.sum");
    expect(doc).toContain("run-benchmark.sh");
    expect(doc).toContain("Releases 4");
    expect(doc).toContain("v0.4.0");
    expect(doc).toContain("Feb 25, 2026");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Go 84.8%");
    expect(doc).toContain("Python 12.5%");
    expect(doc).toContain("Shell 2.4%");
    expect(doc).toContain("Makefile 0.3%");
    expect(doc).toContain("EXPLAIN ANALYZE");
    expect(doc).toContain("confidence intervals");
    expect(doc).toContain("CI/CD quality gates");
    expect(doc).toContain("fail-on-regression");
    expect(doc).toContain("Recall@5");
    expect(doc).toContain("MRR");
    expect(doc).toContain("Coverage");
    expect(doc).toContain("Latency p95");
    expect(doc).toContain("NeedleCoverage@K");
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

  it("accepts RagTune context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 22 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "ragtune-validation-table",
      "ragtune-sample-size",
      "ragtune-confidence-interval",
      "ragtune-reliability-check",
      "ragtune-regression-threshold",
      "ragtune-metric-owner",
      "ragtune-retrieval-eval-proof",
      "ragtune-ci-gate-proof",
      "ragtune-repeatability-evidence",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "ragtune-context-agent",
        runId: "run-gap0937-ragtune-metric-validity",
        ts: Date.UTC(2026, 5, 22),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.84,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.83,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "retrieval-metric-construct-validity",
          "recall-mrr-reliability",
          "needle-coverage-stability",
          "ci-gate-repeatability",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `ragtune-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "ragtune-validation-table"],
          ["sample-size", "ragtune-sample-size"],
          ["confidence-interval", "ragtune-confidence-interval"],
          ["reliability-check", "ragtune-reliability-check"],
          ["regression-threshold", "ragtune-regression-threshold"],
          ["metric-owner", "ragtune-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `ragtune-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "ragtune-score-predicts-retrieval-quality",
          aligned: true,
          evidenceRefs: [
            "ragtune-retrieval-eval-proof",
            "ragtune-ci-gate-proof",
            "ragtune-repeatability-evidence",
          ],
        }],
        sourceRefs: [URL],
        gateMode: "ci",
      },
      [
        prior("run-gap0937-baseline", Date.UTC(2026, 5, 8), 3),
        prior("run-gap0937-repeat", Date.UTC(2026, 5, 15), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 22,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.83);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([URL]);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when RagTune metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "ragtune-context-agent",
      runId: "run-gap0937-metadata-only",
      ts: Date.UTC(2026, 5, 22),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.2,
      correlationRatio: 0.2,
      unsupportedClaimCount: 8,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-RAGTUNE-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "RagTune repository and README metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-RAGTUNE-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "ragtune-repository-metadata",
        "ragtune-readme-retrieval-label",
        "ragtune-ci-regression-label",
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
        processEvidenceId: `ragtune-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "ragtune-metadata-only-outcome",
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

  it("does not add RagTune identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("ragtune_metric_validity");
    }
  });
});
