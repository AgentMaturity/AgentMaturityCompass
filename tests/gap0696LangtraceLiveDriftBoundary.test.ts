import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0696-langtrace-live-drift.md";
const SOURCE = "https://github.com/Scale3-Labs/langtrace";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0696-${prefix}-trace-${index}`,
    scenarioId: `gap0696-llm-observability-workflow-${index}`,
    timestamp: `2026-06-21T1${index}:55:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:${index}`,
    taskCategory: "llm-observability-trace-evaluation",
    domain: "llmops-observability",
    agentEvaluationDimension: "observed_llm_application_behavior_drift",
    interactionTurnCount: prefix === "live" ? 19 + index : 9 + index,
    invalidActionRate0to1: prefix === "live" ? 0.1 : 0.015,
    errorAttributionRate0to1: prefix === "live" ? 0.075 : 0.01,
    toolCallCount: prefix === "live" ? 8 : 4,
    latencyMs: prefix === "live" ? 3350 : 1280,
    costUsd: prefix === "live" ? 0.044 : 0.015,
    evidenceRefs: [`ev-gap0696-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0696-${prefix}-${index}`],
  }));
}

describe("GAP-0696 Langtrace live-drift boundary", () => {
  it("documents live Langtrace metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0696");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain("Scale3-Labs/langtrace");
    expect(doc).toContain("AGPL-3.0 license");
    expect(doc).toContain("Apache 2.0 License");
    expect(doc).toContain("1.2k stars");
    expect(doc).toContain("124 forks");
    expect(doc).toContain("0 issues");
    expect(doc).toContain("1 pull request");
    expect(doc).toContain("701 commits");
    expect(doc).toContain("93 releases");
    expect(doc).toContain("4.0.11");
    expect(doc).toContain("Apr 17, 2025");
    expect(doc).toContain("TypeScript 99.4%");
    expect(doc).toContain("Open Telemetry");
    expect(doc).toContain("Real-time Monitoring");
    expect(doc).toContain("Performance Insights");
    expect(doc).toContain("latency, costs, and usage patterns");
    expect(doc).toContain("Debug Tools");
    expect(doc).toContain("Analytics");
    expect(doc).toContain("Self-hosting");
    expect(doc).toContain("TypeScript SDK");
    expect(doc).toContain("Python SDK");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for Langtrace-style observability drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0696-langtrace-observed-agent",
      baselineWindow: {
        windowId: "gap0696-baseline",
        startedAt: "2026-06-20T10:55:00.000Z",
        endedAt: "2026-06-20T14:55:00.000Z",
        rows: rows("baseline", 0.92, "stable-llm-observability-workflow"),
      },
      liveWindow: {
        windowId: "gap0696-live",
        startedAt: "2026-06-21T10:55:00.000Z",
        endedAt: "2026-06-21T14:55:00.000Z",
        rows: rows("live", 0.62, "drifted-llm-observability-workflow"),
      },
      sourceRefs: [SOURCE],
      now: new Date("2026-06-21T15:55:00.000Z"),
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

  it("fails closed when Langtrace repository metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.62, "drifted-llm-observability-workflow").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0696-langtrace-observed-agent",
      baselineWindow: {
        windowId: "gap0696-metadata-only-baseline",
        startedAt: "2026-06-20T10:55:00.000Z",
        endedAt: "2026-06-20T14:55:00.000Z",
        rows: rows("baseline", 0.92, "stable-llm-observability-workflow"),
      },
      liveWindow: {
        windowId: "gap0696-metadata-only-live",
        startedAt: "2026-06-21T10:55:00.000Z",
        endedAt: "2026-06-21T14:55:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [SOURCE],
      now: new Date("2026-06-21T15:55:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add Langtrace identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Langtrace");
      expect(source).not.toContain("langtrace_live_drift");
      expect(source).not.toContain("Scale3-Labs/langtrace");
      expect(source).not.toContain("@langtrase/typescript-sdk");
    }
  });
});
