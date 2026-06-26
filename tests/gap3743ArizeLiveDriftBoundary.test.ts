import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-3743-arize-live-drift.md";
const HOME = "https://arize.com/";
const MODEL_MONITORING = "https://arize.com/model-monitoring/";
const METRICS = "https://arize.com/docs/ax/machine-learning/machine-learning/how-to-ml/monitors/choosing-your-metrics";
const NOTIFICATIONS = "https://arize.com/docs/ax/machine-learning/machine-learning/how-to-ml/monitors/configure-monitors/notifications-and-integrations";
const LLM_OBSERVABILITY = "https://arize.com/blog/llm-observability-for-ai-agents-and-applications/";
const TITLE = "Arize AI";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap3743-${prefix}-trace-${index}`,
    scenarioId: `gap3743-arize-production-agent-${index}`,
    timestamp: `2026-06-26T${10 + index}:43:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: prefix === "live" && index === 1,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:arize-agent-observability-${index}`,
    taskCategory: "arize-production-live-drift",
    domain: "agent-observability-monitoring",
    agentEvaluationDimension: "observed_arize_style_live_behavior_drift",
    lifecycleStage: "production_monitoring",
    interactionTurnCount: prefix === "live" ? 20 + index : 8 + index,
    invalidActionRate0to1: prefix === "live" ? 0.13 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.09 : 0.01,
    toolCallCount: prefix === "live" ? 14 : 5,
    latencyMs: prefix === "live" ? 4200 : 1350,
    costUsd: prefix === "live" ? 0.052 : 0.013,
    evidenceRefs: [`ev-gap3743-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap3743-${prefix}-${index}`],
  }));
}

describe("GAP-3743 Arize live-drift boundary", () => {
  it("documents live Arize metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-3743");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(HOME);
    expect(doc).toContain(MODEL_MONITORING);
    expect(doc).toContain(METRICS);
    expect(doc).toContain(NOTIFICATIONS);
    expect(doc).toContain(LLM_OBSERVABILITY);
    expect(doc).toContain("The continual learning platform for agents");
    expect(doc).toContain("Trace. Eval. Learn.");
    expect(doc).toContain("production signals");
    expect(doc).toContain("span, trace, and session evals");
    expect(doc).toContain("model monitoring");
    expect(doc).toContain("monitors fire when a model metric crosses a threshold");
    expect(doc).toContain("automatically detect drift");
    expect(doc).toContain("anomalous performance degradations");
    expect(doc).toContain("Performance Metrics");
    expect(doc).toContain("Drift Metrics");
    expect(doc).toContain("Triggered");
    expect(doc).toContain("No Data");
    expect(doc).toContain("Slack");
    expect(doc).toContain("PagerDuty");
    expect(doc).toContain("Webhooks");
    expect(doc).toContain("LLM Observability");
    expect(doc).toContain("AI Agents and Applications");
    expect(doc).toContain("session-level evaluations");
    expect(doc).toContain("OpenInference");
    expect(doc).toContain("OpenTelemetry");
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

  it("accepts Arize context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-3743-arize-reviewed-agent",
      baselineWindow: {
        windowId: "gap3743-baseline",
        startedAt: "2026-06-26T10:43:00.000Z",
        endedAt: "2026-06-26T13:43:00.000Z",
        rows: rows("baseline", 0.91, "stable-arize-style-session-eval"),
      },
      liveWindow: {
        windowId: "gap3743-live",
        startedAt: "2026-06-26T14:43:00.000Z",
        endedAt: "2026-06-26T17:43:00.000Z",
        rows: rows("live", 0.47, "drifted-arize-style-session-eval"),
      },
      sourceRefs: [HOME, MODEL_MONITORING, METRICS, NOTIFICATIONS, LLM_OBSERVABILITY],
      now: new Date("2026-06-26T18:43:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([HOME, MODEL_MONITORING, METRICS, NOTIFICATIONS, LLM_OBSERVABILITY]);
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

  it("fails closed when Arize competitor metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.47, "drifted-arize-style-session-eval").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-3743-arize-metadata-only-agent",
      baselineWindow: {
        windowId: "gap3743-metadata-only-baseline",
        startedAt: "2026-06-26T10:43:00.000Z",
        endedAt: "2026-06-26T13:43:00.000Z",
        rows: rows("baseline", 0.91, "stable-arize-style-session-eval"),
      },
      liveWindow: {
        windowId: "gap3743-metadata-only-live",
        startedAt: "2026-06-26T14:43:00.000Z",
        endedAt: "2026-06-26T17:43:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [HOME],
      now: new Date("2026-06-26T18:43:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add Arize identifiers to generic Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(HOME);
      expect(source).not.toContain("arize_live_drift");
      expect(source).not.toContain("Arize AI");
    }
  });
});
