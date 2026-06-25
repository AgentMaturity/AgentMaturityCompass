import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0011-weave-metric-validity.md";
const WEAVE = "https://wandb.ai/site/weave";
const WEAVE_CANONICAL = "https://wandb.ai/site/weave/";
const WEAVE_DOCS = "https://docs.wandb.ai/weave";
const WEAVE_EVAL_DOCS = "https://docs.wandb.ai/weave/tutorial-eval";
const TITLE = "Weights & Biases Weave";
const IDENTIFIER = "weave_metric_validity";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/runner.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-WEAVE-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`weave-metric-row-${index}`],
    flags: [],
    narrative: `Weave evaluation context is bounded to AMC metric-validity sample ${index}.`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "weave-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 5).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `weave-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `weave-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 25),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0011 W&B Weave metric-validity boundary", () => {
  it("documents live Weave metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0011");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(WEAVE);
    expect(doc).toContain(WEAVE_CANONICAL);
    expect(doc).toContain(WEAVE_DOCS);
    expect(doc).toContain(WEAVE_EVAL_DOCS);
    expect(doc).toContain("observability and evaluation platform");
    expect(doc).toContain("production agents");
    expect(doc).toContain("custom scorers");
    expect(doc).toContain("datasets");
    expect(doc).toContain("regressions");
    expect(doc).toContain("validation table");
    expect(doc).toContain("confidence interval");
    expect(doc).toContain("sample size");
    expect(doc).toContain("metric owner");
    expect(doc).toContain("reproducible eval pack");
    expect(doc).toContain("signed evidence refs");
    expect(doc).toContain("CI/lifecycle gate");
    expect(doc).toContain("metadata-only Weave evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts Weave context only through signed metric-validity eval-pack receipts", () => {
    const questionScores = Array.from({ length: 30 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "weave-validation-table",
      "weave-sample-size",
      "weave-confidence-interval",
      "weave-construct-validity",
      "weave-inter-rater-reliability",
      "weave-test-retest-stability",
      "weave-dataset-version",
      "weave-scorer-configuration",
      "weave-trace-evaluation",
      "weave-metric-owner",
      "weave-regression-threshold",
      "weave-production-outcome",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];
    const sourceRefs = [WEAVE, WEAVE_CANONICAL, WEAVE_DOCS, WEAVE_EVAL_DOCS];

    const report = buildMetricValidationReport(
      {
        agentId: "weave-context-agent",
        runId: "run-gap0011-weave-metric-validity",
        ts: Date.UTC(2026, 5, 25),
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
          averageJudgeAgreement: 0.9,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "construct-validity",
          "inter-rater-reliability",
          "test-retest-stability",
          "dataset-version",
          "scorer-configuration",
          "trace-evaluation",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `weave-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index + 3]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "weave-validation-table"],
          ["sample-size", "weave-sample-size"],
          ["confidence-interval", "weave-confidence-interval"],
          ["metric-owner", "weave-metric-owner"],
          ["regression-threshold", "weave-regression-threshold"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `weave-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "weave-production-agent-reliability",
          aligned: true,
          evidenceRefs: [
            "weave-trace-evaluation",
            "weave-scorer-configuration",
            "weave-production-outcome",
          ],
        }],
        sourceRefs,
        gateMode: "ci",
      },
      [
        prior("run-gap0011-baseline", Date.UTC(2026, 5, 11), 3),
        prior("run-gap0011-repeat", Date.UTC(2026, 5, 18), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      owner: "AMC Score",
      sampleSize: 30,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.9);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual(sourceRefs);
    expect(report.evalPack.datasetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.evalPack.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.evalPack.rows[0]?.signedEvidenceRefs.length).toBeGreaterThan(0);
    expect(report.ciGate).toMatchObject({ mode: "ci", passed: true, failClosed: false });
  });

  it("fails closed when Weave metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "weave-context-agent",
      runId: "run-gap0011-weave-metadata-only",
      ts: Date.UTC(2026, 5, 25),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.22,
      evidenceCoverage: 0.1,
      correlationRatio: 0.2,
      unsupportedClaimCount: 9,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-WEAVE-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "Weave product and docs metadata cannot prove AMC metric validity.",
        },
      ],
      confidenceSummary: {
        lowConfidenceFindings: 1,
        highUncertaintyFindings: 1,
        downgradedFindings: 1,
        autoFixBlockedRecommendations: 0,
        averageEvidenceSufficiency: 0.2,
        averageJudgeAgreement: 0.2,
      },
      questions: [{ id: "AMC-WEAVE-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "weave-product-page-label",
        "weave-docs-navigation-label",
        "weave-scorer-marketing-label",
      ].map((facetId) => ({
        facetId,
        covered: false,
        evidenceRefs: [],
      })),
      processEvidenceChecks: [
        "weave-validation-table",
        "weave-sample-size",
        "weave-confidence-interval",
        "weave-metric-owner",
      ].map((processEvidenceId) => ({
        processEvidenceId,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "weave-production-agent-reliability",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [WEAVE, WEAVE_CANONICAL, WEAVE_DOCS, WEAVE_EVAL_DOCS],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      validationFacetCoverage: 0,
      processEvidenceCoverage: 0,
      outcomeAlignment: 0,
      sampleSize: 1,
    });
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate).toMatchObject({ mode: "ci", passed: false, failClosed: true });
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
    expect(report.warnings.join(" ")).toContain("sample size");
    expect(report.warnings.join(" ")).toContain("construct validity");
  });

  it("keeps the Weave source-review boundary out of generic implementation files", () => {
    for (const filePath of implementationFiles) {
      const source = readFileSync(filePath, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(WEAVE);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("COMP-007");
      expect(source).not.toContain("wandb_weave_metric_validity");
    }
  });
});
