import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0685-adk-java-live-drift.md";
const SOURCE = "https://github.com/google/adk-java";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0685-${prefix}-trace-${index}`,
    scenarioId: `gap0685-java-agent-workflow-${index}`,
    timestamp: `2026-06-21T1${index}:30:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 2,
    behaviorSignature: `${behavior}:${index}`,
    taskCategory: "java-agent-tool-orchestration",
    domain: "agent-development-kit-runtime",
    agentEvaluationDimension: "deployed_agent_behavior_drift",
    interactionTurnCount: prefix === "live" ? 16 + index : 8 + index,
    invalidActionRate0to1: prefix === "live" ? 0.1 : 0.015,
    errorAttributionRate0to1: prefix === "live" ? 0.07 : 0.01,
    toolCallCount: prefix === "live" ? 7 : 3,
    latencyMs: prefix === "live" ? 3100 : 1200,
    costUsd: prefix === "live" ? 0.038 : 0.014,
    evidenceRefs: [`ev-gap0685-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0685-${prefix}-${index}`],
  }));
}

describe("GAP-0685 ADK Java live-drift boundary", () => {
  it("documents live ADK Java metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0685");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain("google/adk-java");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("1.6k stars");
    expect(doc).toContain("364 forks");
    expect(doc).toContain("58 issues");
    expect(doc).toContain("69 pull requests");
    expect(doc).toContain("1,068 commits");
    expect(doc).toContain("14 releases");
    expect(doc).toContain("v1.4.0");
    expect(doc).toContain("Jun 1, 2026");
    expect(doc).toContain("Development UI");
    expect(doc).toContain("Evaluate Agents");
    expect(doc).toContain("Coming soon");
    expect(doc).toContain("A2A protocol");
    expect(doc).toContain("Pre-GA");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for ADK Java deployed-agent behavior changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0685-adk-java-agent",
      baselineWindow: {
        windowId: "gap0685-baseline",
        startedAt: "2026-06-20T10:30:00.000Z",
        endedAt: "2026-06-20T14:30:00.000Z",
        rows: rows("baseline", 0.9, "stable-java-agent-workflow"),
      },
      liveWindow: {
        windowId: "gap0685-live",
        startedAt: "2026-06-21T10:30:00.000Z",
        endedAt: "2026-06-21T14:30:00.000Z",
        rows: rows("live", 0.62, "drifted-java-agent-workflow"),
      },
      sourceRefs: [SOURCE],
      now: new Date("2026-06-21T15:30:00.000Z"),
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

  it("fails closed when ADK Java repository metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.62, "drifted-java-agent-workflow").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0685-adk-java-agent",
      baselineWindow: {
        windowId: "gap0685-metadata-only-baseline",
        startedAt: "2026-06-20T10:30:00.000Z",
        endedAt: "2026-06-20T14:30:00.000Z",
        rows: rows("baseline", 0.9, "stable-java-agent-workflow"),
      },
      liveWindow: {
        windowId: "gap0685-metadata-only-live",
        startedAt: "2026-06-21T10:30:00.000Z",
        endedAt: "2026-06-21T14:30:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [SOURCE],
      now: new Date("2026-06-21T15:30:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add ADK Java identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("ADK Java");
      expect(source).not.toContain("adk_java_live_drift");
      expect(source).not.toContain("google/adk-java");
      expect(source).not.toContain("com.google.adk");
    }
  });
});
