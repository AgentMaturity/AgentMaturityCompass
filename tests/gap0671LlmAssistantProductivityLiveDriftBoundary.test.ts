import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0671-llm-assistant-productivity-live-drift.md";
const DOI = "10.1145/3809494";
const OPENALEX = "W4415343831";
const ARXIV = "https://arxiv.org/abs/2507.03156";

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0671-${prefix}-trace-${index}`,
    scenarioId: `gap0671-code-assistant-productivity-${index}`,
    timestamp: `2026-06-21T0${index}:40:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:${index}`,
    taskCategory: "llm-assistant-developer-productivity",
    domain: "software-engineering-assistant",
    agentEvaluationDimension: "developer_productivity_behavior_regression",
    interactionTurnCount: prefix === "live" ? 16 + index : 8 + index,
    invalidActionRate0to1: prefix === "live" ? 0.1 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.07 : 0.01,
    toolCallCount: prefix === "live" ? 8 : 3,
    latencyMs: prefix === "live" ? 2400 : 950,
    costUsd: prefix === "live" ? 0.026 : 0.009,
    evidenceRefs: [`ev-gap0671-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0671-${prefix}-${index}`],
  }));
}

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/bishengObservabilityLiveDrift.ts",
  "src/score/bishengObservabilityLiveDriftScore.ts",
];

describe("GAP-0671 LLM-assistant productivity live-drift boundary", () => {
  it("documents live source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0671");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain("The Impact of LLM-Assistants on Software Developer Productivity");
    expect(doc).toContain("Systematic Review and Mapping Study");
    expect(doc).toContain("SPACE framework");
    expect(doc).toContain("replication package");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for software-assistant behavior changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0671-code-assistant-agent",
      baselineWindow: {
        windowId: "gap0671-baseline",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T04:00:00.000Z",
        rows: rows("baseline", 0.9, "stable-code-assistant-workflow"),
      },
      liveWindow: {
        windowId: "gap0671-live",
        startedAt: "2026-06-21T00:00:00.000Z",
        endedAt: "2026-06-21T04:00:00.000Z",
        rows: rows("live", 0.66, "drifted-code-assistant-workflow"),
      },
      sourceRefs: [`https://openalex.org/${OPENALEX}`, `https://doi.org/${DOI}`, ARXIV],
      now: new Date("2026-06-21T06:00:00.000Z"),
    });

    expect(receipt.sourceRefs).toEqual([`https://openalex.org/${OPENALEX}`, `https://doi.org/${DOI}`, ARXIV]);
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

  it("does not add LLM-assistant productivity identifiers to generic live-drift modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("2507.03156");
      expect(source).not.toContain("llm_assistant_productivity");
      expect(source).not.toContain("developer_productivity_live_drift");
    }
  });
});
