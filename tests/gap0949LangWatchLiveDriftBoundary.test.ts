import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0949-langwatch-live-drift.md";
const URL = "https://langwatch.ai";
const CANONICAL = "https://langwatch.ai/";
const DOCS = "https://docs.langwatch.ai/";
const TITLE = "LangWatch";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0949-${prefix}-trace-${index}`,
    scenarioId: `gap0949-langwatch-production-agent-${index}`,
    timestamp: `2026-06-22T1${index}:49:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: prefix === "live" && index === 1,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:langwatch-production-agent-${index}`,
    taskCategory: "langwatch-production-agent-live-drift",
    domain: "agent-evaluation-observability",
    agentEvaluationDimension: "observed_langwatch_agent_behavior_drift",
    interactionTurnCount: prefix === "live" ? 18 + index : 8 + index,
    invalidActionRate0to1: prefix === "live" ? 0.12 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 20 : 9,
    latencyMs: prefix === "live" ? 4300 : 1450,
    costUsd: prefix === "live" ? 0.059 : 0.019,
    evidenceRefs: [`ev-gap0949-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0949-${prefix}-${index}`],
  }));
}

describe("GAP-0949 LangWatch live-drift boundary", () => {
  it("documents live LangWatch metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0949");
    expect(doc).toContain(URL);
    expect(doc).toContain(CANONICAL);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live LangWatch homepage");
    expect(doc).toContain("Simulate real-world");
    expect(doc).toContain("Turn production traces into evals");
    expect(doc).toContain("The #1 AI engineering platform");
    expect(doc).toContain("pre- and in production");
    expect(doc).toContain("Traces");
    expect(doc).toContain("Evaluations");
    expect(doc).toContain("Agent Simulations");
    expect(doc).toContain("Prompt Management");
    expect(doc).toContain("Auto-prompt optimization");
    expect(doc).toContain("780k+");
    expect(doc).toContain("Monthly installs");
    expect(doc).toContain("900k+");
    expect(doc).toContain("Daily evaluations to prevent hallucinations");
    expect(doc).toContain("5,6k+");
    expect(doc).toContain("Total Github stars");
    expect(doc).toContain("AI agents can break or behave differently in production");
    expect(doc).toContain("model swap can degrade quality");
    expect(doc).toContain("prompt change introduces regressions");
    expect(doc).toContain("monitor production signals");
    expect(doc).toContain("Evaluating RAG quality");
    expect(doc).toContain("Testing Multimodal");
    expect(doc).toContain("Voice");
    expect(doc).toContain("Test Multi-turn Conversations");
    expect(doc).toContain("Ensure agents use the right tools for simulations");
    expect(doc).toContain("Real-time Evaluations");
    expect(doc).toContain("LLM Observability");
    expect(doc).toContain("Measure the impact of every update");
    expect(doc).toContain("Run thousands of synthetic conversations");
    expect(doc).toContain("Batch Tests & Experiments");
    expect(doc).toContain("Auto-Evals");
    expect(doc).toContain("Data review & labeling");
    expect(doc).toContain("Dataset management");
    expect(doc).toContain("Convert production traces into reusable test cases, golden datasets, and benchmarks");
    expect(doc).toContain("OpenTelemetry native");
    expect(doc).toContain("Evaluations and Agent Simulations running on your existing testing infra");
    expect(doc).toContain("Fully open-source");
    expect(doc).toContain("No data lock-in");
    expect(doc).toContain("LangWatch: The Complete LLMOps Platform");
    expect(doc).toContain("comprehensive observability, evaluations and agent simulations");
    expect(doc).toContain("Every LLM call, tool usage, and user interaction");
    expect(doc).toContain("detailed traces, spans, and metadata");
    expect(doc).toContain("online tracing, prompt management, production evaluations, and offline evaluations");
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

  it("accepts LangWatch context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0949-langwatch-reviewed-agent",
      baselineWindow: {
        windowId: "gap0949-baseline",
        startedAt: "2026-06-21T10:49:00.000Z",
        endedAt: "2026-06-21T13:49:00.000Z",
        rows: rows("baseline", 0.88, "stable-langwatch-production-agent"),
      },
      liveWindow: {
        windowId: "gap0949-live",
        startedAt: "2026-06-22T10:49:00.000Z",
        endedAt: "2026-06-22T13:49:00.000Z",
        rows: rows("live", 0.49, "drifted-langwatch-production-agent"),
      },
      sourceRefs: [URL, CANONICAL, DOCS],
      now: new Date("2026-06-22T14:49:00.000Z"),
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

  it("fails closed when LangWatch metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.49, "drifted-langwatch-production-agent").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0949-langwatch-reviewed-agent",
      baselineWindow: {
        windowId: "gap0949-metadata-only-baseline",
        startedAt: "2026-06-21T10:49:00.000Z",
        endedAt: "2026-06-21T13:49:00.000Z",
        rows: rows("baseline", 0.88, "stable-langwatch-production-agent"),
      },
      liveWindow: {
        windowId: "gap0949-metadata-only-live",
        startedAt: "2026-06-22T10:49:00.000Z",
        endedAt: "2026-06-22T13:49:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [URL],
      now: new Date("2026-06-22T14:49:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add LangWatch identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(URL);
      expect(source).not.toContain("langwatch_live_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
