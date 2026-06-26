import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildRiskCostLatencySloReceipt,
  buildRiskCostLatencySloWatchAlerts,
  type RiskCostLatencySloDefinition,
  type RiskCostLatencyTraceRow,
} from "../src/observability/riskCostLatencySlo.js";

const DOC = "docs/source-reviews/GAP-3754-promptflow-risk-cost-latency-slo.md";
const TITLE = "microsoft/promptflow";
const REPO = "https://github.com/microsoft/promptflow";
const API = "https://api.github.com/repos/microsoft/promptflow";
const README = "https://raw.githubusercontent.com/microsoft/promptflow/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/microsoft/promptflow/main/LICENSE";
const CONTENTS = "https://api.github.com/repos/microsoft/promptflow/contents?ref=main";

const implementationFiles = [
  "src/observability/riskCostLatencySlo.ts",
  "src/index.ts",
];

function definition(): RiskCostLatencySloDefinition {
  return {
    sloId: "gap3754-promptflow-prod-slo",
    agentId: "gap3754-agent",
    timeWindow: {
      start: "2026-06-26T00:00:00.000Z",
      end: "2026-06-26T01:00:00.000Z",
    },
    objectives: {
      minReliabilityRate: 0.75,
      maxRiskIncidentRate: 0.25,
      maxTotalCostUsd: 0.25,
      maxP95LatencyMs: 3_000,
      maxEscalationRate: 0.25,
    },
    alertRouting: [
      {
        routeId: "watch-slo-channel",
        channel: "slack",
        target: "agent-ops",
        severity: "warning",
      },
    ],
    evidenceRefs: ["gap3754-slo-def", "gap3754-alert-route"],
  };
}

function trace(traceId: string, overrides: Partial<RiskCostLatencyTraceRow> = {}): RiskCostLatencyTraceRow {
  return {
    traceId,
    agentId: "gap3754-agent",
    timestamp: "2026-06-26T00:20:00.000Z",
    status: "ok",
    latencyMs: 1_200,
    costUsd: 0.03,
    inputTokens: 400,
    outputTokens: 120,
    riskEvent: null,
    failureMode: null,
    promptBoundary: "prompt-template",
    toolBoundary: "deployment-tool",
    remediationState: "closed",
    escalationRequired: false,
    evidenceRefs: [`${traceId}-row-hash`, `${traceId}-receipt-hash`],
    ...overrides,
  };
}

describe("GAP-3754 promptflow risk/cost/latency SLO boundary", () => {
  it("documents live promptflow metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-3754");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(CONTENTS);
    expect(doc).toContain("default_branch `main`");
    expect(doc).toContain("license `MIT`");
    expect(doc).toContain("Python");
    expect(doc).toContain("Build high-quality LLM apps");
    expect(doc).toContain("prototyping");
    expect(doc).toContain("testing");
    expect(doc).toContain("production deployment");
    expect(doc).toContain("monitoring");
    expect(doc).toContain("evaluation");
    expect(doc).toContain("tracing");
    expect(doc).toContain("metrics");
    expect(doc).toContain("Risk, cost, and latency SLOs");
    expect(doc).toContain("SLO definition, time window, breach evidence, and alert routing");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts promptflow context only through AMC-owned risk/cost/latency SLO receipts", () => {
    const receipt = buildRiskCostLatencySloReceipt({
      definition: definition(),
      sourceRefs: [REPO, API],
      generatedAt: "2026-06-26T01:00:00.000Z",
      traces: [
        trace("trace-ok-1"),
        trace("trace-ok-2", { costUsd: 0.04, latencyMs: 1_500 }),
        trace("trace-risk-1", {
          status: "error",
          latencyMs: 4_200,
          costUsd: 0.12,
          riskEvent: "deployment_regression",
          failureMode: "latency_timeout",
          promptBoundary: "prompt-deploy",
          toolBoundary: "serving-endpoint",
          remediationState: "open",
          escalationRequired: true,
        }),
      ],
    });

    expect(receipt.status).toBe("breached");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.sourceRefs).toEqual([API, REPO]);
    expect(receipt.traceIndex.entries.map((entry) => entry.traceId)).toEqual(expect.arrayContaining([
      "trace-ok-1",
      "trace-risk-1",
    ]));
    expect(receipt.failureClusters[0]?.failureMode).toBe("latency_timeout");
    expect(receipt.liveTrends).toMatchObject({
      traceCount: 3,
      riskIncidentRate: 0.333333,
      escalationRate: 0.333333,
      totalCostUsd: 0.19,
      p95LatencyMs: 4_200,
    });
    expect(receipt.breachEvidence.map((breach) => breach.metricId)).toEqual(expect.arrayContaining([
      "riskIncidentRate",
      "p95LatencyMs",
      "escalationRate",
    ]));
    expect(buildRiskCostLatencySloWatchAlerts(receipt).every((alert) => alert.routeId === "watch-slo-channel")).toBe(true);
  });

  it("fails closed when promptflow repository metadata replaces SLO rows and routing", () => {
    const receipt = buildRiskCostLatencySloReceipt({
      definition: {
        ...definition(),
        evidenceRefs: [],
        alertRouting: [],
      },
      traces: [],
      sourceRefs: [REPO, README],
      generatedAt: "2026-06-26T01:00:00.000Z",
    });

    expect(receipt.status).toBe("fail_closed");
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "traces:missing",
      "sloEvidenceRefs:missing",
      "alertRouting:missing",
    ]));
    expect(receipt.traceIndex.entries).toEqual([]);
    expect(receipt.failureClusters).toEqual([]);
  });

  it("does not add promptflow identifiers to generic SLO implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("promptflow");
    }
  });
});
