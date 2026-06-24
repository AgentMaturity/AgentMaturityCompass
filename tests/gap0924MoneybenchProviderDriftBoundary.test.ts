import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0924-moneybench-provider-drift.md";
const REPO = "Moneybench/moneybench";
const URL = "https://github.com/Moneybench/moneybench";
const TITLE = "Moneybench - Real-World Agent Benchmark";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "moneybench-real-world-agent-canary",
  model: "autonomous-browser-payment-agent",
  version: side === "baseline" ? "hud-payman-provider-2026-06-01" : "hud-payman-provider-2026-06-22",
  canaryId: "moneybench-provider-canary",
  benchmarkFamily: "moneybench-provider-drift",
  capabilityId: "real-world-agent-payment-stability",
  evaluationFrameworkId: "amc-owned-moneybench-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.22",
  providerRouteId: `moneybench-provider:${side}`,
  metricSuiteId: "moneybench-provider-drift-suite",
  metricIds: ["reward", "completion_rate", "latency_p95", "cost", "payment_error_rate", "refusal_rate"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-moneybench-provider-drift-canary",
  pipelineRunId: `moneybench-provider-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `moneybench-canary-${side}`,
  observabilityProjectId: "amc-moneybench-observability",
  datastoreId: "amc-owned-moneybench-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 36,
  trajectoryCount: 36,
  scoreMean0to1: side === "baseline" ? 0.812 : 0.803,
  refusalRate0to1: side === "baseline" ? 0.025 : 0.028,
  invalidActionRate0to1: side === "baseline" ? 0.032 : 0.038,
  evaluatorCoverage0to1: side === "baseline" ? 0.982 : 0.978,
  guardrailPassRate0to1: side === "baseline" ? 0.958 : 0.953,
  latencyMsP95: side === "baseline" ? 2100 : 2250,
  costUsdMean: side === "baseline" ? 0.019 : 0.021,
  evidenceRefs: [`moneybench:${side}:canary`],
  signedEvidenceRefs: [`ledger:moneybench-${side}`],
  ...overrides,
});

describe("GAP-0924 Moneybench provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0924");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("Star 14");
    expect(doc).toContain("Fork 0");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("48 Commits");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("__pycache__");
    expect(doc).toContain("docs");
    expect(doc).toContain("payman_js_caller");
    expect(doc).toContain(".env.example");
    expect(doc).toContain("api_test.py");
    expect(doc).toContain("hud_imgur_test.py");
    expect(doc).toContain("hud_imgur_test_v2.py");
    expect(doc).toContain("hud_payman_eval.py");
    expect(doc).toContain("moneybench-proposal.txt");
    expect(doc).toContain("moneybench_task.py");
    expect(doc).toContain("multi_agent_eval.py");
    expect(doc).toContain("requirements-hud-payman.txt");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("test_agent.py");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Python 97.0%");
    expect(doc).toContain("TypeScript 3.0%");
    expect(doc).toContain("Status: Active development");
    expect(doc).toContain("VERY WIP");
    expect(doc).toContain("autonomous AI agents can make money");
    expect(doc).toContain("time pressure");
    expect(doc).toContain("limited information");
    expect(doc).toContain("HUD SDK");
    expect(doc).toContain("Payman");
    expect(doc).toContain("programmatic peer-to-peer cash transfers");
    expect(doc).toContain("hud-browser environment");
    expect(doc).toContain("Chrome in a cloud VM");
    expect(doc).toContain("public Imgur album");
    expect(doc).toContain("Payman payee ID");
    expect(doc).toContain("Node (Bun) subprocess");
    expect(doc).toContain("USD 0.50");
    expect(doc).toContain("Payman Client-Credentials OAuth flow");
    expect(doc).toContain("hud_imgur_test_v2_results.json");
    expect(doc).toContain("HUD evaluation metrics");
    expect(doc).toContain("stdout/stderr");
    expect(doc).toContain("timings");
    expect(doc).toContain("errors");
    expect(doc).toContain("Python >= 3.11");
    expect(doc).toContain("Bun");
    expect(doc).toContain("HUD_API_KEY");
    expect(doc).toContain("PAYMAN_CLIENT_ID");
    expect(doc).toContain("PAYMAN_CLIENT_SECRET");
    expect(doc).toContain("OpenAI Gym API");
    expect(doc).toContain("OAuth 2 Client Credentials");
    expect(doc).toContain("provider version");
    expect(doc).toContain("canary results");
    expect(doc).toContain("drift statistic");
    expect(doc).toContain("alert or waiver");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing provider-drift evaluator for Moneybench context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "moneybench-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: { minEvaluationMetricCount: 6, minTrajectoryCount: 30, maxGuardrailPassRateDrop0to1: 0.02 },
    });
    const pack = buildProviderDriftEvalPack(report, { packId: "provider-drift-moneybench-v1", datasetHash: hash("f"), sourceRefs: [URL] });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when Moneybench metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "moneybench-reviewed-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [URL], signedEvidenceRefs: [] })],
      candidate: [baseRow("candidate", {
        metricIds: [],
        metricCount: 1,
        evaluatorConfigHash: undefined,
        generatedTestDataHash: undefined,
        dashboardArtifactHash: undefined,
        pipelineRunId: undefined,
        traceExportHash: undefined,
        metricReportHash: undefined,
        evidenceRefs: [URL],
        signedEvidenceRefs: [],
      })],
      thresholds: { minEvaluationMetricCount: 6, minTrajectoryCount: 30 },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "signedEvidenceRefs",
      "evaluationFrameworkEvidence",
      "observabilityPipelineEvidence",
    ]));
  });

  it("keeps Moneybench identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("moneybench_provider_drift");
    }
  });
});
