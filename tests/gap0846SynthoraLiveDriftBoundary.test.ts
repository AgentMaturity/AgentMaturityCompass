import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0846-synthora-live-drift.md";
const REPO = "syntropix-ai/synthora";
const URL = "https://github.com/syntropix-ai/synthora";
const DOCS = "https://docs.syntropix.ai/";
const TITLE = "Synthora";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0846-${prefix}-trace-${index}`,
    scenarioId: `gap0846-synthora-agent-workflow-${index}`,
    timestamp: `2026-06-21T1${index}:46:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 2,
    behaviorSignature: `${behavior}:synthora-agent-workflow:${index}`,
    taskCategory: "agent-framework-live-drift",
    domain: "agent-evaluation-framework",
    agentEvaluationDimension: "observed_agent_workflow_behavior_drift",
    interactionTurnCount: prefix === "live" ? 17 + index : 8 + index,
    invalidActionRate0to1: prefix === "live" ? 0.12 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.09 : 0.01,
    toolCallCount: prefix === "live" ? 8 : 4,
    latencyMs: prefix === "live" ? 3400 : 1400,
    costUsd: prefix === "live" ? 0.058 : 0.019,
    evidenceRefs: [`ev-gap0846-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0846-${prefix}-${index}`],
  }));
}

describe("GAP-0846 Synthora live-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0846");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("api.github.com repository metadata");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("stargazers_count");
    expect(doc).toContain("67");
    expect(doc).toContain("Python");
    expect(doc).toContain("agent");
    expect(doc).toContain("artificial-intelligence");
    expect(doc).toContain("cooperative-ai");
    expect(doc).toContain("large-language-models");
    expect(doc).toContain("multi-agent-systems");
    expect(doc).toContain("workflows");
    expect(doc).toContain("Config-Driven Assembly");
    expect(doc).toContain("Agents");
    expect(doc).toContain("Tools");
    expect(doc).toContain("Task Automation");
    expect(doc).toContain("Multi-Agent Interactions");
    expect(doc).toContain("early stage");
    expect(doc).toContain("APIs are subject to significant changes");
    expect(doc).toContain("Detailed observability, analysis, and evaluation");
    expect(doc).toContain("raw.githubusercontent.com DNS lookup failed");
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

  it("uses existing Watch live-drift receipts for Synthora-style agent workflow changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0846-synthora-reviewed-agent",
      baselineWindow: {
        windowId: "gap0846-baseline",
        startedAt: "2026-06-20T10:46:00.000Z",
        endedAt: "2026-06-20T13:46:00.000Z",
        rows: rows("baseline", 0.91, "stable-agent-workflow"),
      },
      liveWindow: {
        windowId: "gap0846-live",
        startedAt: "2026-06-21T10:46:00.000Z",
        endedAt: "2026-06-21T13:46:00.000Z",
        rows: rows("live", 0.57, "drifted-agent-workflow"),
      },
      sourceRefs: [URL, DOCS],
      now: new Date("2026-06-21T14:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([URL, DOCS]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when Synthora source metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.57, "drifted-agent-workflow").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0846-synthora-reviewed-agent",
      baselineWindow: {
        windowId: "gap0846-metadata-only-baseline",
        startedAt: "2026-06-20T10:46:00.000Z",
        endedAt: "2026-06-20T13:46:00.000Z",
        rows: rows("baseline", 0.91, "stable-agent-workflow"),
      },
      liveWindow: {
        windowId: "gap0846-metadata-only-live",
        startedAt: "2026-06-21T10:46:00.000Z",
        endedAt: "2026-06-21T13:46:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [URL, DOCS],
      now: new Date("2026-06-21T14:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(false);
  });

  it("does not add Synthora identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("synthora_live_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
