import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0719-mcp-universe-live-drift.md";
const SOURCE = "https://github.com/SalesforceAIResearch/MCP-Universe";
const README = "https://github.com/SalesforceAIResearch/MCP-Universe/blob/main/README.md";
const REPO = "SalesforceAIResearch/MCP-Universe";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0719-${prefix}-trace-${index}`,
    scenarioId: `gap0719-mcp-tool-use-workflow-${index}`,
    timestamp: `2026-06-21T2${index}:10:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 2,
    behaviorSignature: `${behavior}:${index}`,
    taskCategory: "mcp-tool-use-benchmark-drift",
    domain: "mcp-agent-evaluation",
    agentEvaluationDimension: "observed_mcp_tool_use_behavior_drift",
    interactionTurnCount: prefix === "live" ? 24 + index : 11 + index,
    invalidActionRate0to1: prefix === "live" ? 0.13 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 10 : 4,
    latencyMs: prefix === "live" ? 3900 : 1550,
    costUsd: prefix === "live" ? 0.061 : 0.019,
    evidenceRefs: [`ev-gap0719-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0719-${prefix}-${index}`],
  }));
}

describe("GAP-0719 MCP-Universe live-drift boundary", () => {
  it("documents live MCP-Universe metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0719");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(README);
    expect(doc).toContain(REPO);
    expect(doc).toContain("repository id `976443794`");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("size `4098`");
    expect(doc).toContain("not archived");
    expect(doc).toContain("MCPMark");
    expect(doc).toContain("MCP+");
    expect(doc).toContain("Deep Research Agent");
    expect(doc).toContain("real-world MCP server interactions");
    expect(doc).toContain("long-horizon reasoning");
    expect(doc).toContain("large unfamiliar tool spaces");
    expect(doc).toContain("live environments");
    expect(doc).toContain("dynamic evaluation");
    expect(doc).toContain("multi-provider LLM support");
    expect(doc).toContain("trace");
    expect(doc).toContain("dashboard");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for MCP-Universe-style tool-use drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0719-mcp-universe-reviewed-agent",
      baselineWindow: {
        windowId: "gap0719-baseline",
        startedAt: "2026-06-20T20:10:00.000Z",
        endedAt: "2026-06-20T23:10:00.000Z",
        rows: rows("baseline", 0.91, "stable-mcp-tool-use-workflow"),
      },
      liveWindow: {
        windowId: "gap0719-live",
        startedAt: "2026-06-21T20:10:00.000Z",
        endedAt: "2026-06-21T23:10:00.000Z",
        rows: rows("live", 0.57, "drifted-mcp-tool-use-workflow"),
      },
      sourceRefs: [SOURCE, README],
      now: new Date("2026-06-21T23:30:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([SOURCE, README]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when MCP-Universe metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.57, "drifted-mcp-tool-use-workflow").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0719-mcp-universe-reviewed-agent",
      baselineWindow: {
        windowId: "gap0719-metadata-only-baseline",
        startedAt: "2026-06-20T20:10:00.000Z",
        endedAt: "2026-06-20T23:10:00.000Z",
        rows: rows("baseline", 0.91, "stable-mcp-tool-use-workflow"),
      },
      liveWindow: {
        windowId: "gap0719-metadata-only-live",
        startedAt: "2026-06-21T20:10:00.000Z",
        endedAt: "2026-06-21T23:10:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [SOURCE, README],
      now: new Date("2026-06-21T23:30:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add MCP-Universe identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("mcp_universe_live_drift");
      expect(source).not.toContain("MCPMark");
    }
  });
});
