import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0751-opence-live-drift.md";
const SOURCE = "https://github.com/sci-m-wang/OpenCE";
const README = "https://github.com/sci-m-wang/OpenCE/blob/main/README.md";
const REPO = "sci-m-wang/OpenCE";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0751-${prefix}-trace-${index}`,
    scenarioId: `gap0751-context-engineering-loop-${index}`,
    timestamp: `2026-06-21T1${index}:51:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 2,
    behaviorSignature: `${behavior}:closed-loop-context-${index}`,
    taskCategory: "context-engineering-live-drift",
    domain: "agent-evaluation-context-engineering",
    agentEvaluationDimension: "observed_context_acquisition_processing_evaluator_evolver_drift",
    interactionTurnCount: prefix === "live" ? 12 + index : 5 + index,
    invalidActionRate0to1: prefix === "live" ? 0.12 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 14 : 7,
    latencyMs: prefix === "live" ? 3900 : 1500,
    costUsd: prefix === "live" ? 0.051 : 0.014,
    evidenceRefs: [`ev-gap0751-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0751-${prefix}-${index}`],
  }));
}

describe("GAP-0751 OpenCE live-drift boundary", () => {
  it("documents live OpenCE metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0751");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(README);
    expect(doc).toContain(REPO);
    expect(doc).toContain("public, unarchived");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("closed-loop Context Engineering toolkit");
    expect(doc).toContain("pluggable meta-framework");
    expect(doc).toContain("ACE reproduction");
    expect(doc).toContain("RAG");
    expect(doc).toContain("compression");
    expect(doc).toContain("sense/reason/evaluate/evolve");
    expect(doc).toContain("ACE Reflector");
    expect(doc).toContain("RAGAS");
    expect(doc).toContain("ACE Curator");
    expect(doc).toContain("adaptive RAG policies");
    expect(doc).toContain("Acquisition");
    expect(doc).toContain("Processing");
    expect(doc).toContain("Construction");
    expect(doc).toContain("Evaluation");
    expect(doc).toContain("Evolution");
    expect(doc).toContain("IAcquirer");
    expect(doc).toContain("IProcessor");
    expect(doc).toContain("IConstructor");
    expect(doc).toContain("IEvaluator");
    expect(doc).toContain("IEvolver");
    expect(doc).toContain("LangChain");
    expect(doc).toContain("LlamaIndex");
    expect(doc).toContain("ClosedLoopOrchestrator");
    expect(doc).toContain("ACEClosedLoopMethod");
    expect(doc).toContain("MethodRegistry");
    expect(doc).toContain("OpenAIModelProvider");
    expect(doc).toContain("TransformersModelProvider");
    expect(doc).toContain("RWKVModelProvider");
    expect(doc).toContain("DummyModelProvider");
    expect(doc).toContain("live score and behavior drift");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for OpenCE-style context-engineering drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0751-opence-reviewed-agent",
      baselineWindow: {
        windowId: "gap0751-baseline",
        startedAt: "2026-06-20T10:51:00.000Z",
        endedAt: "2026-06-20T13:51:00.000Z",
        rows: rows("baseline", 0.88, "stable-context-engineering-loop"),
      },
      liveWindow: {
        windowId: "gap0751-live",
        startedAt: "2026-06-21T10:51:00.000Z",
        endedAt: "2026-06-21T13:51:00.000Z",
        rows: rows("live", 0.50, "drifted-context-engineering-loop"),
      },
      sourceRefs: [SOURCE, README],
      now: new Date("2026-06-21T14:20:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([SOURCE, README]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when OpenCE metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.50, "drifted-context-engineering-loop").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0751-opence-reviewed-agent",
      baselineWindow: {
        windowId: "gap0751-metadata-only-baseline",
        startedAt: "2026-06-20T10:51:00.000Z",
        endedAt: "2026-06-20T13:51:00.000Z",
        rows: rows("baseline", 0.88, "stable-context-engineering-loop"),
      },
      liveWindow: {
        windowId: "gap0751-metadata-only-live",
        startedAt: "2026-06-21T10:51:00.000Z",
        endedAt: "2026-06-21T13:51:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [SOURCE, README],
      now: new Date("2026-06-21T14:20:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add OpenCE identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("OpenCE");
      expect(source).not.toContain("opence_live_drift");
      expect(source).not.toContain("ClosedLoopOrchestrator");
    }
  });
});
