import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0659-${prefix}-trace-${index}`,
    scenarioId: "rag-service-discovery-endpoint-selection",
    timestamp: `2026-06-21T0${index}:15:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:${index}`,
    taskCategory: "rag-service-discovery",
    domain: "service-discovery-rag",
    agentEvaluationDimension: "retrieval_behavior_regression",
    interactionTurnCount: prefix === "live" ? 11 + index : 6 + index,
    invalidActionRate0to1: prefix === "live" ? 0.11 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.09 : 0.01,
    toolCallCount: prefix === "live" ? 7 : 3,
    latencyMs: prefix === "live" ? 2100 : 900,
    costUsd: prefix === "live" ? 0.021 : 0.008,
    evidenceRefs: [`ev-gap0659-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0659-${prefix}-${index}`],
  }));
}

describe("GAP-0659 RAG service-discovery live-drift source-review boundary", () => {
  it("documents source relevance, retrieval limits, and no-bloat boundaries", () => {
    const doc = readFileSync("docs/source-reviews/GAP-0659-rag-service-discovery-live-drift.md", "utf8");

    expect(doc).toContain("GAP-0659");
    expect(doc).toContain("W7129177026");
    expect(doc).toContain("10.1109/tsc.2026.3665441");
    expect(doc).toContain("https://arxiv.org/abs/2505.19310");
    expect(doc).toContain("DNS resolution errors");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
    expect(doc).toContain("No RAG chunking subsystem");
    expect(doc).toContain("No paper prose");
  });

  it("uses existing Watch live-drift receipts for service-discovery RAG behavior changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0659-rag-service-discovery-agent",
      baselineWindow: {
        windowId: "gap0659-baseline",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T04:00:00.000Z",
        rows: rows("baseline", 0.91, "stable-endpoint-selection"),
      },
      liveWindow: {
        windowId: "gap0659-live",
        startedAt: "2026-06-21T00:00:00.000Z",
        endedAt: "2026-06-21T04:00:00.000Z",
        rows: rows("live", 0.68, "drifted-endpoint-selection"),
      },
      sourceRefs: [
        "https://openalex.org/W7129177026",
        "https://doi.org/10.1109/tsc.2026.3665441",
        "https://arxiv.org/abs/2505.19310",
      ],
      now: new Date("2026-06-21T05:00:00.000Z"),
    });

    expect(receipt.sourceRefs).toEqual([
      "https://openalex.org/W7129177026",
      "https://doi.org/10.1109/tsc.2026.3665441",
      "https://arxiv.org/abs/2505.19310",
    ]);
    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });
});
