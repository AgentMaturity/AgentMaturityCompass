import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0009-modular-benchmark-metric-validity.md";
const OPENALEX = "https://openalex.org/W7119224602";
const OPENALEX_API = "https://api.openalex.org/works/W7119224602";
const DOI = "https://doi.org/10.34218/ijrcait_09_01_001";
const DOI_VALUE = "10.34218/ijrcait_09_01_001";
const CROSSREF = "https://api.crossref.org/works/10.34218/ijrcait_09_01_001";
const PDF = "https://iaeme.com/MasterAdmin/Journal_uploads/IJRCAIT/VOLUME_9_ISSUE_1/IJRCAIT_09_01_001.pdf";
const TITLE = "A MODULAR BENCHMARKING FRAMEWORK FOR EVALUATING LLM-BASED AGENT APPLICATIONS";
const IDENTIFIER = "modular_benchmark_metric_validity";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/runner.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-MODULAR-BENCHMARK-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`modular-benchmark-metric-row-${index}`],
    flags: [],
    narrative: `Modular benchmark context is bounded to AMC metric-validity sample ${index}.`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "modular-benchmark-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 4).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `modular-benchmark-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `modular-benchmark-session-${index}`,
    ts: Date.UTC(2026, 5, 25),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0009 modular benchmark metric-validity boundary", () => {
  it("documents live modular benchmark metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0009");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(PDF);
    expect(doc).toContain("publication year `2026`");
    expect(doc).toContain("publication date `2026-01-06`");
    expect(doc).toContain("OpenAlex type `article`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("INTERNATIONAL JOURNAL OF RESEARCH IN COMPUTER APPLICATIONS AND INFORMATION TECHNOLOGY");
    expect(doc).toContain("IAEME Publication");
    expect(doc).toContain("OpenAlex OA status `bronze`");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Modular design");
    expect(doc).toContain("Benchmarking");
    expect(doc).toContain("Systems engineering");
    expect(doc).toContain("Karthik Perikala");
    expect(doc).toContain("validation table");
    expect(doc).toContain("confidence interval");
    expect(doc).toContain("sample size");
    expect(doc).toContain("metric owner");
    expect(doc).toContain("reproducible eval pack");
    expect(doc).toContain("signed evidence refs");
    expect(doc).toContain("CI/lifecycle gate");
    expect(doc).toContain("metadata-only modular benchmark evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts modular benchmark context only through signed metric-validity eval-pack receipts", () => {
    const questionScores = Array.from({ length: 28 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "modular-benchmark-validation-table",
      "modular-benchmark-sample-size",
      "modular-benchmark-confidence-interval",
      "modular-benchmark-construct-validity",
      "modular-benchmark-inter-rater-reliability",
      "modular-benchmark-test-retest-stability",
      "modular-benchmark-module-coverage",
      "modular-benchmark-regression-threshold",
      "modular-benchmark-metric-owner",
      "modular-benchmark-agent-application-outcome",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];
    const sourceRefs = [OPENALEX, OPENALEX_API, DOI, CROSSREF, PDF];

    const report = buildMetricValidationReport(
      {
        agentId: "modular-benchmark-context-agent",
        runId: "run-gap0009-modular-benchmark-metric-validity",
        ts: Date.UTC(2026, 5, 25),
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
          averageJudgeAgreement: 0.9,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "construct-validity",
          "inter-rater-reliability",
          "test-retest-stability",
          "module-coverage",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `modular-benchmark-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index + 3]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "modular-benchmark-validation-table"],
          ["sample-size", "modular-benchmark-sample-size"],
          ["confidence-interval", "modular-benchmark-confidence-interval"],
          ["metric-owner", "modular-benchmark-metric-owner"],
          ["regression-threshold", "modular-benchmark-regression-threshold"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `modular-benchmark-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "modular-benchmark-agent-application-reliability",
          aligned: true,
          evidenceRefs: [
            "modular-benchmark-module-coverage",
            "modular-benchmark-agent-application-outcome",
          ],
        }],
        sourceRefs,
        gateMode: "lifecycle",
      },
      [
        prior("run-gap0009-baseline", Date.UTC(2026, 5, 11), 3),
        prior("run-gap0009-repeat", Date.UTC(2026, 5, 18), 3.02),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      owner: "AMC Score",
      sampleSize: 28,
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
    expect(report.evalPack.datasetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.evalPack.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.evalPack.rows[0]?.signedEvidenceRefs.length).toBeGreaterThan(0);
    expect(report.ciGate).toMatchObject({ mode: "lifecycle", passed: true, failClosed: false });
  });

  it("fails closed when modular benchmark metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "modular-benchmark-context-agent",
      runId: "run-gap0009-modular-benchmark-metadata-only",
      ts: Date.UTC(2026, 5, 25),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.24,
      evidenceCoverage: 0.12,
      correlationRatio: 0.2,
      unsupportedClaimCount: 7,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-MODULAR-BENCHMARK-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "Modular benchmarking paper metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-MODULAR-BENCHMARK-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "modular-benchmark-openalex-metadata",
        "modular-benchmark-crossref-metadata",
        "modular-benchmark-concept-labels",
      ].map((facetId) => ({
        facetId,
        covered: false,
        evidenceRefs: [],
      })),
      processEvidenceChecks: [
        "modular-benchmark-validation-table",
        "modular-benchmark-sample-size",
        "modular-benchmark-confidence-interval",
        "modular-benchmark-metric-owner",
      ].map((processEvidenceId) => ({
        processEvidenceId,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "modular-benchmark-agent-application-outcome",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [OPENALEX, DOI, CROSSREF, PDF],
      gateMode: "lifecycle",
    });

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      validationFacetCoverage: 0,
      processEvidenceCoverage: 0,
      outcomeAlignment: 0,
      sampleSize: 1,
    });
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate).toMatchObject({ mode: "lifecycle", passed: false, failClosed: true });
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
    expect(report.warnings.join(" ")).toContain("sample size");
    expect(report.warnings.join(" ")).toContain("construct validity");
  });

  it("keeps the modular benchmark source-review boundary out of product implementation files", () => {
    for (const filePath of implementationFiles) {
      const source = readFileSync(filePath, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("W7119224602");
      expect(source).not.toContain("ijrcait_09_01_001");
      expect(source).not.toContain("IAEME");
    }
  });
});
