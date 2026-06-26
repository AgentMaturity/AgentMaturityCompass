import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0019-humanloop-live-drift.md";
const HOME = "https://humanloop.com/";
const OVERVIEW = "https://humanloop.com/docs/getting-started/overview";
const MONITORING = "https://humanloop.com/docs/guides/observability/monitoring";
const AGENT_UI = "https://humanloop.com/docs/tutorials/evaluate-agent-in-ui";
const MIGRATION = "https://humanloop.com/docs/guides/migrating-from-humanloop";
const EVALUATORS = "https://humanloop.com/docs/explanation/evaluators";
const LOGS = "https://humanloop.com/docs/explanation/logs";
const CICD = "https://humanloop.com/docs/guides/evals/cicd-integration";
const SECURITY = "https://humanloop.com/docs/reference/security-compliance";
const TITLE = "Humanloop";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0019-${prefix}-trace-${index}`,
    scenarioId: `gap0019-humanloop-production-prompt-${index}`,
    timestamp: `2026-06-26T1${index}:19:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: prefix === "live" && index === 1,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:humanloop-production-log-${index}`,
    taskCategory: "humanloop-production-live-drift",
    domain: "agent-evaluation-observability",
    agentEvaluationDimension: "observed_humanloop_live_behavior_drift",
    lifecycleStage: "production_monitoring",
    interactionTurnCount: prefix === "live" ? 15 + index : 6 + index,
    invalidActionRate0to1: prefix === "live" ? 0.1 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.07 : 0.01,
    toolCallCount: prefix === "live" ? 11 : 4,
    latencyMs: prefix === "live" ? 3900 : 1300,
    costUsd: prefix === "live" ? 0.041 : 0.012,
    evidenceRefs: [`ev-gap0019-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0019-${prefix}-${index}`],
  }));
}

describe("GAP-0019 Humanloop live-drift boundary", () => {
  it("documents live Humanloop metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0019");
    expect(doc).toContain(HOME);
    expect(doc).toContain(OVERVIEW);
    expect(doc).toContain(MONITORING);
    expect(doc).toContain(AGENT_UI);
    expect(doc).toContain(MIGRATION);
    expect(doc).toContain(EVALUATORS);
    expect(doc).toContain(LOGS);
    expect(doc).toContain(CICD);
    expect(doc).toContain(SECURITY);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Humanloop joins Anthropic");
    expect(doc).toContain("platform is being sunset");
    expect(doc).toContain("September 8th, 2025");
    expect(doc).toContain("LLM Evals Platform for Enterprises");
    expect(doc).toContain("Evaluation");
    expect(doc).toContain("Prompt Management");
    expect(doc).toContain("Observability");
    expect(doc).toContain("Monitor production Logs");
    expect(doc).toContain("automatically run them on new Logs");
    expect(doc).toContain("average Evaluator results over time");
    expect(doc).toContain("Logs table");
    expect(doc).toContain("check for drift or degradation in performance");
    expect(doc).toContain("Logs contain the inputs and outputs");
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

  it("accepts Humanloop context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0019-humanloop-reviewed-agent",
      baselineWindow: {
        windowId: "gap0019-baseline",
        startedAt: "2026-06-26T10:19:00.000Z",
        endedAt: "2026-06-26T13:19:00.000Z",
        rows: rows("baseline", 0.88, "stable-humanloop-production-evaluator"),
      },
      liveWindow: {
        windowId: "gap0019-live",
        startedAt: "2026-06-26T14:19:00.000Z",
        endedAt: "2026-06-26T17:19:00.000Z",
        rows: rows("live", 0.49, "drifted-humanloop-production-evaluator"),
      },
      sourceRefs: [HOME, MONITORING, EVALUATORS, LOGS],
      now: new Date("2026-06-26T18:19:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([HOME, MONITORING, EVALUATORS, LOGS]);
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

  it("fails closed when Humanloop metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.49, "drifted-humanloop-production-evaluator").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0019-humanloop-metadata-only-agent",
      baselineWindow: {
        windowId: "gap0019-metadata-only-baseline",
        startedAt: "2026-06-26T10:19:00.000Z",
        endedAt: "2026-06-26T13:19:00.000Z",
        rows: rows("baseline", 0.88, "stable-humanloop-production-evaluator"),
      },
      liveWindow: {
        windowId: "gap0019-metadata-only-live",
        startedAt: "2026-06-26T14:19:00.000Z",
        endedAt: "2026-06-26T17:19:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [HOME],
      now: new Date("2026-06-26T18:19:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add Humanloop identifiers to generic Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(HOME);
      expect(source).not.toContain("humanloop_live_drift");
      expect(source).not.toContain("Humanloop");
    }
  });
});
