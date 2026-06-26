import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0815-frfp-trading-metric-validity.md";
const DOI = "10.5281/zenodo.20481443";
const ZENODO_RECORD = "20481444";
const OPENALEX = "W7162947222";
const TITLE = "FRFP Governance Improves LLM Trading Agents: A Lean-Formalized, Shared-Window Evaluation";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-FRFP-EVAL-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`frfp-metric-row-${index}`],
    flags: [],
    narrative: `FRFP source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "frfp-context-eval-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 101).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `frfp-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `frfp-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 21),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0815 FRFP trading metric-validity boundary", () => {
  it("documents the FRFP DOI alias and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0815");
    expect(doc).toContain(DOI);
    expect(doc).toContain(ZENODO_RECORD);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("same live source reviewed for GAP-0814");
    expect(doc).toContain("DOI returned HTTP 302");
    expect(doc).toContain("/records/20481444");
    expect(doc).toContain("OpenAlex API HEAD returned HTTP 200");
    expect(doc).toContain("FRFP-based Human-AI protocol");
    expect(doc).toContain("multi-agent trading workflow");
    expect(doc).toContain("matched infrastructure and scoring");
    expect(doc).toContain("shared-window evaluation");
    expect(doc).toContain("Lean-Formalized");
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

  it("accepts FRFP trading context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 19 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "frfp-construct-validity",
      "frfp-validation-table",
      "frfp-sample-size",
      "frfp-confidence-interval",
      "frfp-reliability-check",
      "frfp-regression-threshold",
      "frfp-metric-owner",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "frfp-context-eval-agent",
        runId: "run-gap0815-frfp-metric-validity",
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
          facetId: `frfp-${facetId}`,
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
          processEvidenceId: `frfp-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index + 1]!],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "frfp-score-predicts-trading-governance-eval-quality",
          aligned: true,
          evidenceRefs: ["frfp-reliability-check", "frfp-regression-threshold"],
        }],
        sourceRefs: [`https://doi.org/${DOI}`, `https://zenodo.org/records/${ZENODO_RECORD}`, `openalex:${OPENALEX}`],
        gateMode: "ci",
      },
      [
        prior("run-gap0815-baseline", Date.UTC(2026, 5, 7), 3),
        prior("run-gap0815-repeat", Date.UTC(2026, 5, 14), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 19,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.85);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([
      `https://doi.org/${DOI}`,
      `https://zenodo.org/records/${ZENODO_RECORD}`,
      `openalex:${OPENALEX}`,
    ]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when FRFP metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "frfp-context-eval-agent",
      runId: "run-gap0815-metadata-only",
      ts: Date.UTC(2026, 5, 21),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.12,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-FRFP-EVAL-01", layerName }],
      sourceRefs: [`https://doi.org/${DOI}`],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add FRFP trading identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("frfp_trading_metric_validity");
      expect(source).not.toContain(TITLE);
    }
  });
});
