import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0821-agentic-clear-live-drift.md";
const ARXIV = "https://arxiv.org/abs/2605.22608";
const DOI = "10.48550/arXiv.2605.22608";
const OPENALEX = "W7162219190";
const TITLE = "Agentic CLEAR: Automating Multi-Level Evaluation of LLM Agents";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3, 4].map((index) => ({
    traceId: `gap0821-${prefix}-trace-${index}`,
    scenarioId: `gap0821-agentic-clear-multilevel-eval-${index}`,
    timestamp: `2026-06-21T1${index}:25:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index >= 3,
    behaviorSignature: `${behavior}:system-trace-node:${index}`,
    taskCategory: "agentic-clear-multi-level-evaluation",
    domain: "agent-evaluation-and-benchmarks",
    agentEvaluationDimension: "observed_multi_level_agent_behavior_drift",
    interactionTurnCount: prefix === "live" ? 28 + index : 12 + index,
    invalidActionRate0to1: prefix === "live" ? 0.15 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.1 : 0.01,
    toolCallCount: prefix === "live" ? 13 : 5,
    latencyMs: prefix === "live" ? 4200 : 1600,
    costUsd: prefix === "live" ? 0.074 : 0.021,
    evidenceRefs: [`ev-gap0821-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0821-${prefix}-${index}`],
  }));
}

describe("GAP-0821 Agentic CLEAR live-drift boundary", () => {
  it("documents live arXiv/OpenAlex metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0821");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("DOI returned HTTP/2 302");
    expect(doc).toContain("OpenAlex API HEAD returned HTTP/2 200");
    expect(doc).toContain("Submitted on 21 May 2026");
    expect(doc).toContain("Asaf Yehudai");
    expect(doc).toContain("Lilach Eden");
    expect(doc).toContain("Michal Shmueli-Scheuer");
    expect(doc).toContain("system, trace, node");
    expect(doc).toContain("above the observability layer");
    expect(doc).toContain("four benchmarks");
    expect(doc).toContain("seven agentic settings");
    expect(doc).toContain("task success rate");
    expect(doc).toContain("human-annotated errors");
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

  it("uses existing Watch live-drift receipts for Agentic-CLEAR-style behavior changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0821-agentic-clear-reviewed-agent",
      baselineWindow: {
        windowId: "gap0821-baseline",
        startedAt: "2026-06-20T10:25:00.000Z",
        endedAt: "2026-06-20T15:25:00.000Z",
        rows: rows("baseline", 0.92, "stable-multi-level-agent-evaluation"),
      },
      liveWindow: {
        windowId: "gap0821-live",
        startedAt: "2026-06-21T10:25:00.000Z",
        endedAt: "2026-06-21T15:25:00.000Z",
        rows: rows("live", 0.55, "drifted-multi-level-agent-evaluation"),
      },
      sourceRefs: [ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T16:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when paper metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.55, "drifted-multi-level-agent-evaluation").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0821-agentic-clear-reviewed-agent",
      baselineWindow: {
        windowId: "gap0821-metadata-only-baseline",
        startedAt: "2026-06-20T10:25:00.000Z",
        endedAt: "2026-06-20T15:25:00.000Z",
        rows: rows("baseline", 0.92, "stable-multi-level-agent-evaluation"),
      },
      liveWindow: {
        windowId: "gap0821-metadata-only-live",
        startedAt: "2026-06-21T10:25:00.000Z",
        endedAt: "2026-06-21T15:25:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T16:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(false);
  });

  it("does not add Agentic CLEAR identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("agentic_clear_live_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
