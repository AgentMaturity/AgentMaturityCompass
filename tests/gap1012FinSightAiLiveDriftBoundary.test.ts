import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-1012-finsight-ai-live-drift.md";
const REPO = "https://github.com/juanjuandog/FinSight-AI";
const API = "https://api.github.com/repos/juanjuandog/FinSight-AI";
const README_API = "https://api.github.com/repos/juanjuandog/FinSight-AI/readme";
const README = "https://raw.githubusercontent.com/juanjuandog/FinSight-AI/master/README.md";
const LICENSE_API = "https://api.github.com/repos/juanjuandog/FinSight-AI/license";
const CONTENTS_API = "https://api.github.com/repos/juanjuandog/FinSight-AI/contents?ref=master";
const COMMIT_API = "https://api.github.com/repos/juanjuandog/FinSight-AI/commits/master";
const RELEASE_API = "https://api.github.com/repos/juanjuandog/FinSight-AI/releases/latest";
const CI = "https://raw.githubusercontent.com/juanjuandog/FinSight-AI/master/.github/workflows/ci.yml";
const BENCHMARK = "https://raw.githubusercontent.com/juanjuandog/FinSight-AI/master/docs/benchmark.md";
const WORKFLOW = "https://raw.githubusercontent.com/juanjuandog/FinSight-AI/master/docs/design-agent-workflow.md";
const HEAD = "3da99f69007f88e8721efb82a950b46c579252b3";
const IDENTIFIER = "finsight_ai_live_drift";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3, 4].map((index) => ({
    traceId: `gap1012-${prefix}-trace-${index}`,
    scenarioId: `gap1012-financial-research-eval-${index}`,
    timestamp: `2026-06-24T1${index}:12:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 4,
    behaviorSignature: `${behavior}:finsight-report-eval-${index}`,
    taskCategory: "financial-research-live-drift",
    domain: "agent-evaluation-and-benchmarks",
    agentEvaluationDimension: "finsight-ai-source-context",
    invalidActionRate0to1: prefix === "live" ? 0.19 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.16 : 0.01,
    toolCallCount: prefix === "live" ? 12 : 5,
    latencyMs: prefix === "live" ? 3900 : 1100,
    costUsd: prefix === "live" ? 0.054 : 0.014,
    evidenceRefs: [`ev-gap1012-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap1012-${prefix}-${index}`],
  }));
}

describe("GAP-1012 FinSight-AI live-drift boundary", () => {
  it("documents live GitHub source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1012");
    expect(doc).toContain("juanjuandog/FinSight-AI");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE_API);
    expect(doc).toContain(CONTENTS_API);
    expect(doc).toContain(COMMIT_API);
    expect(doc).toContain(RELEASE_API);
    expect(doc).toContain(CI);
    expect(doc).toContain(BENCHMARK);
    expect(doc).toContain(WORKFLOW);
    expect(doc).toContain(HEAD);
    expect(doc).toContain("default branch `master`");
    expect(doc).toContain("Java");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("1,107 stars");
    expect(doc).toContain("59 forks");
    expect(doc).toContain("0 open issues");
    expect(doc).toContain("created_at `2026-05-11T11:19:40Z`");
    expect(doc).toContain("pushed_at `2026-05-26T01:39:47Z`");
    expect(doc).toContain("updated_at `2026-06-23T07:22:23Z`");
    expect(doc).toContain("README sha `41219993984d1a59b4986094135a9928d3257ec9`");
    expect(doc).toContain("LICENSE sha `70c7c97be5c2c08b826478376ab8bad70ce8bff0`");
    expect(doc).toContain("latest-release API returned 404");
    expect(doc).toContain("CI workflow sha `96aca2763416b1042b46d21735157559eb7d8d58`");
    expect(doc).toContain("mvn test");
    expect(doc).toContain("bash -n scripts/*.sh");
    expect(doc).toContain("evidence-grounded reports");
    expect(doc).toContain("resilient workflow orchestration");
    expect(doc).toContain("RAG evaluation");
    expect(doc).toContain("reportVersion");
    expect(doc).toContain("dataSnapshotHash");
    expect(doc).toContain("evidence chunks");
    expect(doc).toContain("RAG hit rate");
    expect(doc).toContain("evidence coverage");
    expect(doc).toContain("answer coverage");
    expect(doc).toContain("hallucination risk");
    expect(doc).toContain("conclusion consistency");
    expect(doc).toContain("confidence calibration");
    expect(doc).toContain("latency");
    expect(doc).toContain("regression loop");
    expect(doc).toContain("Redis Lua single-flight");
    expect(doc).toContain("fencing token");
    expect(doc).toContain("WorkflowRecoveryScheduler");
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

  it("accepts FinSight-AI context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-1012-finsight-reviewed-agent",
      baselineWindow: {
        windowId: "gap1012-baseline",
        startedAt: "2026-06-23T10:12:00.000Z",
        endedAt: "2026-06-23T14:12:00.000Z",
        rows: rows("baseline", 0.9, "stable-financial-research"),
      },
      liveWindow: {
        windowId: "gap1012-live",
        startedAt: "2026-06-24T10:12:00.000Z",
        endedAt: "2026-06-24T14:12:00.000Z",
        rows: rows("live", 0.5, "drifted-financial-research"),
      },
      sourceRefs: [REPO, API, README, BENCHMARK, WORKFLOW],
      now: new Date("2026-06-24T15:12:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([REPO, API, README, BENCHMARK, WORKFLOW]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "passRate0to1",
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

  it("fails closed when GitHub and README metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.5, "drifted-financial-research").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-1012-finsight-metadata-agent",
      baselineWindow: {
        windowId: "gap1012-metadata-only-baseline",
        startedAt: "2026-06-23T10:12:00.000Z",
        endedAt: "2026-06-23T14:12:00.000Z",
        rows: rows("baseline", 0.9, "stable-financial-research"),
      },
      liveWindow: {
        windowId: "gap1012-metadata-only-live",
        startedAt: "2026-06-24T10:12:00.000Z",
        endedAt: "2026-06-24T14:12:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [REPO, README_API, README],
      now: new Date("2026-06-24T15:12:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add FinSight-AI identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("FinSight");
      expect(source).not.toContain("juanjuandog/FinSight-AI");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
