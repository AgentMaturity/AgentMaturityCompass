import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0767-ai-penetration-testing-metric-validity.md";
const REPO = "https://github.com/Mr-Infect/AI-penetration-testing";
const README = "https://github.com/Mr-Infect/AI-penetration-testing/blob/main/README.md";
const TITLE = "Mr-Infect/AI-penetration-testing";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.88): QuestionScore {
  return {
    questionId: `AMC-AI-PENTEST-EVAL-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`ai-pentest-metric-row-${index}`],
    flags: [],
    narrative: `AI penetration-testing source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "ai-pentest-context-eval-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 17).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `ai-pentest-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `ai-pentest-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 21),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0767 AI penetration-testing metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0767");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("GitHub connector fetch");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("404");
    expect(doc).toContain("AI, ML, and LLM penetration-testing toolkit");
    expect(doc).toContain("prompt injection");
    expect(doc).toContain("LLM security");
    expect(doc).toContain("red-team AI");
    expect(doc).toContain("sensitive information leakage");
    expect(doc).toContain("vector-store attacks");
    expect(doc).toContain("retrieval manipulation");
    expect(doc).toContain("model-weight poisoning");
    expect(doc).toContain("data supply-chain attacks");
    expect(doc).toContain("plugin abuse");
    expect(doc).toContain("OWASP LLM Top 10");
    expect(doc).toContain("MITRE ATLAS");
    expect(doc).toContain("Lakera Gandalf");
    expect(doc).toContain("AI Goat");
    expect(doc).toContain("PromptTrace");
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

  it("accepts AI-pentest context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 18 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "ai-pentest-construct-validity",
      "ai-pentest-validation-table",
      "ai-pentest-sample-size",
      "ai-pentest-confidence-interval",
      "ai-pentest-reliability-check",
      "ai-pentest-regression-threshold",
      "ai-pentest-metric-owner",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "ai-pentest-context-eval-agent",
        runId: "run-gap0767-ai-pentest-metric-validity",
        ts: Date.UTC(2026, 5, 21),
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
          facetId: `ai-pentest-${facetId}`,
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
          processEvidenceId: `ai-pentest-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index + 1]!],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "ai-pentest-context-score-predicts-red-team-measurement-quality",
          aligned: true,
          evidenceRefs: ["ai-pentest-reliability-check", "ai-pentest-regression-threshold"],
        }],
        sourceRefs: [REPO, README],
        gateMode: "ci",
      },
      [
        prior("run-gap0767-baseline", Date.UTC(2026, 5, 7), 3),
        prior("run-gap0767-repeat", Date.UTC(2026, 5, 14), 3.02),
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
    expect(report.rows[0]?.interRaterAgreement).toBe(0.84);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([REPO, README]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when GitHub metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "ai-pentest-context-eval-agent",
      runId: "run-gap0767-metadata-only",
      ts: Date.UTC(2026, 5, 21),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.22,
      evidenceCoverage: 0.14,
      correlationRatio: 0.18,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-AI-PENTEST-EVAL-01", layerName }],
      sourceRefs: [REPO],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add AI penetration-testing identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("AI-penetration-testing");
      expect(source).not.toContain("ai_pentest_metric_validity");
      expect(source).not.toContain("prompt-injection payload library");
    }
  });
});
