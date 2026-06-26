import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0702-judgeval-live-drift.md";
const SOURCE = "https://github.com/JudgmentLabs/judgeval";
const REPO = "JudgmentLabs/judgeval";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0702-${prefix}-trace-${index}`,
    scenarioId: `gap0702-agent-monitoring-workflow-${index}`,
    timestamp: `2026-06-21T1${index}:45:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 2,
    behaviorSignature: `${behavior}:${index}`,
    taskCategory: "agent-production-monitoring-evaluation",
    domain: "llmops-agent-observability",
    agentEvaluationDimension: "observed_agent_behavior_drift",
    interactionTurnCount: prefix === "live" ? 23 + index : 11 + index,
    invalidActionRate0to1: prefix === "live" ? 0.14 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 9 : 4,
    latencyMs: prefix === "live" ? 3650 : 1420,
    costUsd: prefix === "live" ? 0.052 : 0.017,
    evidenceRefs: [`ev-gap0702-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0702-${prefix}-${index}`],
  }));
}

describe("GAP-0702 Judgeval live-drift boundary", () => {
  it("documents live Judgeval metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0702");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(REPO);
    expect(doc).toContain("repository id `878272507`");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("size `231070`");
    expect(doc).toContain("not archived");
    expect(doc).toContain("2026-05-12T08:53:02Z");
    expect(doc).toContain("Python SDK for agent improvement");
    expect(doc).toContain("OpenTelemetry-based tracing");
    expect(doc).toContain("prompt-based agent judges");
    expect(doc).toContain("scored/labeled behavior records");
    expect(doc).toContain("live production traffic monitoring");
    expect(doc).toContain("replay on historical traces");
    expect(doc).toContain("Slack regression alerts");
    expect(doc).toContain("OpenAI, Anthropic, Google GenAI, Together AI");
    expect(doc).toContain("LangGraph, OpenLit, and Claude Agent SDK");
    expect(doc).toContain("MCP server");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for Judgeval-style production monitoring drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0702-judgeval-reviewed-agent",
      baselineWindow: {
        windowId: "gap0702-baseline",
        startedAt: "2026-06-20T10:45:00.000Z",
        endedAt: "2026-06-20T14:45:00.000Z",
        rows: rows("baseline", 0.91, "stable-agent-monitoring-workflow"),
      },
      liveWindow: {
        windowId: "gap0702-live",
        startedAt: "2026-06-21T10:45:00.000Z",
        endedAt: "2026-06-21T14:45:00.000Z",
        rows: rows("live", 0.58, "drifted-agent-monitoring-workflow"),
      },
      sourceRefs: [SOURCE],
      now: new Date("2026-06-21T15:45:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([SOURCE]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when Judgeval metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.58, "drifted-agent-monitoring-workflow").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0702-judgeval-reviewed-agent",
      baselineWindow: {
        windowId: "gap0702-metadata-only-baseline",
        startedAt: "2026-06-20T10:45:00.000Z",
        endedAt: "2026-06-20T14:45:00.000Z",
        rows: rows("baseline", 0.91, "stable-agent-monitoring-workflow"),
      },
      liveWindow: {
        windowId: "gap0702-metadata-only-live",
        startedAt: "2026-06-21T10:45:00.000Z",
        endedAt: "2026-06-21T14:45:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [SOURCE],
      now: new Date("2026-06-21T15:45:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add Judgeval identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Judgeval");
      expect(source).not.toContain("judgeval_live_drift");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("JudgmentLabs");
    }
  });
});
