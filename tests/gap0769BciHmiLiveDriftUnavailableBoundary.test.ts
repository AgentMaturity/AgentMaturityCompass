import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0769-bci-hmi-live-drift-unavailable.md";
const DOI = "10.3389/fncom.2026.1780276";
const OPENALEX = "W7127134078";
const TITLE = "Editorial: The convergence of AI, LLMs, and industry 4.0: enhancing BCI, HMI, and neuroscience research";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0769-${prefix}-trace-${index}`,
    scenarioId: `gap0769-bci-hmi-human-state-${index}`,
    timestamp: `2026-06-21T1${index}:29:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:human-interface-adaptation-${index}`,
    taskCategory: "bci-hmi-live-drift",
    domain: "agent-evaluation-human-interface",
    agentEvaluationDimension: "observed_bci_hmi_human_state_behavior_drift",
    interactionTurnCount: prefix === "live" ? 11 + index : 5 + index,
    invalidActionRate0to1: prefix === "live" ? 0.12 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 13 : 6,
    latencyMs: prefix === "live" ? 4200 : 1400,
    costUsd: prefix === "live" ? 0.057 : 0.019,
    evidenceRefs: [`ev-gap0769-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0769-${prefix}-${index}`],
  }));
}

describe("GAP-0769 BCI/HMI live-drift unavailable-source boundary", () => {
  it("documents unavailable source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0769");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title and DOI searches did not surface a reachable primary source");
    expect(doc).toContain("direct DOI opening was blocked");
    expect(doc).toContain("live score and behavior drift");
    expect(doc).toContain("BCI");
    expect(doc).toContain("HMI");
    expect(doc).toContain("neuroscience");
    expect(doc).toContain("Industry 4.0");
    expect(doc).toContain("human-state");
    expect(doc).toContain("human-computer interaction");
    expect(doc).toContain("counterfactual thinking");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for BCI/HMI human-interface drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0769-bci-hmi-reviewed-agent",
      baselineWindow: {
        windowId: "gap0769-baseline",
        startedAt: "2026-06-20T10:29:00.000Z",
        endedAt: "2026-06-20T13:29:00.000Z",
        rows: rows("baseline", 0.89, "stable-human-interface-adaptation"),
      },
      liveWindow: {
        windowId: "gap0769-live",
        startedAt: "2026-06-21T10:29:00.000Z",
        endedAt: "2026-06-21T13:29:00.000Z",
        rows: rows("live", 0.47, "drifted-human-interface-adaptation"),
      },
      sourceRefs: [`doi:${DOI}`, `openalex:${OPENALEX}`],
      now: new Date("2026-06-21T14:29:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([`doi:${DOI}`, `openalex:${OPENALEX}`]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "invalidActionRate0to1",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when BCI/HMI metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.47, "drifted-human-interface-adaptation").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0769-bci-hmi-reviewed-agent",
      baselineWindow: {
        windowId: "gap0769-metadata-only-baseline",
        startedAt: "2026-06-20T10:29:00.000Z",
        endedAt: "2026-06-20T13:29:00.000Z",
        rows: rows("baseline", 0.89, "stable-human-interface-adaptation"),
      },
      liveWindow: {
        windowId: "gap0769-metadata-only-live",
        startedAt: "2026-06-21T10:29:00.000Z",
        endedAt: "2026-06-21T13:29:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [`doi:${DOI}`],
      now: new Date("2026-06-21T14:29:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add BCI/HMI identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("bci_hmi_live_drift");
      expect(source).not.toContain("human-state adaptation engine");
    }
  });
});
