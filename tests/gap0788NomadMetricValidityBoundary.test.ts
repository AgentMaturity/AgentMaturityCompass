import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0788-nomad-metric-validity.md";
const ARXIV = "https://arxiv.org/abs/2511.22409";
const ARXIV_DOI = "10.48550/arXiv.2511.22409";
const RELATED_DOI = "10.5220/0014301900004058";
const OPENALEX = "W7139097803";
const TITLE = "NOMAD: A Multi-Agent LLM System for UML Class Diagram Generation from Natural Language Requirements";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-NOMAD-EVAL-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`nomad-metric-row-${index}`],
    flags: [],
    narrative: `NOMAD source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "nomad-context-eval-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 59).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `nomad-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `nomad-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 21),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0788 NOMAD metric-validity boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0788");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_DOI);
    expect(doc).toContain(RELATED_DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("submitted `27 Nov 2025`");
    expect(doc).toContain("last revised `1 May 2026`");
    expect(doc).toContain("v2");
    expect(doc).toContain("Polydoros Giannouris");
    expect(doc).toContain("Sophia Ananiadou");
    expect(doc).toContain("Software Engineering");
    expect(doc).toContain("role-specialised subtasks");
    expect(doc).toContain("entity extraction");
    expect(doc).toContain("relationship classification");
    expect(doc).toContain("diagram synthesis");
    expect(doc).toContain("Northwind");
    expect(doc).toContain("human-authored UML exercises");
    expect(doc).toContain("taxonomy of errors");
    expect(doc).toContain("structural");
    expect(doc).toContain("relationship");
    expect(doc).toContain("semantic/logical");
    expect(doc).toContain("verification as a design probe");
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

  it("accepts UML-generation agent context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 20 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "nomad-construct-validity",
      "nomad-validation-table",
      "nomad-sample-size",
      "nomad-confidence-interval",
      "nomad-reliability-check",
      "nomad-regression-threshold",
      "nomad-metric-owner",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "nomad-context-eval-agent",
        runId: "run-gap0788-nomad-metric-validity",
        ts: Date.UTC(2026, 5, 21),
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
          averageJudgeAgreement: 0.86,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "construct-validity",
          "validation-table",
          "sample-size",
          "confidence-interval",
          "reliability-check",
        ].map((facetId, index) => ({
          facetId: `nomad-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          "validation-table",
          "sample-size",
          "confidence-interval",
          "reliability-check",
          "regression-threshold",
          "metric-owner",
        ].map((processEvidenceId, index) => ({
          processEvidenceId: `nomad-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index + 1]!],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "nomad-score-predicts-uml-agent-eval-quality",
          aligned: true,
          evidenceRefs: ["nomad-reliability-check", "nomad-regression-threshold"],
        }],
        sourceRefs: [ARXIV, `doi:${ARXIV_DOI}`, `doi:${RELATED_DOI}`, `openalex:${OPENALEX}`],
        gateMode: "ci",
      },
      [
        prior("run-gap0788-baseline", Date.UTC(2026, 5, 7), 3),
        prior("run-gap0788-repeat", Date.UTC(2026, 5, 14), 3.02),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 20,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.86);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([ARXIV, `doi:${ARXIV_DOI}`, `doi:${RELATED_DOI}`, `openalex:${OPENALEX}`]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when paper metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "nomad-context-eval-agent",
      runId: "run-gap0788-metadata-only",
      ts: Date.UTC(2026, 5, 21),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.12,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-NOMAD-EVAL-01", layerName }],
      sourceRefs: [ARXIV],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add NOMAD identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("nomad_metric_validity");
      expect(source).not.toContain(TITLE);
    }
  });
});
