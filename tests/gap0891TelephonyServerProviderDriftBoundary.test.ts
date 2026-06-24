import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0891-telephony-server-provider-drift.md";
const REPO = "steinathan/telephony-server";
const URL = "https://github.com/steinathan/telephony-server";
const TITLE = "Telephony Server";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "telephony-canary",
  model: "voice-routing-agent",
  version: side === "baseline" ? "2026-06-01" : "2026-06-22",
  canaryId: "telephony-server-provider-canary",
  benchmarkFamily: "telephony-server-provider-drift",
  capabilityId: "telephony-agent-route-stability",
  evaluationFrameworkId: "amc-owned-telephony-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.22",
  providerRouteId: `telephony-canary:voice-routing-agent:${side}`,
  metricSuiteId: "telephony-provider-drift-suite",
  metricIds: ["call_route_quality", "transcription_grounding", "handoff_quality", "observability_receipt_quality", "guardrail_pass_rate", "latency", "cost"],
  metricCount: 7,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-telephony-provider-drift-canary",
  pipelineRunId: `telephony-provider-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `telephony-canary-${side}`,
  observabilityProjectId: "amc-telephony-observability",
  datastoreId: "amc-owned-telephony-style-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 44,
  trajectoryCount: 44,
  scoreMean0to1: side === "baseline" ? 0.842 : 0.827,
  refusalRate0to1: side === "baseline" ? 0.028 : 0.032,
  invalidActionRate0to1: side === "baseline" ? 0.018 : 0.022,
  evaluatorCoverage0to1: side === "baseline" ? 0.988 : 0.982,
  guardrailPassRate0to1: side === "baseline" ? 0.968 : 0.961,
  latencyMsP95: side === "baseline" ? 2060 : 2190,
  costUsdMean: side === "baseline" ? 0.021 : 0.022,
  evidenceRefs: [`telephony:${side}:canary`],
  signedEvidenceRefs: [`ledger:telephony-${side}`],
  ...overrides,
});

describe("GAP-0891 telephony-server provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0891");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("BSD-2-Clause license");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("Star 23");
    expect(doc).toContain("Fork 3");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("10 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 100.0%");
    expect(doc).toContain(".vscode");
    expect(doc).toContain("apps");
    expect(doc).toContain("streaming_providers");
    expect(doc).toContain("telephony");
    expect(doc).toContain(".env.example");
    expect(doc).toContain("__init__.py");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("uv.lock");
    expect(doc).toContain("inspired by Vocode");
    expect(doc).toContain("Twilio");
    expect(doc).toContain("Vonage");
    expect(doc).toContain("Plivo");
    expect(doc).toContain("LiveKit");
    expect(doc).toContain("Jay.so");
    expect(doc).toContain("Pipecat");
    expect(doc).toContain("call routing");
    expect(doc).toContain("metrics collection");
    expect(doc).toContain("observability");
    expect(doc).toContain("Webhooks");
    expect(doc).toContain("TWILIO_ACCOUNT_SID");
    expect(doc).toContain("DEEPGRAM_API_KEY");
    expect(doc).toContain("OPENAI_API_KEY");
    expect(doc).toContain("ELEVENLABS_API_KEY");
    expect(doc).toContain("Redis");
    expect(doc).toContain("uvicorn");
    expect(doc).toContain("Prometheus");
    expect(doc).toContain("Grafana");
    expect(doc).toContain("ELK Stack");
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

  it("uses existing provider-drift evaluator for telephony-server context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "telephony-server-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-telephony-server-v1",
      datasetHash: hash("f"),
      sourceRefs: [URL],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([URL]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when telephony-server metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "telephony-server-reviewed-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [URL], signedEvidenceRefs: [] })],
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
          evidenceRefs: [URL],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: { minEvaluationMetricCount: 6, minTrajectoryCount: 30 },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "signedEvidenceRefs",
      "evaluationFrameworkEvidence",
      "observabilityPipelineEvidence",
    ]));
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).failClosed).toBe(true);
  });

  it("keeps telephony-server identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("telephony_server_provider_drift");
      expect(source).not.toContain("steinathan");
    }
  });
});
