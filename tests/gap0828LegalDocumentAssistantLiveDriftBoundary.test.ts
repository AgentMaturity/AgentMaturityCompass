import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0828-legal-document-assistant-live-drift.md";
const REPO = "lixx21/legal-document-assistant";
const URL = "https://github.com/lixx21/legal-document-assistant";
const TITLE = "legal-document-assistant";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0828-${prefix}-trace-${index}`,
    scenarioId: `gap0828-legal-rag-workflow-${index}`,
    timestamp: `2026-06-21T2${index}:39:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:legal-rag:${index}`,
    taskCategory: "legal-document-rag-live-drift",
    domain: "legal-document-assistant",
    agentEvaluationDimension: "observed_legal_rag_behavior_drift",
    interactionTurnCount: prefix === "live" ? 18 + index : 9 + index,
    invalidActionRate0to1: prefix === "live" ? 0.11 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 9 : 4,
    latencyMs: prefix === "live" ? 3600 : 1450,
    costUsd: prefix === "live" ? 0.058 : 0.018,
    evidenceRefs: [`ev-gap0828-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0828-${prefix}-${index}`],
  }));
}

describe("GAP-0828 legal-document-assistant live-drift boundary", () => {
  it("documents live GitHub reachability and unavailable source-content boundary", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0828");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("README.md lookup returned 404");
    expect(doc).toContain("LICENSE lookup returned 404");
    expect(doc).toContain("GitHub page body grep returned no matching source details");
    expect(doc).toContain("local backlog metadata only");
    expect(doc).toContain("Retrieval-Augmented Generation");
    expect(doc).toContain("PostgreSQL");
    expect(doc).toContain("Elasticsearch");
    expect(doc).toContain("Grafana");
    expect(doc).toContain("Streamlit");
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

  it("uses existing Watch live-drift receipts for legal-RAG behavior changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0828-legal-rag-reviewed-agent",
      baselineWindow: {
        windowId: "gap0828-baseline",
        startedAt: "2026-06-20T20:39:00.000Z",
        endedAt: "2026-06-20T23:39:00.000Z",
        rows: rows("baseline", 0.9, "stable-legal-rag-workflow"),
      },
      liveWindow: {
        windowId: "gap0828-live",
        startedAt: "2026-06-21T20:39:00.000Z",
        endedAt: "2026-06-21T23:39:00.000Z",
        rows: rows("live", 0.58, "drifted-legal-rag-workflow"),
      },
      sourceRefs: [URL],
      now: new Date("2026-06-21T23:55:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([URL]);
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
    const metadataOnlyLiveRows = rows("live", 0.58, "drifted-legal-rag-workflow").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0828-legal-rag-reviewed-agent",
      baselineWindow: {
        windowId: "gap0828-metadata-only-baseline",
        startedAt: "2026-06-20T20:39:00.000Z",
        endedAt: "2026-06-20T23:39:00.000Z",
        rows: rows("baseline", 0.9, "stable-legal-rag-workflow"),
      },
      liveWindow: {
        windowId: "gap0828-metadata-only-live",
        startedAt: "2026-06-21T20:39:00.000Z",
        endedAt: "2026-06-21T23:39:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [URL],
      now: new Date("2026-06-21T23:55:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(false);
  });

  it("does not add legal-document-assistant identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("legal_document_assistant_live_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
