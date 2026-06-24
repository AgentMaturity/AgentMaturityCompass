import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1014-langkit-metric-validity.md";
const SOURCE = "https://github.com/whylabs/langkit";
const API = "https://api.github.com/repos/whylabs/langkit";
const README_API = "https://api.github.com/repos/whylabs/langkit/readme";
const README = "https://raw.githubusercontent.com/whylabs/langkit/main/README.md";
const LICENSE_API = "https://api.github.com/repos/whylabs/langkit/license";
const CONTENTS_API = "https://api.github.com/repos/whylabs/langkit/contents?ref=main";
const COMMIT_API = "https://api.github.com/repos/whylabs/langkit/commits/main";
const RELEASE_API = "https://api.github.com/repos/whylabs/langkit/releases/latest";
const PYPROJECT = "https://raw.githubusercontent.com/whylabs/langkit/main/pyproject.toml";
const CI = "https://raw.githubusercontent.com/whylabs/langkit/main/.github/workflows/langkit-ci.yml";
const QUALITY_DOC = "https://raw.githubusercontent.com/whylabs/langkit/main/langkit/docs/features/quality.md";
const RELEVANCE_DOC = "https://raw.githubusercontent.com/whylabs/langkit/main/langkit/docs/features/relevance.md";
const SECURITY_DOC = "https://raw.githubusercontent.com/whylabs/langkit/main/langkit/docs/features/security.md";
const SENTIMENT_DOC = "https://raw.githubusercontent.com/whylabs/langkit/main/langkit/docs/features/sentiment.md";
const HEAD = "5d6cab1e2ff32181ba5c514aaa2a4473421dc413";
const RELEASE = "v0.0.35";
const TITLE = "whylabs/langkit";
const IDENTIFIER = "langkit_metric_validity";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.91): QuestionScore {
  return {
    questionId: `AMC-LANGKIT-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`langkit-metric-row-${index}`],
    flags: [],
    narrative: `LangKit context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "langkit-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 1014).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `langkit-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `langkit-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 24),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-1014 LangKit metric-validity boundary", () => {
  it("documents live LangKit source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1014");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(API);
    expect(doc).toContain(README_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE_API);
    expect(doc).toContain(CONTENTS_API);
    expect(doc).toContain(COMMIT_API);
    expect(doc).toContain(RELEASE_API);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain(CI);
    expect(doc).toContain(QUALITY_DOC);
    expect(doc).toContain(RELEVANCE_DOC);
    expect(doc).toContain(SECURITY_DOC);
    expect(doc).toContain(SENTIMENT_DOC);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("Jupyter Notebook");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("992 stars");
    expect(doc).toContain("74 forks");
    expect(doc).toContain("37 open issues");
    expect(doc).toContain("created_at `2023-04-26T21:46:58Z`");
    expect(doc).toContain("pushed_at `2024-11-22T20:02:14Z`");
    expect(doc).toContain("updated_at `2026-06-19T17:03:00Z`");
    expect(doc).toContain("README sha `e23def1a91289692366f63c29c02b9ea6171c155`");
    expect(doc).toContain("pyproject sha `410b8b7ff60497a57930eb4b8949ca27687cb37f`");
    expect(doc).toContain("LICENSE sha `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`");
    expect(doc).toContain("CI workflow sha `74e54641548a8a990e5fe0ea392981654f8b99c4`");
    expect(doc).toContain("release `v0.0.35` published `2024-11-06T19:12:50Z`");
    expect(doc).toContain("text quality");
    expect(doc).toContain("text relevance");
    expect(doc).toContain("Security and Privacy");
    expect(doc).toContain("sentiment");
    expect(doc).toContain("toxicity");
    expect(doc).toContain("prompt injection");
    expect(doc).toContain("hallucination");
    expect(doc).toContain("whylogs");
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

  it("accepts LangKit context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 26 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "langkit-validation-table",
      "langkit-sample-size",
      "langkit-confidence-interval",
      "langkit-reliability-check",
      "langkit-regression-threshold",
      "langkit-metric-owner",
      "langkit-text-quality-proof",
      "langkit-relevance-proof",
      "langkit-safety-signal-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "langkit-context-agent",
        runId: "run-gap1014-langkit-metric-validity",
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
          "signal-repeatability",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `langkit-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "langkit-validation-table"],
          ["sample-size", "langkit-sample-size"],
          ["confidence-interval", "langkit-confidence-interval"],
          ["reliability-check", "langkit-reliability-check"],
          ["regression-threshold", "langkit-regression-threshold"],
          ["metric-owner", "langkit-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `langkit-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "langkit-score-predicts-agent-evaluation-quality",
          aligned: true,
          evidenceRefs: [
            "langkit-text-quality-proof",
            "langkit-relevance-proof",
            "langkit-safety-signal-proof",
          ],
        }],
        sourceRefs: [SOURCE, README, PYPROJECT, CI, QUALITY_DOC, RELEVANCE_DOC, SECURITY_DOC, SENTIMENT_DOC],
        gateMode: "ci",
      },
      [
        prior("run-gap1014-baseline", Date.UTC(2026, 5, 10), 3),
        prior("run-gap1014-repeat", Date.UTC(2026, 5, 17), 3.01),
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
    expect(report.evalPack.sourceRefs).toEqual([
      SOURCE,
      README,
      PYPROJECT,
      CI,
      QUALITY_DOC,
      RELEVANCE_DOC,
      SECURITY_DOC,
      SENTIMENT_DOC,
    ]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when LangKit metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "langkit-context-agent",
      runId: "run-gap1014-langkit-metadata-only",
      ts: Date.UTC(2026, 5, 24),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.15,
      correlationRatio: 0.2,
      unsupportedClaimCount: 9,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-LANGKIT-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "LangKit repository metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-LANGKIT-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "langkit-repository-metadata",
        "langkit-observability-label",
        "langkit-text-metric-label",
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
        processEvidenceId: `langkit-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "langkit-metadata-only-outcome",
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

  it("does not add LangKit identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(RELEASE);
      expect(source).not.toContain("LangKit");
      expect(source).not.toContain("langkit");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
