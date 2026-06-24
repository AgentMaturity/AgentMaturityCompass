import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0771-rag-arena-live-drift.md";
const REPO = "https://github.com/firecrawl/rag-arena";
const README = "https://github.com/firecrawl/rag-arena/blob/master/README.md";
const PACKAGE = "https://github.com/firecrawl/rag-arena/blob/master/package.json";
const LICENSE = "https://github.com/firecrawl/rag-arena/blob/master/LICENSE";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0771-${prefix}-trace-${index}`,
    scenarioId: `gap0771-rag-arena-retriever-vote-${index}`,
    timestamp: `2026-06-21T1${index}:31:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:retriever-vote-leaderboard-${index}`,
    taskCategory: "rag-arena-live-drift",
    domain: "agent-evaluation-rag-retriever-feedback",
    agentEvaluationDimension: "observed_rag_retriever_feedback_behavior_drift",
    interactionTurnCount: prefix === "live" ? 13 + index : 6 + index,
    invalidActionRate0to1: prefix === "live" ? 0.09 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.06 : 0.01,
    toolCallCount: prefix === "live" ? 16 : 8,
    latencyMs: prefix === "live" ? 3600 : 1500,
    costUsd: prefix === "live" ? 0.049 : 0.018,
    evidenceRefs: [`ev-gap0771-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0771-${prefix}-${index}`],
  }));
}

describe("GAP-0771 RAG Arena live-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0771");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(PACKAGE);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain("default branch `master`");
    expect(doc).toContain("open-source Next.js project");
    expect(doc).toContain("LangChain");
    expect(doc).toContain("RAG chatbot");
    expect(doc).toContain("Users vote");
    expect(doc).toContain("real-time leaderboard");
    expect(doc).toContain("Supabase");
    expect(doc).toContain("Upstash Redis");
    expect(doc).toContain("Python/Flask service");
    expect(doc).toContain("Neo4j graph-store");
    expect(doc).toContain("dynamic retriever");
    expect(doc).toContain("Elo adjustment");
    expect(doc).toContain("contextual compression");
    expect(doc).toContain("multi-query retrievers");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("live score and behavior drift");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for RAG retriever feedback drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0771-rag-arena-reviewed-agent",
      baselineWindow: {
        windowId: "gap0771-baseline",
        startedAt: "2026-06-20T10:31:00.000Z",
        endedAt: "2026-06-20T13:31:00.000Z",
        rows: rows("baseline", 0.87, "stable-rag-retriever-feedback"),
      },
      liveWindow: {
        windowId: "gap0771-live",
        startedAt: "2026-06-21T10:31:00.000Z",
        endedAt: "2026-06-21T13:31:00.000Z",
        rows: rows("live", 0.51, "drifted-rag-retriever-feedback"),
      },
      sourceRefs: [REPO, README, PACKAGE, LICENSE],
      now: new Date("2026-06-21T14:31:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([REPO, README, PACKAGE, LICENSE]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when RAG Arena metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.51, "drifted-rag-retriever-feedback").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0771-rag-arena-reviewed-agent",
      baselineWindow: {
        windowId: "gap0771-metadata-only-baseline",
        startedAt: "2026-06-20T10:31:00.000Z",
        endedAt: "2026-06-20T13:31:00.000Z",
        rows: rows("baseline", 0.87, "stable-rag-retriever-feedback"),
      },
      liveWindow: {
        windowId: "gap0771-metadata-only-live",
        startedAt: "2026-06-21T10:31:00.000Z",
        endedAt: "2026-06-21T13:31:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [REPO, README],
      now: new Date("2026-06-21T14:31:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add RAG Arena identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("rag_arena_live_drift");
      expect(source).not.toContain("SupabaseVectorStore");
      expect(source).not.toContain("Elo adjustment");
    }
  });
});
