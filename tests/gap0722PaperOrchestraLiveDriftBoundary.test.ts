import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0722-paperorchestra-live-drift.md";
const SOURCE = "https://github.com/Ar9av/PaperOrchestra";
const README = "https://raw.githubusercontent.com/Ar9av/PaperOrchestra/main/README.md";
const PAPER = "https://arxiv.org/abs/2604.05018";
const REPO = "Ar9av/PaperOrchestra";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0722-${prefix}-trace-${index}`,
    scenarioId: `gap0722-paper-writing-workflow-${index}`,
    timestamp: `2026-06-21T1${index}:40:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 1,
    behaviorSignature: `${behavior}:${index}`,
    taskCategory: "research-paper-writing-workflow-drift",
    domain: "automated-research-agent-evaluation",
    agentEvaluationDimension: "observed_research_writing_agent_behavior_drift",
    interactionTurnCount: prefix === "live" ? 32 + index : 14 + index,
    invalidActionRate0to1: prefix === "live" ? 0.16 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.11 : 0.01,
    toolCallCount: prefix === "live" ? 18 : 6,
    latencyMs: prefix === "live" ? 5200 : 1900,
    costUsd: prefix === "live" ? 0.084 : 0.022,
    evidenceRefs: [`ev-gap0722-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0722-${prefix}-${index}`],
  }));
}

describe("GAP-0722 PaperOrchestra live-drift boundary", () => {
  it("documents live PaperOrchestra metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0722");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(README);
    expect(doc).toContain(PAPER);
    expect(doc).toContain(REPO);
    expect(doc).toContain("host-agent-executable skills");
    expect(doc).toContain("deterministic helper scripts");
    expect(doc).toContain("PaperWritingBench");
    expect(doc).toContain("autorater");
    expect(doc).toContain("agent log aggregation");
    expect(doc).toContain("citation checking");
    expect(doc).toContain("LaTeX sanity checks");
    expect(doc).toContain("research-writing workflow");
    expect(doc).toContain("live score and behavior drift");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for PaperOrchestra-style research-writing drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0722-paperorchestra-reviewed-agent",
      baselineWindow: {
        windowId: "gap0722-baseline",
        startedAt: "2026-06-20T10:40:00.000Z",
        endedAt: "2026-06-20T13:40:00.000Z",
        rows: rows("baseline", 0.9, "stable-paper-writing-workflow"),
      },
      liveWindow: {
        windowId: "gap0722-live",
        startedAt: "2026-06-21T10:40:00.000Z",
        endedAt: "2026-06-21T13:40:00.000Z",
        rows: rows("live", 0.52, "drifted-paper-writing-workflow"),
      },
      sourceRefs: [SOURCE, README, PAPER],
      now: new Date("2026-06-21T14:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([SOURCE, README, PAPER]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when PaperOrchestra metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.52, "drifted-paper-writing-workflow").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0722-paperorchestra-reviewed-agent",
      baselineWindow: {
        windowId: "gap0722-metadata-only-baseline",
        startedAt: "2026-06-20T10:40:00.000Z",
        endedAt: "2026-06-20T13:40:00.000Z",
        rows: rows("baseline", 0.9, "stable-paper-writing-workflow"),
      },
      liveWindow: {
        windowId: "gap0722-metadata-only-live",
        startedAt: "2026-06-21T10:40:00.000Z",
        endedAt: "2026-06-21T13:40:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [SOURCE, README, PAPER],
      now: new Date("2026-06-21T14:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add PaperOrchestra identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("PaperOrchestra");
      expect(source).not.toContain("paperorchestra_live_drift");
      expect(source).not.toContain("PaperWritingBench");
    }
  });
});
