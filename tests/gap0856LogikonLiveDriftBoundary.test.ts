import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0856-logikon-live-drift.md";
const REPO = "logikon-ai/logikon";
const URL = "https://github.com/logikon-ai/logikon";
const TITLE = "Logikon";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0856-${prefix}-trace-${index}`,
    scenarioId: `gap0856-logikon-reasoning-trace-${index}`,
    timestamp: `2026-06-21T1${index}:56:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:logikon-reasoning-trace:${index}`,
    taskCategory: "reasoning-trace-live-drift",
    domain: "agent-evaluation-reasoning",
    agentEvaluationDimension: "observed_reasoning_trace_behavior_drift",
    interactionTurnCount: prefix === "live" ? 16 + index : 7 + index,
    invalidActionRate0to1: prefix === "live" ? 0.1 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 6 : 3,
    latencyMs: prefix === "live" ? 3100 : 1300,
    costUsd: prefix === "live" ? 0.052 : 0.017,
    evidenceRefs: [`ev-gap0856-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0856-${prefix}-${index}`],
  }));
}

describe("GAP-0856 Logikon live-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0856");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("AGPL-3.0 license");
    expect(doc).toContain("Star 48");
    expect(doc).toContain("Fork 0");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("499 Commits");
    expect(doc).toContain("v0.2.0 Latest Aug 29, 2024");
    expect(doc).toContain("Python 99.8%");
    expect(doc).toContain("Just 0.2%");
    expect(doc).toContain("argument-mapping");
    expect(doc).toContain("argument-mining");
    expect(doc).toContain("argumentation");
    expect(doc).toContain("critical-thinking");
    expect(doc).toContain("explainable-ai");
    expect(doc).toContain("llmops");
    expect(doc).toContain("observability");
    expect(doc).toContain("reasoning-agent");
    expect(doc).toContain("reliable-ai");
    expect(doc).toContain("Analyzing and scoring reasoning traces of LLMs");
    expect(doc).toContain("guided reasoning");
    expect(doc).toContain("pros and cons");
    expect(doc).toContain("argument maps");
    expect(doc).toContain("recursive balancing");
    expect(doc).toContain("baseline distribution");
    expect(doc).toContain("live sample");
    expect(doc).toContain("drift statistic");
    expect(doc).toContain("alert receipt");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for Logikon-style reasoning trace changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0856-logikon-reviewed-agent",
      baselineWindow: {
        windowId: "gap0856-baseline",
        startedAt: "2026-06-20T10:56:00.000Z",
        endedAt: "2026-06-20T13:56:00.000Z",
        rows: rows("baseline", 0.92, "stable-reasoning-trace"),
      },
      liveWindow: {
        windowId: "gap0856-live",
        startedAt: "2026-06-21T10:56:00.000Z",
        endedAt: "2026-06-21T13:56:00.000Z",
        rows: rows("live", 0.55, "drifted-reasoning-trace"),
      },
      sourceRefs: [URL],
      now: new Date("2026-06-21T14:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([URL]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when Logikon source metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.55, "drifted-reasoning-trace").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0856-logikon-reviewed-agent",
      baselineWindow: {
        windowId: "gap0856-metadata-only-baseline",
        startedAt: "2026-06-20T10:56:00.000Z",
        endedAt: "2026-06-20T13:56:00.000Z",
        rows: rows("baseline", 0.92, "stable-reasoning-trace"),
      },
      liveWindow: {
        windowId: "gap0856-metadata-only-live",
        startedAt: "2026-06-21T10:56:00.000Z",
        endedAt: "2026-06-21T13:56:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [URL],
      now: new Date("2026-06-21T14:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(false);
  });

  it("does not add Logikon identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("logikon_live_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
