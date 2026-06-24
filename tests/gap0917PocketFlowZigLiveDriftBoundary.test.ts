import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0917-pocketflow-zig-live-drift.md";
const REPO = "The-Pocket/PocketFlow-Zig";
const URL = "https://github.com/The-Pocket/PocketFlow-Zig";
const TITLE = "PocketFlow-Zig";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0917-${prefix}-trace-${index}`,
    scenarioId: `gap0917-pocketflow-zig-score-${index}`,
    timestamp: `2026-06-22T1${index}:17:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:zig-flow-agent:${index}`,
    taskCategory: "pocketflow-zig-score-live-drift",
    domain: "agent-evaluation-workflow",
    agentEvaluationDimension: "observed_zig_flow_agent_score_behavior_drift",
    interactionTurnCount: prefix === "live" ? 18 + index : 8 + index,
    invalidActionRate0to1: prefix === "live" ? 0.13 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.06 : 0.01,
    toolCallCount: prefix === "live" ? 7 : 2,
    latencyMs: prefix === "live" ? 3100 : 1250,
    costUsd: prefix === "live" ? 0.048 : 0.012,
    evidenceRefs: [`ev-gap0917-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0917-${prefix}-${index}`],
  }));
}

describe("GAP-0917 PocketFlow-Zig live-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0917");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 15");
    expect(doc).toContain("Fork 1");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("28 Commits");
    expect(doc).toContain(".github/ workflows");
    expect(doc).toContain("docs");
    expect(doc).toContain("examples");
    expect(doc).toContain("src");
    expect(doc).toContain("CHANGELOG.md");
    expect(doc).toContain("CONTRIBUTING.md");
    expect(doc).toContain("SECURITY.md");
    expect(doc).toContain("build.zig");
    expect(doc).toContain("build.zig.zon");
    expect(doc).toContain("Releases 2");
    expect(doc).toContain("v0.3.1");
    expect(doc).toContain("Jan 26, 2026");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Zig 100.0%");
    expect(doc).toContain("minimalist flow-based programming framework");
    expect(doc).toContain("LLM-powered workflows");
    expect(doc).toContain("Compile-time polymorphism");
    expect(doc).toContain("Explicit memory management");
    expect(doc).toContain("Thread-safe context");
    expect(doc).toContain("Zero dependencies");
    expect(doc).toContain("Node-based architecture");
    expect(doc).toContain("Flow execution engine");
    expect(doc).toContain("Ollama integration");
    expect(doc).toContain("Action-based routing");
    expect(doc).toContain("document_generator.zig");
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

  it("uses existing Watch live-drift receipts for PocketFlow-Zig workflow drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0917-pocketflow-zig-reviewed-agent",
      baselineWindow: {
        windowId: "gap0917-baseline",
        startedAt: "2026-06-21T10:17:00.000Z",
        endedAt: "2026-06-21T13:17:00.000Z",
        rows: rows("baseline", 0.89, "stable-zig-flow"),
      },
      liveWindow: {
        windowId: "gap0917-live",
        startedAt: "2026-06-22T10:17:00.000Z",
        endedAt: "2026-06-22T13:17:00.000Z",
        rows: rows("live", 0.56, "drifted-zig-flow"),
      },
      sourceRefs: [URL],
      now: new Date("2026-06-22T14:17:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([URL]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "invalidActionRate0to1",
      "latencyMsP95",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when PocketFlow-Zig metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.56, "drifted-zig-flow").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0917-pocketflow-zig-reviewed-agent",
      baselineWindow: {
        windowId: "gap0917-metadata-only-baseline",
        startedAt: "2026-06-21T10:17:00.000Z",
        endedAt: "2026-06-21T13:17:00.000Z",
        rows: rows("baseline", 0.89, "stable-zig-flow"),
      },
      liveWindow: {
        windowId: "gap0917-metadata-only-live",
        startedAt: "2026-06-22T10:17:00.000Z",
        endedAt: "2026-06-22T13:17:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [URL],
      now: new Date("2026-06-22T14:17:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(false);
  });

  it("does not add PocketFlow-Zig identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("pocketflow_zig_live_drift");
    }
  });
});
