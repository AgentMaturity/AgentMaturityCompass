import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0736-planner-centric-metric-validity.md";
const ARXIV = "https://arxiv.org/abs/2511.10037";
const DOI = "10.1609/aaai.v40i40.40676";
const ARXIV_DOI = "10.48550/arxiv.2511.10037";
const OPENALEX = "W7139107105";
const TITLE = "Beyond ReAct: A Planner-Centric Framework for Complex Tool-Augmented LLM Reasoning";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.88): QuestionScore {
  return {
    questionId: `AMC-PLANNER-EVAL-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`planner-centric-metric-row-${index}`],
    flags: [],
    narrative: `Planner-centric source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "planner-centric-context-eval-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 16).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `planner-centric-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `planner-centric-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 21),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0736 planner-centric metric-validity boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0736");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ARXIV_DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Zhiqing Sun");
    expect(doc).toContain("Sheng Shen");
    expect(doc).toContain("Jinhui Yuan");
    expect(doc).toContain("Fei Liu");
    expect(doc).toContain("Hai Zhao");
    expect(doc).toContain("2025-11-13");
    expect(doc).toContain("planner-centric");
    expect(doc).toContain("Plan-and-Execute");
    expect(doc).toContain("directed acyclic graph");
    expect(doc).toContain("ComplexTool-Plan");
    expect(doc).toContain("SFT");
    expect(doc).toContain("GRPO");
    expect(doc).toContain("StableToolBench");
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

  it("accepts planner-centric context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 20 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "planner-construct-validity",
      "planner-validation-table",
      "planner-sample-size",
      "planner-confidence-interval",
      "planner-reliability-check",
      "planner-regression-threshold",
      "planner-metric-owner",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "planner-centric-context-eval-agent",
        runId: "run-gap0736-planner-centric-metric-validity",
        ts: Date.UTC(2026, 5, 21),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.93,
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
          facetId: `planner-${facetId}`,
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
          processEvidenceId: `planner-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index + 1]!],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "planner-context-score-predicts-tool-reasoning-quality",
          aligned: true,
          evidenceRefs: ["planner-reliability-check", "planner-regression-threshold"],
        }],
        sourceRefs: [ARXIV, `doi:${DOI}`, `doi:${ARXIV_DOI}`, `openalex:${OPENALEX}`],
        gateMode: "ci",
      },
      [
        prior("run-gap0736-baseline", Date.UTC(2026, 5, 7), 3),
        prior("run-gap0736-repeat", Date.UTC(2026, 5, 14), 3.01),
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
    expect(report.evalPack.sourceRefs).toEqual([ARXIV, `doi:${DOI}`, `doi:${ARXIV_DOI}`, `openalex:${OPENALEX}`]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when paper metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "planner-centric-context-eval-agent",
      runId: "run-gap0736-metadata-only",
      ts: Date.UTC(2026, 5, 21),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.15,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-PLANNER-EVAL-01", layerName }],
      sourceRefs: [ARXIV],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add planner-centric identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("planner_centric_metric_validity");
      expect(source).not.toContain(TITLE);
    }
  });
});
