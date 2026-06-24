import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0697-hybrid-industrial-decision-support-live-drift.md";
const DOI = "10.3390/ai7020051";
const OPENALEX = "W7126421871";
const SOURCE = "https://www.mdpi.com/2673-2688/7/2/51";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0697-${prefix}-trace-${index}`,
    scenarioId: `gap0697-cip-decision-support-${index}`,
    timestamp: `2026-06-21T1${index}:58:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 2,
    behaviorSignature: `${behavior}:${index}`,
    taskCategory: "industrial-batch-process-decision-support",
    domain: "clean-in-place-industrial-iot",
    agentEvaluationDimension: "safety_critical_decision_support_drift",
    interactionTurnCount: prefix === "live" ? 21 + index : 10 + index,
    invalidActionRate0to1: prefix === "live" ? 0.12 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 9 : 4,
    latencyMs: prefix === "live" ? 3520 : 1320,
    costUsd: prefix === "live" ? 0.046 : 0.016,
    evidenceRefs: [`ev-gap0697-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0697-${prefix}-${index}`],
  }));
}

describe("GAP-0697 hybrid industrial decision-support live-drift boundary", () => {
  it("documents live MDPI metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0697");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(SOURCE);
    expect(doc).toContain("Hybrid AI and LLM-Enabled Agent-Based Real-Time Decision Support Architecture for Industrial Batch Processes: A Clean-in-Place Case Study");
    expect(doc).toContain("1 February 2026");
    expect(doc).toContain("AI 2026, 7(2), 51");
    expect(doc).toContain("Clean-in-Place");
    expect(doc).toContain("industrial IoT");
    expect(doc).toContain("process supervision");
    expect(doc).toContain("real-time decision support");
    expect(doc).toContain("predictive maintenance");
    expect(doc).toContain("PLC/SCADA");
    expect(doc).toContain("deterministic rule-based agents");
    expect(doc).toContain("fuzzy and statistical enrichment");
    expect(doc).toContain("LLM-driven analytics agent");
    expect(doc).toContain("24 runs");
    expect(doc).toContain("six-month deployment");
    expect(doc).toContain("nominal baseline");
    expect(doc).toContain("preventive-warning");
    expect(doc).toContain("diagnostic-alert");
    expect(doc).toContain("stage-specification compliance");
    expect(doc).toContain("state-to-specification consistency");
    expect(doc).toContain("temporal stability");
    expect(doc).toContain("median numerical error below 3%");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for industrial decision-support behavior changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0697-industrial-decision-support-agent",
      baselineWindow: {
        windowId: "gap0697-baseline",
        startedAt: "2026-06-20T10:58:00.000Z",
        endedAt: "2026-06-20T14:58:00.000Z",
        rows: rows("baseline", 0.93, "stable-cip-decision-support-workflow"),
      },
      liveWindow: {
        windowId: "gap0697-live",
        startedAt: "2026-06-21T10:58:00.000Z",
        endedAt: "2026-06-21T14:58:00.000Z",
        rows: rows("live", 0.6, "drifted-cip-decision-support-workflow"),
      },
      sourceRefs: [SOURCE, `doi:${DOI}`, `openalex:${OPENALEX}`],
      now: new Date("2026-06-21T15:58:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([SOURCE, `doi:${DOI}`, `openalex:${OPENALEX}`]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when industrial paper metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.6, "drifted-cip-decision-support-workflow").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0697-industrial-decision-support-agent",
      baselineWindow: {
        windowId: "gap0697-metadata-only-baseline",
        startedAt: "2026-06-20T10:58:00.000Z",
        endedAt: "2026-06-20T14:58:00.000Z",
        rows: rows("baseline", 0.93, "stable-cip-decision-support-workflow"),
      },
      liveWindow: {
        windowId: "gap0697-metadata-only-live",
        startedAt: "2026-06-21T10:58:00.000Z",
        endedAt: "2026-06-21T14:58:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [SOURCE],
      now: new Date("2026-06-21T15:58:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add industrial decision-support identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Clean-in-Place");
      expect(source).not.toContain("cip_decision_support_live_drift");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
    }
  });
});
