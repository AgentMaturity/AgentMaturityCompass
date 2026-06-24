import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0820-raga-llm-hub-metric-validity.md";
const REPO = "raga-ai-hub/raga-llm-hub";
const URL = "https://github.com/raga-ai-hub/raga-llm-hub";
const TITLE = "Raga LLM Hub";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.92): QuestionScore {
  return {
    questionId: `AMC-RAGA-LLM-HUB-EVAL-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`raga-llm-hub-metric-row-${index}`],
    flags: [],
    narrative: `Raga LLM Hub source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "raga-llm-hub-context-eval-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 113).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `raga-llm-hub-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `raga-llm-hub-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 21),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0820 Raga LLM Hub metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0820");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("Attribution-NonCommercial-NoDerivatives 4.0 International");
    expect(doc).toContain("over 100 meticulously designed metrics");
    expect(doc).toContain("Relevance & Understanding");
    expect(doc).toContain("Content Quality");
    expect(doc).toContain("Hallucination");
    expect(doc).toContain("Safety & Bias");
    expect(doc).toContain("Context Relevance");
    expect(doc).toContain("Guardrails");
    expect(doc).toContain("Vulnerability scanning");
    expect(doc).toContain("Metric-Based Tests");
    expect(doc).toContain("entire RAG pipeline");
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

  it("accepts Raga LLM Hub context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 22 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "raga-construct-validity",
      "raga-validation-table",
      "raga-sample-size",
      "raga-confidence-interval",
      "raga-reliability-check",
      "raga-regression-threshold",
      "raga-metric-owner",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "raga-llm-hub-context-eval-agent",
        runId: "run-gap0820-raga-metric-validity",
        ts: Date.UTC(2026, 5, 21),
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
          facetId: `raga-${facetId}`,
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
          processEvidenceId: `raga-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index + 1]!],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "raga-score-predicts-llm-eval-quality",
          aligned: true,
          evidenceRefs: ["raga-reliability-check", "raga-regression-threshold"],
        }],
        sourceRefs: [URL, `github:${REPO}`],
        gateMode: "ci",
      },
      [
        prior("run-gap0820-baseline", Date.UTC(2026, 5, 7), 3),
        prior("run-gap0820-repeat", Date.UTC(2026, 5, 14), 3.01),
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
    expect(report.rows[0]?.interRaterAgreement).toBe(0.86);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([URL, `github:${REPO}`]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when repository metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "raga-llm-hub-context-eval-agent",
      runId: "run-gap0820-metadata-only",
      ts: Date.UTC(2026, 5, 21),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.12,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-RAGA-LLM-HUB-EVAL-01", layerName }],
      sourceRefs: [URL],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add Raga LLM Hub identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("raga_llm_hub_metric_validity");
      expect(source).not.toContain(TITLE);
    }
  });
});
