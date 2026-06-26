import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1046-lira-metric-validity.md";
const OPENALEX = "https://openalex.org/W7139095367";
const OPENALEX_API = "https://api.openalex.org/works/W7139095367";
const DOI = "https://doi.org/10.1609/aaai.v40i47.41489";
const DOI_VALUE = "10.1609/aaai.v40i47.41489";
const CROSSREF = "https://api.crossref.org/works/10.1609/aaai.v40i47.41489";
const AAAI = "https://ojs.aaai.org/index.php/AAAI/article/view/41489";
const PDF = "https://ojs.aaai.org/index.php/AAAI/article/download/41489/45450";
const TITLE = "LiRA: A Multi-Agent Framework for Reliable and Readable Literature Review Generation";
const IDENTIFIER = "lira_metric_validity";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-LIRA-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`lira-metric-row-${index}`],
    flags: [],
    narrative: `LiRA paper context is bounded to AMC metric-validity sample ${index}.`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "lira-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 1046).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `lira-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `lira-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 25),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-1046 LiRA metric-validity boundary", () => {
  it("documents live LiRA paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1046");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(AAAI);
    expect(doc).toContain(PDF);
    expect(doc).toContain("Proceedings of the AAAI Conference on Artificial Intelligence");
    expect(doc).toContain("Association for the Advancement of Artificial Intelligence");
    expect(doc).toContain("publication_date `2026-03-14`");
    expect(doc).toContain("OpenAlex type `article`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("is_oa `true`");
    expect(doc).toContain("open access status `diamond`");
    expect(doc).toContain("cited_by_count `1`");
    expect(doc).toContain("volume `40`");
    expect(doc).toContain("issue `47`");
    expect(doc).toContain("pages `40456-40464`");
    expect(doc).toContain("Gregory Hok Tjoan Go");
    expect(doc).toContain("Khang Ly");
    expect(doc).toContain("Anders");
    expect(doc).toContain("Seyed Amin Tabatabaei");
    expect(doc).toContain("Maarten de Rijke");
    expect(doc).toContain("Xinyi Chen");
    expect(doc).toContain("RELX Group");
    expect(doc).toContain("University of Copenhagen");
    expect(doc).toContain("University of Amsterdam");
    expect(doc).toContain("Topic Modeling");
    expect(doc).toContain("Biomedical Text Mining and Ontologies");
    expect(doc).toContain("Expert finding and Q&A systems");
    expect(doc).toContain("Readability");
    expect(doc).toContain("Workflow");
    expect(doc).toContain("Usability");
    expect(doc).toContain("Robustness");
    expect(doc).toContain("Scientific literature");
    expect(doc).toContain("Systematic review");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("content-type: application/pdf");
    expect(doc).toContain("00311-IAAI26.TjoanGoG-EA.pdf");
    expect(doc).toContain("validation table");
    expect(doc).toContain("confidence interval");
    expect(doc).toContain("sample size");
    expect(doc).toContain("metric owner");
    expect(doc).toContain("construct validity");
    expect(doc).toContain("inter-rater agreement");
    expect(doc).toContain("test-retest stability");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts LiRA context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 30 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "lira-validation-table",
      "lira-sample-size",
      "lira-confidence-interval",
      "lira-reliability-check",
      "lira-regression-threshold",
      "lira-metric-owner",
      "lira-literature-review-repeatability-proof",
      "lira-readability-rubric-proof",
      "lira-citation-trace-proof",
      "lira-safety-alignment-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];
    const sourceRefs = [OPENALEX, OPENALEX_API, DOI, CROSSREF, AAAI, PDF];

    const report = buildMetricValidationReport(
      {
        agentId: "lira-context-agent",
        runId: "run-gap1046-lira-metric-validity",
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
          averageJudgeAgreement: 0.9,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "construct-validity",
          "inter-rater-reliability",
          "test-retest-stability",
          "literature-review-repeatability",
          "readability-rubric-coverage",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `lira-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "lira-validation-table"],
          ["sample-size", "lira-sample-size"],
          ["confidence-interval", "lira-confidence-interval"],
          ["reliability-check", "lira-reliability-check"],
          ["regression-threshold", "lira-regression-threshold"],
          ["metric-owner", "lira-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `lira-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "lira-score-predicts-literature-review-agent-reliability",
          aligned: true,
          evidenceRefs: [
            "lira-literature-review-repeatability-proof",
            "lira-readability-rubric-proof",
            "lira-citation-trace-proof",
            "lira-safety-alignment-proof",
          ],
        }],
        sourceRefs,
        gateMode: "ci",
      },
      [
        prior("run-gap1046-baseline", Date.UTC(2026, 5, 11), 3),
        prior("run-gap1046-repeat", Date.UTC(2026, 5, 18), 3.01),
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
    expect(report.rows[0]?.interRaterAgreement).toBe(0.9);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual(sourceRefs);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when LiRA metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "lira-context-agent",
      runId: "run-gap1046-lira-metadata-only",
      ts: Date.UTC(2026, 5, 25),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.22,
      evidenceCoverage: 0.14,
      correlationRatio: 0.2,
      unsupportedClaimCount: 9,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-LIRA-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "LiRA paper metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-LIRA-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "lira-openalex-metadata",
        "lira-doi-metadata",
        "lira-aaai-pdf-availability",
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
        processEvidenceId: `lira-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "lira-metadata-only-outcome",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [OPENALEX, DOI, CROSSREF, AAAI, PDF],
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

  it("does not add LiRA identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(PDF);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
