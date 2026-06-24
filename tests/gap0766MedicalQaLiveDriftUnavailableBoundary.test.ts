import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0766-medical-qa-live-drift-unavailable.md";
const DOI = "10.1016/j.ijmedinf.2026.106339";
const OPENALEX = "W7128371373";
const TITLE = "Agentic memory-augmented retrieval and evidence grounding for medical question-answering tasks";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0766-${prefix}-trace-${index}`,
    scenarioId: `gap0766-medical-qa-memory-grounding-${index}`,
    timestamp: `2026-06-21T1${index}:26:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: prefix === "live" && index === 2,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:memory-retrieval-grounding-${index}`,
    taskCategory: "medical-qa-live-drift",
    domain: "agent-evaluation-medical-qa",
    agentEvaluationDimension: "observed_medical_qa_memory_grounding_behavior_drift",
    interactionTurnCount: prefix === "live" ? 12 + index : 5 + index,
    invalidActionRate0to1: prefix === "live" ? 0.11 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.07 : 0.01,
    toolCallCount: prefix === "live" ? 15 : 7,
    latencyMs: prefix === "live" ? 3900 : 1300,
    costUsd: prefix === "live" ? 0.052 : 0.017,
    evidenceRefs: [`ev-gap0766-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0766-${prefix}-${index}`],
  }));
}

describe("GAP-0766 medical QA live-drift unavailable-source boundary", () => {
  it("documents unavailable source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0766");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title and DOI searches did not surface a reachable primary source");
    expect(doc).toContain("direct DOI opening was blocked");
    expect(doc).toContain("live score and behavior drift");
    expect(doc).toContain("medical QA");
    expect(doc).toContain("agentic memory-augmented retrieval");
    expect(doc).toContain("evidence grounding");
    expect(doc).toContain("cognitive psychology");
    expect(doc).toContain("Watch live score and behavior drift receipts");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for medical QA memory-grounding drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0766-medical-qa-reviewed-agent",
      baselineWindow: {
        windowId: "gap0766-baseline",
        startedAt: "2026-06-20T10:26:00.000Z",
        endedAt: "2026-06-20T13:26:00.000Z",
        rows: rows("baseline", 0.88, "stable-medical-qa-grounding"),
      },
      liveWindow: {
        windowId: "gap0766-live",
        startedAt: "2026-06-21T10:26:00.000Z",
        endedAt: "2026-06-21T13:26:00.000Z",
        rows: rows("live", 0.49, "drifted-medical-qa-grounding"),
      },
      sourceRefs: [`doi:${DOI}`, `openalex:${OPENALEX}`],
      now: new Date("2026-06-21T14:26:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([`doi:${DOI}`, `openalex:${OPENALEX}`]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "refusalRate0to1",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when medical QA metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.49, "drifted-medical-qa-grounding").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0766-medical-qa-reviewed-agent",
      baselineWindow: {
        windowId: "gap0766-metadata-only-baseline",
        startedAt: "2026-06-20T10:26:00.000Z",
        endedAt: "2026-06-20T13:26:00.000Z",
        rows: rows("baseline", 0.88, "stable-medical-qa-grounding"),
      },
      liveWindow: {
        windowId: "gap0766-metadata-only-live",
        startedAt: "2026-06-21T10:26:00.000Z",
        endedAt: "2026-06-21T13:26:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [`doi:${DOI}`],
      now: new Date("2026-06-21T14:26:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add medical QA identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("medical_qa_live_drift");
      expect(source).not.toContain("memory-grounding adapter");
    }
  });
});
