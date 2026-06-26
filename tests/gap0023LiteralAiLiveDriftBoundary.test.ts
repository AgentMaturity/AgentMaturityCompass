import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0023-literal-ai-live-drift.md";
const HOME = "https://literalai.com/";
const DOCS_ROOT = "https://docs.literalai.com/";
const OVERVIEW = "https://docs.literalai.com/get-started/overview";
const MIGRATION = "https://docs.literalai.com/more/migration-guide";
const DASHBOARD = "https://docs.literalai.com/guides/dashboard";
const LOGS = "https://docs.literalai.com/guides/logs";
const SCORERS = "https://docs.literalai.com/guides/scorers";
const ONLINE_EVALS = "https://docs.literalai.com/guides/online-evals";
const DATASET = "https://docs.literalai.com/guides/dataset";
const EXPERIMENT = "https://docs.literalai.com/guides/experiment";
const EVALUATION = "https://docs.literalai.com/guides/evaluation";
const CONTINUOUS_IMPROVEMENT = "https://docs.literalai.com/guides/continuous-improvement";
const EXPORT_DATA = "https://docs.literalai.com/more/export-data";
const STALE_MONITORING = "https://docs.literalai.com/guides/monitoring";
const TITLE = "Literal AI";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0023-${prefix}-trace-${index}`,
    scenarioId: `gap0023-literal-ai-production-eval-${index}`,
    timestamp: `2026-06-26T0${index}:23:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: prefix === "live" && index === 2,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:literal-ai-production-log-${index}`,
    taskCategory: "literal-ai-production-live-drift",
    domain: "agent-evaluation-observability",
    agentEvaluationDimension: "observed_literal_ai_live_behavior_drift",
    lifecycleStage: "production_monitoring",
    interactionTurnCount: prefix === "live" ? 18 + index : 7 + index,
    invalidActionRate0to1: prefix === "live" ? 0.12 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 12 : 5,
    latencyMs: prefix === "live" ? 4100 : 1250,
    costUsd: prefix === "live" ? 0.046 : 0.011,
    evidenceRefs: [`ev-gap0023-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0023-${prefix}-${index}`],
  }));
}

describe("GAP-0023 Literal AI live-drift boundary", () => {
  it("documents live Literal AI metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0023");
    expect(doc).toContain(HOME);
    expect(doc).toContain(DOCS_ROOT);
    expect(doc).toContain(OVERVIEW);
    expect(doc).toContain(MIGRATION);
    expect(doc).toContain(DASHBOARD);
    expect(doc).toContain(LOGS);
    expect(doc).toContain(SCORERS);
    expect(doc).toContain(ONLINE_EVALS);
    expect(doc).toContain(DATASET);
    expect(doc).toContain(EXPERIMENT);
    expect(doc).toContain(EVALUATION);
    expect(doc).toContain(CONTINUOUS_IMPROVEMENT);
    expect(doc).toContain(EXPORT_DATA);
    expect(doc).toContain(STALE_MONITORING);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("root URL now returns HTTP 404");
    expect(doc).toContain("Literal AI will be discontinued");
    expect(doc).toContain("October 31st, 2025");
    expect(doc).toContain("Monitor your AI application usage");
    expect(doc).toContain("Logs are essential to monitor and improve your LLM app in production");
    expect(doc).toContain("Automatically evaluate your LLM logs in production");
    expect(doc).toContain("distribution of scores");
    expect(doc).toContain("Datasets are collections of input/expected output samples");
    expect(doc).toContain("Experiments enable continous improvement");
    expect(doc).toContain("evaluate your LLM applications and agents");
    expect(doc).toContain("Production Monitoring and Evaluation");
    expect(doc).toContain("OpenTelemetry format");
    expect(doc).toContain("baseline distribution");
    expect(doc).toContain("live sample");
    expect(doc).toContain("drift statistic");
    expect(doc).toContain("alert receipt");
    expect(doc).toContain("signed evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts Literal AI context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0023-literal-ai-reviewed-agent",
      baselineWindow: {
        windowId: "gap0023-baseline",
        startedAt: "2026-06-26T00:23:00.000Z",
        endedAt: "2026-06-26T03:23:00.000Z",
        rows: rows("baseline", 0.9, "stable-literal-ai-production-evaluator"),
      },
      liveWindow: {
        windowId: "gap0023-live",
        startedAt: "2026-06-26T04:23:00.000Z",
        endedAt: "2026-06-26T07:23:00.000Z",
        rows: rows("live", 0.46, "drifted-literal-ai-production-evaluator"),
      },
      sourceRefs: [DOCS_ROOT, LOGS, ONLINE_EVALS, CONTINUOUS_IMPROVEMENT],
      now: new Date("2026-06-26T08:23:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([DOCS_ROOT, LOGS, ONLINE_EVALS, CONTINUOUS_IMPROVEMENT]);
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

  it("fails closed when Literal AI metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.46, "drifted-literal-ai-production-evaluator").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0023-literal-ai-metadata-only-agent",
      baselineWindow: {
        windowId: "gap0023-metadata-only-baseline",
        startedAt: "2026-06-26T00:23:00.000Z",
        endedAt: "2026-06-26T03:23:00.000Z",
        rows: rows("baseline", 0.9, "stable-literal-ai-production-evaluator"),
      },
      liveWindow: {
        windowId: "gap0023-metadata-only-live",
        startedAt: "2026-06-26T04:23:00.000Z",
        endedAt: "2026-06-26T07:23:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [HOME, DOCS_ROOT],
      now: new Date("2026-06-26T08:23:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add Literal AI identifiers to generic Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(HOME);
      expect(source).not.toContain("literal_ai_live_drift");
      expect(source).not.toContain("Literal AI");
    }
  });
});
