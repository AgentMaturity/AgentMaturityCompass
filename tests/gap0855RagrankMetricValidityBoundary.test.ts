import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0855-ragrank-metric-validity.md";
const REPO = "izam-mohammed/ragrank";
const URL = "https://github.com/izam-mohammed/ragrank";
const DOCS = "https://ragrank.readthedocs.io/latest/";
const API_DOCS = "https://api-ragrank.readthedocs.io/";
const PYPI = "https://pypi.org/project/ragrank/";
const TITLE = "Ragrank";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-RAGRANK-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`ragrank-metric-row-${index}`],
    flags: [],
    narrative: `Ragrank source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "ragrank-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 355).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `ragrank-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `ragrank-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 21),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0855 Ragrank metric-validity boundary", () => {
  it("documents live source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0855");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(API_DOCS);
    expect(doc).toContain(PYPI);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("Star 47");
    expect(doc).toContain("Fork 15");
    expect(doc).toContain("Issues 1");
    expect(doc).toContain("Pull requests 2");
    expect(doc).toContain("291 Commits");
    expect(doc).toContain("v0.0.9 Latest Feb 14, 2026");
    expect(doc).toContain("Python 97.3%");
    expect(doc).toContain("Makefile 2.7%");
    expect(doc).toContain("evaluation");
    expect(doc).toContain("language-model");
    expect(doc).toContain("llm-eval");
    expect(doc).toContain("llmops");
    expect(doc).toContain("prompt-engineering");
    expect(doc).toContain("rag");
    expect(doc).toContain("Retrieval-Augmented Generation");
    expect(doc).toContain("response_relevancy");
    expect(doc).toContain("Response Relevancy");
    expect(doc).toContain("Response Conciseness");
    expect(doc).toContain("Context relevancy");
    expect(doc).toContain("Context Utilization");
    expect(doc).toContain("Custom Metrics");
    expect(doc).toContain("Evaluate, monitor, and troubleshoot LLM applications");
    expect(doc).toContain("5+ LLM-evaluated metrics");
    expect(doc).toContain("Define evaluation datasets in Python code");
    expect(doc).toContain("online monitoring");
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

  it("accepts Ragrank context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 18 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "ragrank-response-relevancy",
      "ragrank-context-relevancy",
      "ragrank-context-utilization",
      "ragrank-validation-table",
      "ragrank-sample-size",
      "ragrank-confidence-interval",
      "ragrank-reliability-check",
      "ragrank-regression-threshold",
      "ragrank-metric-owner",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "ragrank-context-agent",
        runId: "run-gap0855-ragrank-metric-validity",
        ts: Date.UTC(2026, 5, 21),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.88,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.86,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "response-relevancy",
          "context-relevancy",
          "context-utilization",
          "validation-table",
          "sample-size",
        ].map((facetId, index) => ({
          facetId: `ragrank-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "ragrank-validation-table"],
          ["sample-size", "ragrank-sample-size"],
          ["confidence-interval", "ragrank-confidence-interval"],
          ["reliability-check", "ragrank-reliability-check"],
          ["regression-threshold", "ragrank-regression-threshold"],
          ["metric-owner", "ragrank-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `ragrank-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "ragrank-score-predicts-rag-evaluation-quality",
          aligned: true,
          evidenceRefs: ["ragrank-reliability-check", "ragrank-regression-threshold"],
        }],
        sourceRefs: [URL, DOCS, API_DOCS, PYPI],
        gateMode: "ci",
      },
      [
        prior("run-gap0855-baseline", Date.UTC(2026, 5, 7), 3),
        prior("run-gap0855-repeat", Date.UTC(2026, 5, 14), 3.01),
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
    expect(report.rows[0]?.interRaterAgreement).toBe(0.86);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([URL, DOCS, API_DOCS, PYPI]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when source metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "ragrank-context-agent",
      runId: "run-gap0855-metadata-only",
      ts: Date.UTC(2026, 5, 21),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.1,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-RAGRANK-01", layerName }],
      sourceRefs: [URL, DOCS],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add Ragrank identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("ragrank_metric_validity");
      expect(source).not.toContain(TITLE);
    }
  });
});
