import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0969-uptrain-live-drift.md";
const GITHUB = "https://github.com/uptrain-ai/uptrain";
const DOCS = "https://docs.uptrain.ai/";
const INTRO = "https://docs.uptrain.ai/getting-started/introduction";
const TITLE = "UpTrain";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0969-${prefix}-trace-${index}`,
    scenarioId: `gap0969-uptrain-production-agent-${index}`,
    timestamp: `2026-06-22T1${index}:59:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: prefix === "live" && index === 1,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:uptrain-production-agent-${index}`,
    taskCategory: "uptrain-production-agent-live-drift",
    domain: "agent-evaluation-observability",
    agentEvaluationDimension: "observed_uptrain_agent_behavior_drift",
    interactionTurnCount: prefix === "live" ? 20 + index : 10 + index,
    invalidActionRate0to1: prefix === "live" ? 0.14 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.1 : 0.01,
    toolCallCount: prefix === "live" ? 22 : 10,
    latencyMs: prefix === "live" ? 4500 : 1520,
    costUsd: prefix === "live" ? 0.063 : 0.021,
    evidenceRefs: [`ev-gap0969-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0969-${prefix}-${index}`],
  }));
}

describe("GAP-0969 UpTrain live-drift boundary", () => {
  it("documents live UpTrain metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0969");
    expect(doc).toContain(GITHUB);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(INTRO);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("live UpTrain docs");
    expect(doc).toContain("2.4k stars");
    expect(doc).toContain("202 forks");
    expect(doc).toContain("44 issues");
    expect(doc).toContain("11 pull requests");
    expect(doc).toContain("770 commits");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("20+ preconfigured evaluations");
    expect(doc).toContain("root cause analysis");
    expect(doc).toContain("local dashboard");
    expect(doc).toContain("Response Completeness");
    expect(doc).toContain("Factual Accuracy");
    expect(doc).toContain("Context Relevance");
    expect(doc).toContain("Prompt Injection");
    expect(doc).toContain("Jailbreak Detection");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Claude");
    expect(doc).toContain("Ollama");
    expect(doc).toContain("Langfuse");
    expect(doc).toContain("Monitoring Prompt Drift");
    expect(doc).toContain("fixed dataset");
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

  it("accepts UpTrain context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0969-uptrain-reviewed-agent",
      baselineWindow: {
        windowId: "gap0969-baseline",
        startedAt: "2026-06-21T10:59:00.000Z",
        endedAt: "2026-06-21T13:59:00.000Z",
        rows: rows("baseline", 0.89, "stable-uptrain-production-agent"),
      },
      liveWindow: {
        windowId: "gap0969-live",
        startedAt: "2026-06-22T10:59:00.000Z",
        endedAt: "2026-06-22T13:59:00.000Z",
        rows: rows("live", 0.47, "drifted-uptrain-production-agent"),
      },
      sourceRefs: [GITHUB, DOCS, INTRO],
      now: new Date("2026-06-22T14:59:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([GITHUB, DOCS, INTRO]);
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

  it("fails closed when UpTrain metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.47, "drifted-uptrain-production-agent").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0969-uptrain-reviewed-agent",
      baselineWindow: {
        windowId: "gap0969-metadata-only-baseline",
        startedAt: "2026-06-21T10:59:00.000Z",
        endedAt: "2026-06-21T13:59:00.000Z",
        rows: rows("baseline", 0.89, "stable-uptrain-production-agent"),
      },
      liveWindow: {
        windowId: "gap0969-metadata-only-live",
        startedAt: "2026-06-22T10:59:00.000Z",
        endedAt: "2026-06-22T13:59:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [GITHUB],
      now: new Date("2026-06-22T14:59:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add UpTrain identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(GITHUB);
      expect(source).not.toContain("uptrain_live_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
