import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1006-simba-metric-validity.md";
const SOURCE = "https://github.com/GitHamza0206/simba";
const API = "https://api.github.com/repos/GitHamza0206/simba";
const README = "https://raw.githubusercontent.com/GitHamza0206/simba/main/README.md";
const LICENSE_API = "https://api.github.com/repos/GitHamza0206/simba/license";
const LICENSE = "https://raw.githubusercontent.com/GitHamza0206/simba/main/LICENSE.md";
const RELEASE = "https://github.com/GitHamza0206/simba/releases/tag/v0.4.0";
const TITLE = "GitHamza0206/simba";
const HEAD = "81098f2a1dc4eb0470aae4dbf94695192067340c";
const README_SHA = "797a0c6cab70d8785390a60e58595ddab5249d26";
const IDENTIFIER = "simba_metric_validity";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-SIMBA-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`simba-metric-row-${index}`],
    flags: [],
    narrative: `Simba context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "simba-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 1006).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `simba-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `simba-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 24),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-1006 Simba metric-validity boundary", () => {
  it("documents live Simba repository metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1006");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE_API);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(README_SHA);
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("TypeScript");
    expect(doc).toContain("1452 stars");
    expect(doc).toContain("104 forks");
    expect(doc).toContain("6 open issues");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("pushed_at `2026-06-18T03:19:25Z`");
    expect(doc).toContain("updated_at `2026-06-22T05:10:07Z`");
    expect(doc).toContain("v0.4.0");
    expect(doc).toContain("2025-03-11T11:50:14Z");
    expect(doc).toContain("customer-service");
    expect(doc).toContain("evals");
    expect(doc).toContain("knowledge-base");
    expect(doc).toContain("llm");
    expect(doc).toContain("rag");
    expect(doc).toContain("built-in evaluation framework");
    expect(doc).toContain("retrieval accuracy");
    expect(doc).toContain("generation quality");
    expect(doc).toContain("latency");
    expect(doc).toContain("Modern Dashboard");
    expect(doc).toContain("Core evaluation framework");
    expect(doc).toContain("Advanced analytics dashboard");
    expect(doc).toContain("AGENT.md");
    expect(doc).toContain("CLAUDE.md");
    expect(doc).toContain("frontend");
    expect(doc).toContain("packages");
    expect(doc).toContain("simba");
    expect(doc).toContain("simba_sdk");
    expect(doc).toContain("docker");
    expect(doc).toContain("docs");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("pnpm-workspace.yaml");
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

  it("accepts Simba context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 26 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "simba-validation-table",
      "simba-sample-size",
      "simba-confidence-interval",
      "simba-reliability-check",
      "simba-regression-threshold",
      "simba-metric-owner",
      "simba-retrieval-quality-proof",
      "simba-generation-quality-proof",
      "simba-latency-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "simba-context-agent",
        runId: "run-gap1006-simba-metric-validity",
        ts: Date.UTC(2026, 5, 24),
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
          averageJudgeAgreement: 0.89,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "construct-validity",
          "inter-rater-reliability",
          "test-retest-stability",
          "retrieval-generation-repeatability",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `simba-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "simba-validation-table"],
          ["sample-size", "simba-sample-size"],
          ["confidence-interval", "simba-confidence-interval"],
          ["reliability-check", "simba-reliability-check"],
          ["regression-threshold", "simba-regression-threshold"],
          ["metric-owner", "simba-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `simba-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "simba-score-predicts-customer-service-quality",
          aligned: true,
          evidenceRefs: [
            "simba-retrieval-quality-proof",
            "simba-generation-quality-proof",
            "simba-latency-proof",
          ],
        }],
        sourceRefs: [SOURCE, README, RELEASE, LICENSE],
        gateMode: "ci",
      },
      [
        prior("run-gap1006-baseline", Date.UTC(2026, 5, 10), 3),
        prior("run-gap1006-repeat", Date.UTC(2026, 5, 17), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 26,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.89);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([SOURCE, README, RELEASE, LICENSE]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when Simba metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "simba-context-agent",
      runId: "run-gap1006-simba-metadata-only",
      ts: Date.UTC(2026, 5, 24),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.15,
      correlationRatio: 0.2,
      unsupportedClaimCount: 8,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-SIMBA-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "Simba repository metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-SIMBA-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "simba-repository-metadata",
        "simba-evals-label",
        "simba-dashboard-label",
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
        processEvidenceId: `simba-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "simba-metadata-only-outcome",
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

  it("does not add Simba identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(README_SHA);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
