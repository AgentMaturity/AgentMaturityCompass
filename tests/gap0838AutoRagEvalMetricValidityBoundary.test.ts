import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0838-auto-rag-eval-metric-validity.md";
const REPO = "amazon-science/auto-rag-eval";
const URL = "https://github.com/amazon-science/auto-rag-eval";
const ARXIV = "https://arxiv.org/abs/2405.13622";
const TITLE = "Automated Evaluation of Retrieval-Augmented Language Models with Task-Specific Exam Generation";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-AUTO-RAG-EVAL-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`auto-rag-eval-metric-row-${index}`],
    flags: [],
    narrative: `Auto-RAG-Eval source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "auto-rag-eval-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 239).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `auto-rag-eval-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `auto-rag-eval-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 21),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0838 Auto-RAG-Eval metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0838");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("api.github.com DNS lookup failed");
    expect(doc).toContain("ICML 2024");
    expect(doc).toContain("task-specific exam generation");
    expect(doc).toContain("RAG system evaluation");
    expect(doc).toContain("Bedrock");
    expect(doc).toContain("Claude");
    expect(doc).toContain("lm-harness");
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

  it("accepts Auto-RAG-Eval context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 20 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "auto-rag-eval-construct-validity",
      "auto-rag-eval-validation-table",
      "auto-rag-eval-sample-size",
      "auto-rag-eval-confidence-interval",
      "auto-rag-eval-reliability-check",
      "auto-rag-eval-regression-threshold",
      "auto-rag-eval-metric-owner",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "auto-rag-eval-context-agent",
        runId: "run-gap0838-auto-rag-eval-metric-validity",
        ts: Date.UTC(2026, 5, 21),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.87,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.84,
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
          facetId: `auto-rag-eval-${facetId}`,
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
          processEvidenceId: `auto-rag-eval-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index + 1]!],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "auto-rag-eval-score-predicts-rag-evaluation-quality",
          aligned: true,
          evidenceRefs: ["auto-rag-eval-reliability-check", "auto-rag-eval-regression-threshold"],
        }],
        sourceRefs: [URL, ARXIV],
        gateMode: "ci",
      },
      [
        prior("run-gap0838-baseline", Date.UTC(2026, 5, 7), 3),
        prior("run-gap0838-repeat", Date.UTC(2026, 5, 14), 3.01),
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
    expect(report.rows[0]?.interRaterAgreement).toBe(0.84);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([URL, ARXIV]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when source metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "auto-rag-eval-context-agent",
      runId: "run-gap0838-metadata-only",
      ts: Date.UTC(2026, 5, 21),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.12,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-AUTO-RAG-EVAL-01", layerName }],
      sourceRefs: [URL],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add Auto-RAG-Eval identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("auto_rag_eval_metric_validity");
      expect(source).not.toContain(TITLE);
    }
  });
});
