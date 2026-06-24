import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0691-anthropic-console-evals-metric-validity.md";
const SOURCE = "https://platform.claude.com/docs/en/test-and-evaluate/eval-tool";
const DEVELOP_TESTS = "https://platform.claude.com/docs/en/test-and-evaluate/develop-tests";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.92): QuestionScore {
  return {
    questionId: `AMC-ANTHROPIC-EVAL-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`anthropic-console-eval-row-${index}`],
    flags: [],
    narrative: `Anthropic Console-style eval validation sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "anthropic-console-style-eval-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 4).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `anthropic-console-eval-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `anthropic-console-eval-session-${index}`,
    ts: Date.UTC(2026, 5, 21),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0691 Anthropic Console Evals metric-validity boundary", () => {
  it("documents live Anthropic eval metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0691");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(DEVELOP_TESTS);
    expect(doc).toContain("Using the Evaluation Tool");
    expect(doc).toContain("Define success criteria and build evaluations");
    expect(doc).toContain("Claude Console");
    expect(doc).toContain("Evaluate tab");
    expect(doc).toContain("{{variable}}");
    expect(doc).toContain("Generate Test Case");
    expect(doc).toContain("Import test cases from a CSV file");
    expect(doc).toContain("Side-by-side comparison");
    expect(doc).toContain("Quality grading");
    expect(doc).toContain("5-point scale");
    expect(doc).toContain("Prompt versioning");
    expect(doc).toContain("task-specific");
    expect(doc).toContain("automated grading");
    expect(doc).toContain("code-based grading");
    expect(doc).toContain("LLM-based grading");
    expect(doc).toContain("detailed, clear rubrics");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing metric-validity receipts for Console-style eval reliability evidence", () => {
    const questionScores = Array.from({ length: 18 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "anthropic-eval-success-criteria",
      "anthropic-eval-task-specific-row-manifest",
      "anthropic-eval-rubric-coverage",
      "anthropic-eval-grader-reliability-check",
      "anthropic-eval-prompt-version-comparison",
      "anthropic-eval-ci-regression-receipt",
      "anthropic-eval-metric-owner",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "anthropic-console-style-eval-agent",
        runId: "run-anthropic-console-evals-metric-validity",
        ts: Date.UTC(2026, 5, 21),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.96,
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
          "success-criteria",
          "task-specific-row-manifest",
          "rubric-coverage",
          "grader-reliability-check",
          "prompt-version-comparison",
        ].map((facetId, index) => ({
          facetId: `anthropic-console-evals-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          "task-specific-row-manifest",
          "rubric-coverage",
          "grader-reliability-check",
          "prompt-version-comparison",
          "ci-regression-receipt",
          "metric-owner",
        ].map((processEvidenceId, index) => ({
          processEvidenceId: `anthropic-console-evals-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index + 1]!],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "anthropic-console-evals-score-predicts-real-quality",
          aligned: true,
          evidenceRefs: ["anthropic-eval-grader-reliability-check", "anthropic-eval-prompt-version-comparison"],
        }],
        sourceRefs: [SOURCE, DEVELOP_TESTS],
        gateMode: "ci",
      },
      [
        prior("run-anthropic-console-evals-baseline", Date.UTC(2026, 5, 7), 3),
        prior("run-anthropic-console-evals-repeat", Date.UTC(2026, 5, 14), 3.02),
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
    expect(report.rows[0]?.interRaterAgreement).toBe(0.9);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([SOURCE, DEVELOP_TESTS]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when Anthropic docs metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "anthropic-console-style-eval-agent",
      runId: "run-anthropic-console-evals-metadata-only",
      ts: Date.UTC(2026, 5, 21),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.15,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-ANTHROPIC-EVAL-01", layerName }],
      sourceRefs: [SOURCE],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add Anthropic Console identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Anthropic Console Evals");
      expect(source).not.toContain("anthropic_console_evals");
      expect(source).not.toContain("Claude Console");
      expect(source).not.toContain(SOURCE);
    }
  });
});
