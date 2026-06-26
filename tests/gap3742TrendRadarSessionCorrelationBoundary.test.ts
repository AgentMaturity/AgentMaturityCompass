import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCrossSurfaceSessionCorrelation,
  type AMCSurfaceId,
} from "../src/observability/sessionCorrelator.js";
import type { NormalizedTrace } from "../src/watch/observabilityBridge.js";

const DOC = "docs/source-reviews/GAP-3742-trendradar-session-correlation.md";
const REPO = "https://github.com/sansan0/TrendRadar";
const REPO_API = "https://api.github.com/repos/sansan0/TrendRadar";
const README = "https://raw.githubusercontent.com/sansan0/TrendRadar/master/README.md";
const LICENSE = "https://raw.githubusercontent.com/sansan0/TrendRadar/master/LICENSE";
const CONTENTS = "https://api.github.com/repos/sansan0/TrendRadar/contents?ref=master";
const TITLE = "sansan0/TrendRadar";

const implementationFiles = [
  "src/observability/sessionCorrelator.ts",
  "src/api/index.ts",
  "src/watch/traceFailureIndex.ts",
  "src/studio/studioState.ts",
];

function trace(params: {
  traceId: string;
  sessionId?: string;
  surface?: AMCSurfaceId;
  ts: number;
  status?: NormalizedTrace["status"];
  durationMs?: number;
  costUsd?: number;
  eventName?: string;
  failureMode?: string;
  riskEvent?: string;
  remediationState?: string;
}): NormalizedTrace {
  const durationMs = params.durationMs ?? 500;
  return {
    traceId: params.traceId,
    sessionId: params.sessionId,
    agentId: "gap-3742-agent",
    name: params.eventName,
    startTimeMs: params.ts,
    endTimeMs: params.ts + durationMs,
    durationMs,
    status: params.status ?? "ok",
    spans: [
      {
        spanId: `${params.traceId}-span`,
        traceId: params.traceId,
        name: params.eventName ?? "surface-event",
        kind: "agent_step",
        startTimeMs: params.ts,
        endTimeMs: params.ts + durationMs,
        durationMs,
        status: params.status ?? "ok",
        metadata: { surface: params.surface },
      },
    ],
    totalTokens: 100,
    totalCostUsd: params.costUsd ?? 0.01,
    modelBreakdown: {},
    errorCount: params.status === "error" ? 1 : 0,
    toolCallCount: 0,
    llmCallCount: 0,
    metadata: {
      surface: params.surface,
      eventName: params.eventName,
      failureMode: params.failureMode,
      riskEvent: params.riskEvent,
      remediationState: params.remediationState,
    },
  };
}

describe("GAP-3742 TrendRadar cross-surface session-correlation boundary", () => {
  it("documents live TrendRadar metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-3742");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(REPO);
    expect(doc).toContain(REPO_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(CONTENTS);
    expect(doc).toContain("default_branch `master`");
    expect(doc).toContain("license `GPL-3.0`");
    expect(doc).toContain("Python");
    expect(doc).toContain("AI-driven public opinion & trend monitor");
    expect(doc).toContain("multi-platform aggregation");
    expect(doc).toContain("RSS");
    expect(doc).toContain("smart alerts");
    expect(doc).toContain("MCP");
    expect(doc).toContain("sentiment");
    expect(doc).toContain("Docker");
    expect(doc).toContain("Telegram");
    expect(doc).toContain("Slack");
    expect(doc).toContain("session ID");
    expect(doc).toContain("surface event list");
    expect(doc).toContain("timestamp chain");
    expect(doc).toContain("missing-event checks");
    expect(doc).toContain("failure clusters");
    expect(doc).toContain("risk/cost/latency trends");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("correlates stable session IDs across Watch, Studio, and API-visible surfaces", () => {
    const sessionId = "gap3742-session-1";
    const result = buildCrossSurfaceSessionCorrelation({
      sessionId,
      requiredSurfaces: ["Score", "Shield", "Watch", "API", "Studio"],
      traces: [
        trace({ traceId: "t-score", sessionId, surface: "Score", ts: 10, eventName: "score.receipt", costUsd: 0.01 }),
        trace({ traceId: "t-shield", sessionId, surface: "Shield", ts: 20, eventName: "shield.decision", riskEvent: "policy_violation", costUsd: 0.02 }),
        trace({ traceId: "t-api", sessionId, surface: "API", ts: 30, eventName: "api.response", costUsd: 0.01 }),
        trace({ traceId: "t-watch", sessionId, surface: "Watch", ts: 40, eventName: "watch.alert", failureMode: "latency_timeout", status: "error", durationMs: 1400, costUsd: 0.03, remediationState: "open" }),
        trace({ traceId: "t-studio", sessionId, surface: "Studio", ts: 50, eventName: "studio.drilldown", costUsd: 0.01, remediationState: "linked" }),
      ],
    });

    expect(result.sessionId).toBe(sessionId);
    expect(result.failClosed).toBe(false);
    expect(result.missingSurfaces).toEqual([]);
    expect(result.timestampChainValid).toBe(true);
    expect(result.surfaceEvents.map((event) => event.surface)).toEqual(["Score", "Shield", "API", "Watch", "Studio"]);
    expect(result.surfaceEvents.map((event) => event.traceId)).toEqual(["t-score", "t-shield", "t-api", "t-watch", "t-studio"]);
    expect(result.missingEventChecks.every((check) => check.status === "present")).toBe(true);
    expect(result.liveTrends.riskEventCount).toBe(1);
    expect(result.liveTrends.failureModeCounts.latency_timeout).toBe(1);
    expect(result.liveTrends.totalCostUsd).toBeCloseTo(0.08);
    expect(result.liveTrends.p95LatencyMs).toBe(1400);
  });

  it("fails closed when TrendRadar-style metadata replaces correlated AMC surface events", () => {
    const result = buildCrossSurfaceSessionCorrelation({
      sessionId: "gap3742-metadata-only",
      requiredSurfaces: ["Score", "Shield", "Watch", "API", "Studio"],
      traces: [
        trace({ traceId: "metadata-only", surface: "Watch", ts: 10, eventName: TITLE, costUsd: 0 }),
      ],
    });

    expect(result.failClosed).toBe(true);
    expect(result.failClosedReasons.join(" ")).toContain("missing stable session id");
    expect(result.missingSurfaces).toEqual(expect.arrayContaining(["Score", "Shield", "API", "Studio"]));
    expect(result.missingEventChecks.filter((check) => check.status === "missing").map((check) => check.surface)).toEqual(expect.arrayContaining(["Score", "Shield", "API", "Studio"]));
  });

  it("does not add TrendRadar identifiers to generic correlation, API, Watch, or Studio modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("TrendRadar");
      expect(source).not.toContain("sansan0");
    }
  });
});
