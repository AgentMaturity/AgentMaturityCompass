import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0758-rag-experiment-accelerator-live-drift.md";
const SOURCE = "https://github.com/microsoft/rag-experiment-accelerator";
const README = "https://github.com/microsoft/rag-experiment-accelerator/blob/development/README.md";
const REPO = "microsoft/rag-experiment-accelerator";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0758-${prefix}-trace-${index}`,
    scenarioId: `gap0758-rag-experiment-search-eval-${index}`,
    timestamp: `2026-06-21T1${index}:58:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:rag-search-rerank-eval-${index}`,
    taskCategory: "rag-experiment-accelerator-live-drift",
    domain: "agent-evaluation-rag-experimentation",
    agentEvaluationDimension: "observed_rag_search_rerank_evaluation_behavior_drift",
    interactionTurnCount: prefix === "live" ? 10 + index : 5 + index,
    invalidActionRate0to1: prefix === "live" ? 0.11 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.07 : 0.01,
    toolCallCount: prefix === "live" ? 13 : 6,
    latencyMs: prefix === "live" ? 4100 : 1400,
    costUsd: prefix === "live" ? 0.049 : 0.013,
    evidenceRefs: [`ev-gap0758-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0758-${prefix}-${index}`],
  }));
}

describe("GAP-0758 RAG Experiment Accelerator live-drift boundary", () => {
  it("documents live RAG Experiment Accelerator metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0758");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(README);
    expect(doc).toContain(REPO);
    expect(doc).toContain("default branch `development`");
    expect(doc).toContain("Azure AI Search");
    expect(doc).toContain("Azure OpenAI");
    expect(doc).toContain("Azure Machine Learning");
    expect(doc).toContain("MLFlow");
    expect(doc).toContain("search hyperparameters");
    expect(doc).toContain("query sets");
    expect(doc).toContain("Document Intelligence");
    expect(doc).toContain("pure vector search");
    expect(doc).toContain("hybrid search");
    expect(doc).toContain("sub-querying");
    expect(doc).toContain("LLM re-ranking");
    expect(doc).toContain("MAP@k");
    expect(doc).toContain("LLM-as-judge");
    expect(doc).toContain("llm_answer_relevance");
    expect(doc).toContain("llm_context_precision");
    expect(doc).toContain("llm_context_recall");
    expect(doc).toContain("content sampling");
    expect(doc).toContain("roughly `10%` margin");
    expect(doc).toContain("config.sample.json");
    expect(doc).toContain("04_evaluation.py");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("live score and behavior drift");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for RAG experiment behavior drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0758-rag-experiment-reviewed-agent",
      baselineWindow: {
        windowId: "gap0758-baseline",
        startedAt: "2026-06-20T10:58:00.000Z",
        endedAt: "2026-06-20T13:58:00.000Z",
        rows: rows("baseline", 0.89, "stable-rag-search-eval"),
      },
      liveWindow: {
        windowId: "gap0758-live",
        startedAt: "2026-06-21T10:58:00.000Z",
        endedAt: "2026-06-21T13:58:00.000Z",
        rows: rows("live", 0.51, "drifted-rag-search-eval"),
      },
      sourceRefs: [SOURCE, README],
      now: new Date("2026-06-21T14:30:00.000Z"),
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

  it("fails closed when RAG Experiment Accelerator metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.51, "drifted-rag-search-eval").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0758-rag-experiment-reviewed-agent",
      baselineWindow: {
        windowId: "gap0758-metadata-only-baseline",
        startedAt: "2026-06-20T10:58:00.000Z",
        endedAt: "2026-06-20T13:58:00.000Z",
        rows: rows("baseline", 0.89, "stable-rag-search-eval"),
      },
      liveWindow: {
        windowId: "gap0758-metadata-only-live",
        startedAt: "2026-06-21T10:58:00.000Z",
        endedAt: "2026-06-21T13:58:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [SOURCE, README],
      now: new Date("2026-06-21T14:30:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add RAG Experiment Accelerator identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("rag-experiment-accelerator");
      expect(source).not.toContain("rag_experiment_accelerator_live_drift");
      expect(source).not.toContain("Azure AI Search");
    }
  });
});
