import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0679-genmac-live-drift.md";
const DOI = "10.1609/aaai.v40i7.37418";
const OPENALEX = "W7138404676";
const ARXIV = "https://arxiv.org/abs/2412.04440";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0679-${prefix}-trace-${index}`,
    scenarioId: `gap0679-compositional-video-${index}`,
    timestamp: `2026-06-21T1${index}:00:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:${index}`,
    taskCategory: "compositional-text-to-video",
    domain: "multi-agent-generation-evaluation",
    agentEvaluationDimension: "multi_agent_compositional_generation",
    interactionTurnCount: prefix === "live" ? 14 + index : 7 + index,
    invalidActionRate0to1: prefix === "live" ? 0.09 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.06 : 0.01,
    toolCallCount: prefix === "live" ? 6 : 3,
    latencyMs: prefix === "live" ? 2800 : 1100,
    costUsd: prefix === "live" ? 0.034 : 0.012,
    evidenceRefs: [`ev-gap0679-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0679-${prefix}-${index}`],
  }));
}

describe("GAP-0679 GENMAC live-drift boundary", () => {
  it("documents live GENMAC metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0679");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain("GenMAC: Compositional Text-to-Video Generation with Multi-Agent Collaboration");
    expect(doc).toContain("Thu Dec  5 18:56:05 2024");
    expect(doc).toContain("Design, Generation, and Redesign");
    expect(doc).toContain("verification agent");
    expect(doc).toContain("suggestion agent");
    expect(doc).toContain("correction agent");
    expect(doc).toContain("output structuring agent");
    expect(doc).toContain("self-routing mechanism");
    expect(doc).toContain("compositional text-to-video generation");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for multi-agent generation behavior changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0679-multi-agent-generation-agent",
      baselineWindow: {
        windowId: "gap0679-baseline",
        startedAt: "2026-06-20T10:00:00.000Z",
        endedAt: "2026-06-20T14:00:00.000Z",
        rows: rows("baseline", 0.91, "stable-compositional-generation-workflow"),
      },
      liveWindow: {
        windowId: "gap0679-live",
        startedAt: "2026-06-21T10:00:00.000Z",
        endedAt: "2026-06-21T14:00:00.000Z",
        rows: rows("live", 0.64, "drifted-compositional-generation-workflow"),
      },
      sourceRefs: [`https://openalex.org/${OPENALEX}`, `https://doi.org/${DOI}`, ARXIV],
      now: new Date("2026-06-21T15:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([`https://openalex.org/${OPENALEX}`, `https://doi.org/${DOI}`, ARXIV]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when GENMAC source metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.64, "drifted-compositional-generation-workflow").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0679-multi-agent-generation-agent",
      baselineWindow: {
        windowId: "gap0679-metadata-only-baseline",
        startedAt: "2026-06-20T10:00:00.000Z",
        endedAt: "2026-06-20T14:00:00.000Z",
        rows: rows("baseline", 0.91, "stable-compositional-generation-workflow"),
      },
      liveWindow: {
        windowId: "gap0679-metadata-only-live",
        startedAt: "2026-06-21T10:00:00.000Z",
        endedAt: "2026-06-21T14:00:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [ARXIV],
      now: new Date("2026-06-21T15:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add GENMAC-specific identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("GenMAC");
      expect(source).not.toContain("genmac_live_drift");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
    }
  });
});
