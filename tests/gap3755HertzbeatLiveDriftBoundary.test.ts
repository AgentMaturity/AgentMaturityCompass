import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-3755-hertzbeat-live-drift.md";
const REPO = "https://github.com/apache/hertzbeat";
const REPO_API = "https://api.github.com/repos/apache/hertzbeat";
const README = "https://raw.githubusercontent.com/apache/hertzbeat/master/README.md";
const LICENSE = "https://raw.githubusercontent.com/apache/hertzbeat/master/LICENSE";
const CONTENTS = "https://api.github.com/repos/apache/hertzbeat/contents?ref=master";
const PRIOR_REVIEW = "docs/source-reviews/GAP-0642-hertzbeat-public-methodology.md";
const TITLE = "apache/hertzbeat";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap3755-${prefix}-trace-${index}`,
    scenarioId: `gap3755-hertzbeat-observability-agent-${index}`,
    timestamp: `2026-06-26T${10 + index}:55:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: prefix === "live" && index === 1,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:hertzbeat-observability-context-${index}`,
    taskCategory: "hertzbeat-observability-live-drift",
    domain: "agent-observability-monitoring",
    agentEvaluationDimension: "observed_hertzbeat_style_live_behavior_drift",
    lifecycleStage: "production_monitoring",
    interactionTurnCount: prefix === "live" ? 19 + index : 7 + index,
    invalidActionRate0to1: prefix === "live" ? 0.11 : 0.015,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 13 : 5,
    latencyMs: prefix === "live" ? 4050 : 1280,
    costUsd: prefix === "live" ? 0.049 : 0.012,
    evidenceRefs: [`ev-gap3755-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap3755-${prefix}-${index}`],
  }));
}

describe("GAP-3755 HertzBeat live-drift boundary", () => {
  it("documents live HertzBeat metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-3755");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(REPO);
    expect(doc).toContain(REPO_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(CONTENTS);
    expect(doc).toContain(PRIOR_REVIEW);
    expect(doc).toContain("default_branch `master`");
    expect(doc).toContain("license `Apache-2.0`");
    expect(doc).toContain("Java");
    expect(doc).toContain("AI-powered next-generation open source real-time observability system");
    expect(doc).toContain("agent");
    expect(doc).toContain("alerting");
    expect(doc).toContain("logs");
    expect(doc).toContain("metrics");
    expect(doc).toContain("monitoring");
    expect(doc).toContain("notifications");
    expect(doc).toContain("observability");
    expect(doc).toContain("Prometheus");
    expect(doc).toContain("status page");
    expect(doc).toContain("uptime");
    expect(doc).toContain("hertzbeat-ai");
    expect(doc).toContain("hertzbeat-otel");
    expect(doc).toContain("hertzbeat-alerter");
    expect(doc).toContain("baseline distribution");
    expect(doc).toContain("live sample");
    expect(doc).toContain("drift statistic");
    expect(doc).toContain("alert receipt");
    expect(doc).toContain("signed evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts HertzBeat context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-3755-hertzbeat-reviewed-agent",
      baselineWindow: {
        windowId: "gap3755-baseline",
        startedAt: "2026-06-26T10:55:00.000Z",
        endedAt: "2026-06-26T13:55:00.000Z",
        rows: rows("baseline", 0.9, "stable-hertzbeat-style-observability-eval"),
      },
      liveWindow: {
        windowId: "gap3755-live",
        startedAt: "2026-06-26T14:55:00.000Z",
        endedAt: "2026-06-26T17:55:00.000Z",
        rows: rows("live", 0.48, "drifted-hertzbeat-style-observability-eval"),
      },
      sourceRefs: [REPO, REPO_API, README, PRIOR_REVIEW],
      now: new Date("2026-06-26T18:55:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([REPO, REPO_API, README, PRIOR_REVIEW]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "refusalRate0to1",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when HertzBeat repository metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.48, "drifted-hertzbeat-style-observability-eval").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-3755-hertzbeat-metadata-only-agent",
      baselineWindow: {
        windowId: "gap3755-metadata-only-baseline",
        startedAt: "2026-06-26T10:55:00.000Z",
        endedAt: "2026-06-26T13:55:00.000Z",
        rows: rows("baseline", 0.9, "stable-hertzbeat-style-observability-eval"),
      },
      liveWindow: {
        windowId: "gap3755-metadata-only-live",
        startedAt: "2026-06-26T14:55:00.000Z",
        endedAt: "2026-06-26T17:55:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [REPO],
      now: new Date("2026-06-26T18:55:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add HertzBeat identifiers to generic Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("hertzbeat_live_drift");
      expect(source).not.toContain("HertzBeat");
      expect(source).not.toContain("apache/hertzbeat");
    }
  });
});
