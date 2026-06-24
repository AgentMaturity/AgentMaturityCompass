import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0882-self-care-metric-validity.md";
const REPO = "Not-Diamond/self-care";
const URL = "https://github.com/Not-Diamond/self-care";
const TITLE = "Self-Care";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.88): QuestionScore {
  return {
    questionId: `AMC-SELF-CARE-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`self-care-metric-row-${index}`],
    flags: [],
    narrative: `Self-Care source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "self-care-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 582).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `self-care-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `self-care-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 22),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0882 Self-Care metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0882");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 27");
    expect(doc).toContain("Fork 0");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("22 Commits");
    expect(doc).toContain("17 releases");
    expect(doc).toContain("v0.0.17");
    expect(doc).toContain("JavaScript 93.0%");
    expect(doc).toContain("Shell 7.0%");
    expect(doc).toContain(".claude-plugin");
    expect(doc).toContain(".github");
    expect(doc).toContain("agents");
    expect(doc).toContain("commands");
    expect(doc).toContain("lib");
    expect(doc).toContain("scripts");
    expect(doc).toContain("CODE_OF_CONDUCT.md");
    expect(doc).toContain("CONTRIBUTING.md");
    expect(doc).toContain("SECURITY.md");
    expect(doc).toContain("Claude Code");
    expect(doc).toContain("LangSmith");
    expect(doc).toContain("LangFuse");
    expect(doc).toContain("OTEL-format");
    expect(doc).toContain("trace JSON");
    expect(doc).toContain("14 specialized detection skills");
    expect(doc).toContain("Goal Drift");
    expect(doc).toContain("Grounding");
    expect(doc).toContain("Missed Action");
    expect(doc).toContain("Guardrail Violation");
    expect(doc).toContain("auto-remediation");
    expect(doc).toContain("continuous monitoring");
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

  it("accepts Self-Care context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 16 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "self-care-trace-analysis-coverage",
      "self-care-validation-table",
      "self-care-sample-size",
      "self-care-confidence-interval",
      "self-care-reliability-check",
      "self-care-regression-threshold",
      "self-care-metric-owner",
      "self-care-detector-alignment",
      "self-care-remediation-quality-alignment",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "self-care-context-agent",
        runId: "run-gap0882-self-care-metric-validity",
        ts: Date.UTC(2026, 5, 22),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.86,
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
          "trace-analysis-coverage",
          "detector-consistency",
          "context-remediation-fit",
          "guardrail-violation-alignment",
          "continuous-monitoring-stability",
        ].map((facetId, index) => ({
          facetId: `self-care-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "self-care-validation-table"],
          ["sample-size", "self-care-sample-size"],
          ["confidence-interval", "self-care-confidence-interval"],
          ["reliability-check", "self-care-reliability-check"],
          ["regression-threshold", "self-care-regression-threshold"],
          ["metric-owner", "self-care-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `self-care-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "self-care-score-predicts-agent-trace-quality-and-remediation-reliability",
          aligned: true,
          evidenceRefs: ["self-care-detector-alignment", "self-care-remediation-quality-alignment"],
        }],
        sourceRefs: [URL],
        gateMode: "ci",
      },
      [
        prior("run-gap0882-baseline", Date.UTC(2026, 5, 8), 3),
        prior("run-gap0882-repeat", Date.UTC(2026, 5, 15), 3.02),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 16,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.84);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([URL]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when Self-Care metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "self-care-context-agent",
      runId: "run-gap0882-metadata-only",
      ts: Date.UTC(2026, 5, 22),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.1,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-SELF-CARE-01", layerName }],
      sourceRefs: [URL],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add Self-Care identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("self_care_metric_validity");
      expect(source).not.toContain(TITLE);
    }
  });
});
