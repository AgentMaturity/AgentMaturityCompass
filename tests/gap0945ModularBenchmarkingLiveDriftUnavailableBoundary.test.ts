import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0945-modular-benchmarking-live-drift-unavailable.md";
const DOI = "10.34218/ijrcait_09_01_001";
const OPENALEX = "W7119224602";
const TITLE = "A MODULAR BENCHMARKING FRAMEWORK FOR EVALUATING LLM-BASED AGENT APPLICATIONS";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0945-${prefix}-trace-${index}`,
    scenarioId: `gap0945-modular-agent-benchmark-${index}`,
    timestamp: `2026-06-22T1${index}:45:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: prefix === "live" && index === 1,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:modular-benchmark-framework-${index}`,
    taskCategory: "modular-agent-benchmark-live-drift",
    domain: "agent-evaluation-benchmarking",
    agentEvaluationDimension: "observed_modular_agent_benchmark_behavior_drift",
    interactionTurnCount: prefix === "live" ? 14 + index : 6 + index,
    invalidActionRate0to1: prefix === "live" ? 0.1 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 16 : 7,
    latencyMs: prefix === "live" ? 3600 : 1250,
    costUsd: prefix === "live" ? 0.048 : 0.014,
    evidenceRefs: [`ev-gap0945-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0945-${prefix}-${index}`],
  }));
}

describe("GAP-0945 modular benchmarking live-drift unavailable-source boundary", () => {
  it("documents unavailable primary-source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0945");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("source unavailable");
    expect(doc).toContain("exact-title, DOI, and OpenAlex searches did not surface a reachable primary source");
    expect(doc).toContain("direct DOI and OpenAlex opening returned no usable page content");
    expect(doc).toContain("No abstract in OpenAlex metadata");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Modular design");
    expect(doc).toContain("Benchmarking");
    expect(doc).toContain("Systems engineering");
    expect(doc).toContain("Software engineering");
    expect(doc).toContain("Component (thermodynamics)");
    expect(doc).toContain("Measure (data warehouse)");
    expect(doc).toContain("live score and behavior drift");
    expect(doc).toContain("baseline distribution");
    expect(doc).toContain("live sample");
    expect(doc).toContain("drift statistic");
    expect(doc).toContain("alert receipt");
    expect(doc).toContain("Watch live score and behavior drift receipts");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for modular benchmark drift context", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0945-modular-benchmark-reviewed-agent",
      baselineWindow: {
        windowId: "gap0945-baseline",
        startedAt: "2026-06-21T10:45:00.000Z",
        endedAt: "2026-06-21T13:45:00.000Z",
        rows: rows("baseline", 0.87, "stable-modular-agent-benchmark"),
      },
      liveWindow: {
        windowId: "gap0945-live",
        startedAt: "2026-06-22T10:45:00.000Z",
        endedAt: "2026-06-22T13:45:00.000Z",
        rows: rows("live", 0.5, "drifted-modular-agent-benchmark"),
      },
      sourceRefs: [`doi:${DOI}`, `openalex:${OPENALEX}`],
      now: new Date("2026-06-22T14:45:00.000Z"),
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

  it("fails closed when unavailable paper metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.5, "drifted-modular-agent-benchmark").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0945-modular-benchmark-reviewed-agent",
      baselineWindow: {
        windowId: "gap0945-metadata-only-baseline",
        startedAt: "2026-06-21T10:45:00.000Z",
        endedAt: "2026-06-21T13:45:00.000Z",
        rows: rows("baseline", 0.87, "stable-modular-agent-benchmark"),
      },
      liveWindow: {
        windowId: "gap0945-metadata-only-live",
        startedAt: "2026-06-22T10:45:00.000Z",
        endedAt: "2026-06-22T13:45:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [`doi:${DOI}`],
      now: new Date("2026-06-22T14:45:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add modular benchmarking identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("modular_benchmarking_live_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
