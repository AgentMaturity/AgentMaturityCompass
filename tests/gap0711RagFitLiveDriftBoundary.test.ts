import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0711-rag-fit-live-drift.md";
const SOURCE = "https://github.com/IntelLabs/RAG-FiT";
const REPO = "IntelLabs/RAG-FiT";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0711-${prefix}-trace-${index}`,
    scenarioId: `gap0711-rag-fit-evaluation-workflow-${index}`,
    timestamp: `2026-06-21T1${index}:30:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 1,
    behaviorSignature: `${behavior}:${index}`,
    taskCategory: "rag-finetuning-evaluation-drift",
    domain: "rag-evaluation",
    agentEvaluationDimension: "observed_rag_behavior_drift",
    interactionTurnCount: prefix === "live" ? 21 + index : 10 + index,
    invalidActionRate0to1: prefix === "live" ? 0.12 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.07 : 0.01,
    toolCallCount: prefix === "live" ? 7 : 3,
    latencyMs: prefix === "live" ? 3180 : 1340,
    costUsd: prefix === "live" ? 0.047 : 0.016,
    evidenceRefs: [`ev-gap0711-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0711-${prefix}-${index}`],
  }));
}

describe("GAP-0711 RAG-FiT live-drift boundary", () => {
  it("documents live RAG-FiT metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0711");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(REPO);
    expect(doc).toContain("repository id `832661327`");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("size `976`");
    expect(doc).toContain("not archived");
    expect(doc).toContain("2024-10-06T10:20:02Z");
    expect(doc).toContain("RAG-augmented datasets");
    expect(doc).toContain("dataset creation");
    expect(doc).toContain("training");
    expect(doc).toContain("inference");
    expect(doc).toContain("evaluation");
    expect(doc).toContain("PEFT");
    expect(doc).toContain("Hydra configuration");
    expect(doc).toContain("Deepeval");
    expect(doc).toContain("RAGAS");
    expect(doc).toContain("HF evaluate");
    expect(doc).toContain("Apache 2.0 license");
    expect(doc).toContain("not an official Intel product");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for RAG-FiT-style evaluation drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0711-rag-fit-reviewed-agent",
      baselineWindow: {
        windowId: "gap0711-baseline",
        startedAt: "2026-06-20T10:30:00.000Z",
        endedAt: "2026-06-20T14:30:00.000Z",
        rows: rows("baseline", 0.9, "stable-rag-fit-evaluation-workflow"),
      },
      liveWindow: {
        windowId: "gap0711-live",
        startedAt: "2026-06-21T10:30:00.000Z",
        endedAt: "2026-06-21T14:30:00.000Z",
        rows: rows("live", 0.61, "drifted-rag-fit-evaluation-workflow"),
      },
      sourceRefs: [SOURCE],
      now: new Date("2026-06-21T15:30:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([SOURCE]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when RAG-FiT metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.61, "drifted-rag-fit-evaluation-workflow").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0711-rag-fit-reviewed-agent",
      baselineWindow: {
        windowId: "gap0711-metadata-only-baseline",
        startedAt: "2026-06-20T10:30:00.000Z",
        endedAt: "2026-06-20T14:30:00.000Z",
        rows: rows("baseline", 0.9, "stable-rag-fit-evaluation-workflow"),
      },
      liveWindow: {
        windowId: "gap0711-metadata-only-live",
        startedAt: "2026-06-21T10:30:00.000Z",
        endedAt: "2026-06-21T14:30:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [SOURCE],
      now: new Date("2026-06-21T15:30:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add RAG-FiT identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("RAG-FiT");
      expect(source).not.toContain("rag_fit_live_drift");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("IntelLabs/RAG-FiT");
    }
  });
});
