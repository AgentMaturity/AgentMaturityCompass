import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0829-ohr-bench-live-drift.md";
const REPO = "opendatalab/OHR-Bench";
const URL = "https://github.com/opendatalab/OHR-Bench";
const ARXIV = "https://arxiv.org/abs/2412.02592v2";
const TITLE = "OCR Hinders RAG: Evaluating the Cascading Impact of OCR on Retrieval-Augmented Generation";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0829-${prefix}-trace-${index}`,
    scenarioId: `gap0829-ocr-rag-workflow-${index}`,
    timestamp: `2026-06-21T1${index}:42:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 2,
    behaviorSignature: `${behavior}:ocr-rag:${index}`,
    taskCategory: "ocr-rag-live-drift",
    domain: "document-rag-benchmark",
    agentEvaluationDimension: "observed_ocr_rag_behavior_drift",
    interactionTurnCount: prefix === "live" ? 20 + index : 10 + index,
    invalidActionRate0to1: prefix === "live" ? 0.12 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.09 : 0.01,
    toolCallCount: prefix === "live" ? 10 : 5,
    latencyMs: prefix === "live" ? 4100 : 1700,
    costUsd: prefix === "live" ? 0.066 : 0.022,
    evidenceRefs: [`ev-gap0829-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0829-${prefix}-${index}`],
  }));
}

describe("GAP-0829 OHR-Bench live-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0829");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE lookup returned 404");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("ICCV 2025");
    expect(doc).toContain("OHR-Bench");
    expect(doc).toContain("8500+ unstructured PDF pages");
    expect(doc).toContain("7 domains");
    expect(doc).toContain("Textbook");
    expect(doc).toContain("Law");
    expect(doc).toContain("Finance");
    expect(doc).toContain("8498 Q&A");
    expect(doc).toContain("human-verified ground truth structured data");
    expect(doc).toContain("Semantic Noise");
    expect(doc).toContain("Formatting Noise");
    expect(doc).toContain("retrieval");
    expect(doc).toContain("generation");
    expect(doc).toContain("overall performance");
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

  it("uses existing Watch live-drift receipts for OHR-Bench-style OCR-RAG behavior changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0829-ohr-bench-reviewed-agent",
      baselineWindow: {
        windowId: "gap0829-baseline",
        startedAt: "2026-06-20T10:42:00.000Z",
        endedAt: "2026-06-20T13:42:00.000Z",
        rows: rows("baseline", 0.88, "stable-ocr-rag-workflow"),
      },
      liveWindow: {
        windowId: "gap0829-live",
        startedAt: "2026-06-21T10:42:00.000Z",
        endedAt: "2026-06-21T13:42:00.000Z",
        rows: rows("live", 0.56, "drifted-ocr-rag-workflow"),
      },
      sourceRefs: [URL, ARXIV],
      now: new Date("2026-06-21T14:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([URL, ARXIV]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when repository metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.56, "drifted-ocr-rag-workflow").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0829-ohr-bench-reviewed-agent",
      baselineWindow: {
        windowId: "gap0829-metadata-only-baseline",
        startedAt: "2026-06-20T10:42:00.000Z",
        endedAt: "2026-06-20T13:42:00.000Z",
        rows: rows("baseline", 0.88, "stable-ocr-rag-workflow"),
      },
      liveWindow: {
        windowId: "gap0829-metadata-only-live",
        startedAt: "2026-06-21T10:42:00.000Z",
        endedAt: "2026-06-21T13:42:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [URL, ARXIV],
      now: new Date("2026-06-21T14:00:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(false);
  });

  it("does not add OHR-Bench identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("ohr_bench_live_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
