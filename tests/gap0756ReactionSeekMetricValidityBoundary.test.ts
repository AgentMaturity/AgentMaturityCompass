import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0756-reactionseek-metric-validity.md";
const SOURCE = "https://www.nature.com/articles/s41467-026-70180-1";
const DOI = "10.1038/s41467-026-70180-1";
const OPENALEX = "W7133224213";
const TITLE = "ReactionSeek: LLM-powered literature data mining and knowledge discovery in organic synthesis";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.89): QuestionScore {
  return {
    questionId: `AMC-REACTIONSEEK-EVAL-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`reactionseek-metric-row-${index}`],
    flags: [],
    narrative: `ReactionSeek source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "reactionseek-context-eval-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 16).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `reactionseek-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `reactionseek-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 21),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0756 ReactionSeek metric-validity boundary", () => {
  it("documents live Nature metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0756");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Nature Communications");
    expect(doc).toContain("02 March 2026");
    expect(doc).toContain("article `3356`");
    expect(doc).toContain("Jiawei Li");
    expect(doc).toContain("Minzhou Li");
    expect(doc).toContain("Qi Yang");
    expect(doc).toContain("Sanzhong Luo");
    expect(doc).toContain("Cheminformatics");
    expect(doc).toContain("Organic chemistry");
    expect(doc).toContain("LLM-powered literature data mining");
    expect(doc).toContain("organic synthesis");
    expect(doc).toContain("cheminformatics tools");
    expect(doc).toContain("Organic Syntheses");
    expect(doc).toContain("95%");
    expect(doc).toContain("Synthetic Chatbot/SynChat");
    expect(doc).toContain("GLM-4V");
    expect(doc).toContain("InDraw");
    expect(doc).toContain("SMILES");
    expect(doc).toContain("OCSR");
    expect(doc).toContain("ChEMU");
    expect(doc).toContain("0.983");
    expect(doc).toContain("50` article benchmark");
    expect(doc).toContain("236` molecules");
    expect(doc).toContain("3103` Organic Syntheses articles");
    expect(doc).toContain("102` volumes");
    expect(doc).toContain("48` of `50`");
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

  it("accepts ReactionSeek context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 22 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "reactionseek-construct-validity",
      "reactionseek-validation-table",
      "reactionseek-sample-size",
      "reactionseek-confidence-interval",
      "reactionseek-reliability-check",
      "reactionseek-regression-threshold",
      "reactionseek-metric-owner",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "reactionseek-context-eval-agent",
        runId: "run-gap0756-reactionseek-metric-validity",
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
          facetId: `reactionseek-${facetId}`,
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
          processEvidenceId: `reactionseek-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index + 1]!],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "reactionseek-context-score-predicts-chemistry-data-mining-quality",
          aligned: true,
          evidenceRefs: ["reactionseek-reliability-check", "reactionseek-regression-threshold"],
        }],
        sourceRefs: [SOURCE, `doi:${DOI}`, `openalex:${OPENALEX}`],
        gateMode: "ci",
      },
      [
        prior("run-gap0756-baseline", Date.UTC(2026, 5, 7), 3),
        prior("run-gap0756-repeat", Date.UTC(2026, 5, 14), 3.01),
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
    expect(report.rows[0]?.interRaterAgreement).toBe(0.85);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([SOURCE, `doi:${DOI}`, `openalex:${OPENALEX}`]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when Nature metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "reactionseek-context-eval-agent",
      runId: "run-gap0756-metadata-only",
      ts: Date.UTC(2026, 5, 21),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.15,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-REACTIONSEEK-EVAL-01", layerName }],
      sourceRefs: [SOURCE],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add ReactionSeek identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("reactionseek_metric_validity");
      expect(source).not.toContain(TITLE);
    }
  });
});
