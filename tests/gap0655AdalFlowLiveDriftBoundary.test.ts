import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const ADALFLOW_SOURCE_REF = "github:SylphAI-Inc/AdalFlow@810de99d86191b3aa0c939aa6d6d1a21977555aa";
const ADALFLOW_METADATA_HASH = "17874e26e321b024f888e72ecf03dfe1de42a7deaba8fb568213bde00f6f147b";

function rows(phase: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2].map((index) => ({
    traceId: `gap0655-${phase}-trace-${index}`,
    scenarioId: `gap0655-agent-eval-${index}`,
    timestamp: `2026-06-21T03:0${index}:00.000Z`,
    score0to1,
    passed: phase === "baseline",
    refused: false,
    errored: phase === "live" && index === 2,
    behaviorSignature: `${behavior}:${index}`,
    taskCategory: "agent-evaluation-live-drift",
    domain: "llm-application-evaluation",
    agentEvaluationDimension: "behavioral_regression",
    interactionTurnCount: phase === "live" ? 13 + index : 7 + index,
    invalidActionRate0to1: phase === "live" ? 0.09 : 0.01,
    errorAttributionRate0to1: phase === "live" ? 0.08 : 0.01,
    toolCallCount: phase === "live" ? 5 : 2,
    latencyMs: phase === "live" ? 1800 : 850,
    costUsd: phase === "live" ? 0.014 : 0.006,
    evidenceRefs: [`ev-gap0655-${phase}-${index}`, `source-metadata-sha256:${ADALFLOW_METADATA_HASH}`],
    signedEvidenceRefs: [`ledger-gap0655-${phase}-${index}`],
  }));
}

describe("GAP-0655 AdalFlow live-drift source review", () => {
  it("maps AdalFlow only to existing live score and behavior drift Watch primitives", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0655-adalflow-reviewed-agent",
      baselineWindow: {
        windowId: "gap0655-baseline",
        startedAt: "2026-06-21T02:00:00.000Z",
        endedAt: "2026-06-21T02:30:00.000Z",
        rows: rows("baseline", 0.92, "stable-adalflow-reviewed-app"),
      },
      liveWindow: {
        windowId: "gap0655-live",
        startedAt: "2026-06-21T03:00:00.000Z",
        endedAt: "2026-06-21T03:30:00.000Z",
        rows: rows("live", 0.73, "drifted-adalflow-reviewed-app"),
      },
      sourceRefs: [ADALFLOW_SOURCE_REF, `github-metadata-sha256:${ADALFLOW_METADATA_HASH}`],
      now: new Date("2026-06-21T04:00:00.000Z"),
    });

    expect(receipt.sourceRefs).toEqual([ADALFLOW_SOURCE_REF, `github-metadata-sha256:${ADALFLOW_METADATA_HASH}`]);
    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);

    const watchAlerts = buildLiveDriftWatchAlerts(receipt);
    expect(watchAlerts.length).toBeGreaterThan(0);
    expect(watchAlerts.every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
    expect(watchAlerts.every((alert) => alert.receiptHash === receipt.receiptHash)).toBe(true);
  });

  it("documents live metadata and preserves the no-AdalFlow-subsystem boundary", () => {
    const doc = readFileSync("docs/source-reviews/GAP-0655-adalflow-live-drift.md", "utf8");

    expect(doc).toContain("API `full_name`: `SylphAI-Inc/AdalFlow`");
    expect(doc).toContain("Default branch: `main`");
    expect(doc).toContain("HEAD commit at retrieval: `810de99d86191b3aa0c939aa6d6d1a21977555aa`");
    expect(doc).toContain("License metadata: `MIT`");
    expect(doc).toContain(`Metadata SHA-256: \`${ADALFLOW_METADATA_HASH}\``);
    expect(doc).toContain("Relevant to AMC only through existing Watch live score and behavior drift primitives");
    expect(doc).toContain("No AdalFlow subsystem, SDK/importer, adapter, parity layer");
    expect(doc).toContain("No upstream code, README prose, docs prose, examples, prompts, configs, tests, data");
  });
});
