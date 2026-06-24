import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1019-neuroradiology-metric-validity.md";
const OPENALEX = "https://openalex.org/W7131099824";
const OPENALEX_API = "https://api.openalex.org/works/W7131099824";
const DOI = "https://doi.org/10.3348/kjr.2025.1045";
const CROSSREF = "https://api.crossref.org/works/10.3348/kjr.2025.1045";
const PUBLISHER = "https://kjronline.org/DOIx.php?id=10.3348/kjr.2025.1045";
const PDF = "https://kjronline.org/Synapse/Data/PDFData/0068KJR/kjr-27-214.pdf";
const TITLE =
  "Evaluating the Accuracy and Diagnostic Reasoning of Multimodal Large Language Models in Interpreting Neuroradiology Cases From RadioGraphics";
const IDENTIFIER = "neuroradiology_metric_validity";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-NEURORAD-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`neurorad-metric-row-${index}`],
    flags: [],
    narrative: `Neuroradiology paper context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "neuroradiology-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 1019).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `neurorad-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `neurorad-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 24),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-1019 neuroradiology metric-validity boundary", () => {
  it("documents live OpenAlex, DOI, Crossref, publisher, and PDF metadata plus required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1019");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(PUBLISHER);
    expect(doc).toContain(PDF);
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/1.1 200 OK");
    expect(doc).toContain("Content-Length: 4851826");
    expect(doc).toContain("Last-Modified: Mon, 23 Feb 2026 00:32:50 GMT");
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-01-01`");
    expect(doc).toContain("journal-article");
    expect(doc).toContain("Korean Journal of Radiology");
    expect(doc).toContain("Korean Society of Radiology");
    expect(doc).toContain("XMLink");
    expect(doc).toContain("cc-by-nc");
    expect(doc).toContain("hybrid");
    expect(doc).toContain("cited_by_count `2`");
    expect(doc).toContain("referenced_works_count `31`");
    expect(doc).toContain("Pae Sun Suh");
    expect(doc).toContain("Ji Su Ko");
    expect(doc).toContain("Woo Hyun Shim");
    expect(doc).toContain("Hwon Heo");
    expect(doc).toContain("Chang-Yun Woo");
    expect(doc).toContain("Hyungjun Park");
    expect(doc).toContain("Chong Hyun Suh");
    expect(doc).toContain("Yonsei University");
    expect(doc).toContain("Asan Medical Center");
    expect(doc).toContain("Ulsan College");
    expect(doc).toContain("Medicine");
    expect(doc).toContain("Neuroradiology");
    expect(doc).toContain("Neuroimaging");
    expect(doc).toContain("Differential diagnosis");
    expect(doc).toContain("Artificial intelligence");
    expect(doc).toContain("401 radiologic quizzes");
    expect(doc).toContain("GPT-4 Turbo with Vision");
    expect(doc).toContain("GPT-4 Omni");
    expect(doc).toContain("Gemini Flash");
    expect(doc).toContain("Claude");
    expect(doc).toContain("top three differential diagnoses");
    expect(doc).toContain("generalized estimating equations");
    expect(doc).toContain("four-point scales");
    expect(doc).toContain("hallucinations");
    expect(doc).toContain("acceptable");
    expect(doc).toContain("repeatability");
    expect(doc).toContain("proprietary models underwent updates");
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

  it("accepts neuroradiology paper context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 31 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "neurorad-validation-table",
      "neurorad-sample-size",
      "neurorad-confidence-interval",
      "neurorad-reliability-check",
      "neurorad-regression-threshold",
      "neurorad-metric-owner",
      "neurorad-construct-validity-proof",
      "neurorad-diagnostic-reasoning-proof",
      "neurorad-human-reader-comparison-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "neuroradiology-context-agent",
        runId: "run-gap1019-neurorad-metric-validity",
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
          averageJudgeAgreement: 0.88,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "construct-validity",
          "inter-rater-reliability",
          "test-retest-stability",
          "clinical-context-repeatability",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `neurorad-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "neurorad-validation-table"],
          ["sample-size", "neurorad-sample-size"],
          ["confidence-interval", "neurorad-confidence-interval"],
          ["reliability-check", "neurorad-reliability-check"],
          ["regression-threshold", "neurorad-regression-threshold"],
          ["metric-owner", "neurorad-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `neurorad-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "neurorad-score-predicts-diagnostic-reasoning-evaluation-quality",
          aligned: true,
          evidenceRefs: [
            "neurorad-construct-validity-proof",
            "neurorad-diagnostic-reasoning-proof",
            "neurorad-human-reader-comparison-proof",
          ],
        }],
        sourceRefs: [OPENALEX, DOI, CROSSREF, PUBLISHER, PDF],
        gateMode: "ci",
      },
      [
        prior("run-gap1019-baseline", Date.UTC(2026, 5, 10), 3),
        prior("run-gap1019-repeat", Date.UTC(2026, 5, 17), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 31,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.88);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([OPENALEX, DOI, CROSSREF, PUBLISHER, PDF]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when neuroradiology paper metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "neuroradiology-context-agent",
      runId: "run-gap1019-neurorad-metadata-only",
      ts: Date.UTC(2026, 5, 24),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.22,
      evidenceCoverage: 0.14,
      correlationRatio: 0.2,
      unsupportedClaimCount: 10,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-NEURORAD-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "Neuroradiology paper metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-NEURORAD-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "neurorad-paper-metadata",
        "neurorad-clinical-benchmark-label",
        "neurorad-publisher-abstract",
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
        processEvidenceId: `neurorad-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "neurorad-metadata-only-outcome",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [OPENALEX, DOI],
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

  it("does not add neuroradiology paper identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(OPENALEX_API);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(PDF);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain("kjr.2025.1045");
    }
  });
});
