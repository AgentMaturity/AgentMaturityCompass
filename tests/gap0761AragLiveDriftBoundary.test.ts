import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0761-arag-live-drift.md";
const SOURCE = "https://github.com/Ayanami0730/arag";
const README = "https://github.com/Ayanami0730/arag/blob/main/README.md";
const ARXIV = "https://arxiv.org/abs/2602.03442";
const DATASET = "https://huggingface.co/datasets/Ayanami0730/rag_test";
const REPO = "Ayanami0730/arag";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0761-${prefix}-trace-${index}`,
    scenarioId: `gap0761-agentic-rag-hierarchical-retrieval-${index}`,
    timestamp: `2026-06-21T1${index}:41:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:keyword-semantic-chunk-loop-${index}`,
    taskCategory: "agentic-rag-live-drift",
    domain: "agent-evaluation-hierarchical-rag",
    agentEvaluationDimension: "observed_hierarchical_retrieval_tool_routing_behavior_drift",
    interactionTurnCount: prefix === "live" ? 14 + index : 6 + index,
    invalidActionRate0to1: prefix === "live" ? 0.13 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 17 : 8,
    latencyMs: prefix === "live" ? 4400 : 1500,
    costUsd: prefix === "live" ? 0.062 : 0.018,
    evidenceRefs: [`ev-gap0761-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0761-${prefix}-${index}`],
  }));
}

describe("GAP-0761 A-RAG live-drift boundary", () => {
  it("documents live A-RAG metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0761");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(README);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(DATASET);
    expect(doc).toContain(REPO);
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("A-RAG: Scaling Agentic Retrieval-Augmented Generation via Hierarchical Retrieval Interfaces");
    expect(doc).toContain("hierarchical retrieval interfaces");
    expect(doc).toContain("keyword_search");
    expect(doc).toContain("semantic_search");
    expect(doc).toContain("chunk_read");
    expect(doc).toContain("autonomous strategy");
    expect(doc).toContain("iterative execution");
    expect(doc).toContain("interleaved tool use");
    expect(doc).toContain("ReAct-like action-observation-reasoning loop");
    expect(doc).toContain("Qwen3-Embedding-0.6B");
    expect(doc).toContain("batch_runner.py");
    expect(doc).toContain("eval.py");
    expect(doc).toContain("MuSiQue");
    expect(doc).toContain("HotpotQA");
    expect(doc).toContain("2WikiMultiHopQA");
    expect(doc).toContain("GraphRAG-Bench");
    expect(doc).toContain("LLM-Evaluation Accuracy");
    expect(doc).toContain("Contain-Match Accuracy");
    expect(doc).toContain("GPT-4o-mini");
    expect(doc).toContain("GPT-5-mini");
    expect(doc).toContain("max_loops");
    expect(doc).toContain("max_token_budget");
    expect(doc).toContain("total_cost");
    expect(doc).toContain("total_retrieved_tokens");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("live score and behavior drift");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for A-RAG hierarchical retrieval drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0761-arag-reviewed-agent",
      baselineWindow: {
        windowId: "gap0761-baseline",
        startedAt: "2026-06-20T10:41:00.000Z",
        endedAt: "2026-06-20T13:41:00.000Z",
        rows: rows("baseline", 0.90, "stable-agentic-rag-routing"),
      },
      liveWindow: {
        windowId: "gap0761-live",
        startedAt: "2026-06-21T10:41:00.000Z",
        endedAt: "2026-06-21T13:41:00.000Z",
        rows: rows("live", 0.52, "drifted-agentic-rag-routing"),
      },
      sourceRefs: [SOURCE, README, ARXIV, DATASET],
      now: new Date("2026-06-21T14:40:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([SOURCE, README, ARXIV, DATASET]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when A-RAG metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.52, "drifted-agentic-rag-routing").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0761-arag-reviewed-agent",
      baselineWindow: {
        windowId: "gap0761-metadata-only-baseline",
        startedAt: "2026-06-20T10:41:00.000Z",
        endedAt: "2026-06-20T13:41:00.000Z",
        rows: rows("baseline", 0.90, "stable-agentic-rag-routing"),
      },
      liveWindow: {
        windowId: "gap0761-metadata-only-live",
        startedAt: "2026-06-21T10:41:00.000Z",
        endedAt: "2026-06-21T13:41:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [SOURCE, README],
      now: new Date("2026-06-21T14:40:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add A-RAG identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("A-RAG");
      expect(source).not.toContain("arag_live_drift");
      expect(source).not.toContain("hierarchical retrieval adapter");
    }
  });
});
