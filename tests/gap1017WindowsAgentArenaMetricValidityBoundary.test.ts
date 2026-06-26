import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1017-windows-agent-arena-metric-validity.md";
const SOURCE = "https://github.com/microsoft/WindowsAgentArena";
const API = "https://api.github.com/repos/microsoft/WindowsAgentArena";
const README_API = "https://api.github.com/repos/microsoft/WindowsAgentArena/readme";
const README = "https://raw.githubusercontent.com/microsoft/WindowsAgentArena/main/README.md";
const LICENSE_API = "https://api.github.com/repos/microsoft/WindowsAgentArena/license";
const CONTENTS_API = "https://api.github.com/repos/microsoft/WindowsAgentArena/contents?ref=main";
const COMMIT_API = "https://api.github.com/repos/microsoft/WindowsAgentArena/commits/main";
const RELEASE_API = "https://api.github.com/repos/microsoft/WindowsAgentArena/releases/latest";
const REQUIREMENTS = "https://raw.githubusercontent.com/microsoft/WindowsAgentArena/main/requirements.txt";
const DOCKER_WORKFLOW = "https://raw.githubusercontent.com/microsoft/WindowsAgentArena/main/.github/workflows/publish-docker.yml";
const DEVELOP_AGENT = "https://raw.githubusercontent.com/microsoft/WindowsAgentArena/main/docs/Develop-Agent.md";
const DEVELOP_TASKS = "https://raw.githubusercontent.com/microsoft/WindowsAgentArena/main/docs/Develop-Tasks.md";
const ARXIV_API = "https://export.arxiv.org/api/query?id_list=2409.08264";
const ARXIV = "https://arxiv.org/abs/2409.08264";
const PROJECT_SITE = "https://microsoft.github.io/WindowsAgentArena";
const BLOG = "https://www.microsoft.com/applied-sciences/projects/windows-agent-arena";
const HEAD = "6d39ed88c545a0d40a7a02e39b928e278df7332b";
const RELEASE = "v0.0.4";
const TITLE = "microsoft/WindowsAgentArena";
const IDENTIFIER = "windows_agent_arena_metric_validity";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.9): QuestionScore {
  return {
    questionId: `AMC-WAA-METRIC-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`waa-metric-row-${index}`],
    flags: [],
    narrative: `WindowsAgentArena context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "windows-agent-arena-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 1017).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `waa-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `waa-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 24),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-1017 WindowsAgentArena metric-validity boundary", () => {
  it("documents live WindowsAgentArena source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1017");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(API);
    expect(doc).toContain(README_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE_API);
    expect(doc).toContain(CONTENTS_API);
    expect(doc).toContain(COMMIT_API);
    expect(doc).toContain(RELEASE_API);
    expect(doc).toContain(REQUIREMENTS);
    expect(doc).toContain(DOCKER_WORKFLOW);
    expect(doc).toContain(DEVELOP_AGENT);
    expect(doc).toContain(DEVELOP_TASKS);
    expect(doc).toContain(ARXIV_API);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(PROJECT_SITE);
    expect(doc).toContain(BLOG);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain("MIT License");
    expect(doc).toContain("Python");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("874 stars");
    expect(doc).toContain("95 forks");
    expect(doc).toContain("35 open issues");
    expect(doc).toContain("created_at `2024-07-29T15:31:40Z`");
    expect(doc).toContain("pushed_at `2026-04-13T19:58:37Z`");
    expect(doc).toContain("updated_at `2026-06-22T03:24:19Z`");
    expect(doc).toContain("README sha `d4b26caff094a182d686b33232843fafe6ac070d`");
    expect(doc).toContain("LICENSE sha `3d8b93bc7987d14c848448c089e2ae15311380d7`");
    expect(doc).toContain("requirements sha `6a7526a58c1543ce934c9d292a195e70160d9a09`");
    expect(doc).toContain("Docker workflow sha `8e593fa640a0f880dc5b4919a1db00816af9cb50`");
    expect(doc).toContain("Develop-Agent sha `b855dfc386685810a20e38ffefd746131e4876d9`");
    expect(doc).toContain("Develop-Tasks sha `2b7b6429092778f1b9c03ef70eacbe66a88504b8`");
    expect(doc).toContain("release `v0.0.4` published `2024-09-28T21:06:11Z`");
    expect(doc).toContain("Windows Agent Arena: Evaluating Multi-Modal OS Agents at Scale");
    expect(doc).toContain("http://arxiv.org/abs/2409.08264v2");
    expect(doc).toContain("project site returned HTTP 200");
    expect(doc).toContain("blog URL returned HTTP 403");
    expect(doc).toContain("multi-modal, desktop AI agents");
    expect(doc).toContain("Windows OS environment");
    expect(doc).toContain("Azure ML");
    expect(doc).toContain("Windows 11 VM");
    expect(doc).toContain("golden image");
    expect(doc).toContain("show_results.py");
    expect(doc).toContain("show_azure.py");
    expect(doc).toContain("predict()");
    expect(doc).toContain("reset()");
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

  it("accepts WindowsAgentArena context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 27 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "waa-validation-table",
      "waa-sample-size",
      "waa-confidence-interval",
      "waa-reliability-check",
      "waa-regression-threshold",
      "waa-metric-owner",
      "waa-desktop-task-proof",
      "waa-agent-interface-proof",
      "waa-azure-scale-proof",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "windows-agent-arena-context-agent",
        runId: "run-gap1017-waa-metric-validity",
        ts: Date.UTC(2026, 5, 24),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.91,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.88,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "construct-validity",
          "inter-rater-reliability",
          "test-retest-stability",
          "desktop-task-repeatability",
          "regression-threshold-fit",
        ].map((facetId, index) => ({
          facetId: `waa-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "waa-validation-table"],
          ["sample-size", "waa-sample-size"],
          ["confidence-interval", "waa-confidence-interval"],
          ["reliability-check", "waa-reliability-check"],
          ["regression-threshold", "waa-regression-threshold"],
          ["metric-owner", "waa-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `waa-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "waa-score-predicts-desktop-agent-evaluation-quality",
          aligned: true,
          evidenceRefs: [
            "waa-desktop-task-proof",
            "waa-agent-interface-proof",
            "waa-azure-scale-proof",
          ],
        }],
        sourceRefs: [
          SOURCE,
          README,
          REQUIREMENTS,
          DOCKER_WORKFLOW,
          DEVELOP_AGENT,
          DEVELOP_TASKS,
          ARXIV,
          PROJECT_SITE,
        ],
        gateMode: "ci",
      },
      [
        prior("run-gap1017-baseline", Date.UTC(2026, 5, 10), 3),
        prior("run-gap1017-repeat", Date.UTC(2026, 5, 17), 3.02),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 27,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.88);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([
      SOURCE,
      README,
      REQUIREMENTS,
      DOCKER_WORKFLOW,
      DEVELOP_AGENT,
      DEVELOP_TASKS,
      ARXIV,
      PROJECT_SITE,
    ]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when WindowsAgentArena metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "windows-agent-arena-context-agent",
      runId: "run-gap1017-waa-metadata-only",
      ts: Date.UTC(2026, 5, 24),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.22,
      evidenceCoverage: 0.14,
      correlationRatio: 0.2,
      unsupportedClaimCount: 10,
      layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
      questionScores: [
        {
          questionId: "AMC-WAA-METADATA-ONLY",
          claimedLevel: 4,
          supportedMaxLevel: 1,
          finalLevel: 1,
          confidence: 0.2,
          evidenceEventIds: [],
          flags: ["metadata_only"],
          narrative: "WindowsAgentArena repository metadata cannot prove AMC metric validity.",
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
      questions: [{ id: "AMC-WAA-METADATA-ONLY", layerName }],
      signedEvidenceRefs: [],
      validationFacetChecks: [
        "waa-repository-metadata",
        "waa-desktop-benchmark-label",
        "waa-arxiv-title",
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
        processEvidenceId: `waa-missing-${processEvidenceId}`,
        covered: false,
        evidenceRefs: [],
      })),
      outcomeAlignmentChecks: [{
        outcomeId: "waa-metadata-only-outcome",
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

  it("does not add WindowsAgentArena identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(RELEASE);
      expect(source).not.toContain("WindowsAgentArena");
      expect(source).not.toContain("Windows Agent Arena");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
