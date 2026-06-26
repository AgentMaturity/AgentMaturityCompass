import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0694-adk-js-live-drift.md";
const SOURCE = "https://github.com/google/adk-js";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0694-${prefix}-trace-${index}`,
    scenarioId: `gap0694-typescript-agent-workflow-${index}`,
    timestamp: `2026-06-21T1${index}:40:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 1,
    behaviorSignature: `${behavior}:${index}`,
    taskCategory: "typescript-agent-tool-orchestration",
    domain: "agent-development-kit-runtime",
    agentEvaluationDimension: "typescript_deployed_agent_behavior_drift",
    interactionTurnCount: prefix === "live" ? 17 + index : 8 + index,
    invalidActionRate0to1: prefix === "live" ? 0.11 : 0.015,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 8 : 3,
    latencyMs: prefix === "live" ? 3200 : 1250,
    costUsd: prefix === "live" ? 0.04 : 0.014,
    evidenceRefs: [`ev-gap0694-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0694-${prefix}-${index}`],
  }));
}

describe("GAP-0694 ADK JS live-drift boundary", () => {
  it("documents live ADK JS metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0694");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain("google/adk-js");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("1.2k stars");
    expect(doc).toContain("162 forks");
    expect(doc).toContain("12 issues");
    expect(doc).toContain("20 pull requests");
    expect(doc).toContain("377 commits");
    expect(doc).toContain("32 releases");
    expect(doc).toContain("devtools: v1.2.0");
    expect(doc).toContain("Jun 3, 2026");
    expect(doc).toContain("TypeScript 96.9%");
    expect(doc).toContain("code-first TypeScript toolkit");
    expect(doc).toContain("evaluating");
    expect(doc).toContain("multi-agent systems");
    expect(doc).toContain("A2A protocol");
    expect(doc).toContain("dev UI");
    expect(doc).toContain("adk run");
    expect(doc).toContain("adk web");
    expect(doc).toContain("deploy cloud_run");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for ADK JS deployed-agent behavior changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0694-adk-js-agent",
      baselineWindow: {
        windowId: "gap0694-baseline",
        startedAt: "2026-06-20T10:40:00.000Z",
        endedAt: "2026-06-20T14:40:00.000Z",
        rows: rows("baseline", 0.91, "stable-typescript-agent-workflow"),
      },
      liveWindow: {
        windowId: "gap0694-live",
        startedAt: "2026-06-21T10:40:00.000Z",
        endedAt: "2026-06-21T14:40:00.000Z",
        rows: rows("live", 0.63, "drifted-typescript-agent-workflow"),
      },
      sourceRefs: [SOURCE],
      now: new Date("2026-06-21T15:40:00.000Z"),
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

  it("fails closed when ADK JS repository metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.63, "drifted-typescript-agent-workflow").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0694-adk-js-agent",
      baselineWindow: {
        windowId: "gap0694-metadata-only-baseline",
        startedAt: "2026-06-20T10:40:00.000Z",
        endedAt: "2026-06-20T14:40:00.000Z",
        rows: rows("baseline", 0.91, "stable-typescript-agent-workflow"),
      },
      liveWindow: {
        windowId: "gap0694-metadata-only-live",
        startedAt: "2026-06-21T10:40:00.000Z",
        endedAt: "2026-06-21T14:40:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [SOURCE],
      now: new Date("2026-06-21T15:40:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add ADK JS identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("ADK JS");
      expect(source).not.toContain("adk_js_live_drift");
      expect(source).not.toContain("google/adk-js");
      expect(source).not.toContain("@google/adk");
    }
  });
});
