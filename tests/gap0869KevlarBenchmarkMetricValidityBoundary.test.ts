import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0869-kevlar-benchmark-metric-validity.md";
const REPO = "toxy4ny/kevlar-benchmark";
const URL = "https://github.com/toxy4ny/kevlar-benchmark";
const TITLE = "Kevlar: OWASP Top 10 for Agentic Apps 2026 Benchmark";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.89): QuestionScore {
  return {
    questionId: `AMC-KEVLAR-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`kevlar-metric-row-${index}`],
    flags: [],
    narrative: `Kevlar source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "kevlar-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 469).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `kevlar-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `kevlar-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 21),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0869 Kevlar benchmark metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0869");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 35");
    expect(doc).toContain("Fork 4");
    expect(doc).toContain("Issues 1");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("66 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 99.8%");
    expect(doc).toContain("C 0.2%");
    expect(doc).toContain("scripts");
    expect(doc).toContain("src/kevlar");
    expect(doc).toContain("tests");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("uv.lock");
    expect(doc).toContain("extension-run.yaml");
    expect(doc).toContain("education");
    expect(doc).toContain("ai-agents");
    expect(doc).toContain("cybersecurity");
    expect(doc).toContain("owasp-top-10");
    expect(doc).toContain("redteaming-tools");
    expect(doc).toContain("Full-coverage red team framework for AI agent security testing");
    expect(doc).toContain("OWASP Top 10 for Agentic Applications");
    expect(doc).toContain("Agent Goal Hijack");
    expect(doc).toContain("Unexpected Code Execution");
    expect(doc).toContain("Identity & Privilege Abuse");
    expect(doc).toContain("Tool Misuse & Exploitation");
    expect(doc).toContain("Agentic Supply Chain");
    expect(doc).toContain("Memory & Context Poisoning");
    expect(doc).toContain("Insecure Inter-Agent Comms");
    expect(doc).toContain("Cascading Failures");
    expect(doc).toContain("Human-Agent Trust Exploitation");
    expect(doc).toContain("Rogue Agents");
    expect(doc).toContain("AIVSS Scoring Engine");
    expect(doc).toContain("CI mode");
    expect(doc).toContain("591 tests total");
    expect(doc).toContain("coverage threshold 40%");
    expect(doc).toContain("authorized red teaming only");
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

  it("accepts Kevlar context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 20 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "kevlar-owasp-asi-coverage",
      "kevlar-validation-table",
      "kevlar-sample-size",
      "kevlar-confidence-interval",
      "kevlar-reliability-check",
      "kevlar-regression-threshold",
      "kevlar-metric-owner",
      "kevlar-aivss-alignment",
      "kevlar-ci-gate",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "kevlar-context-agent",
        runId: "run-gap0869-kevlar-metric-validity",
        ts: Date.UTC(2026, 5, 21),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.87,
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
          "owasp-asi-coverage",
          "aivss-alignment",
          "ci-gate",
          "red-team-safety-boundary",
          "authorized-use-scope",
        ].map((facetId, index) => ({
          facetId: `kevlar-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "kevlar-validation-table"],
          ["sample-size", "kevlar-sample-size"],
          ["confidence-interval", "kevlar-confidence-interval"],
          ["reliability-check", "kevlar-reliability-check"],
          ["regression-threshold", "kevlar-regression-threshold"],
          ["metric-owner", "kevlar-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `kevlar-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "kevlar-score-predicts-agent-red-team-risk",
          aligned: true,
          evidenceRefs: ["kevlar-aivss-alignment", "kevlar-ci-gate"],
        }],
        sourceRefs: [URL],
        gateMode: "ci",
      },
      [
        prior("run-gap0869-baseline", Date.UTC(2026, 5, 7), 3),
        prior("run-gap0869-repeat", Date.UTC(2026, 5, 14), 3.02),
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
    expect(report.rows[0]?.interRaterAgreement).toBe(0.84);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([URL]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when Kevlar metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "kevlar-context-agent",
      runId: "run-gap0869-metadata-only",
      ts: Date.UTC(2026, 5, 21),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.1,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-KEVLAR-01", layerName }],
      sourceRefs: [URL],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add Kevlar identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("kevlar_benchmark_metric_validity");
      expect(source).not.toContain(TITLE);
    }
  });
});
