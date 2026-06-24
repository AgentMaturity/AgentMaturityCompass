import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0970-openai-evals-metric-validity.md";
const SOURCE = "https://github.com/openai/evals";
const DOCS = "https://github.com/openai/evals/tree/main/docs";
const RUN_EVALS = "https://github.com/openai/evals/blob/main/docs/run-evals.md";
const EVAL_TEMPLATES = "https://github.com/openai/evals/blob/main/docs/eval-templates.md";
const COMPLETION_FNS = "https://github.com/openai/evals/blob/main/docs/completion-fns.md";
const OPENAI_EVALS_GUIDE = "https://developers.openai.com/api/docs/guides/evals";
const TITLE = "OpenAI Evals";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.91): QuestionScore {
  return {
    questionId: `AMC-OPENAI-EVALS-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`openai-evals-metric-row-${index}`],
    flags: [],
    narrative: `OpenAI Evals context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "openai-evals-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 970).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `openai-evals-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `openai-evals-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 22),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0970 OpenAI Evals metric-validity boundary", () => {
  it("documents live OpenAI Evals metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0970");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(RUN_EVALS);
    expect(doc).toContain(EVAL_TEMPLATES);
    expect(doc).toContain(COMPLETION_FNS);
    expect(doc).toContain(OPENAI_EVALS_GUIDE);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("18.7k stars");
    expect(doc).toContain("3k forks");
    expect(doc).toContain("125 issues");
    expect(doc).toContain("85 pull requests");
    expect(doc).toContain("691 commits");
    expect(doc).toContain("Python 89.4%");
    expect(doc).toContain("OpenAI Dashboard");
    expect(doc).toContain("framework for evaluating LLMs and LLM systems");
    expect(doc).toContain("open-source registry of benchmarks");
    expect(doc).toContain("private evals");
    expect(doc).toContain("Git-LFS");
    expect(doc).toContain("run existing evals");
    expect(doc).toContain("eval templates");
    expect(doc).toContain("Completion Function Protocol");
    expect(doc).toContain("Snowflake");
    expect(doc).toContain("custom eval logic");
    expect(doc).toContain("model-graded YAML");
    expect(doc).toContain("MIT license");
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

  it("accepts OpenAI Evals context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 25 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "openai-evals-validation-table",
      "openai-evals-sample-size",
      "openai-evals-confidence-interval",
      "openai-evals-reliability-check",
      "openai-evals-regression-threshold",
      "openai-evals-metric-owner",
      "openai-evals-registry-proof",
      "openai-evals-template-proof",
      "openai-evals-private-eval-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "openai-evals-context-agent",
        runId: "run-gap0970-openai-evals-metric-validity",
        ts: Date.UTC(2026, 5, 22),
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
          averageJudgeAgreement: 0.87,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "construct-validity",
          "inter-rater-reliability",
          "test-retest-stability",
          "registry-repeatability",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `openai-evals-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "openai-evals-validation-table"],
          ["sample-size", "openai-evals-sample-size"],
          ["confidence-interval", "openai-evals-confidence-interval"],
          ["reliability-check", "openai-evals-reliability-check"],
          ["regression-threshold", "openai-evals-regression-threshold"],
          ["metric-owner", "openai-evals-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `openai-evals-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "openai-evals-score-predicts-agent-evaluation-quality",
          aligned: true,
          evidenceRefs: [
            "openai-evals-registry-proof",
            "openai-evals-template-proof",
            "openai-evals-private-eval-proof",
          ],
        }],
        sourceRefs: [SOURCE, DOCS, RUN_EVALS, EVAL_TEMPLATES, COMPLETION_FNS, OPENAI_EVALS_GUIDE],
        gateMode: "ci",
      },
      [
        prior("run-gap0970-baseline", Date.UTC(2026, 5, 8), 3),
        prior("run-gap0970-repeat", Date.UTC(2026, 5, 15), 3.01),
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
    expect(report.rows[0]?.interRaterAgreement).toBe(0.87);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([
      SOURCE,
      DOCS,
      RUN_EVALS,
      EVAL_TEMPLATES,
      COMPLETION_FNS,
      OPENAI_EVALS_GUIDE,
    ]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when OpenAI Evals metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "openai-evals-context-agent",
      runId: "run-gap0970-openai-evals-metadata-only",
      ts: Date.UTC(2026, 5, 22),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.15,
      correlationRatio: 0.2,
      unsupportedClaimCount: 7,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-OPENAI-EVALS-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "OpenAI Evals repository metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-OPENAI-EVALS-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "openai-evals-repository-metadata",
        "openai-evals-registry-label",
        "openai-evals-template-label",
      ].map((facetId) => ({
        facetId,
        covered: false,
        evidenceRefs: [],
      })),
      processEvidenceChecks: [
        "validation-table",
        "sample-size",
        "confidence-interval",
        "metric-owner",
      ].map((processEvidenceId) => ({
        processEvidenceId: `openai-evals-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "openai-evals-metadata-only-outcome",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [SOURCE],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("fail");
    expect(report.ciGate.passed).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
    expect(report.evalPack.replayable).toBe(false);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add OpenAI Evals identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("openai_evals_metric_validity");
    }
  });
});
