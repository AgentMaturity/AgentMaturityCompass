import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0886-mosaic-metric-validity.md";
const REPO = "Abdulhamid97Mousa/MOSAIC";
const URL = "https://github.com/Abdulhamid97Mousa/MOSAIC";
const TITLE = "MOSAIC";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.88): QuestionScore {
  return {
    questionId: `AMC-MOSAIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`mosaic-metric-row-${index}`],
    flags: [],
    narrative: `MOSAIC source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "mosaic-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 586).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `mosaic-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `mosaic-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 22),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0886 MOSAIC metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0886");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 24");
    expect(doc).toContain("Fork 4");
    expect(doc).toContain("Issues 2");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("65 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 99.6%");
    expect(doc).toContain("Other 0.4%");
    expect(doc).toContain(".factory");
    expect(doc).toContain(".github/ workflows");
    expect(doc).toContain("3rd_party");
    expect(doc).toContain("experiments/ operator_configs");
    expect(doc).toContain("gym_gui");
    expect(doc).toContain("metadata");
    expect(doc).toContain("requirements");
    expect(doc).toContain("tools");
    expect(doc).toContain("var");
    expect(doc).toContain(".env.example");
    expect(doc).toContain("run_client.sh");
    expect(doc).toContain("run_malmo.sh");
    expect(doc).toContain("setup_malmo.sh");
    expect(doc).toContain("RL, LLM, VLM, and human decision-makers");
    expect(doc).toContain("Two Evaluation Modes");
    expect(doc).toContain("Manual Mode");
    expect(doc).toContain("Script Mode");
    expect(doc).toContain("shared seeds");
    expect(doc).toContain("deterministic seed sequences");
    expect(doc).toContain("JSONL");
    expect(doc).toContain("Heterogeneous Agent Mixing");
    expect(doc).toContain("Resource Management & Quotas");
    expect(doc).toContain("PolicyMappingService");
    expect(doc).toContain("FastLane");
    expect(doc).toContain("MOSAIC MultiGrid");
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

  it("accepts MOSAIC context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 18 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "mosaic-cross-paradigm-coverage",
      "mosaic-validation-table",
      "mosaic-sample-size",
      "mosaic-confidence-interval",
      "mosaic-reliability-check",
      "mosaic-regression-threshold",
      "mosaic-metric-owner",
      "mosaic-seed-reproducibility-alignment",
      "mosaic-human-ai-outcome-alignment",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "mosaic-context-agent",
        runId: "run-gap0886-mosaic-metric-validity",
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
          "cross-paradigm-coverage",
          "shared-seed-reproducibility",
          "heterogeneous-agent-comparison",
          "human-ai-collaboration-fit",
          "telemetry-log-reliability",
        ].map((facetId, index) => ({
          facetId: `mosaic-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "mosaic-validation-table"],
          ["sample-size", "mosaic-sample-size"],
          ["confidence-interval", "mosaic-confidence-interval"],
          ["reliability-check", "mosaic-reliability-check"],
          ["regression-threshold", "mosaic-regression-threshold"],
          ["metric-owner", "mosaic-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `mosaic-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "mosaic-score-predicts-cross-paradigm-agent-evaluation-reliability",
          aligned: true,
          evidenceRefs: ["mosaic-seed-reproducibility-alignment", "mosaic-human-ai-outcome-alignment"],
        }],
        sourceRefs: [URL],
        gateMode: "ci",
      },
      [
        prior("run-gap0886-baseline", Date.UTC(2026, 5, 8), 3),
        prior("run-gap0886-repeat", Date.UTC(2026, 5, 15), 3.02),
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
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([URL]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when MOSAIC metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "mosaic-context-agent",
      runId: "run-gap0886-metadata-only",
      ts: Date.UTC(2026, 5, 22),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.1,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-MOSAIC-01", layerName }],
      sourceRefs: [URL],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add MOSAIC identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("mosaic_metric_validity");
      expect(source).not.toContain("MOSAIC: A Unified Platform");
    }
  });
});
