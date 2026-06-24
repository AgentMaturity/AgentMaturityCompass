import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0777-awesome-rag-evaluation-live-drift.md";
const REPO = "https://github.com/YHPeter/Awesome-RAG-Evaluation";
const README = "https://github.com/YHPeter/Awesome-RAG-Evaluation/blob/main/README.md";
const LICENSE = "https://github.com/YHPeter/Awesome-RAG-Evaluation/blob/main/LICENSE";
const ARXIV = "https://arxiv.org/pdf/2405.07437";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0777-${prefix}-trace-${index}`,
    scenarioId: `gap0777-rag-eval-catalog-${index}`,
    timestamp: `2026-06-21T1${index}:37:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:retrieval-generation-metric-catalog-${index}`,
    taskCategory: "awesome-rag-evaluation-live-drift",
    domain: "agent-evaluation-rag-evaluation-catalog",
    agentEvaluationDimension: "observed_rag_evaluation_catalog_behavior_drift",
    interactionTurnCount: prefix === "live" ? 12 + index : 6 + index,
    invalidActionRate0to1: prefix === "live" ? 0.1 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.06 : 0.01,
    toolCallCount: prefix === "live" ? 14 : 7,
    latencyMs: prefix === "live" ? 3500 : 1450,
    costUsd: prefix === "live" ? 0.046 : 0.017,
    evidenceRefs: [`ev-gap0777-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0777-${prefix}-${index}`],
  }));
}

describe("GAP-0777 Awesome RAG Evaluation live-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0777");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("requirements.txt` path returned 404");
    expect(doc).toContain("Evaluation of Retrieval-Augmented Generation: A Survey");
    expect(doc).toContain("2024 CCF Big Data");
    expect(doc).toContain("Auepora");
    expect(doc).toContain("retrieval and generation components");
    expect(doc).toContain("relevance");
    expect(doc).toContain("accuracy");
    expect(doc).toContain("faithfulness");
    expect(doc).toContain("TruLens RAG Triad");
    expect(doc).toContain("RAGAs");
    expect(doc).toContain("ARES");
    expect(doc).toContain("MultiHop-RAG");
    expect(doc).toContain("LegalBench-RAG");
    expect(doc).toContain("CRAG");
    expect(doc).toContain("2025-04-21");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("live score and behavior drift");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for RAG evaluation catalog drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0777-rag-evaluation-reviewed-agent",
      baselineWindow: {
        windowId: "gap0777-baseline",
        startedAt: "2026-06-20T10:37:00.000Z",
        endedAt: "2026-06-20T13:37:00.000Z",
        rows: rows("baseline", 0.88, "stable-rag-evaluation-catalog"),
      },
      liveWindow: {
        windowId: "gap0777-live",
        startedAt: "2026-06-21T10:37:00.000Z",
        endedAt: "2026-06-21T13:37:00.000Z",
        rows: rows("live", 0.50, "drifted-rag-evaluation-catalog"),
      },
      sourceRefs: [REPO, README, LICENSE, ARXIV],
      now: new Date("2026-06-21T14:37:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([REPO, README, LICENSE, ARXIV]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when RAG evaluation catalog metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.50, "drifted-rag-evaluation-catalog").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0777-rag-evaluation-reviewed-agent",
      baselineWindow: {
        windowId: "gap0777-metadata-only-baseline",
        startedAt: "2026-06-20T10:37:00.000Z",
        endedAt: "2026-06-20T13:37:00.000Z",
        rows: rows("baseline", 0.88, "stable-rag-evaluation-catalog"),
      },
      liveWindow: {
        windowId: "gap0777-metadata-only-live",
        startedAt: "2026-06-21T10:37:00.000Z",
        endedAt: "2026-06-21T13:37:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [REPO, README],
      now: new Date("2026-06-21T14:37:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add RAG evaluation catalog identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("awesome_rag_evaluation_live_drift");
      expect(source).not.toContain("Auepora adapter");
      expect(source).not.toContain("RAG evaluation catalog importer");
    }
  });
});
