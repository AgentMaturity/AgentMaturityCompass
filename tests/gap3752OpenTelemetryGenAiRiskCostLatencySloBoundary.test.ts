import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildRiskCostLatencySloReceipt,
  buildRiskCostLatencySloWatchAlerts,
  type RiskCostLatencySloDefinition,
  type RiskCostLatencyTraceRow,
} from "../src/observability/riskCostLatencySlo.js";

const DOC = "docs/source-reviews/GAP-3752-opentelemetry-genai-risk-cost-latency-slo.md";
const SOURCE = "OpenTelemetry GenAI";
const SEMCONV = "https://opentelemetry.io/docs/specs/semconv/gen-ai/";
const SPANS = "https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/";
const METRICS = "https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/";

const implementationFiles = [
  "src/observability/riskCostLatencySlo.ts",
  "src/index.ts",
];

function definition(overrides: Partial<RiskCostLatencySloDefinition> = {}): RiskCostLatencySloDefinition {
  return {
    sloId: "gap3752-prod-risk-cost-latency",
    agentId: "gap3752-agent",
    timeWindow: {
      start: "2026-06-26T00:00:00.000Z",
      end: "2026-06-26T01:00:00.000Z",
    },
    objectives: {
      minReliabilityRate: 0.9,
      maxRiskIncidentRate: 0.1,
      maxTotalCostUsd: 0.12,
      maxP95LatencyMs: 2_000,
      maxEscalationRate: 0.2,
    },
    alertRouting: [
      {
        routeId: "watch-pager",
        channel: "pager",
        target: "risk-oncall",
        severity: "critical",
      },
    ],
    evidenceRefs: ["slo-definition-hash", "alert-routing-hash"],
    ...overrides,
  };
}

function row(
  traceId: string,
  overrides: Partial<RiskCostLatencyTraceRow> = {}
): RiskCostLatencyTraceRow {
  return {
    traceId,
    agentId: "gap3752-agent",
    timestamp: "2026-06-26T00:10:00.000Z",
    status: "ok",
    latencyMs: 1_000,
    costUsd: 0.01,
    inputTokens: 200,
    outputTokens: 80,
    riskEvent: null,
    failureMode: null,
    promptBoundary: "system-contract",
    toolBoundary: "search-tool",
    remediationState: "closed",
    escalationRequired: false,
    evidenceRefs: [`${traceId}-trace-hash`, `${traceId}-receipt-hash`],
    ...overrides,
  };
}

describe("GAP-3752 OpenTelemetry GenAI risk/cost/latency SLO boundary", () => {
  it("documents live OpenTelemetry GenAI metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-3752");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(SEMCONV);
    expect(doc).toContain(SPANS);
    expect(doc).toContain(METRICS);
    expect(doc).toContain("HTTP 200");
    expect(doc).toContain("GenAI");
    expect(doc).toContain("Semantic Conventions");
    expect(doc).toContain("spans");
    expect(doc).toContain("metrics");
    expect(doc).toContain("events");
    expect(doc).toContain("request");
    expect(doc).toContain("response");
    expect(doc).toContain("token");
    expect(doc).toContain("usage");
    expect(doc).toContain("Risk, cost, and latency SLOs");
    expect(doc).toContain("SLO definition, time window, breach evidence, and alert routing");
    expect(doc).toContain("reliability");
    expect(doc).toContain("risk incidents");
    expect(doc).toContain("token cost");
    expect(doc).toContain("latency");
    expect(doc).toContain("escalation rate");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("builds a per-agent operating SLO receipt with trace index, clusters, live trends, breaches, and routed alerts", () => {
    const receipt = buildRiskCostLatencySloReceipt({
      definition: definition(),
      traces: [
        row("trace-ok-1"),
        row("trace-ok-2", { latencyMs: 1_300, costUsd: 0.02, remediationState: "closed" }),
        row("trace-risk-1", {
          status: "error",
          latencyMs: 4_500,
          costUsd: 0.09,
          riskEvent: "policy_violation",
          failureMode: "policy_violation",
          promptBoundary: "system-policy",
          toolBoundary: "payment-tool",
          remediationState: "open",
          escalationRequired: true,
        }),
        row("trace-cost-1", {
          status: "warning",
          latencyMs: 3_200,
          costUsd: 0.08,
          riskEvent: "budget_breach",
          failureMode: "cost_spike",
          promptBoundary: "budget-policy",
          toolBoundary: "llm-router",
          remediationState: "in_progress",
          escalationRequired: true,
        }),
      ],
      generatedAt: "2026-06-26T01:00:00.000Z",
      sourceRefs: [SEMCONV],
    });

    expect(receipt.schemaVersion).toBe("2026-06-26");
    expect(receipt.surfaceBindings).toEqual(["Watch", "Studio", "API", "Fleet"]);
    expect(receipt.status).toBe("breached");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.liveTrends).toMatchObject({
      traceCount: 4,
      reliabilityRate: 0.5,
      riskIncidentRate: 0.5,
      totalCostUsd: 0.2,
      escalationRate: 0.5,
    });
    expect(receipt.liveTrends.p95LatencyMs).toBe(4_500);
    expect(receipt.traceIndex.entries).toHaveLength(4);
    expect(receipt.traceIndex.entries.every((entry) => entry.rowHash && entry.searchText.includes(entry.traceId))).toBe(true);
    expect(receipt.traceIndex.entries.map((entry) => entry.promptToolBoundary)).toEqual(expect.arrayContaining([
      "system-policy/payment-tool",
      "budget-policy/llm-router",
    ]));
    expect(receipt.failureClusters.map((cluster) => cluster.failureMode)).toEqual(expect.arrayContaining([
      "policy_violation",
      "cost_spike",
    ]));
    expect(receipt.failureClusters.every((cluster) => /^slofc_[a-f0-9]{16}$/.test(cluster.clusterId))).toBe(true);
    expect(receipt.breachEvidence.map((breach) => breach.metricId)).toEqual(expect.arrayContaining([
      "reliabilityRate",
      "riskIncidentRate",
      "totalCostUsd",
      "p95LatencyMs",
      "escalationRate",
    ]));
    expect(receipt.breachEvidence.every((breach) => breach.evidenceRefs.length > 0 && breach.alertRouteIds.includes("watch-pager"))).toBe(true);
    expect(receipt.alerts).toHaveLength(receipt.breachEvidence.length);
    expect(buildRiskCostLatencySloWatchAlerts(receipt).map((alert) => alert.source)).toEqual(
      Array(receipt.alerts.length).fill("risk-cost-latency-slo")
    );
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when OpenTelemetry metadata replaces AMC-owned SLO rows and alert routing", () => {
    const receipt = buildRiskCostLatencySloReceipt({
      definition: definition({ evidenceRefs: [], alertRouting: [] }),
      traces: [],
      sourceRefs: [SEMCONV, SPANS, METRICS],
      generatedAt: "2026-06-26T01:00:00.000Z",
    });

    expect(receipt.status).toBe("fail_closed");
    expect(receipt.failClosed).toBe(true);
    expect(receipt.traceIndex.entries).toEqual([]);
    expect(receipt.failureClusters).toEqual([]);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "traces:missing",
      "sloEvidenceRefs:missing",
      "alertRouting:missing",
    ]));
  });

  it("does not add OpenTelemetry-specific identifiers to generic SLO implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SEMCONV);
      expect(source).not.toContain("OpenTelemetry GenAI");
      expect(source).not.toContain("opentelemetry.io/docs/specs/semconv/gen-ai");
    }
  });
});
