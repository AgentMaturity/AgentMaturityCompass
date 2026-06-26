import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0773-llamator-metric-validity.md";
const REPO = "https://github.com/LLAMATOR-Core/llamator";
const README = "https://github.com/LLAMATOR-Core/llamator/blob/release/README.md";
const TITLE = "LLAMATOR-Core/llamator";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.89): QuestionScore {
  return {
    questionId: `AMC-LLAMATOR-EVAL-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`llamator-metric-row-${index}`],
    flags: [],
    narrative: `LLAMATOR source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "llamator-context-eval-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 19).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `llamator-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `llamator-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 21),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0773 LLAMATOR metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0773");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("default branch `release`");
    expect(doc).toContain("LICENSE` path returned 404");
    expect(doc).toContain("LICENSE.md");
    expect(doc).toContain("red-teaming Python framework");
    expect(doc).toContain("pip install llamator==3.5.0");
    expect(doc).toContain("RAG bot testing");
    expect(doc).toContain("Gandalf web bot testing");
    expect(doc).toContain("Telegram bot testing");
    expect(doc).toContain("WhatsApp bot testing");
    expect(doc).toContain("LangChain custom attacks");
    expect(doc).toContain("vision model attacks");
    expect(doc).toContain("OpenAI-like APIs");
    expect(doc).toContain("custom attacks and datasets");
    expect(doc).toContain("Excel/CSV");
    expect(doc).toContain("DOCX test reports");
    expect(doc).toContain("OWASP prompt injection/jailbreaks");
    expect(doc).toContain("Bandit");
    expect(doc).toContain("Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International");
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

  it("accepts LLAMATOR context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 18 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "llamator-construct-validity",
      "llamator-validation-table",
      "llamator-sample-size",
      "llamator-confidence-interval",
      "llamator-reliability-check",
      "llamator-regression-threshold",
      "llamator-metric-owner",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "llamator-context-eval-agent",
        runId: "run-gap0773-llamator-metric-validity",
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
          averageJudgeAgreement: 0.85,
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
          facetId: `llamator-${facetId}`,
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
          processEvidenceId: `llamator-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index + 1]!],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "llamator-context-score-predicts-red-team-measurement-quality",
          aligned: true,
          evidenceRefs: ["llamator-reliability-check", "llamator-regression-threshold"],
        }],
        sourceRefs: [REPO, README],
        gateMode: "ci",
      },
      [
        prior("run-gap0773-baseline", Date.UTC(2026, 5, 7), 3),
        prior("run-gap0773-repeat", Date.UTC(2026, 5, 14), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 18,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.85);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([REPO, README]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when LLAMATOR metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "llamator-context-eval-agent",
      runId: "run-gap0773-metadata-only",
      ts: Date.UTC(2026, 5, 21),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.22,
      evidenceCoverage: 0.14,
      correlationRatio: 0.19,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-LLAMATOR-EVAL-01", layerName }],
      sourceRefs: [REPO],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add LLAMATOR identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("LLAMATOR-Core/llamator");
      expect(source).not.toContain("llamator_metric_validity");
      expect(source).not.toContain("llamator==3.5.0");
    }
  });
});
