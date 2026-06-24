import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0730-multihop-rag-live-drift.md";
const SOURCE = "https://github.com/yixuantt/MultiHop-RAG";
const README = "https://raw.githubusercontent.com/yixuantt/MultiHop-RAG/main/README.md";
const PAPER = "https://arxiv.org/abs/2401.15391";
const DOI = "10.48550/arxiv.2401.15391";
const TITLE = "MultiHop-RAG: Benchmarking Retrieval-Augmented Generation for Multi-Hop Queries";
const REPO = "yixuantt/MultiHop-RAG";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0730-${prefix}-trace-${index}`,
    scenarioId: `gap0730-multihop-rag-query-${index}`,
    timestamp: `2026-06-21T1${index}:50:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 2,
    behaviorSignature: `${behavior}:supporting-evidence-hop-${index}`,
    taskCategory: "multi-hop-rag-evaluation-drift",
    domain: "retrieval-augmented-generation-agent-evaluation",
    agentEvaluationDimension: "observed_multihop_retrieval_and_answer_behavior_drift",
    interactionTurnCount: prefix === "live" ? 9 + index : 5 + index,
    invalidActionRate0to1: prefix === "live" ? 0.14 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.1 : 0.01,
    toolCallCount: prefix === "live" ? 14 : 7,
    latencyMs: prefix === "live" ? 4800 : 1700,
    costUsd: prefix === "live" ? 0.061 : 0.017,
    evidenceRefs: [`ev-gap0730-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0730-${prefix}-${index}`],
  }));
}

describe("GAP-0730 MultiHop-RAG live-drift boundary", () => {
  it("documents live MultiHop-RAG metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0730");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(README);
    expect(doc).toContain(PAPER);
    expect(doc).toContain(DOI);
    expect(doc).toContain(TITLE);
    expect(doc).toContain(REPO);
    expect(doc).toContain("2556");
    expect(doc).toContain("2` to `4` documents");
    expect(doc).toContain("document metadata");
    expect(doc).toContain("Hugging Face dataloader");
    expect(doc).toContain("simple retrieval");
    expect(doc).toContain("retrieval and QA evaluation scripts");
    expect(doc).toContain("COLM 2024");
    expect(doc).toContain("ODC-BY");
    expect(doc).toContain("live score and behavior drift");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for MultiHop-RAG-style retrieval drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0730-multihop-rag-reviewed-agent",
      baselineWindow: {
        windowId: "gap0730-baseline",
        startedAt: "2026-06-20T10:50:00.000Z",
        endedAt: "2026-06-20T13:50:00.000Z",
        rows: rows("baseline", 0.88, "stable-multihop-evidence-retrieval"),
      },
      liveWindow: {
        windowId: "gap0730-live",
        startedAt: "2026-06-21T10:50:00.000Z",
        endedAt: "2026-06-21T13:50:00.000Z",
        rows: rows("live", 0.5, "drifted-multihop-evidence-retrieval"),
      },
      sourceRefs: [SOURCE, README, PAPER, `doi:${DOI}`],
      now: new Date("2026-06-21T14:10:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([SOURCE, README, PAPER, `doi:${DOI}`]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when MultiHop-RAG metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.5, "drifted-multihop-evidence-retrieval").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0730-multihop-rag-reviewed-agent",
      baselineWindow: {
        windowId: "gap0730-metadata-only-baseline",
        startedAt: "2026-06-20T10:50:00.000Z",
        endedAt: "2026-06-20T13:50:00.000Z",
        rows: rows("baseline", 0.88, "stable-multihop-evidence-retrieval"),
      },
      liveWindow: {
        windowId: "gap0730-metadata-only-live",
        startedAt: "2026-06-21T10:50:00.000Z",
        endedAt: "2026-06-21T13:50:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [SOURCE, README, PAPER, `doi:${DOI}`],
      now: new Date("2026-06-21T14:10:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add MultiHop-RAG identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("MultiHop-RAG");
      expect(source).not.toContain("multihop_rag_live_drift");
      expect(source).not.toContain("MultiHopRAG");
    }
  });
});
