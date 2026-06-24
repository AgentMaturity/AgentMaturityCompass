import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0881-dart-agent-core-metric-validity.md";
const REPO = "memex-lab/dart_agent_core";
const URL = "https://github.com/memex-lab/dart_agent_core";
const TITLE = "Dart Agent Core";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.88): QuestionScore {
  return {
    questionId: `AMC-DART-AGENT-CORE-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`dart-agent-core-metric-row-${index}`],
    flags: [],
    narrative: `Dart Agent Core source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "dart-agent-core-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 581).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `dart-agent-core-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `dart-agent-core-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 22),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0881 Dart Agent Core metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0881");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 27");
    expect(doc).toContain("Fork 8");
    expect(doc).toContain("Issues 1");
    expect(doc).toContain("Pull requests 3");
    expect(doc).toContain("61 Commits");
    expect(doc).toContain("Dart 100.0%");
    expect(doc).toContain("bin");
    expect(doc).toContain("doc");
    expect(doc).toContain("example");
    expect(doc).toContain("lib");
    expect(doc).toContain("test");
    expect(doc).toContain("CHANGELOG.md");
    expect(doc).toContain("README.zh-CN.md");
    expect(doc).toContain("analysis_options.yaml");
    expect(doc).toContain("pubspec.yaml");
    expect(doc).toContain("mobile-first");
    expect(doc).toContain("local-first");
    expect(doc).toContain("stateful");
    expect(doc).toContain("tool use");
    expect(doc).toContain("skills");
    expect(doc).toContain("sub-agent delegation");
    expect(doc).toContain("planning");
    expect(doc).toContain("streaming");
    expect(doc).toContain("multi-provider LLM support");
    expect(doc).toContain("Agent evals");
    expect(doc).toContain("tasks");
    expect(doc).toContain("graders");
    expect(doc).toContain("transcripts");
    expect(doc).toContain("record/replay");
    expect(doc).toContain("reports");
    expect(doc).toContain("pass@k / pass^k");
    expect(doc).toContain("Langfuse export");
    expect(doc).toContain("cross-run health");
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

  it("accepts Dart Agent Core context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 18 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "dart-agent-core-agent-eval-coverage",
      "dart-agent-core-validation-table",
      "dart-agent-core-sample-size",
      "dart-agent-core-confidence-interval",
      "dart-agent-core-reliability-check",
      "dart-agent-core-regression-threshold",
      "dart-agent-core-metric-owner",
      "dart-agent-core-passk-alignment",
      "dart-agent-core-cross-run-health-alignment",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "dart-agent-core-context-agent",
        runId: "run-gap0881-dart-agent-core-metric-validity",
        ts: Date.UTC(2026, 5, 22),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.85,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.84,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "agent-eval-coverage",
          "grader-consistency",
          "record-replay-stability",
          "passk-metric-fit",
          "cross-run-health",
        ].map((facetId, index) => ({
          facetId: `dart-agent-core-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "dart-agent-core-validation-table"],
          ["sample-size", "dart-agent-core-sample-size"],
          ["confidence-interval", "dart-agent-core-confidence-interval"],
          ["reliability-check", "dart-agent-core-reliability-check"],
          ["regression-threshold", "dart-agent-core-regression-threshold"],
          ["metric-owner", "dart-agent-core-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `dart-agent-core-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "dart-agent-core-score-predicts-agent-eval-reliability",
          aligned: true,
          evidenceRefs: ["dart-agent-core-passk-alignment", "dart-agent-core-cross-run-health-alignment"],
        }],
        sourceRefs: [URL],
        gateMode: "ci",
      },
      [
        prior("run-gap0881-baseline", Date.UTC(2026, 5, 8), 3),
        prior("run-gap0881-repeat", Date.UTC(2026, 5, 15), 3.01),
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
    expect(report.rows[0]?.interRaterAgreement).toBe(0.84);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([URL]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when Dart Agent Core metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "dart-agent-core-context-agent",
      runId: "run-gap0881-metadata-only",
      ts: Date.UTC(2026, 5, 22),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.1,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-DART-AGENT-CORE-01", layerName }],
      sourceRefs: [URL],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add Dart Agent Core identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("dart_agent_core_metric_validity");
      expect(source).not.toContain(TITLE);
    }
  });
});
