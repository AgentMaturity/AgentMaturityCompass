import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0687-mdcrow-metric-validity.md";
const DOI = "10.1088/2632-2153/ae4b07";
const OPENALEX = "W7131651590";
const ARXIV = "https://arxiv.org/abs/2502.09565";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Strategic Agent Operations";

function score(index: number, finalLevel = 3, confidence = 0.93): QuestionScore {
  return {
    questionId: `AMC-MDCROW-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`mdcrow-task-${index}`],
    flags: [],
    narrative: `MDCrow-style signed validation sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "mdcrow-style-md-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${index.toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `mdcrow-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `mdcrow-session-${index}`,
    ts: Date.UTC(2026, 5, 21),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0687 MDCrow metric-validity boundary", () => {
  it("documents live MDCrow metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0687");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain("MDCrow: Automating Molecular Dynamics Workflows with Large Language Models");
    expect(doc).toContain("Thu Feb 13 18:19:20 2025");
    expect(doc).toContain("March 22, 2026");
    expect(doc).toContain("40 expert-designed tools");
    expect(doc).toContain("25 tasks");
    expect(doc).toContain("1 and 10 subtasks");
    expect(doc).toContain("coefficient of variation");
    expect(doc).toContain("Spearman correlation");
    expect(doc).toContain("gpt-4o");
    expect(doc).toContain("llama3-405b");
    expect(doc).toContain("hallucinations");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing metric-validity receipts for MDCrow-style task robustness evidence", () => {
    const questionScores = Array.from({ length: 25 }, (_, index) => score(index + 1));
    const mdEvidenceIds = [
      "mdcrow-source-metadata-review",
      "mdcrow-25-task-manifest",
      "mdcrow-subtask-complexity-scale",
      "mdcrow-expert-evaluation-table",
      "mdcrow-robustness-cv-analysis",
      "mdcrow-ci-regression-receipt",
      "mdcrow-metric-owner",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...mdEvidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "mdcrow-style-md-agent",
        runId: "run-mdcrow-metric-validity",
        ts: Date.UTC(2026, 5, 21),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.91,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "source-metadata-review",
          "25-task-manifest",
          "subtask-complexity-scale",
          "expert-evaluation-table",
          "robustness-cv-analysis",
        ].map((facetId, index) => ({
          facetId: `mdcrow-${facetId}`,
          covered: true,
          evidenceRefs: [mdEvidenceIds[index]!],
        })),
        processEvidenceChecks: [
          "25-task-manifest",
          "subtask-complexity-scale",
          "expert-evaluation-table",
          "robustness-cv-analysis",
          "ci-regression-receipt",
          "metric-owner",
        ].map((processEvidenceId, index) => ({
          processEvidenceId: `mdcrow-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [mdEvidenceIds[index + 1]!],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "mdcrow-md-workflow-validity",
          aligned: true,
          evidenceRefs: ["mdcrow-expert-evaluation-table", "mdcrow-robustness-cv-analysis"],
        }],
        sourceRefs: [ARXIV, `doi:${DOI}`, `openalex:${OPENALEX}`],
        gateMode: "ci",
      },
      [
        prior("run-mdcrow-baseline", Date.UTC(2026, 5, 7), 3),
        prior("run-mdcrow-repeat", Date.UTC(2026, 5, 14), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 25,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.91);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([ARXIV, `doi:${DOI}`, `openalex:${OPENALEX}`]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when MDCrow metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "mdcrow-style-md-agent",
      runId: "run-mdcrow-metadata-only",
      ts: Date.UTC(2026, 5, 21),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.25,
      evidenceCoverage: 0.2,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-MDCROW-01", layerName }],
      sourceRefs: [ARXIV],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add MDCrow identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("MDCrow");
      expect(source).not.toContain("mdcrow_metric_validity");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
    }
  });
});
