import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0688-agents4plc-live-drift.md";
const DOI = "10.1109/tse.2026.3667895";
const OPENALEX = "W7131417432";
const ARXIV = "https://arxiv.org/abs/2410.14209";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0688-${prefix}-trace-${index}`,
    scenarioId: `gap0688-plc-verification-${index}`,
    timestamp: `2026-06-21T1${index}:45:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 1,
    behaviorSignature: `${behavior}:${index}`,
    taskCategory: "industrial-control-plc-code-generation",
    domain: "industrial-control-systems",
    agentEvaluationDimension: "safety_critical_code_generation_drift",
    interactionTurnCount: prefix === "live" ? 18 + index : 9 + index,
    invalidActionRate0to1: prefix === "live" ? 0.12 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 8 : 4,
    latencyMs: prefix === "live" ? 3300 : 1350,
    costUsd: prefix === "live" ? 0.041 : 0.016,
    evidenceRefs: [`ev-gap0688-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0688-${prefix}-${index}`],
  }));
}

describe("GAP-0688 Agents4PLC live-drift boundary", () => {
  it("documents live Agents4PLC metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0688");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain("Agents4PLC: Automating Closed-loop PLC Code Generation and Verification");
    expect(doc).toContain("Fri Oct 18 06:51:13 2024");
    expect(doc).toContain("Programmable Logic Controller");
    expect(doc).toContain("industrial control systems");
    expect(doc).toContain("human-written-verified formal specifications");
    expect(doc).toContain("reference PLC code");
    expect(doc).toContain("Retrieval-Augmented Generation");
    expect(doc).toContain("Chain-of-Thought");
    expect(doc).toContain("increasingly rigorous metrics");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for safety-critical PLC behavior changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0688-plc-code-agent",
      baselineWindow: {
        windowId: "gap0688-baseline",
        startedAt: "2026-06-20T10:45:00.000Z",
        endedAt: "2026-06-20T14:45:00.000Z",
        rows: rows("baseline", 0.92, "stable-plc-formal-verification-workflow"),
      },
      liveWindow: {
        windowId: "gap0688-live",
        startedAt: "2026-06-21T10:45:00.000Z",
        endedAt: "2026-06-21T14:45:00.000Z",
        rows: rows("live", 0.58, "drifted-plc-formal-verification-workflow"),
      },
      sourceRefs: [ARXIV, `doi:${DOI}`, `openalex:${OPENALEX}`],
      now: new Date("2026-06-21T15:45:00.000Z"),
    });

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

  it("fails closed when Agents4PLC paper metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.58, "drifted-plc-formal-verification-workflow").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0688-plc-code-agent",
      baselineWindow: {
        windowId: "gap0688-metadata-only-baseline",
        startedAt: "2026-06-20T10:45:00.000Z",
        endedAt: "2026-06-20T14:45:00.000Z",
        rows: rows("baseline", 0.92, "stable-plc-formal-verification-workflow"),
      },
      liveWindow: {
        windowId: "gap0688-metadata-only-live",
        startedAt: "2026-06-21T10:45:00.000Z",
        endedAt: "2026-06-21T14:45:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [ARXIV],
      now: new Date("2026-06-21T15:45:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add Agents4PLC identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Agents4PLC");
      expect(source).not.toContain("agents4plc_live_drift");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
    }
  });
});
