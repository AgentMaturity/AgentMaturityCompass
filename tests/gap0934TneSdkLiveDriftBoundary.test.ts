import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0934-tne-sdk-live-drift.md";
const REPO = "Firespawn-Studios/tne-sdk";
const URL = "https://github.com/Firespawn-Studios/tne-sdk";
const TITLE = "TNE-SDK";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3, 4].map((index) => ({
    traceId: `gap0934-${prefix}-trace-${index}`,
    scenarioId: `gap0934-tne-sdk-autonomous-agent-${index}`,
    timestamp: `2026-06-22T1${index}:34:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 4,
    behaviorSignature: `${behavior}:mcp-memory-reflection-loop:${index}`,
    taskCategory: "tne-sdk-live-score-behavior-drift",
    domain: "autonomous-agent-gameplay-benchmark",
    agentEvaluationDimension: "observed_tne_sdk_autonomous_agent_score_behavior_drift",
    interactionTurnCount: prefix === "live" ? 34 + index : 12 + index,
    invalidActionRate0to1: prefix === "live" ? 0.16 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 11 : 4,
    latencyMs: prefix === "live" ? 4200 : 1450,
    costUsd: prefix === "live" ? 0.071 : 0.018,
    evidenceRefs: [`ev-gap0934-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0934-${prefix}-${index}`],
  }));
}

describe("GAP-0934 TNE-SDK live-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0934");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("Star 13");
    expect(doc).toContain("Fork 1");
    expect(doc).toContain("Issues 1");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("49 Commits");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain(".github");
    expect(doc).toContain("examples");
    expect(doc).toContain("skills/ null-epoch");
    expect(doc).toContain("src/ tne_sdk");
    expect(doc).toContain("tests");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("Python 100.0%");
    expect(doc).toContain("AI-only MMO");
    expect(doc).toContain("MCP");
    expect(doc).toContain("TUI launcher");
    expect(doc).toContain("raw HTTP");
    expect(doc).toContain("persistent memory");
    expect(doc).toContain("self-reflection");
    expect(doc).toContain("hierarchical goal planning");
    expect(doc).toContain("full action/reasoning loop");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Anthropic");
    expect(doc).toContain("Ollama");
    expect(doc).toContain("vLLM");
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

  it("uses existing Watch live-drift receipts for autonomous gameplay agent drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0934-tne-sdk-reviewed-agent",
      baselineWindow: {
        windowId: "gap0934-baseline",
        startedAt: "2026-06-21T10:34:00.000Z",
        endedAt: "2026-06-21T13:34:00.000Z",
        rows: rows("baseline", 0.91, "stable-autonomous-gameplay-agent"),
      },
      liveWindow: {
        windowId: "gap0934-live",
        startedAt: "2026-06-22T10:34:00.000Z",
        endedAt: "2026-06-22T13:34:00.000Z",
        rows: rows("live", 0.54, "drifted-autonomous-gameplay-agent"),
      },
      sourceRefs: [URL],
      now: new Date("2026-06-22T14:34:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([URL]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "passRate0to1",
      "behaviorSignature",
      "invalidActionRate0to1",
      "interactionTurnMean",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when TNE-SDK metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.54, "drifted-autonomous-gameplay-agent").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0934-tne-sdk-reviewed-agent",
      baselineWindow: {
        windowId: "gap0934-metadata-only-baseline",
        startedAt: "2026-06-21T10:34:00.000Z",
        endedAt: "2026-06-21T13:34:00.000Z",
        rows: rows("baseline", 0.91, "stable-autonomous-gameplay-agent"),
      },
      liveWindow: {
        windowId: "gap0934-metadata-only-live",
        startedAt: "2026-06-22T10:34:00.000Z",
        endedAt: "2026-06-22T13:34:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [URL],
      now: new Date("2026-06-22T14:34:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(false);
  });

  it("does not add TNE-SDK identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("tne_sdk_live_drift");
      expect(source).not.toContain("Null Epoch");
    }
  });
});
