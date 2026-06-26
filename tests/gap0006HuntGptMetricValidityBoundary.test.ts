import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0006-huntgpt-metric-validity.md";
const OPENALEX = "https://openalex.org/W4387210439";
const OPENALEX_API = "https://api.openalex.org/works/W4387210439";
const DOI = "https://doi.org/10.3390/telecom7030073";
const DOI_VALUE = "10.3390/telecom7030073";
const CROSSREF = "https://api.crossref.org/works/10.3390/telecom7030073";
const MDPI = "https://www.mdpi.com/2673-4001/7/3/73";
const TITLE = "HuntGPT: Integrating Machine Learning-Based Anomaly Detection and Explainable AI with Large Language Models (LLMs)";
const IDENTIFIER = "huntgpt_metric_validity";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/runner.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.91): QuestionScore {
  return {
    questionId: `AMC-HUNTGPT-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`huntgpt-metric-row-${index}`],
    flags: [],
    narrative: `HuntGPT anomaly-detection context is bounded to AMC metric-validity sample ${index}.`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "huntgpt-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 3).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `huntgpt-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `huntgpt-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 25),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0006 HuntGPT metric-validity boundary", () => {
  it("documents live HuntGPT metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0006");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(MDPI);
    expect(doc).toContain("publication year `2026`");
    expect(doc).toContain("publication date `2026-06-08`");
    expect(doc).toContain("OpenAlex type `preprint`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("Telecom");
    expect(doc).toContain("MDPI AG");
    expect(doc).toContain("Creative Commons BY 4.0");
    expect(doc).toContain("OpenAlex OA status `gold`");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Intrusion detection system");
    expect(doc).toContain("Anomaly detection");
    expect(doc).toContain("False positive paradox");
    expect(doc).toContain("University of Oulu");
    expect(doc).toContain("validation table");
    expect(doc).toContain("confidence interval");
    expect(doc).toContain("sample size");
    expect(doc).toContain("metric owner");
    expect(doc).toContain("reproducible eval pack");
    expect(doc).toContain("signed evidence refs");
    expect(doc).toContain("CI/lifecycle gate");
    expect(doc).toContain("metadata-only HuntGPT evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts HuntGPT context only through existing signed metric-validity eval-pack receipts", () => {
    const questionScores = Array.from({ length: 32 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "huntgpt-validation-table",
      "huntgpt-sample-size",
      "huntgpt-confidence-interval",
      "huntgpt-construct-validity",
      "huntgpt-inter-rater-reliability",
      "huntgpt-test-retest-stability",
      "huntgpt-false-positive-threshold",
      "huntgpt-xai-review",
      "huntgpt-metric-owner",
      "huntgpt-ci-regression-threshold",
      "huntgpt-operational-trust-outcome",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];
    const sourceRefs = [OPENALEX, OPENALEX_API, DOI, CROSSREF, MDPI];

    const report = buildMetricValidationReport(
      {
        agentId: "huntgpt-context-agent",
        runId: "run-gap0006-huntgpt-metric-validity",
        ts: Date.UTC(2026, 5, 25),
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
          averageJudgeAgreement: 0.91,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "construct-validity",
          "inter-rater-reliability",
          "test-retest-stability",
          "false-positive-threshold-fit",
          "xai-review-coverage",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `huntgpt-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index + 3]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "huntgpt-validation-table"],
          ["sample-size", "huntgpt-sample-size"],
          ["confidence-interval", "huntgpt-confidence-interval"],
          ["metric-owner", "huntgpt-metric-owner"],
          ["ci-regression-threshold", "huntgpt-ci-regression-threshold"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `huntgpt-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "huntgpt-operational-trust-and-false-positive-control",
          aligned: true,
          evidenceRefs: [
            "huntgpt-false-positive-threshold",
            "huntgpt-xai-review",
            "huntgpt-operational-trust-outcome",
          ],
        }],
        sourceRefs,
        gateMode: "ci",
      },
      [
        prior("run-gap0006-baseline", Date.UTC(2026, 5, 11), 3),
        prior("run-gap0006-repeat", Date.UTC(2026, 5, 18), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      owner: "AMC Score",
      sampleSize: 32,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.91);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual(sourceRefs);
    expect(report.evalPack.datasetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.evalPack.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.evalPack.rows[0]?.signedEvidenceRefs.length).toBeGreaterThan(0);
    expect(report.ciGate).toMatchObject({ mode: "ci", passed: true, failClosed: false });
  });

  it("fails closed when HuntGPT metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "huntgpt-context-agent",
      runId: "run-gap0006-huntgpt-metadata-only",
      ts: Date.UTC(2026, 5, 25),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.25,
      evidenceCoverage: 0.12,
      correlationRatio: 0.2,
      unsupportedClaimCount: 8,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-HUNTGPT-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "HuntGPT paper metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-HUNTGPT-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "huntgpt-openalex-metadata",
        "huntgpt-crossref-metadata",
        "huntgpt-anomaly-detection-labels",
      ].map((facetId) => ({
        facetId,
        covered: false,
        evidenceRefs: [],
      })),
      processEvidenceChecks: [
        "huntgpt-validation-table",
        "huntgpt-sample-size",
        "huntgpt-confidence-interval",
        "huntgpt-metric-owner",
      ].map((processEvidenceId) => ({
        processEvidenceId,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "huntgpt-operational-trust-outcome",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [OPENALEX, DOI, CROSSREF, MDPI],
      gateMode: "ci",
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
    expect(report.ciGate).toMatchObject({ passed: false, failClosed: true });
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
    expect(report.warnings.join(" ")).toContain("sample size");
    expect(report.warnings.join(" ")).toContain("construct validity");
  });

  it("keeps the HuntGPT source-review boundary out of product implementation files", () => {
    for (const filePath of implementationFiles) {
      const source = readFileSync(filePath, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("HuntGPT");
      expect(source).not.toContain("W4387210439");
      expect(source).not.toContain("telecom7030073");
    }
  });
});
