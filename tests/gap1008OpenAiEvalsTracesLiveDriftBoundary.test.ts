import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-1008-openai-evals-traces-live-drift.md";
const SOURCE = "https://platform.openai.com/docs/guides/evals";
const EVALS_CANONICAL = "https://developers.openai.com/api/docs/guides/evals";
const TRACE_GRADING = "https://developers.openai.com/api/docs/guides/trace-grading";
const AGENT_EVALS = "https://developers.openai.com/api/docs/guides/agent-evals";
const EVALUATION_BEST_PRACTICES = "https://developers.openai.com/api/docs/guides/evaluation-best-practices";
const IDENTIFIER = "openai_evals_traces_live_drift";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3, 4].map((index) => ({
    traceId: `gap1008-${prefix}-trace-${index}`,
    scenarioId: `gap1008-agent-trace-eval-${index}`,
    timestamp: `2026-06-24T1${index}:08:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: prefix === "live" && index === 3,
    errored: prefix === "live" && index === 4,
    behaviorSignature: `${behavior}:agent-trace-eval-${index}`,
    taskCategory: "agent-workflow-trace-live-drift",
    domain: "agent-evaluation-and-benchmarks",
    agentEvaluationDimension: "openai-evals-and-traces",
    invalidActionRate0to1: prefix === "live" ? 0.24 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.18 : 0.01,
    toolCallCount: prefix === "live" ? 14 : 6,
    latencyMs: prefix === "live" ? 4200 : 1200,
    costUsd: prefix === "live" ? 0.061 : 0.018,
    evidenceRefs: [`ev-gap1008-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap1008-${prefix}-${index}`],
  }));
}

describe("GAP-1008 OpenAI Evals and Traces live-drift boundary", () => {
  it("documents live OpenAI source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1008");
    expect(doc).toContain("OpenAI Evals and Traces");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(EVALS_CANONICAL);
    expect(doc).toContain(TRACE_GRADING);
    expect(doc).toContain(AGENT_EVALS);
    expect(doc).toContain(EVALUATION_BEST_PRACTICES);
    expect(doc).toContain("HTTP/2 301");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("etag: `\"15aa9e27f9d9707885355a6aab15dceb\"`");
    expect(doc).toContain("last-modified: `Wed, 24 Jun 2026 00:12:04 GMT`");
    expect(doc).toContain("Working with evals | OpenAI API");
    expect(doc).toContain("Trace grading | OpenAI API");
    expect(doc).toContain("Evaluate agent workflows | OpenAI API");
    expect(doc).toContain("Evaluation best practices | OpenAI API");
    expect(doc).toContain("read-only");
    expect(doc).toContain("October 31, 2026");
    expect(doc).toContain("November 30, 2026");
    expect(doc).toContain("Datasets");
    expect(doc).toContain("Describe the task");
    expect(doc).toContain("Run your eval");
    expect(doc).toContain("Analyze the results");
    expect(doc).toContain("report_url");
    expect(doc).toContain("Detecting prompt regressions");
    expect(doc).toContain("Bulk model and prompt experimentation");
    expect(doc).toContain("Monitoring stored completions");
    expect(doc).toContain("structured scores");
    expect(doc).toContain("tool calls");
    expect(doc).toContain("reasoning steps");
    expect(doc).toContain("Logs > Traces");
    expect(doc).toContain("Grade all");
    expect(doc).toContain("evaluation dashboard");
    expect(doc).toContain("date range");
    expect(doc).toContain("guardrails");
    expect(doc).toContain("handoffs");
    expect(doc).toContain("repeatability");
    expect(doc).toContain("eval-driven development");
    expect(doc).toContain("Log everything");
    expect(doc).toContain("production traffic patterns");
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

  it("accepts OpenAI Evals and Traces context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-1008-openai-evals-traces-reviewed-agent",
      baselineWindow: {
        windowId: "gap1008-baseline",
        startedAt: "2026-06-23T10:08:00.000Z",
        endedAt: "2026-06-23T14:08:00.000Z",
        rows: rows("baseline", 0.91, "stable-agent-workflow-trace"),
      },
      liveWindow: {
        windowId: "gap1008-live",
        startedAt: "2026-06-24T10:08:00.000Z",
        endedAt: "2026-06-24T14:08:00.000Z",
        rows: rows("live", 0.52, "drifted-agent-workflow-trace"),
      },
      sourceRefs: [SOURCE, EVALS_CANONICAL, TRACE_GRADING, AGENT_EVALS, EVALUATION_BEST_PRACTICES],
      now: new Date("2026-06-24T15:08:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([SOURCE, EVALS_CANONICAL, TRACE_GRADING, AGENT_EVALS, EVALUATION_BEST_PRACTICES]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "passRate0to1",
      "refusalRate0to1",
      "errorRate0to1",
      "latencyMsP95",
      "costUsdMean",
      "toolCallMean",
      "behaviorSignature",
      "invalidActionRate0to1",
      "errorAttributionRate0to1",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when OpenAI docs metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.52, "drifted-agent-workflow-trace").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-1008-openai-evals-traces-reviewed-agent",
      baselineWindow: {
        windowId: "gap1008-metadata-only-baseline",
        startedAt: "2026-06-23T10:08:00.000Z",
        endedAt: "2026-06-23T14:08:00.000Z",
        rows: rows("baseline", 0.91, "stable-agent-workflow-trace"),
      },
      liveWindow: {
        windowId: "gap1008-metadata-only-live",
        startedAt: "2026-06-24T10:08:00.000Z",
        endedAt: "2026-06-24T14:08:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [SOURCE],
      now: new Date("2026-06-24T15:08:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add OpenAI Evals or trace identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("OpenAI Evals and Traces");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(EVALS_CANONICAL);
      expect(source).not.toContain(TRACE_GRADING);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
