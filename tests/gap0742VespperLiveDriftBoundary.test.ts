import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0742-vespper-live-drift.md";
const SOURCE = "https://github.com/vespperhq/vespper";
const DOCS = "https://docs.vespper.com";
const REPO = "vespperhq/vespper";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0742-${prefix}-trace-${index}`,
    scenarioId: `gap0742-observability-copilot-incident-${index}`,
    timestamp: `2026-06-21T1${index}:55:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 2,
    behaviorSignature: `${behavior}:incident-rca-${index}`,
    taskCategory: "observability-copilot-live-drift",
    domain: "incident-response-agent-evaluation",
    agentEvaluationDimension: "observed_incident_rca_and_connector_behavior_drift",
    interactionTurnCount: prefix === "live" ? 11 + index : 6 + index,
    invalidActionRate0to1: prefix === "live" ? 0.13 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.09 : 0.01,
    toolCallCount: prefix === "live" ? 15 : 8,
    latencyMs: prefix === "live" ? 4300 : 1600,
    costUsd: prefix === "live" ? 0.058 : 0.016,
    evidenceRefs: [`ev-gap0742-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0742-${prefix}-${index}`],
  }));
}

describe("GAP-0742 Vespper live-drift boundary", () => {
  it("documents live Vespper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0742");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(REPO);
    expect(doc).toContain("archived");
    expect(doc).toContain("TypeScript");
    expect(doc).toContain("AI on-call developer");
    expect(doc).toContain("observability data and code");
    expect(doc).toContain("automatic root-cause analysis");
    expect(doc).toContain("incident response");
    expect(doc).toContain("ChatOps");
    expect(doc).toContain("Slack");
    expect(doc).toContain("Datadog");
    expect(doc).toContain("Coralogix");
    expect(doc).toContain("Opsgenie");
    expect(doc).toContain("PagerDuty");
    expect(doc).toContain("Docker Compose");
    expect(doc).toContain("LiteLLM");
    expect(doc).toContain("ChromaDB");
    expect(doc).toContain("live score and behavior drift");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for Vespper-style incident copilot drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0742-vespper-reviewed-agent",
      baselineWindow: {
        windowId: "gap0742-baseline",
        startedAt: "2026-06-20T10:55:00.000Z",
        endedAt: "2026-06-20T13:55:00.000Z",
        rows: rows("baseline", 0.87, "stable-observability-rca"),
      },
      liveWindow: {
        windowId: "gap0742-live",
        startedAt: "2026-06-21T10:55:00.000Z",
        endedAt: "2026-06-21T13:55:00.000Z",
        rows: rows("live", 0.49, "drifted-observability-rca"),
      },
      sourceRefs: [SOURCE, DOCS],
      now: new Date("2026-06-21T14:15:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([SOURCE, DOCS]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when Vespper metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.49, "drifted-observability-rca").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0742-vespper-reviewed-agent",
      baselineWindow: {
        windowId: "gap0742-metadata-only-baseline",
        startedAt: "2026-06-20T10:55:00.000Z",
        endedAt: "2026-06-20T13:55:00.000Z",
        rows: rows("baseline", 0.87, "stable-observability-rca"),
      },
      liveWindow: {
        windowId: "gap0742-metadata-only-live",
        startedAt: "2026-06-21T10:55:00.000Z",
        endedAt: "2026-06-21T13:55:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [SOURCE, DOCS],
      now: new Date("2026-06-21T14:15:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add Vespper identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("Vespper");
      expect(source).not.toContain("vespper_live_drift");
      expect(source).not.toContain("vespperhq/vespper");
    }
  });
});
