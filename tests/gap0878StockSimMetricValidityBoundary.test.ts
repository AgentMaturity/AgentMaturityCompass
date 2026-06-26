import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0878-stocksim-metric-validity.md";
const REPO = "harrypapadakis/StockSim";
const URL = "https://github.com/harrypapadakis/StockSim";
const ARXIV = "https://arxiv.org/abs/2507.09255";
const TITLE = "StockSim: Multi-Agent LLM Financial Market Simulation Platform";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.89): QuestionScore {
  return {
    questionId: `AMC-STOCKSIM-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`stocksim-metric-row-${index}`],
    flags: [],
    narrative: `StockSim source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "stocksim-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 578).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `stocksim-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `stocksim-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 21),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0878 StockSim metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0878");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("Star 30");
    expect(doc).toContain("Fork 5");
    expect(doc).toContain("Issues 1");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("12 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 96.0%");
    expect(doc).toContain("Jinja 3.5%");
    expect(doc).toContain("Other 0.5%");
    expect(doc).toContain("agents");
    expect(doc).toContain("configs");
    expect(doc).toContain("exchanges");
    expect(doc).toContain("orders");
    expect(doc).toContain("simulation");
    expect(doc).toContain("templates");
    expect(doc).toContain("wrappers");
    expect(doc).toContain("docker-compose.yml");
    expect(doc).toContain("main_launcher.py");
    expect(doc).toContain("algorithmic-trading");
    expect(doc).toContain("financial-markets");
    expect(doc).toContain("backtesting");
    expect(doc).toContain("multi-agent-systems");
    expect(doc).toContain("real-time order book simulation");
    expect(doc).toContain("historical backtesting");
    expect(doc).toContain("heterogeneous LLM and traditional algorithmic traders");
    expect(doc).toContain("market microstructure");
    expect(doc).toContain("latency");
    expect(doc).toContain("slippage");
    expect(doc).toContain("market impact");
    expect(doc).toContain("Decision Traceability");
    expect(doc).toContain("ROI");
    expect(doc).toContain("Sharpe Ratio");
    expect(doc).toContain("Sortino Ratio");
    expect(doc).toContain("Max Drawdown");
    expect(doc).toContain("Win Rate");
    expect(doc).toContain("Profit Factor");
    expect(doc).toContain("Decision Consistency");
    expect(doc).toContain("Analyst Utilization");
    expect(doc).toContain("Response Quality");
    expect(doc).toContain("Coordination Effectiveness");
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

  it("accepts StockSim context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 20 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "stocksim-financial-metric-coverage",
      "stocksim-validation-table",
      "stocksim-sample-size",
      "stocksim-confidence-interval",
      "stocksim-reliability-check",
      "stocksim-regression-threshold",
      "stocksim-metric-owner",
      "stocksim-decision-consistency-alignment",
      "stocksim-high-stakes-risk-alignment",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "stocksim-context-agent",
        runId: "run-gap0878-stocksim-metric-validity",
        ts: Date.UTC(2026, 5, 21),
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
          averageJudgeAgreement: 0.83,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "financial-metric-coverage",
          "decision-consistency",
          "market-stress-robustness",
          "response-quality",
          "coordination-effectiveness",
        ].map((facetId, index) => ({
          facetId: `stocksim-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "stocksim-validation-table"],
          ["sample-size", "stocksim-sample-size"],
          ["confidence-interval", "stocksim-confidence-interval"],
          ["reliability-check", "stocksim-reliability-check"],
          ["regression-threshold", "stocksim-regression-threshold"],
          ["metric-owner", "stocksim-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `stocksim-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "stocksim-score-predicts-high-stakes-financial-agent-reliability",
          aligned: true,
          evidenceRefs: ["stocksim-decision-consistency-alignment", "stocksim-high-stakes-risk-alignment"],
        }],
        sourceRefs: [URL, ARXIV],
        gateMode: "ci",
      },
      [
        prior("run-gap0878-baseline", Date.UTC(2026, 5, 7), 3),
        prior("run-gap0878-repeat", Date.UTC(2026, 5, 14), 3.02),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 20,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.83);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([URL, ARXIV]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when StockSim metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "stocksim-context-agent",
      runId: "run-gap0878-metadata-only",
      ts: Date.UTC(2026, 5, 21),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.1,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-STOCKSIM-01", layerName }],
      sourceRefs: [URL],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add StockSim identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("stocksim_metric_validity");
      expect(source).not.toContain(TITLE);
    }
  });
});
