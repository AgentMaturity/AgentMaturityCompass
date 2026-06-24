import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0947-wandb-weave-live-drift.md";
const URL = "https://wandb.ai/site/weave";
const CANONICAL = "https://wandb.ai/site/weave/";
const DOCS = "https://docs.wandb.ai/weave";
const TITLE = "Weights & Biases Weave";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0947-${prefix}-trace-${index}`,
    scenarioId: `gap0947-weave-production-agent-${index}`,
    timestamp: `2026-06-22T1${index}:47:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: prefix === "live" && index === 1,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:weave-production-agent-${index}`,
    taskCategory: "weave-production-agent-live-drift",
    domain: "agent-evaluation-observability",
    agentEvaluationDimension: "observed_weave_agent_behavior_drift",
    interactionTurnCount: prefix === "live" ? 16 + index : 7 + index,
    invalidActionRate0to1: prefix === "live" ? 0.12 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 18 : 8,
    latencyMs: prefix === "live" ? 4100 : 1400,
    costUsd: prefix === "live" ? 0.056 : 0.018,
    evidenceRefs: [`ev-gap0947-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0947-${prefix}-${index}`],
  }));
}

describe("GAP-0947 W&B Weave live-drift boundary", () => {
  it("documents live Weave metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0947");
    expect(doc).toContain(URL);
    expect(doc).toContain(CANONICAL);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live Weave homepage");
    expect(doc).toContain("Observability and continuous improvement for production agents");
    expect(doc).toContain("production agents learn and improve from real-world experience");
    expect(doc).toContain("end-to-end observability");
    expect(doc).toContain("out-of-the-box signals");
    expect(doc).toContain("flexible evaluation framework");
    expect(doc).toContain("prevent regressions");
    expect(doc).toContain("Behavior monitoring with out-of-box signals");
    expect(doc).toContain("millions of incoming traces");
    expect(doc).toContain("Alerts route what matters through Slack notifications");
    expect(doc).toContain("trigger webhook automations");
    expect(doc).toContain("sessions and turns");
    expect(doc).toContain("multi-turn, multi-agent systems");
    expect(doc).toContain("Agent-native tracing");
    expect(doc).toContain("sessions, turns, steps, tools, and sub-agents");
    expect(doc).toContain("Measure every improvement");
    expect(doc).toContain("catch regressions before they reach users");
    expect(doc).toContain("MCP server");
    expect(doc).toContain("read live production data");
    expect(doc).toContain("run evaluations");
    expect(doc).toContain("test new LLMs and custom models against production traces");
    expect(doc).toContain("Safety scorers include toxicity, bias, PII detection, and hallucinations");
    expect(doc).toContain("Traces");
    expect(doc).toContain("Evaluations");
    expect(doc).toContain("Monitors");
    expect(doc).toContain("Quickstart: Trace an agent");
    expect(doc).toContain("Evaluate your agents and applications");
    expect(doc).toContain("Monitor and collect feedback");
    expect(doc).toContain("LLM judges and custom scorers");
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

  it("accepts Weave context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0947-weave-reviewed-agent",
      baselineWindow: {
        windowId: "gap0947-baseline",
        startedAt: "2026-06-21T10:47:00.000Z",
        endedAt: "2026-06-21T13:47:00.000Z",
        rows: rows("baseline", 0.88, "stable-weave-production-agent"),
      },
      liveWindow: {
        windowId: "gap0947-live",
        startedAt: "2026-06-22T10:47:00.000Z",
        endedAt: "2026-06-22T13:47:00.000Z",
        rows: rows("live", 0.48, "drifted-weave-production-agent"),
      },
      sourceRefs: [URL, CANONICAL, DOCS],
      now: new Date("2026-06-22T14:47:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([URL, CANONICAL, DOCS]);
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

  it("fails closed when Weave metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.48, "drifted-weave-production-agent").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0947-weave-reviewed-agent",
      baselineWindow: {
        windowId: "gap0947-metadata-only-baseline",
        startedAt: "2026-06-21T10:47:00.000Z",
        endedAt: "2026-06-21T13:47:00.000Z",
        rows: rows("baseline", 0.88, "stable-weave-production-agent"),
      },
      liveWindow: {
        windowId: "gap0947-metadata-only-live",
        startedAt: "2026-06-22T10:47:00.000Z",
        endedAt: "2026-06-22T13:47:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [URL],
      now: new Date("2026-06-22T14:47:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add Weave identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(URL);
      expect(source).not.toContain("wandb_weave_live_drift");
      expect(source).not.toContain("Weights & Biases Weave");
    }
  });
});
