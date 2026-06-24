import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0789-agentic-ai-security-metric-validity.md";
const ARXIV = "https://arxiv.org/abs/2510.23883";
const ARXIV_DOI = "10.48550/arXiv.2510.23883";
const IEEE_DOI = "10.1109/access.2026.3675554";
const OPENALEX = "W7138839765";
const TITLE = "Agentic AI Security: Threats, Defenses, Evaluation, and Open Challenges";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-AGENTIC-SECURITY-EVAL-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`agentic-security-metric-row-${index}`],
    flags: [],
    narrative: `Agentic AI security source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "agentic-security-context-eval-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 71).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `agentic-security-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `agentic-security-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 21),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0789 Agentic AI Security metric-validity boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0789");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_DOI);
    expect(doc).toContain(IEEE_DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("submitted `27 Oct 2025`");
    expect(doc).toContain("Shrestha Datta");
    expect(doc).toContain("Shahriar Kabir Nahin");
    expect(doc).toContain("Anshuman Chhabra");
    expect(doc).toContain("Prasant Mohapatra");
    expect(doc).toContain("planning, tool use, memory, and autonomy");
    expect(doc).toContain("web, software, and physical environments");
    expect(doc).toContain("taxonomy of threats");
    expect(doc).toContain("benchmarks and evaluation methodologies");
    expect(doc).toContain("defense strategies");
    expect(doc).toContain("technical and governance perspectives");
    expect(doc).toContain("secure-by-design agent systems");
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

  it("accepts agentic-security context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 20 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "agentic-security-construct-validity",
      "agentic-security-validation-table",
      "agentic-security-sample-size",
      "agentic-security-confidence-interval",
      "agentic-security-reliability-check",
      "agentic-security-regression-threshold",
      "agentic-security-metric-owner",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "agentic-security-context-eval-agent",
        runId: "run-gap0789-agentic-security-metric-validity",
        ts: Date.UTC(2026, 5, 21),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.93,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.87,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "construct-validity",
          "validation-table",
          "sample-size",
          "confidence-interval",
          "reliability-check",
        ].map((facetId, index) => ({
          facetId: `agentic-security-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          "validation-table",
          "sample-size",
          "confidence-interval",
          "reliability-check",
          "regression-threshold",
          "metric-owner",
        ].map((processEvidenceId, index) => ({
          processEvidenceId: `agentic-security-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index + 1]!],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "agentic-security-score-predicts-secure-agent-eval-quality",
          aligned: true,
          evidenceRefs: ["agentic-security-reliability-check", "agentic-security-regression-threshold"],
        }],
        sourceRefs: [ARXIV, `doi:${ARXIV_DOI}`, `doi:${IEEE_DOI}`, `openalex:${OPENALEX}`],
        gateMode: "ci",
      },
      [
        prior("run-gap0789-baseline", Date.UTC(2026, 5, 7), 3),
        prior("run-gap0789-repeat", Date.UTC(2026, 5, 14), 3.01),
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
    expect(report.rows[0]?.interRaterAgreement).toBe(0.87);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([ARXIV, `doi:${ARXIV_DOI}`, `doi:${IEEE_DOI}`, `openalex:${OPENALEX}`]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when paper metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "agentic-security-context-eval-agent",
      runId: "run-gap0789-metadata-only",
      ts: Date.UTC(2026, 5, 21),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.12,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-AGENTIC-SECURITY-EVAL-01", layerName }],
      sourceRefs: [ARXIV],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add Agentic AI Security identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("agentic_ai_security_metric_validity");
      expect(source).not.toContain(TITLE);
    }
  });
});
