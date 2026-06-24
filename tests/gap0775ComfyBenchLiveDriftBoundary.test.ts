import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0775-comfybench-live-drift.md";
const REPO = "https://github.com/xxyQwQ/ComfyBench";
const README = "https://github.com/xxyQwQ/ComfyBench/blob/main/README.md";
const ARXIV = "https://arxiv.org/abs/2409.01392";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0775-${prefix}-trace-${index}`,
    scenarioId: `gap0775-comfybench-workflow-agent-${index}`,
    timestamp: `2026-06-21T1${index}:35:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:workflow-design-pass-resolve-${index}`,
    taskCategory: "comfybench-live-drift",
    domain: "agent-evaluation-comfyui-workflow-design",
    agentEvaluationDimension: "observed_comfyui_workflow_design_behavior_drift",
    interactionTurnCount: prefix === "live" ? 15 + index : 7 + index,
    invalidActionRate0to1: prefix === "live" ? 0.14 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.09 : 0.01,
    toolCallCount: prefix === "live" ? 18 : 9,
    latencyMs: prefix === "live" ? 5300 : 1900,
    costUsd: prefix === "live" ? 0.073 : 0.022,
    evidenceRefs: [`ev-gap0775-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0775-${prefix}-${index}`],
  }));
}

describe("GAP-0775 ComfyBench live-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0775");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("LICENSE` path returned 404");
    expect(doc).toContain("ComfyBench: Benchmarking LLM-based Agents in ComfyUI");
    expect(doc).toContain("Xiangyuan Xue");
    expect(doc).toContain("Zeyu Lu");
    expect(doc).toContain("Lei Bai");
    expect(doc).toContain("CVPR 2025");
    expect(doc).toContain("pass rate");
    expect(doc).toContain("resolve rate");
    expect(doc).toContain("ComfyAgent");
    expect(doc).toContain("3205` nodes");
    expect(doc).toContain("20` curriculum workflows");
    expect(doc).toContain("200` task instructions");
    expect(doc).toContain("10` sample validation tasks");
    expect(doc).toContain("result.json");
    expect(doc).toContain("summary.txt");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("LangChain");
    expect(doc).toContain("Chroma");
    expect(doc).toContain("OpenCV");
    expect(doc).toContain("live score and behavior drift");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for ComfyUI workflow-agent drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0775-comfybench-reviewed-agent",
      baselineWindow: {
        windowId: "gap0775-baseline",
        startedAt: "2026-06-20T10:35:00.000Z",
        endedAt: "2026-06-20T13:35:00.000Z",
        rows: rows("baseline", 0.86, "stable-comfyui-workflow-design"),
      },
      liveWindow: {
        windowId: "gap0775-live",
        startedAt: "2026-06-21T10:35:00.000Z",
        endedAt: "2026-06-21T13:35:00.000Z",
        rows: rows("live", 0.46, "drifted-comfyui-workflow-design"),
      },
      sourceRefs: [REPO, README, ARXIV],
      now: new Date("2026-06-21T14:35:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([REPO, README, ARXIV]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "invalidActionRate0to1",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when ComfyBench metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.46, "drifted-comfyui-workflow-design").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0775-comfybench-reviewed-agent",
      baselineWindow: {
        windowId: "gap0775-metadata-only-baseline",
        startedAt: "2026-06-20T10:35:00.000Z",
        endedAt: "2026-06-20T13:35:00.000Z",
        rows: rows("baseline", 0.86, "stable-comfyui-workflow-design"),
      },
      liveWindow: {
        windowId: "gap0775-metadata-only-live",
        startedAt: "2026-06-21T10:35:00.000Z",
        endedAt: "2026-06-21T13:35:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [REPO, README],
      now: new Date("2026-06-21T14:35:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add ComfyBench identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("comfybench_live_drift");
      expect(source).not.toContain("ComfyUI adapter");
      expect(source).not.toContain("workflow-design runner");
    }
  });
});
