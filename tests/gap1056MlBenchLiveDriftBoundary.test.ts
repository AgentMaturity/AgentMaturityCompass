import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-1056-ml-bench-live-drift.md";
const TITLE = "gersteinlab/ML-Bench";
const PAPER_TITLE = "ML-Bench: Evaluating Large Language Models and Agents for Machine Learning Tasks on Repository-Level Code";
const REPO = "https://github.com/gersteinlab/ML-Bench";
const API = "https://api.github.com/repos/gersteinlab/ML-Bench";
const README = "https://raw.githubusercontent.com/gersteinlab/ML-Bench/master/README.md";
const README_HTML = "https://github.com/gersteinlab/ML-Bench/blob/master/README.md";
const PROJECT_PAGE = "https://ml-bench.github.io/";
const ARXIV = "https://arxiv.org/abs/2311.09835";
const ARXIV_API = "https://export.arxiv.org/api/query?id_list=2311.09835";
const ARXIV_PDF = "https://arxiv.org/pdf/2311.09835v5";
const HF_DATASET = "https://huggingface.co/datasets/super-dainiu/ml-bench";
const HEAD = "476ffcf1cc3bc047e206427e90c2f683339b0cc7";
const TREE = "3046210ce1a2ee4dfae4e6210441f07671ac61fc";
const README_SHA = "1cab80aee7bc43a4516562d32b2cac860b0b1649";
const LICENSE_SHA = "af1393b388a10f9a4bcdea4ecee8a89f227b975b";
const IDENTIFIER = "ml_bench_live_drift";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3, 4].map((index) => ({
    traceId: `gap1056-${prefix}-trace-${index}`,
    scenarioId: `gap1056-ml-bench-repository-task-${index}`,
    timestamp: `2026-06-25T1${index}:56:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index >= 3,
    behaviorSignature: `${behavior}:repository-ml-task-${index}`,
    taskCategory: "ml-bench-live-drift",
    domain: "agent-evaluation-and-benchmarks",
    agentEvaluationDimension: "ml-bench-source-context",
    invalidActionRate0to1: prefix === "live" ? 0.18 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.13 : 0.01,
    toolCallCount: prefix === "live" ? 13 : 5,
    latencyMs: prefix === "live" ? 4200 : 1500,
    costUsd: prefix === "live" ? 0.064 : 0.016,
    evidenceRefs: [`ev-gap1056-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap1056-${prefix}-${index}`],
  }));
}

describe("GAP-1056 ML-Bench live-drift boundary", () => {
  it("documents live ML-Bench source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1056");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(PAPER_TITLE);
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(README_HTML);
    expect(doc).toContain(PROJECT_PAGE);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_API);
    expect(doc).toContain(ARXIV_PDF);
    expect(doc).toContain(HF_DATASET);
    expect(doc).toContain("MIT License");
    expect(doc).toContain("Python");
    expect(doc).toContain("315 stars");
    expect(doc).toContain("11 forks");
    expect(doc).toContain("default branch `master`");
    expect(doc).toContain("pushed_at `2025-07-31T08:53:58Z`");
    expect(doc).toContain("updated_at `2026-06-06T06:51:47Z`");
    expect(doc).toContain(HEAD);
    expect(doc).toContain(TREE);
    expect(doc).toContain(README_SHA);
    expect(doc).toContain(LICENSE_SHA);
    expect(doc).toContain("commit verification `valid`");
    expect(doc).toContain("latest release endpoint returned `404`");
    expect(doc).toContain("no tags");
    expect(doc).toContain("arXiv `2311.09835v5`");
    expect(doc).toContain("9,641 examples");
    expect(doc).toContain("18 GitHub repositories");
    expect(doc).toContain("ML-LLM-Bench");
    expect(doc).toContain("ML-Agent-Bench");
    expect(doc).toContain("Linux sandbox environment");
    expect(doc).toContain("super-dainiu/ml-bench");
    expect(doc).toContain("splits: ['full', 'quarter']");
    expect(doc).toContain("merged_full_benchmark.jsonl");
    expect(doc).toContain("merged_quarter_benchmark.jsonl");
    expect(doc).toContain("Pass@5");
    expect(doc).toContain("success rate");
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

  it("accepts ML-Bench context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-1056-ml-bench-reviewed-agent",
      baselineWindow: {
        windowId: "gap1056-baseline",
        startedAt: "2026-06-24T10:56:00.000Z",
        endedAt: "2026-06-24T14:56:00.000Z",
        rows: rows("baseline", 0.91, "stable-ml-repository-evaluation"),
      },
      liveWindow: {
        windowId: "gap1056-live",
        startedAt: "2026-06-25T10:56:00.000Z",
        endedAt: "2026-06-25T14:56:00.000Z",
        rows: rows("live", 0.49, "drifted-ml-repository-evaluation"),
      },
      sourceRefs: [REPO, API, README, PROJECT_PAGE, ARXIV, ARXIV_API, HF_DATASET],
      now: new Date("2026-06-25T15:56:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([REPO, API, README, PROJECT_PAGE, ARXIV, ARXIV_API, HF_DATASET]);
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

  it("fails closed when ML-Bench metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.49, "drifted-ml-repository-evaluation").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-1056-ml-bench-metadata-agent",
      baselineWindow: {
        windowId: "gap1056-metadata-only-baseline",
        startedAt: "2026-06-24T10:56:00.000Z",
        endedAt: "2026-06-24T14:56:00.000Z",
        rows: rows("baseline", 0.91, "stable-ml-repository-evaluation"),
      },
      liveWindow: {
        windowId: "gap1056-metadata-only-live",
        startedAt: "2026-06-25T10:56:00.000Z",
        endedAt: "2026-06-25T14:56:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [REPO, README, ARXIV],
      now: new Date("2026-06-25T15:56:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(false);
  });

  it("does not add ML-Bench identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("2311.09835");
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
