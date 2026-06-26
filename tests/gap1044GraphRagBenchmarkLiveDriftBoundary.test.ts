import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-1044-graphrag-benchmark-live-drift.md";
const REPO = "https://github.com/GraphRAG-Bench/GraphRAG-Benchmark";
const API = "https://api.github.com/repos/GraphRAG-Bench/GraphRAG-Benchmark";
const README = "https://raw.githubusercontent.com/GraphRAG-Bench/GraphRAG-Benchmark/main/README.md";
const EVAL_README = "https://github.com/GraphRAG-Bench/GraphRAG-Benchmark/blob/main/Evaluation/README.md";
const LICENSE = "https://github.com/GraphRAG-Bench/GraphRAG-Benchmark/blob/main/LICENSE";
const REQUIREMENTS = "https://github.com/GraphRAG-Bench/GraphRAG-Benchmark/blob/main/requirements.txt";
const LEADERBOARD = "https://graphrag-bench.github.io/";
const ARXIV = "https://arxiv.org/abs/2506.05690";
const ARXIV_API = "https://export.arxiv.org/api/query?id_list=2506.05690";
const ARXIV_PDF = "https://arxiv.org/pdf/2506.05690";
const HF_DATASET = "https://huggingface.co/datasets/GraphRAG-Bench/GraphRAG-Bench";
const TITLE = "GraphRAG-Bench/GraphRAG-Benchmark";
const PAPER_TITLE = "When to use Graphs in RAG: A Comprehensive Analysis for Graph Retrieval-Augmented Generation";
const HEAD = "fdbab5959b18c96532580877ffe27d112bccc0ec";
const TREE = "4813973d917f50443746b04cb0131f924c36eda6";
const README_SHA = "061023c554826de9d3e6c2106faef8f7deb6c8d6";
const LICENSE_SHA = "90355b0205ca42b9a2d2cb6087da83a48830a038";
const REQUIREMENTS_SHA = "962707a47b70ee97cd3eda7d875e7b29782c451f";
const EVAL_README_SHA = "71dcc073c948f9f0aeb8c46b4369b30fab5c5ff3";
const IDENTIFIER = "graphrag_benchmark_live_drift";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3, 4].map((index) => ({
    traceId: `gap1044-${prefix}-trace-${index}`,
    scenarioId: `gap1044-graphrag-benchmark-${index}`,
    timestamp: `2026-06-25T0${index}:44:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index >= 3,
    behaviorSignature: `${behavior}:graph-retrieval-generation-${index}`,
    taskCategory: "graphrag-benchmark-live-drift",
    domain: "agent-evaluation-and-benchmarks",
    agentEvaluationDimension: "graphrag-benchmark-source-context",
    invalidActionRate0to1: prefix === "live" ? 0.16 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.11 : 0.01,
    toolCallCount: prefix === "live" ? 14 : 6,
    latencyMs: prefix === "live" ? 3900 : 1400,
    costUsd: prefix === "live" ? 0.058 : 0.017,
    evidenceRefs: [`ev-gap1044-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap1044-${prefix}-${index}`],
  }));
}

describe("GAP-1044 GraphRAG-Benchmark live-drift boundary", () => {
  it("documents live GraphRAG-Benchmark source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1044");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(PAPER_TITLE);
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(EVAL_README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(REQUIREMENTS);
    expect(doc).toContain(LEADERBOARD);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_API);
    expect(doc).toContain(ARXIV_PDF);
    expect(doc).toContain(HF_DATASET);
    expect(doc).toContain("MIT License");
    expect(doc).toContain("Python");
    expect(doc).toContain("446 stars");
    expect(doc).toContain("52 forks");
    expect(doc).toContain("7 open issues");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("pushed_at `2026-06-07T02:17:59Z`");
    expect(doc).toContain(HEAD);
    expect(doc).toContain(TREE);
    expect(doc).toContain(README_SHA);
    expect(doc).toContain(LICENSE_SHA);
    expect(doc).toContain(REQUIREMENTS_SHA);
    expect(doc).toContain(EVAL_README_SHA);
    expect(doc).toContain("latest release endpoint returned `404`");
    expect(doc).toContain("no tags");
    expect(doc).toContain("arXiv `2506.05690v3`");
    expect(doc).toContain("ICLR");
    expect(doc).toContain("GraphRAG-Bench (Novel)");
    expect(doc).toContain("GraphRAG-Bench (Medical)");
    expect(doc).toContain("Fact Retrieval");
    expect(doc).toContain("Complex Reasoning");
    expect(doc).toContain("Contextual Summarization");
    expect(doc).toContain("Creative Generation");
    expect(doc).toContain("Accuracy");
    expect(doc).toContain("ROUGE-L");
    expect(doc).toContain("Coverage");
    expect(doc).toContain("Factual Score");
    expect(doc).toContain("context relevance");
    expect(doc).toContain("context recall");
    expect(doc).toContain("indexing quality");
    expect(doc).toContain("Microsoft GraphRAG");
    expect(doc).toContain("LightRAG");
    expect(doc).toContain("Fast-GraphRAG");
    expect(doc).toContain("HippoRAG2");
    expect(doc).toContain("medical.parquet");
    expect(doc).toContain("novel.parquet");
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

  it("accepts GraphRAG-Benchmark context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-1044-graphrag-benchmark-reviewed-agent",
      baselineWindow: {
        windowId: "gap1044-baseline",
        startedAt: "2026-06-24T00:44:00.000Z",
        endedAt: "2026-06-24T05:44:00.000Z",
        rows: rows("baseline", 0.9, "stable-graphrag-evaluation"),
      },
      liveWindow: {
        windowId: "gap1044-live",
        startedAt: "2026-06-25T00:44:00.000Z",
        endedAt: "2026-06-25T05:44:00.000Z",
        rows: rows("live", 0.51, "drifted-graphrag-evaluation"),
      },
      sourceRefs: [REPO, API, README, EVAL_README, ARXIV, HF_DATASET, LEADERBOARD],
      now: new Date("2026-06-25T06:44:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([REPO, API, README, EVAL_README, ARXIV, HF_DATASET, LEADERBOARD]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "passRate0to1",
      "errorRate0to1",
      "latencyMsP95",
      "costUsdMean",
      "toolCallMean",
      "behaviorSignature",
      "invalidActionRate0to1",
      "errorAttributionRate0to1",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when GraphRAG-Benchmark metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.51, "drifted-graphrag-evaluation").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-1044-graphrag-benchmark-metadata-agent",
      baselineWindow: {
        windowId: "gap1044-metadata-only-baseline",
        startedAt: "2026-06-24T00:44:00.000Z",
        endedAt: "2026-06-24T05:44:00.000Z",
        rows: rows("baseline", 0.9, "stable-graphrag-evaluation"),
      },
      liveWindow: {
        windowId: "gap1044-metadata-only-live",
        startedAt: "2026-06-25T00:44:00.000Z",
        endedAt: "2026-06-25T05:44:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [REPO, README, ARXIV],
      now: new Date("2026-06-25T06:44:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(false);
  });

  it("does not add GraphRAG-Benchmark identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("2506.05690");
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
