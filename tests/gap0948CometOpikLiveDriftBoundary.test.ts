import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0948-comet-opik-live-drift.md";
const URL = "https://www.comet.com/site/products/opik/";
const DOCS = "https://www.comet.com/docs/opik/";
const TITLE = "Comet Opik";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0948-${prefix}-trace-${index}`,
    scenarioId: `gap0948-opik-production-agent-${index}`,
    timestamp: `2026-06-22T1${index}:48:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: prefix === "live" && index === 1,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:opik-production-agent-${index}`,
    taskCategory: "opik-production-agent-live-drift",
    domain: "agent-evaluation-observability",
    agentEvaluationDimension: "observed_opik_agent_behavior_drift",
    interactionTurnCount: prefix === "live" ? 17 + index : 7 + index,
    invalidActionRate0to1: prefix === "live" ? 0.12 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 19 : 8,
    latencyMs: prefix === "live" ? 4200 : 1400,
    costUsd: prefix === "live" ? 0.057 : 0.018,
    evidenceRefs: [`ev-gap0948-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0948-${prefix}-${index}`],
  }));
}

describe("GAP-0948 Comet Opik live-drift boundary", () => {
  it("documents live Opik metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0948");
    expect(doc).toContain(URL);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live Opik product page");
    expect(doc).toContain("AI Observability & Evals");
    expect(doc).toContain("Agentic Era");
    expect(doc).toContain("logs every step your agent takes");
    expect(doc).toContain("user interactions to context retrieval and tool calls");
    expect(doc).toContain("automated eval workflows");
    expect(doc).toContain("development, testing, and production");
    expect(doc).toContain("Trace & Debug Any Step");
    expect(doc).toContain("Capture, visualize, and understand every action");
    expect(doc).toContain("annotate and fix underperforming traces");
    expect(doc).toContain("audit logs");
    expect(doc).toContain("Evaluate Outcomes with LLM-as-a-Judge Metrics");
    expect(doc).toContain("reference dataset or a plain-text assertion");
    expect(doc).toContain("surface errors out of thousands of traces");
    expect(doc).toContain("Evaluate traces from development, testing, or production");
    expect(doc).toContain("30+ metrics");
    expect(doc).toContain("answer relevance, context precision, task completion, hallucination");
    expect(doc).toContain("Monitor Your Agents in Production");
    expect(doc).toContain("Evaluate production traces in real time");
    expect(doc).toContain("alerted if a user interaction fails");
    expect(doc).toContain("Apply guardrails");
    expect(doc).toContain("PII exposure");
    expect(doc).toContain("The Opik Difference");
    expect(doc).toContain("Test Suites & Assertions");
    expect(doc).toContain("Ollie");
    expect(doc).toContain("Agent Playground");
    expect(doc).toContain("Open Source & Ready to Run");
    expect(doc).toContain("19k");
    expect(doc).toContain("Log traces");
    expect(doc).toContain("Build test suites from your traces");
    expect(doc).toContain("Track quality in production");
    expect(doc).toContain("online evaluation rules");
    expect(doc).toContain("feedback scores, latency, cost, and error rates");
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

  it("accepts Opik context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0948-opik-reviewed-agent",
      baselineWindow: {
        windowId: "gap0948-baseline",
        startedAt: "2026-06-21T10:48:00.000Z",
        endedAt: "2026-06-21T13:48:00.000Z",
        rows: rows("baseline", 0.89, "stable-opik-production-agent"),
      },
      liveWindow: {
        windowId: "gap0948-live",
        startedAt: "2026-06-22T10:48:00.000Z",
        endedAt: "2026-06-22T13:48:00.000Z",
        rows: rows("live", 0.47, "drifted-opik-production-agent"),
      },
      sourceRefs: [URL, DOCS],
      now: new Date("2026-06-22T14:48:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([URL, DOCS]);
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

  it("fails closed when Opik metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.47, "drifted-opik-production-agent").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0948-opik-reviewed-agent",
      baselineWindow: {
        windowId: "gap0948-metadata-only-baseline",
        startedAt: "2026-06-21T10:48:00.000Z",
        endedAt: "2026-06-21T13:48:00.000Z",
        rows: rows("baseline", 0.89, "stable-opik-production-agent"),
      },
      liveWindow: {
        windowId: "gap0948-metadata-only-live",
        startedAt: "2026-06-22T10:48:00.000Z",
        endedAt: "2026-06-22T13:48:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [URL],
      now: new Date("2026-06-22T14:48:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add Opik identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(URL);
      expect(source).not.toContain("comet_opik_live_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
