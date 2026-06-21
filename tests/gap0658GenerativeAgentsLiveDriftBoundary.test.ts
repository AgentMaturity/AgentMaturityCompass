import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2].map((index) => ({
    traceId: `gap0658-${prefix}-trace-${index}`,
    scenarioId: "urban-perception-generative-agent",
    timestamp: `2026-06-21T0${index}:00:00.000Z`,
    score0to1,
    behaviorSignature: `${behavior}:${index}`,
    taskCategory: "generative-agent-urban-perception",
    agentEvaluationDimension: "conversational_agents",
    interactionTurnCount: prefix === "live" ? 14 + index : 8 + index,
    solutionPathCount: prefix === "live" ? 5 : 3,
    offPathAttemptCount: prefix === "live" ? 4 : 1,
    divergenceMomentum0to1: prefix === "live" ? 0.34 : 0.07,
    actionFixationRate0to1: prefix === "live" ? 0.24 : 0.05,
    latencyMs: prefix === "live" ? 1900 : 950,
    costUsd: prefix === "live" ? 0.018 : 0.009,
    evidenceRefs: [`ev-gap0658-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0658-${prefix}-${index}`],
  }));
}

describe("GAP-0658 generative-agents live-drift source-review boundary", () => {
  it("documents relevance while keeping paper metadata out of product-specific subsystems", () => {
    const doc = readFileSync("docs/source-reviews/GAP-0658-generative-agents-live-drift.md", "utf8");

    expect(doc).toContain("GAP-0658");
    expect(doc).toContain("10.1016/j.chbah.2026.100277");
    expect(doc).toContain("W4390092730");
    expect(doc).toContain("Generative agents in the streets");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("No generative-agent subsystem");
    expect(doc).toContain("No paper prose");
  });

  it("uses existing Watch live-drift receipts for urban-perception behavior changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0658-generative-agent",
      baselineWindow: {
        windowId: "gap0658-baseline",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T03:00:00.000Z",
        rows: rows("baseline", 0.9, "stable-urban-perception"),
      },
      liveWindow: {
        windowId: "gap0658-live",
        startedAt: "2026-06-21T00:00:00.000Z",
        endedAt: "2026-06-21T03:00:00.000Z",
        rows: rows("live", 0.72, "drifting-urban-perception"),
      },
      sourceRefs: ["https://doi.org/10.1016/j.chbah.2026.100277", "https://openalex.org/W4390092730"],
      now: new Date("2026-06-21T04:00:00.000Z"),
    });

    expect(receipt.sourceRefs).toEqual([
      "https://doi.org/10.1016/j.chbah.2026.100277",
      "https://openalex.org/W4390092730",
    ]);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining(["scoreMean0to1", "behaviorSignature"]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).length).toBeGreaterThan(0);
  });
});
