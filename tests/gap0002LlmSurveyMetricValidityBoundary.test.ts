import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0002-llm-survey-metric-validity.md";
const SPRINGER = "https://link.springer.com/article/10.1007/s11704-026-60308-3";
const HEP = "https://journal.hep.com.cn/fcs/EN/10.1007/s11704-026-60308-3";
const OPENALEX = "https://openalex.org/W4362515116";
const DOI = "https://doi.org/10.1007/s11704-026-60308-3";
const DOI_VALUE = "10.1007/s11704-026-60308-3";
const TITLE = "A Survey of Large Language Models";
const IDENTIFIER = "llm_survey_metric_validity";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-LLM-SURVEY-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`llm-survey-metric-row-${index}`],
    flags: [],
    narrative: `LLM survey context is bounded to AMC metric-validity sample ${index}.`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "llm-survey-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 2).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `llm-survey-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `llm-survey-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 25),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0002 LLM survey metric-validity boundary", () => {
  it("documents live LLM survey metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0002");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(SPRINGER);
    expect(doc).toContain(HEP);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain("Published: 09 May 2026");
    expect(doc).toContain("Front. Comput. Sci.");
    expect(doc).toContain("20 (12) : 2012627");
    expect(doc).toContain("received 2026-02-14");
    expect(doc).toContain("accepted 2026-03-17");
    expect(doc).toContain("published online 2026-03-24");
    expect(doc).toContain("pre-training");
    expect(doc).toContain("post-training");
    expect(doc).toContain("utilization");
    expect(doc).toContain("evaluation");
    expect(doc).toContain("benchmark-based evaluation");
    expect(doc).toContain("human-based evaluation");
    expect(doc).toContain("model-based evaluation");
    expect(doc).toContain("LLM-as-judge");
    expect(doc).toContain("agent-as-a-judge");
    expect(doc).toContain("data contamination");
    expect(doc).toContain("length bias");
    expect(doc).toContain("position bias");
    expect(doc).toContain("style bias");
    expect(doc).toContain("practical utility");
    expect(doc).toContain("agentic tasks");
    expect(doc).toContain("benchmark saturation");
    expect(doc).toContain("validation table");
    expect(doc).toContain("confidence interval");
    expect(doc).toContain("sample size");
    expect(doc).toContain("metric owner");
    expect(doc).toContain("construct validity");
    expect(doc).toContain("inter-rater agreement");
    expect(doc).toContain("test-retest stability");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts LLM survey context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 30 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "llm-survey-validation-table",
      "llm-survey-sample-size",
      "llm-survey-confidence-interval",
      "llm-survey-reliability-check",
      "llm-survey-regression-threshold",
      "llm-survey-metric-owner",
      "llm-survey-benchmark-contamination-control",
      "llm-survey-llm-judge-bias-control",
      "llm-survey-agentic-task-outcome-proof",
      "llm-survey-practical-utility-alignment-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];
    const sourceRefs = [SPRINGER, HEP, OPENALEX, DOI];

    const report = buildMetricValidationReport(
      {
        agentId: "llm-survey-context-agent",
        runId: "run-gap0002-llm-survey-metric-validity",
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
          "benchmark-contamination-control",
          "judge-bias-control",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `llm-survey-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "llm-survey-validation-table"],
          ["sample-size", "llm-survey-sample-size"],
          ["confidence-interval", "llm-survey-confidence-interval"],
          ["reliability-check", "llm-survey-reliability-check"],
          ["regression-threshold", "llm-survey-regression-threshold"],
          ["metric-owner", "llm-survey-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `llm-survey-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "llm-survey-score-predicts-practical-agentic-task-reliability",
          aligned: true,
          evidenceRefs: [
            "llm-survey-benchmark-contamination-control",
            "llm-survey-llm-judge-bias-control",
            "llm-survey-agentic-task-outcome-proof",
            "llm-survey-practical-utility-alignment-proof",
          ],
        }],
        sourceRefs,
        gateMode: "ci",
      },
      [
        prior("run-gap0002-baseline", Date.UTC(2026, 5, 11), 3),
        prior("run-gap0002-repeat", Date.UTC(2026, 5, 18), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
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
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when LLM survey metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "llm-survey-context-agent",
      runId: "run-gap0002-llm-survey-metadata-only",
      ts: Date.UTC(2026, 5, 25),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.22,
      evidenceCoverage: 0.14,
      correlationRatio: 0.2,
      unsupportedClaimCount: 9,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-LLM-SURVEY-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "LLM survey paper metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-LLM-SURVEY-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "llm-survey-springer-metadata",
        "llm-survey-openalex-metadata",
        "llm-survey-benchmark-taxonomy-labels",
      ].map((facetId) => ({
        facetId,
        covered: false,
        evidenceRefs: [],
      })),
      processEvidenceChecks: [
        "llm-survey-validation-table",
        "llm-survey-sample-size",
        "llm-survey-confidence-interval",
        "llm-survey-metric-owner",
      ].map((processEvidenceId) => ({
        processEvidenceId,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "llm-survey-practical-agentic-task-outcome",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [SPRINGER, HEP, OPENALEX, DOI],
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
    expect(report.ciGate).toMatchObject({ passed: false, failClosed: true });
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
    expect(report.evalPack.replayable).toBe(false);
    expect(report.warnings.join(" ")).toContain("sample size");
    expect(report.warnings.join(" ")).toContain("construct validity");
  });

  it("keeps the LLM survey source-review boundary out of product implementation files", () => {
    for (const filePath of implementationFiles) {
      const source = readFileSync(filePath, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(SPRINGER);
      expect(source).not.toContain(HEP);
      expect(source).not.toContain(OPENALEX);
    }
  });
});
