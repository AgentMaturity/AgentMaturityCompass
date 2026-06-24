import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0727-simulated-learners-metric-validity.md";
const SOURCE = "https://arxiv.org/abs/2604.04361";
const DOI = "10.48550/arxiv.2604.04361";
const OPENALEX = "W7151487588";
const TITLE = "Developing Authentic Simulated Learners for Mathematics Teacher Learning: Insights from Three Approaches with Large Language Models";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.89): QuestionScore {
  return {
    questionId: `AMC-SIMULATED-LEARNER-EVAL-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`simulated-learner-metric-row-${index}`],
    flags: [],
    narrative: `Simulated learner source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "simulated-learner-context-eval-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 13).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `simulated-learner-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `simulated-learner-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 21),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0727 simulated learners metric-validity boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0727");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Jie Cao");
    expect(doc).toContain("Ha Nguyen");
    expect(doc).toContain("Selim Yavuz");
    expect(doc).toContain("Boran Yu");
    expect(doc).toContain("Shuguang Wang");
    expect(doc).toContain("Pavneet Kaur Bharaj");
    expect(doc).toContain("Dionne Cross Francis");
    expect(doc).toContain("2026-04-06");
    expect(doc).toContain("AIED 2026");
    expect(doc).toContain("few-shot prompting baselines");
    expect(doc).toContain("fine-tuning, multi-agent, and direct preference optimization");
    expect(doc).toContain("cognitive and linguistic authenticity");
    expect(doc).toContain("n = 8");
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

  it("accepts simulated-learner context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 20 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "simulated-learner-construct-validity",
      "simulated-learner-validation-table",
      "simulated-learner-sample-size",
      "simulated-learner-confidence-interval",
      "simulated-learner-reliability-check",
      "simulated-learner-regression-threshold",
      "simulated-learner-metric-owner",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "simulated-learner-context-eval-agent",
        runId: "run-gap0727-simulated-learners-metric-validity",
        ts: Date.UTC(2026, 5, 21),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.94,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.87,
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
          facetId: `simulated-learner-${facetId}`,
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
          processEvidenceId: `simulated-learner-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index + 1]!],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "simulated-learner-context-score-predicts-authenticity-quality",
          aligned: true,
          evidenceRefs: ["simulated-learner-reliability-check", "simulated-learner-regression-threshold"],
        }],
        sourceRefs: [SOURCE, `doi:${DOI}`, `openalex:${OPENALEX}`],
        gateMode: "ci",
      },
      [
        prior("run-gap0727-baseline", Date.UTC(2026, 5, 7), 3),
        prior("run-gap0727-repeat", Date.UTC(2026, 5, 14), 3.01),
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
    expect(report.rows[0]?.interRaterAgreement).toBe(0.87);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([SOURCE, `doi:${DOI}`, `openalex:${OPENALEX}`]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when arXiv metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "simulated-learner-context-eval-agent",
      runId: "run-gap0727-metadata-only",
      ts: Date.UTC(2026, 5, 21),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.15,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-SIMULATED-LEARNER-EVAL-01", layerName }],
      sourceRefs: [SOURCE],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add simulated-learner identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("simulated_learners_metric_validity");
      expect(source).not.toContain(TITLE);
    }
  });
});
