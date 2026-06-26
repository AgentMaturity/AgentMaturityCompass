import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0884-awesome-mcp-security-live-drift.md";
const REPO = "getagentseal/awesome-mcp-security";
const URL = "https://github.com/getagentseal/awesome-mcp-security";
const TITLE = "Awesome MCP Security";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0884-${prefix}-trace-${index}`,
    scenarioId: `gap0884-mcp-security-score-${index}`,
    timestamp: `2026-06-22T1${index}:44:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:mcp-security-analyzer:${index}`,
    taskCategory: "mcp-security-score-live-drift",
    domain: "agent-evaluation-security",
    agentEvaluationDimension: "observed_mcp_security_score_behavior_drift",
    interactionTurnCount: prefix === "live" ? 18 + index : 8 + index,
    invalidActionRate0to1: prefix === "live" ? 0.12 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.09 : 0.01,
    toolCallCount: prefix === "live" ? 7 : 3,
    latencyMs: prefix === "live" ? 3400 : 1200,
    costUsd: prefix === "live" ? 0.058 : 0.014,
    evidenceRefs: [`ev-gap0884-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0884-${prefix}-${index}`],
  }));
}

describe("GAP-0884 Awesome MCP Security live-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0884");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("CONTRIBUTING.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("README.ja.md");
    expect(doc).toContain("README.ko.md");
    expect(doc).toContain("README.zh.md");
    expect(doc).toContain("Star 25");
    expect(doc).toContain("Fork 6");
    expect(doc).toContain("Issues 6");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("7 Commits");
    expect(doc).toContain("800+ MCP servers");
    expect(doc).toContain("Total servers scanned 800");
    expect(doc).toContain("Safe (score >= 80) 631");
    expect(doc).toContain("Review (score 50-79) 169");
    expect(doc).toContain("Total security findings 6237");
    expect(doc).toContain("Last updated March 14, 2026");
    expect(doc).toContain("9 security analyzers");
    expect(doc).toContain("Schema Analysis");
    expect(doc).toContain("Static Pattern Detection");
    expect(doc).toContain("Prompt Injection Scanning");
    expect(doc).toContain("Toxic Flow Mapping");
    expect(doc).toContain("Unicode Detection");
    expect(doc).toContain("Deep Autopsy");
    expect(doc).toContain("Annotations & Instructions");
    expect(doc).toContain("Resource Analysis");
    expect(doc).toContain("LLM Classification");
    expect(doc).toContain("Trust Score: 0-100");
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

  it("uses existing Watch live-drift receipts for MCP security-score changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0884-mcp-security-reviewed-agent",
      baselineWindow: {
        windowId: "gap0884-baseline",
        startedAt: "2026-06-21T10:44:00.000Z",
        endedAt: "2026-06-21T13:44:00.000Z",
        rows: rows("baseline", 0.91, "stable-mcp-security-score"),
      },
      liveWindow: {
        windowId: "gap0884-live",
        startedAt: "2026-06-22T10:44:00.000Z",
        endedAt: "2026-06-22T13:44:00.000Z",
        rows: rows("live", 0.52, "drifted-mcp-security-score"),
      },
      sourceRefs: [URL],
      now: new Date("2026-06-22T14:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([URL]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when Awesome MCP Security source metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.52, "drifted-mcp-security-score").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0884-mcp-security-reviewed-agent",
      baselineWindow: {
        windowId: "gap0884-metadata-only-baseline",
        startedAt: "2026-06-21T10:44:00.000Z",
        endedAt: "2026-06-21T13:44:00.000Z",
        rows: rows("baseline", 0.91, "stable-mcp-security-score"),
      },
      liveWindow: {
        windowId: "gap0884-metadata-only-live",
        startedAt: "2026-06-22T10:44:00.000Z",
        endedAt: "2026-06-22T13:44:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [URL],
      now: new Date("2026-06-22T14:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(false);
  });

  it("does not add Awesome MCP Security identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("awesome_mcp_security_live_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
