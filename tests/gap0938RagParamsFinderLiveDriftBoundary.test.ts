import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0938-rag-params-finder-live-drift.md";
const REPO = "neomatrix369/rag-params-finder";
const URL = "https://github.com/neomatrix369/rag-params-finder";
const TITLE = "rag-params-finder";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3, 4].map((index) => ({
    traceId: `gap0938-${prefix}-trace-${index}`,
    scenarioId: `gap0938-rag-params-finder-${index}`,
    timestamp: `2026-06-22T1${index}:38:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 4,
    behaviorSignature: `${behavior}:rag-parameter-sweep:${index}`,
    taskCategory: "rag-params-finder-live-score-behavior-drift",
    domain: "rag-retrieval-optimization",
    agentEvaluationDimension: "observed_rag_params_finder_score_behavior_drift",
    interactionTurnCount: prefix === "live" ? 28 + index : 11 + index,
    invalidActionRate0to1: prefix === "live" ? 0.14 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.07 : 0.01,
    toolCallCount: prefix === "live" ? 9 : 3,
    latencyMs: prefix === "live" ? 3600 : 1320,
    costUsd: prefix === "live" ? 0.052 : 0.016,
    evidenceRefs: [`ev-gap0938-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0938-${prefix}-${index}`],
  }));
}

describe("GAP-0938 rag-params-finder live-drift boundary", () => {
  it("documents live GitHub API metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0938");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("GitHub API repository metadata");
    expect(doc).toContain("default_branch: main");
    expect(doc).toContain("stargazers_count: 12");
    expect(doc).toContain("forks_count: 4");
    expect(doc).toContain("open_issues_count: 16");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("created_at: 2026-05-03T10:08:06Z");
    expect(doc).toContain("updated_at: 2026-05-29T15:50:30Z");
    expect(doc).toContain("pushed_at: 2026-06-09T21:38:50Z");
    expect(doc).toContain("chunking-strategies");
    expect(doc).toContain("embedding-models");
    expect(doc).toContain("hyperparameter-tuning");
    expect(doc).toContain("retrieval-optimization");
    expect(doc).toContain("zero-llm");
    expect(doc).toContain(".env.example");
    expect(doc).toContain(".github");
    expect(doc).toContain("AGENTS.md");
    expect(doc).toContain("CHANGELOG.md");
    expect(doc).toContain("CLAUDE.md");
    expect(doc).toContain("README.md");
    expect(doc).toContain("VERIFICATION_CHECKLIST.md");
    expect(doc).toContain("cli");
    expect(doc).toContain("configs");
    expect(doc).toContain("docker-compose.yml");
    expect(doc).toContain("docs");
    expect(doc).toContain("frontend");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("server");
    expect(doc).toContain("tests");
    expect(doc).toContain("uv.lock");
    expect(doc).toContain("Python");
    expect(doc).toContain("TypeScript");
    expect(doc).toContain("Shell");
    expect(doc).toContain("Dockerfile");
    expect(doc).toContain("v0.11.0");
    expect(doc).toContain("Weighted Averaging");
    expect(doc).toContain("query_avg_score");
    expect(doc).toContain("v0.10.0");
    expect(doc).toContain("Unified retriever");
    expect(doc).toContain("v0.8.1");
    expect(doc).toContain("Provider regression tests");
    expect(doc).toContain("Vector DB stats");
    expect(doc).toContain("Voyage");
    expect(doc).toContain("sentence-transformers");
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

  it("uses existing Watch live-drift receipts for RAG parameter-sweep drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0938-rag-params-finder-reviewed-agent",
      baselineWindow: {
        windowId: "gap0938-baseline",
        startedAt: "2026-06-21T10:38:00.000Z",
        endedAt: "2026-06-21T13:38:00.000Z",
        rows: rows("baseline", 0.88, "stable-rag-params"),
      },
      liveWindow: {
        windowId: "gap0938-live",
        startedAt: "2026-06-22T10:38:00.000Z",
        endedAt: "2026-06-22T13:38:00.000Z",
        rows: rows("live", 0.53, "drifted-rag-params"),
      },
      sourceRefs: [URL],
      now: new Date("2026-06-22T14:38:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([URL]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "passRate0to1",
      "behaviorSignature",
      "invalidActionRate0to1",
      "interactionTurnMean",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when rag-params-finder metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.53, "drifted-rag-params").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0938-rag-params-finder-reviewed-agent",
      baselineWindow: {
        windowId: "gap0938-metadata-only-baseline",
        startedAt: "2026-06-21T10:38:00.000Z",
        endedAt: "2026-06-21T13:38:00.000Z",
        rows: rows("baseline", 0.88, "stable-rag-params"),
      },
      liveWindow: {
        windowId: "gap0938-metadata-only-live",
        startedAt: "2026-06-22T10:38:00.000Z",
        endedAt: "2026-06-22T13:38:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [URL],
      now: new Date("2026-06-22T14:38:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(false);
  });

  it("does not add rag-params-finder identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("rag_params_finder_live_drift");
    }
  });
});
