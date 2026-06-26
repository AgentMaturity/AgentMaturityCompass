import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0965-deepeval-live-drift.md";
const CONFIDENT = "https://www.confident-ai.com";
const DEEPEVAL = "https://deepeval.com/";
const GITHUB = "https://github.com/confident-ai/deepeval";
const TITLE = "DeepEval";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0965-${prefix}-trace-${index}`,
    scenarioId: `gap0965-deepeval-production-agent-${index}`,
    timestamp: `2026-06-22T1${index}:55:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: prefix === "live" && index === 1,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:deepeval-production-agent-${index}`,
    taskCategory: "deepeval-production-agent-live-drift",
    domain: "agent-evaluation-observability",
    agentEvaluationDimension: "observed_deepeval_agent_behavior_drift",
    interactionTurnCount: prefix === "live" ? 19 + index : 9 + index,
    invalidActionRate0to1: prefix === "live" ? 0.13 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.09 : 0.01,
    toolCallCount: prefix === "live" ? 21 : 9,
    latencyMs: prefix === "live" ? 4400 : 1500,
    costUsd: prefix === "live" ? 0.061 : 0.02,
    evidenceRefs: [`ev-gap0965-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0965-${prefix}-${index}`],
  }));
}

describe("GAP-0965 DeepEval live-drift boundary", () => {
  it("documents live DeepEval and Confident AI metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0965");
    expect(doc).toContain(CONFIDENT);
    expect(doc).toContain(DEEPEVAL);
    expect(doc).toContain(GITHUB);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live DeepEval homepage");
    expect(doc).toContain("live Confident AI homepage");
    expect(doc).toContain("GitHub repository page");
    expect(doc).toContain("LLM Evaluation Framework");
    expect(doc).toContain("local or CI evaluation tests");
    expect(doc).toContain("research-backed metrics");
    expect(doc).toContain("transparent score explanations");
    expect(doc).toContain("agent traces");
    expect(doc).toContain("synthetic goldens");
    expect(doc).toContain("quality alerts");
    expect(doc).toContain("production traces");
    expect(doc).toContain("trace-to-dataset workflow");
    expect(doc).toContain("real-time monitoring");
    expect(doc).toContain("quality degradation");
    expect(doc).toContain("CI pipeline");
    expect(doc).toContain("build fails");
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

  it("accepts DeepEval context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0965-deepeval-reviewed-agent",
      baselineWindow: {
        windowId: "gap0965-baseline",
        startedAt: "2026-06-21T10:55:00.000Z",
        endedAt: "2026-06-21T13:55:00.000Z",
        rows: rows("baseline", 0.9, "stable-deepeval-production-agent"),
      },
      liveWindow: {
        windowId: "gap0965-live",
        startedAt: "2026-06-22T10:55:00.000Z",
        endedAt: "2026-06-22T13:55:00.000Z",
        rows: rows("live", 0.48, "drifted-deepeval-production-agent"),
      },
      sourceRefs: [CONFIDENT, DEEPEVAL, GITHUB],
      now: new Date("2026-06-22T14:55:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([CONFIDENT, DEEPEVAL, GITHUB]);
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

  it("fails closed when DeepEval metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.48, "drifted-deepeval-production-agent").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0965-deepeval-reviewed-agent",
      baselineWindow: {
        windowId: "gap0965-metadata-only-baseline",
        startedAt: "2026-06-21T10:55:00.000Z",
        endedAt: "2026-06-21T13:55:00.000Z",
        rows: rows("baseline", 0.9, "stable-deepeval-production-agent"),
      },
      liveWindow: {
        windowId: "gap0965-metadata-only-live",
        startedAt: "2026-06-22T10:55:00.000Z",
        endedAt: "2026-06-22T13:55:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [CONFIDENT, DEEPEVAL],
      now: new Date("2026-06-22T14:55:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add DeepEval or Confident AI identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(CONFIDENT);
      expect(source).not.toContain("deepeval_live_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
