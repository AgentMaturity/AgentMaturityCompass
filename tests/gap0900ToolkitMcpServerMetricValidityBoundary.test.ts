import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0900-toolkit-mcp-server-metric-validity.md";
const REPO = "cyanheads/toolkit-mcp-server";
const URL = "https://github.com/cyanheads/toolkit-mcp-server";
const TITLE = "toolkit-mcp-server";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.88): QuestionScore {
  return {
    questionId: `AMC-TOOLKIT-MCP-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`toolkit-mcp-metric-row-${index}`],
    flags: [],
    narrative: `toolkit-mcp-server source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "toolkit-mcp-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 900).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `toolkit-mcp-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `toolkit-mcp-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 22),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0900 toolkit-mcp-server metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0900");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("Star 18");
    expect(doc).toContain("Fork 9");
    expect(doc).toContain("Issues 1");
    expect(doc).toContain("Pull requests 3");
    expect(doc).toContain("7 Commits");
    expect(doc).toContain("2 tags");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("TypeScript 82.5%");
    expect(doc).toContain("JavaScript 17.5%");
    expect(doc).toContain(".github");
    expect(doc).toContain("workflows");
    expect(doc).toContain("src");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("package-lock.json");
    expect(doc).toContain("package.json");
    expect(doc).toContain("tsconfig.json");
    expect(doc).toContain("Model Context Protocol");
    expect(doc).toContain("IP geolocation");
    expect(doc).toContain("network diagnostics");
    expect(doc).toContain("system monitoring");
    expect(doc).toContain("cryptographic operations");
    expect(doc).toContain("QR code generation");
    expect(doc).toContain("Claude Desktop");
    expect(doc).toContain("IDE");
    expect(doc).toContain("rate limiting");
    expect(doc).toContain("constant-time hash comparison");
    expect(doc).toContain("UUID generation");
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

  it("accepts MCP toolkit context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 17 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "toolkit-mcp-utility-task-coverage",
      "toolkit-mcp-validation-table",
      "toolkit-mcp-sample-size",
      "toolkit-mcp-confidence-interval",
      "toolkit-mcp-reliability-check",
      "toolkit-mcp-regression-threshold",
      "toolkit-mcp-metric-owner",
      "toolkit-mcp-tool-risk-outcome-alignment",
      "toolkit-mcp-repeatability-evidence",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "toolkit-mcp-context-agent",
        runId: "run-gap0900-toolkit-mcp-metric-validity",
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
          averageJudgeAgreement: 0.84,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "mcp-tool-coverage",
          "network-diagnostic-repeatability",
          "system-monitoring-sample-fit",
          "security-tool-construct-validity",
          "utility-output-regression-stability",
        ].map((facetId, index) => ({
          facetId: `toolkit-mcp-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "toolkit-mcp-validation-table"],
          ["sample-size", "toolkit-mcp-sample-size"],
          ["confidence-interval", "toolkit-mcp-confidence-interval"],
          ["reliability-check", "toolkit-mcp-reliability-check"],
          ["regression-threshold", "toolkit-mcp-regression-threshold"],
          ["metric-owner", "toolkit-mcp-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `toolkit-mcp-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "toolkit-mcp-score-predicts-tool-utility-risk",
          aligned: true,
          evidenceRefs: ["toolkit-mcp-tool-risk-outcome-alignment", "toolkit-mcp-repeatability-evidence"],
        }],
        sourceRefs: [URL],
        gateMode: "ci",
      },
      [
        prior("run-gap0900-baseline", Date.UTC(2026, 5, 8), 3),
        prior("run-gap0900-repeat", Date.UTC(2026, 5, 15), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 17,
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

  it("fails closed when toolkit-mcp-server metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "toolkit-mcp-context-agent",
      runId: "run-gap0900-metadata-only",
      ts: Date.UTC(2026, 5, 22),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.1,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-TOOLKIT-MCP-01", layerName }],
      sourceRefs: [URL],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add toolkit-mcp-server identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("toolkit_mcp_server_metric_validity");
    }
  });
});
