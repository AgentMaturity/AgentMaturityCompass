import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1034-agentlab-metric-validity.md";
const SOURCE = "https://github.com/ServiceNow/AgentLab";
const API = "https://api.github.com/repos/ServiceNow/AgentLab";
const README_API = "https://api.github.com/repos/ServiceNow/AgentLab/readme";
const README = "https://raw.githubusercontent.com/ServiceNow/AgentLab/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/ServiceNow/AgentLab/main/LICENSE";
const PYPROJECT = "https://raw.githubusercontent.com/ServiceNow/AgentLab/main/pyproject.toml";
const READTHEDOCS = "https://agentlab.readthedocs.io/";
const PYPI = "https://pypi.org/project/agentlab/";
const PYPI_JSON = "https://pypi.org/pypi/agentlab/json";
const LEADERBOARD = "https://huggingface.co/spaces/ServiceNow/browsergym-leaderboard";
const ARXIV = "https://arxiv.org/abs/2412.05467";
const ARXIV_API = "https://export.arxiv.org/api/query?id_list=2412.05467";
const HEAD = "cbc35a9bc0facaf731bc858c5825edbe757c719f";
const RELEASE = "v0.4.2";
const TITLE = "ServiceNow/AgentLab";
const IDENTIFIER = "agentlab_metric_validity";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.91): QuestionScore {
  return {
    questionId: `AMC-AGENTLAB-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`agentlab-metric-row-${index}`],
    flags: [],
    narrative: `AgentLab context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "agentlab-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 1034).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `agentlab-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `agentlab-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 24),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-1034 AgentLab metric-validity boundary", () => {
  it("documents live AgentLab source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1034");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(API);
    expect(doc).toContain(README_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain(READTHEDOCS);
    expect(doc).toContain(PYPI);
    expect(doc).toContain(PYPI_JSON);
    expect(doc).toContain(LEADERBOARD);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_API);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain("AgentLab: An open-source framework for developing, testing, and benchmarking web agents");
    expect(doc).toContain("Apache License, Version 2.0");
    expect(doc).toContain("NOASSERTION");
    expect(doc).toContain("primary language `Python`");
    expect(doc).toContain("Stars `591`");
    expect(doc).toContain("Forks `116`");
    expect(doc).toContain("Watchers `5`");
    expect(doc).toContain("open issues `34`");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("protected `true`");
    expect(doc).toContain("README sha `40611b4dce6fc79dffeca7684110a54f7d574046`");
    expect(doc).toContain("Python, Jupyter Notebook, HTML, Makefile, and Shell");
    expect(doc).toContain("package name `agentlab`");
    expect(doc).toContain("PyPI version `0.4.2`");
    expect(doc).toContain("requires-python `>=3.11,<3.13`");
    expect(doc).toContain("browsergym>=0.7.1");
    expect(doc).toContain("openai>=1.7,<2");
    expect(doc).toContain("anthropic>=0.62.0");
    expect(doc).toContain("litellm>=1.75.3");
    expect(doc).toContain("ray[default]");
    expect(doc).toContain("gradio>=5.5");
    expect(doc).toContain("v0.4.2");
    expect(doc).toContain("v0.4.1");
    expect(doc).toContain("ReadTheDocs");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("WebArena");
    expect(doc).toContain("WorkArena");
    expect(doc).toContain("WebLinx");
    expect(doc).toContain("VisualWebArena");
    expect(doc).toContain("AssistantBench");
    expect(doc).toContain("MiniWoB");
    expect(doc).toContain("OSWorld");
    expect(doc).toContain("TimeWarp");
    expect(doc).toContain("812");
    expect(doc).toContain("341");
    expect(doc).toContain("31586");
    expect(doc).toContain("910");
    expect(doc).toContain("214");
    expect(doc).toContain("125");
    expect(doc).toContain("369");
    expect(doc).toContain("1386");
    expect(doc).toContain("reproducibility_journal.csv");
    expect(doc).toContain("AgentXray");
    expect(doc).toContain("Unified LeaderBoard");
    expect(doc).toContain("The BrowserGym Ecosystem for Web Agent Research");
    expect(doc).toContain("cs.LG");
    expect(doc).toContain("cs.AI");
    expect(doc).toContain("cs.SE");
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

  it("accepts AgentLab context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 32 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "agentlab-validation-table",
      "agentlab-sample-size",
      "agentlab-confidence-interval",
      "agentlab-reliability-check",
      "agentlab-regression-threshold",
      "agentlab-metric-owner",
      "agentlab-construct-validity-proof",
      "agentlab-reproducibility-journal-proof",
      "agentlab-benchmark-coverage-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "agentlab-context-agent",
        runId: "run-gap1034-agentlab-metric-validity",
        ts: Date.UTC(2026, 5, 24),
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
          averageJudgeAgreement: 0.91,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "construct-validity",
          "inter-rater-reliability",
          "test-retest-stability",
          "benchmark-coverage-repeatability",
          "reproducibility-journal-alignment",
        ].map((facetId, index) => ({
          facetId: `agentlab-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "agentlab-validation-table"],
          ["sample-size", "agentlab-sample-size"],
          ["confidence-interval", "agentlab-confidence-interval"],
          ["reliability-check", "agentlab-reliability-check"],
          ["regression-threshold", "agentlab-regression-threshold"],
          ["metric-owner", "agentlab-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `agentlab-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "agentlab-score-predicts-web-agent-evaluation-quality",
          aligned: true,
          evidenceRefs: [
            "agentlab-construct-validity-proof",
            "agentlab-reproducibility-journal-proof",
            "agentlab-benchmark-coverage-proof",
          ],
        }],
        sourceRefs: [SOURCE, README, PYPROJECT, READTHEDOCS, PYPI, ARXIV],
        gateMode: "ci",
      },
      [
        prior("run-gap1034-baseline", Date.UTC(2026, 5, 10), 3),
        prior("run-gap1034-repeat", Date.UTC(2026, 5, 17), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 32,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.91);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([SOURCE, README, PYPROJECT, READTHEDOCS, PYPI, ARXIV]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when AgentLab metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "agentlab-context-agent",
      runId: "run-gap1034-agentlab-metadata-only",
      ts: Date.UTC(2026, 5, 24),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.21,
      evidenceCoverage: 0.15,
      correlationRatio: 0.18,
      unsupportedClaimCount: 11,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-AGENTLAB-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "AgentLab repository metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-AGENTLAB-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "agentlab-repository-metadata",
        "agentlab-benchmark-label",
        "agentlab-leaderboard-label",
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
        processEvidenceId: `agentlab-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "agentlab-metadata-only-outcome",
        aligned: false,
        evidenceRefs: [],
      }],
      sourceRefs: [SOURCE, API, README, PYPROJECT, READTHEDOCS, PYPI],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.ciGate.passed).toBe(false);
    expect(report.rows[0]?.status).toBe("fail");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
  });

  it("does not add AgentLab identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(API);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("AgentLab");
      expect(source).not.toContain("agentlab_metric_validity");
    }
  });
});
