import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0933-class-production-ai-app-metric-validity.md";
const REPO = "fdhhhdjd/Class-Production-AI-App";
const URL = "https://github.com/fdhhhdjd/Class-Production-AI-App";
const TITLE = "Production AI App";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.88): QuestionScore {
  return {
    questionId: `AMC-PRODUCTION-AI-APP-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`production-ai-app-metric-row-${index}`],
    flags: [],
    narrative: `Class-Production-AI-App context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "production-ai-app-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 933).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `production-ai-app-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `production-ai-app-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 22),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0933 Class-Production-AI-App metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0933");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("Star 16");
    expect(doc).toContain("Fork 8");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("1 Commit");
    expect(doc).toContain("README.md");
    expect(doc).toContain(".claude/ rules");
    expect(doc).toContain("app");
    expect(doc).toContain("data");
    expect(doc).toContain("docs");
    expect(doc).toContain("evaluation");
    expect(doc).toContain("frontend");
    expect(doc).toContain("observability");
    expect(doc).toContain("scripts");
    expect(doc).toContain("tests");
    expect(doc).toContain(".env.example");
    expect(doc).toContain("docker-compose.yml");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("Releases 1");
    expect(doc).toContain("v1.0.1");
    expect(doc).toContain("Apr 21, 2026");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Python 61.7%");
    expect(doc).toContain("Dockerfile 38.3%");
    expect(doc).toContain("Production-grade Retrieval-Augmented Generation");
    expect(doc).toContain("agentic layer");
    expect(doc).toContain("semantic caching");
    expect(doc).toContain("evaluation harness");
    expect(doc).toContain("full observability");
    expect(doc).toContain("Hybrid retrieval");
    expect(doc).toContain("Three-layer safety");
    expect(doc).toContain("Golden-dataset offline eval");
    expect(doc).toContain("online monitoring");
    expect(doc).toContain("Per-stage tracing");
    expect(doc).toContain("user feedback capture");
    expect(doc).toContain("cost tracking");
    expect(doc).toContain("offline_eval.py");
    expect(doc).toContain("online_monitor.py");
    expect(doc).toContain("tracer.py");
    expect(doc).toContain("feedback.py");
    expect(doc).toContain("cost_tracker.py");
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

  it("accepts production AI app context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 20 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "production-ai-app-validation-table",
      "production-ai-app-sample-size",
      "production-ai-app-confidence-interval",
      "production-ai-app-reliability-check",
      "production-ai-app-regression-threshold",
      "production-ai-app-metric-owner",
      "production-ai-app-eval-harness-proof",
      "production-ai-app-observability-proof",
      "production-ai-app-repeatability-evidence",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "production-ai-app-context-agent",
        runId: "run-gap0933-production-ai-app-metric-validity",
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
          averageJudgeAgreement: 0.85,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "rag-hybrid-retrieval-construct-validity",
          "semantic-cache-reliability",
          "agentic-routing-repeatability",
          "offline-online-eval-parity",
          "observability-cost-feedback-fit",
        ].map((facetId, index) => ({
          facetId: `production-ai-app-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "production-ai-app-validation-table"],
          ["sample-size", "production-ai-app-sample-size"],
          ["confidence-interval", "production-ai-app-confidence-interval"],
          ["reliability-check", "production-ai-app-reliability-check"],
          ["regression-threshold", "production-ai-app-regression-threshold"],
          ["metric-owner", "production-ai-app-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `production-ai-app-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "production-ai-app-score-predicts-eval-observability-quality",
          aligned: true,
          evidenceRefs: [
            "production-ai-app-eval-harness-proof",
            "production-ai-app-observability-proof",
            "production-ai-app-repeatability-evidence",
          ],
        }],
        sourceRefs: [URL],
        gateMode: "ci",
      },
      [
        prior("run-gap0933-baseline", Date.UTC(2026, 5, 8), 3),
        prior("run-gap0933-repeat", Date.UTC(2026, 5, 15), 3.02),
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
    expect(report.rows[0]?.interRaterAgreement).toBe(0.85);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([URL]);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when production AI app metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "production-ai-app-context-agent",
      runId: "run-gap0933-metadata-only",
      ts: Date.UTC(2026, 5, 22),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.1,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-PRODUCTION-AI-APP-01", layerName }],
      sourceRefs: [URL],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add production AI app identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("class_production_ai_app_metric_validity");
    }
  });
});
