import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1031-mobilegym-metric-validity.md";
const SOURCE = "https://github.com/Purewhiter/mobilegym";
const API = "https://api.github.com/repos/Purewhiter/mobilegym";
const README_API = "https://api.github.com/repos/Purewhiter/mobilegym/readme";
const README = "https://raw.githubusercontent.com/Purewhiter/mobilegym/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/Purewhiter/mobilegym/main/LICENSE";
const PACKAGE_JSON = "https://raw.githubusercontent.com/Purewhiter/mobilegym/main/package.json";
const CONTENTS_API = "https://api.github.com/repos/Purewhiter/mobilegym/contents?ref=main";
const HOMEPAGE = "https://mobilegym.dev";
const ARXIV = "https://arxiv.org/abs/2605.26114";
const ARXIV_API = "https://export.arxiv.org/api/query?id_list=2605.26114";
const ARXIV_PDF = "https://arxiv.org/pdf/2605.26114";
const HEAD = "399235e7e3f26469c3ddd4a75705f63d6e3071a4";
const RELEASE = "data-v1.0";
const TITLE = "Purewhiter/mobilegym";
const IDENTIFIER = "mobilegym_metric_validity";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-MOBILEGYM-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`mobilegym-metric-row-${index}`],
    flags: [],
    narrative: `MobileGym context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "mobilegym-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 1031).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `mobilegym-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `mobilegym-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 24),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-1031 MobileGym metric-validity boundary", () => {
  it("documents live MobileGym source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1031");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(API);
    expect(doc).toContain(README_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(PACKAGE_JSON);
    expect(doc).toContain(CONTENTS_API);
    expect(doc).toContain(HOMEPAGE);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_API);
    expect(doc).toContain(ARXIV_PDF);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("primary language `TypeScript`");
    expect(doc).toContain("Stars `653`");
    expect(doc).toContain("Forks `107`");
    expect(doc).toContain("Watchers `1`");
    expect(doc).toContain("open issues `7`");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("protected `false`");
    expect(doc).toContain("README sha `823213322e66d4d268ba9a4026fb67fadebcb090`");
    expect(doc).toContain("TypeScript, Python, CSS, HTML, JavaScript, and Shell");
    expect(doc).toContain("package name `mobile-gym`");
    expect(doc).toContain("version `0.1.0`");
    expect(doc).toContain("vite");
    expect(doc).toContain("react");
    expect(doc).toContain("vitest");
    expect(doc).toContain("release `data-v1.0`");
    expect(doc).toContain("MobileGym: A Verifiable and Highly Parallel Simulation Platform for Mobile GUI Agent Research");
    expect(doc).toContain("Browser-hosted Android Simulator");
    expect(doc).toContain("Verifiable Evaluation");
    expect(doc).toContain("Scalable Online RL Training");
    expect(doc).toContain("28 simulated apps");
    expect(doc).toContain("416 task templates");
    expect(doc).toContain("deterministic judges");
    expect(doc).toContain("256 parallel instances");
    expect(doc).toContain("256 test");
    expect(doc).toContain("160 train");
    expect(doc).toContain("structured JSON");
    expect(doc).toContain("AnswerSheet protocol");
    expect(doc).toContain("95.1");
    expect(doc).toContain("+40.7 pt");
    expect(doc).toContain("arXiv");
    expect(doc).toContain("cs.AI");
    expect(doc).toContain("cs.CL");
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

  it("accepts MobileGym context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 28 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "mobilegym-validation-table",
      "mobilegym-sample-size",
      "mobilegym-confidence-interval",
      "mobilegym-reliability-check",
      "mobilegym-regression-threshold",
      "mobilegym-metric-owner",
      "mobilegym-construct-validity-proof",
      "mobilegym-state-verification-proof",
      "mobilegym-sim-to-real-alignment-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "mobilegym-context-agent",
        runId: "run-gap1031-mobilegym-metric-validity",
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
          averageJudgeAgreement: 0.9,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "construct-validity",
          "inter-rater-reliability",
          "test-retest-stability",
          "state-verification-repeatability",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `mobilegym-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "mobilegym-validation-table"],
          ["sample-size", "mobilegym-sample-size"],
          ["confidence-interval", "mobilegym-confidence-interval"],
          ["reliability-check", "mobilegym-reliability-check"],
          ["regression-threshold", "mobilegym-regression-threshold"],
          ["metric-owner", "mobilegym-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `mobilegym-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "mobilegym-score-predicts-mobile-agent-evaluation-quality",
          aligned: true,
          evidenceRefs: [
            "mobilegym-construct-validity-proof",
            "mobilegym-state-verification-proof",
            "mobilegym-sim-to-real-alignment-proof",
          ],
        }],
        sourceRefs: [SOURCE, README, PACKAGE_JSON, HOMEPAGE, ARXIV, ARXIV_PDF],
        gateMode: "ci",
      },
      [
        prior("run-gap1031-baseline", Date.UTC(2026, 5, 10), 3),
        prior("run-gap1031-repeat", Date.UTC(2026, 5, 17), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 28,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.9);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([SOURCE, README, PACKAGE_JSON, HOMEPAGE, ARXIV, ARXIV_PDF]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when MobileGym metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "mobilegym-context-agent",
      runId: "run-gap1031-mobilegym-metadata-only",
      ts: Date.UTC(2026, 5, 24),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.22,
      evidenceCoverage: 0.14,
      correlationRatio: 0.2,
      unsupportedClaimCount: 10,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-MOBILEGYM-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "MobileGym repository metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-MOBILEGYM-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "mobilegym-repository-metadata",
        "mobilegym-benchmark-label",
        "mobilegym-arxiv-summary",
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
        processEvidenceId: `mobilegym-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "mobilegym-metadata-only-outcome",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [SOURCE, API, README, HOMEPAGE, ARXIV],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.ciGate.passed).toBe(false);
    expect(report.rows[0]?.status).toBe("fail");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
  });

  it("does not add MobileGym identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(API);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("MobileGym");
      expect(source).not.toContain("mobile-gym");
    }
  });
});
