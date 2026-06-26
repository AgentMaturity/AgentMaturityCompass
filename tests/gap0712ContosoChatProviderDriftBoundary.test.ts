import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  renderProviderDriftBenchmarkMarkdown,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0712-contoso-chat-provider-drift.md";
const SOURCE = "https://github.com/Azure-Samples/contoso-chat";
const README = "https://github.com/Azure-Samples/contoso-chat/blob/main/README.md";
const REPO = "Azure-Samples/contoso-chat";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/api/benchmarkRouter.ts",
  "src/api/watchRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (
  side: "baseline" | "candidate",
  overrides: Partial<ProviderDriftCanaryRow> = {},
): ProviderDriftCanaryRow => ({
  provider: "azure-openai",
  model: "gpt-4o-mini",
  version: side === "baseline" ? "2025-03-07" : "2026-06-21",
  canaryId: "contoso-chat-rag-eval-canary",
  benchmarkFamily: "rag-provider-deployment-drift",
  capabilityId: "retail-rag-grounded-chat-evaluation",
  evaluationFrameworkId: "prompty-ai-assisted-evaluation",
  evaluationFrameworkVersion: side === "baseline" ? "contoso-readme-2025-03-07" : "amc-owned-canary-2026-06-21",
  providerRouteId: `azure-openai:gpt-4o-mini:${side}`,
  metricSuiteId: "rag-quality-and-safety-evaluation",
  metricIds: ["coherence", "fluency", "relevance", "groundedness", "content_safety"],
  metricCount: 5,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "azd-github-actions-rag-deploy",
  pipelineRunId: `contoso-rag-eval-deploy-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `contoso-prompty-eval-${side}`,
  observabilityProjectId: "azure-monitor-prompty-trace-export",
  datastoreId: "amc-owned-retail-rag-canary",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 42,
  trajectoryCount: 42,
  scoreMean0to1: side === "baseline" ? 0.91 : 0.895,
  refusalRate0to1: side === "baseline" ? 0.025 : 0.03,
  invalidActionRate0to1: side === "baseline" ? 0.02 : 0.025,
  evaluatorCoverage0to1: side === "baseline" ? 0.97 : 0.965,
  guardrailPassRate0to1: side === "baseline" ? 0.98 : 0.975,
  latencyMsP95: side === "baseline" ? 1420 : 1475,
  costUsdMean: side === "baseline" ? 0.006 : 0.0062,
  evidenceRefs: [`contoso-chat:${side}:rag-evaluation`, `contoso-chat:${side}:azure-monitor-trace`],
  signedEvidenceRefs: [`ledger:contoso-chat-${side}`],
  ...overrides,
});

describe("GAP-0712 Contoso Chat provider-drift boundary", () => {
  it("documents live Contoso Chat metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0712");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(README);
    expect(doc).toContain(REPO);
    expect(doc).toContain("repository id `725257907`");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("size `245417`");
    expect(doc).toContain("currently archived");
    expect(doc).toContain("2025-03-07T00:20:21Z");
    expect(doc).toContain("Azure AI Foundry");
    expect(doc).toContain("Prompty");
    expect(doc).toContain("Azure OpenAI");
    expect(doc).toContain("Azure AI Search");
    expect(doc).toContain("Azure Cosmos DB");
    expect(doc).toContain("Azure Container Apps");
    expect(doc).toContain("AI-assisted evaluation flows");
    expect(doc).toContain("custom evaluators");
    expect(doc).toContain("Azure Developer CLI");
    expect(doc).toContain("Azure Monitor");
    expect(doc).toContain("managed identity");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing provider-drift evaluator and observability proof for Contoso-style RAG deployment canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "contoso-style-retail-rag-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 5,
        minTrajectoryCount: 20,
        maxGuardrailPassRateDrop0to1: 0.03,
      },
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(report.comparisons[0]).toMatchObject({
      baselineEvaluationFrameworkId: "prompty-ai-assisted-evaluation",
      candidateEvaluationFrameworkId: "prompty-ai-assisted-evaluation",
      baselinePipelineOrchestratorId: "azd-github-actions-rag-deploy",
      candidatePipelineOrchestratorId: "azd-github-actions-rag-deploy",
      baselineObservabilityProjectId: "azure-monitor-prompty-trace-export",
      candidateObservabilityProjectId: "azure-monitor-prompty-trace-export",
      evaluationFrameworkMissingReasons: [],
      observabilityPipelineMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-contoso-chat-rag-v1",
      datasetHash: hash("f"),
      sourceRefs: [SOURCE, README],
    });

    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.rows[0]?.baselineMetricIds).toEqual([
      "coherence",
      "fluency",
      "relevance",
      "groundedness",
      "content_safety",
    ]);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Evaluation Framework Proof");
    expect(markdown).toContain("Observability Pipeline Proof");
    expect(markdown).toContain("prompty-ai-assisted-evaluation");
    expect(markdown).toContain("azure-monitor-prompty-trace-export");
  });

  it("fails closed when Contoso repository metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "contoso-style-retail-rag-agent",
      baseline: [
        baseRow("baseline", {
          evidenceRefs: [SOURCE, README],
          signedEvidenceRefs: [],
        }),
      ],
      candidate: [
        baseRow("candidate", {
          metricIds: [],
          metricCount: 1,
          evaluatorConfigHash: undefined,
          generatedTestDataHash: undefined,
          dashboardArtifactHash: undefined,
          pipelineRunId: undefined,
          traceExportHash: undefined,
          metricReportHash: undefined,
          evidenceRefs: [SOURCE, README],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 5,
        minTrajectoryCount: 20,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "signedEvidenceRefs",
      "evaluationFrameworkEvidence",
      "observabilityPipelineEvidence",
    ]));
    expect(report.comparisons[0]?.evaluationFrameworkMissingReasons).toContain("candidate:metricIds");
    expect(report.comparisons[0]?.observabilityPipelineMissingReasons).toContain("candidate:traceExportHash");
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).failClosed).toBe(true);
  });

  it("keeps Contoso identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Contoso Chat");
      expect(source).not.toContain("contoso_chat_provider_drift");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("Azure-Samples/contoso-chat");
    }
  });
});
