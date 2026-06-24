import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1035-llm-agents-handbook-metric-validity.md";
const SOURCE = "https://github.com/oxbshw/LLM-Agents-Ecosystem-Handbook";
const API = "https://api.github.com/repos/oxbshw/LLM-Agents-Ecosystem-Handbook";
const README_API = "https://api.github.com/repos/oxbshw/LLM-Agents-Ecosystem-Handbook/readme";
const README = "https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/LICENSE";
const REQUIREMENTS = "https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/requirements.txt";
const EVALS_README = "https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/evals/README.md";
const EVAL_DESIGN = "https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/evals/eval_design.md";
const EVAL_FRAMEWORKS = "https://raw.githubusercontent.com/oxbshw/LLM-Agents-Ecosystem-Handbook/main/evaluation_frameworks/README.md";
const HEAD = "0d305fe203afc90fe4a6d9b27c3aaa4df0bcec84";
const TAG = "v1.0.1";
const TITLE = "oxbshw/LLM-Agents-Ecosystem-Handbook";
const IDENTIFIER = "llm_agents_handbook_metric_validity";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.89): QuestionScore {
  return {
    questionId: `AMC-HANDBOOK-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`handbook-metric-row-${index}`],
    flags: [],
    narrative: `LLM Agents handbook context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "llm-agents-handbook-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 1035).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `handbook-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `handbook-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 25),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-1035 LLM Agents Ecosystem Handbook metric-validity boundary", () => {
  it("documents live handbook source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1035");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(API);
    expect(doc).toContain(README_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(REQUIREMENTS);
    expect(doc).toContain(EVALS_README);
    expect(doc).toContain(EVAL_DESIGN);
    expect(doc).toContain(EVAL_FRAMEWORKS);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(TAG);
    expect(doc).toContain("One-stop handbook for building, deploying, and understanding LLM agents");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("primary language `Python`");
    expect(doc).toContain("Stars `529`");
    expect(doc).toContain("Forks `83`");
    expect(doc).toContain("Watchers `9`");
    expect(doc).toContain("open issues `0`");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("protected `false`");
    expect(doc).toContain("README sha `52579de98670255b5a12ed922e22ab757304e958`");
    expect(doc).toContain("Jupyter Notebook and Python");
    expect(doc).toContain("no releases returned");
    expect(doc).toContain("tag `v1.0.1`");
    expect(doc).toContain("60+ skeletons");
    expect(doc).toContain("100+ curated agent skeletons");
    expect(doc).toContain("24+ LLM providers");
    expect(doc).toContain("evaluation tools");
    expect(doc).toContain("evals");
    expect(doc).toContain("evaluation_frameworks");
    expect(doc).toContain("observability");
    expect(doc).toContain("safety");
    expect(doc).toContain("providers");
    expect(doc).toContain("mcp");
    expect(doc).toContain("memory");
    expect(doc).toContain("rag");
    expect(doc).toContain("voice-agent");
    expect(doc).toContain("regression_evals.md");
    expect(doc).toContain("tool_call_evals.md");
    expect(doc).toContain("memory_evals.md");
    expect(doc).toContain("mcp_evals.md");
    expect(doc).toContain("safety_evals.md");
    expect(doc).toContain("prompt_evals.md");
    expect(doc).toContain("eval_dataset.jsonl");
    expect(doc).toContain("eval_rubric.md");
    expect(doc).toContain("regression_eval_plan.md");
    expect(doc).toContain("judge model");
    expect(doc).toContain("version the rubric");
    expect(doc).toContain("sample-grade with humans");
    expect(doc).toContain("Run on every PR");
    expect(doc).toContain("Promptfoo");
    expect(doc).toContain("DeepEval");
    expect(doc).toContain("RAGAs");
    expect(doc).toContain("Langfuse");
    expect(doc).toContain("Phoenix");
    expect(doc).toContain("TruLens");
    expect(doc).toContain("LangSmith");
    expect(doc).toContain("MLflow");
    expect(doc).toContain("gradio");
    expect(doc).toContain("streamlit");
    expect(doc).toContain("openai>=1.0.0");
    expect(doc).toContain("anthropic");
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

  it("accepts handbook context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 30 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "handbook-validation-table",
      "handbook-sample-size",
      "handbook-confidence-interval",
      "handbook-reliability-check",
      "handbook-regression-threshold",
      "handbook-metric-owner",
      "handbook-construct-validity-proof",
      "handbook-rubric-version-proof",
      "handbook-human-sample-grade-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "llm-agents-handbook-context-agent",
        runId: "run-gap1035-handbook-metric-validity",
        ts: Date.UTC(2026, 5, 25),
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
          averageJudgeAgreement: 0.89,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "construct-validity",
          "inter-rater-reliability",
          "test-retest-stability",
          "rubric-version-repeatability",
          "human-sample-grading-alignment",
        ].map((facetId, index) => ({
          facetId: `handbook-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "handbook-validation-table"],
          ["sample-size", "handbook-sample-size"],
          ["confidence-interval", "handbook-confidence-interval"],
          ["reliability-check", "handbook-reliability-check"],
          ["regression-threshold", "handbook-regression-threshold"],
          ["metric-owner", "handbook-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `handbook-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "handbook-score-predicts-agent-eval-quality",
          aligned: true,
          evidenceRefs: [
            "handbook-construct-validity-proof",
            "handbook-rubric-version-proof",
            "handbook-human-sample-grade-proof",
          ],
        }],
        sourceRefs: [SOURCE, README, REQUIREMENTS, EVALS_README, EVAL_DESIGN, EVAL_FRAMEWORKS],
        gateMode: "ci",
      },
      [
        prior("run-gap1035-baseline", Date.UTC(2026, 5, 10), 3),
        prior("run-gap1035-repeat", Date.UTC(2026, 5, 17), 3.01),
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
    expect(report.rows[0]?.interRaterAgreement).toBe(0.89);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([SOURCE, README, REQUIREMENTS, EVALS_README, EVAL_DESIGN, EVAL_FRAMEWORKS]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when handbook metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "llm-agents-handbook-context-agent",
      runId: "run-gap1035-handbook-metadata-only",
      ts: Date.UTC(2026, 5, 25),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.15,
      correlationRatio: 0.17,
      unsupportedClaimCount: 12,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-HANDBOOK-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "Handbook repository metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-HANDBOOK-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "handbook-repository-metadata",
        "handbook-eval-design-label",
        "handbook-framework-catalog-label",
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
        processEvidenceId: `handbook-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "handbook-metadata-only-outcome",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [SOURCE, API, README, EVALS_README, EVAL_DESIGN, EVAL_FRAMEWORKS],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.ciGate.passed).toBe(false);
    expect(report.rows[0]?.status).toBe("fail");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
  });

  it("does not add handbook identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(API);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("LLM-Agents-Ecosystem-Handbook");
      expect(source).not.toContain("llm_agents_handbook_metric_validity");
    }
  });
});
