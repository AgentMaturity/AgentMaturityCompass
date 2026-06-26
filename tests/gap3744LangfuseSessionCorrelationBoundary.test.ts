import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCrossSurfaceSessionCorrelation,
  type AMCSurfaceId,
} from "../src/observability/sessionCorrelator.js";
import type { NormalizedTrace } from "../src/watch/observabilityBridge.js";

const DOC = "docs/source-reviews/GAP-3744-langfuse-session-correlation.md";
const REPO = "https://github.com/langfuse/langfuse";
const REPO_API = "https://api.github.com/repos/langfuse/langfuse";
const README = "https://raw.githubusercontent.com/langfuse/langfuse/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/langfuse/langfuse/main/LICENSE";
const CONTENTS = "https://api.github.com/repos/langfuse/langfuse/contents?ref=main";
const TITLE = "langfuse/langfuse";

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
    agentId: "gap-3744-agent",
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
    totalTokens: 120,
    totalCostUsd: params.costUsd ?? 0.012,
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

describe("GAP-3744 Langfuse cross-surface session-correlation boundary", () => {
  it("documents live Langfuse metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-3744");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(REPO);
    expect(doc).toContain(REPO_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(CONTENTS);
    expect(doc).toContain("default_branch `main`");
    expect(doc).toContain("license `NOASSERTION`");
    expect(doc).toContain("TypeScript");
    expect(doc).toContain("Open source AI engineering platform");
    expect(doc).toContain("LLM evals");
    expect(doc).toContain("observability");
    expect(doc).toContain("metrics");
    expect(doc).toContain("prompt management");
    expect(doc).toContain("datasets");
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("LangChain");
    expect(doc).toContain("OpenAI SDK");
    expect(doc).toContain("LiteLLM");
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

  it("uses AMC-owned traces to correlate a Langfuse-style observability gap across surfaces", () => {
    const sessionId = "gap3744-session-1";
    const result = buildCrossSurfaceSessionCorrelation({
      sessionId,
      requiredSurfaces: ["Score", "Shield", "Watch", "API", "Studio"],
      traces: [
        trace({ traceId: "score", sessionId, surface: "Score", ts: 10, eventName: "score.metric", costUsd: 0.011 }),
        trace({ traceId: "api", sessionId, surface: "API", ts: 20, eventName: "api.trace.lookup", costUsd: 0.009 }),
        trace({ traceId: "shield", sessionId, surface: "Shield", ts: 30, eventName: "shield.risk", riskEvent: "prompt_boundary", costUsd: 0.014 }),
        trace({ traceId: "watch", sessionId, surface: "Watch", ts: 40, eventName: "watch.failure_cluster", failureMode: "tool_retry_loop", status: "error", durationMs: 1800, costUsd: 0.034, remediationState: "triaged" }),
        trace({ traceId: "studio", sessionId, surface: "Studio", ts: 50, eventName: "studio.evidence_drilldown", durationMs: 700, costUsd: 0.01, remediationState: "linked" }),
      ],
    });

    expect(result.failClosed).toBe(false);
    expect(result.eventCount).toBe(5);
    expect(result.surfaceEvents.map((event) => event.surface)).toEqual(["Score", "API", "Shield", "Watch", "Studio"]);
    expect(result.timestampChain).toEqual([10, 20, 30, 40, 50]);
    expect(result.missingEventChecks.every((check) => check.status === "present")).toBe(true);
    expect(result.liveTrends.riskEventCount).toBe(1);
    expect(result.liveTrends.failureModeCounts.tool_retry_loop).toBe(1);
    expect(result.liveTrends.totalCostUsd).toBeCloseTo(0.078);
    expect(result.liveTrends.p95LatencyMs).toBe(1800);
  });

  it("fails closed when Langfuse repository metadata replaces correlated AMC events", () => {
    const result = buildCrossSurfaceSessionCorrelation({
      sessionId: "gap3744-metadata-only",
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

  it("does not add Langfuse identifiers to generic correlation, API, Watch, or Studio modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("Langfuse");
      expect(source).not.toContain("langfuse/langfuse");
    }
  });
});
