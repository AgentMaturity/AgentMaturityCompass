import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-1016-gamingagent-live-drift.md";
const REPO = "https://github.com/lmgame-org/GamingAgent";
const API = "https://api.github.com/repos/lmgame-org/GamingAgent";
const README_API = "https://api.github.com/repos/lmgame-org/GamingAgent/readme";
const README = "https://raw.githubusercontent.com/lmgame-org/GamingAgent/main/README.md";
const LICENSE_API = "https://api.github.com/repos/lmgame-org/GamingAgent/license";
const CONTENTS_API = "https://api.github.com/repos/lmgame-org/GamingAgent/contents?ref=main";
const COMMIT_API = "https://api.github.com/repos/lmgame-org/GamingAgent/commits/main";
const RELEASE_API = "https://api.github.com/repos/lmgame-org/GamingAgent/releases/latest";
const PYPROJECT = "https://raw.githubusercontent.com/lmgame-org/GamingAgent/main/pyproject.toml";
const REQUIREMENTS = "https://raw.githubusercontent.com/lmgame-org/GamingAgent/main/requirements.txt";
const BENCH_README = "https://raw.githubusercontent.com/lmgame-org/GamingAgent/main/lmgame-bench/README.md";
const ARXIV_API = "https://export.arxiv.org/api/query?id_list=2505.15146";
const ARXIV = "https://arxiv.org/abs/2505.15146";
const WEBSITE = "https://lmgame.org/#/gaming_agent";
const LEADERBOARD = "https://huggingface.co/spaces/lmgame/game_arena_bench";
const HEAD = "996d848ae5e3bf68433d663f38ef4da5bdfe5332";
const IDENTIFIER = "gamingagent_live_drift";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3, 4, 5].map((index) => ({
    traceId: `gap1016-${prefix}-trace-${index}`,
    scenarioId: `gap1016-gaming-agent-eval-${index}`,
    timestamp: `2026-06-24T1${index}:16:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index >= 4,
    behaviorSignature: `${behavior}:game-eval-${index}`,
    taskCategory: "gaming-agent-live-drift",
    domain: "agent-evaluation-and-benchmarks",
    agentEvaluationDimension: "gamingagent-source-context",
    invalidActionRate0to1: prefix === "live" ? 0.22 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.18 : 0.01,
    toolCallCount: prefix === "live" ? 18 : 7,
    latencyMs: prefix === "live" ? 4200 : 1250,
    costUsd: prefix === "live" ? 0.061 : 0.016,
    evidenceRefs: [`ev-gap1016-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap1016-${prefix}-${index}`],
  }));
}

describe("GAP-1016 GamingAgent live-drift boundary", () => {
  it("documents live source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1016");
    expect(doc).toContain("lmgame-org/GamingAgent");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE_API);
    expect(doc).toContain(CONTENTS_API);
    expect(doc).toContain(COMMIT_API);
    expect(doc).toContain(RELEASE_API);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain(REQUIREMENTS);
    expect(doc).toContain(BENCH_README);
    expect(doc).toContain(ARXIV_API);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(WEBSITE);
    expect(doc).toContain(LEADERBOARD);
    expect(doc).toContain(HEAD);
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("Python");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("942 stars");
    expect(doc).toContain("102 forks");
    expect(doc).toContain("9 open issues");
    expect(doc).toContain("created_at `2025-02-27T04:19:23Z`");
    expect(doc).toContain("pushed_at `2025-11-16T20:16:05Z`");
    expect(doc).toContain("updated_at `2026-06-23T02:19:43Z`");
    expect(doc).toContain("README sha `7a3e07b7b56bd580468ee548561b1614dd142cd8`");
    expect(doc).toContain("LICENSE sha `4d76a289e3667898ca5b040e739f872a96175b27`");
    expect(doc).toContain("pyproject sha `c9b726d2a190ad77c503ebea2e7465502bc677c1`");
    expect(doc).toContain("requirements sha `c66fe86161de54a08b4e0883f8d894a80997fecb`");
    expect(doc).toContain("latest-release API returned 404");
    expect(doc).toContain("no `.github` workflow directory");
    expect(doc).toContain("lmgame-Bench: How Good are LLMs at Playing Games?");
    expect(doc).toContain("arXiv `2505.15146v2`");
    expect(doc).toContain("Hugging Face leaderboard redirected");
    expect(doc).toContain("website returned HTTP 200");
    expect(doc).toContain("standardized interactive gaming environments");
    expect(doc).toContain("single-model VLM setting");
    expect(doc).toContain("GamingAgent workflow");
    expect(doc).toContain("Gymnasium");
    expect(doc).toContain("Sokoban");
    expect(doc).toContain("multi-agent runner");
    expect(doc).toContain("single_agent_runner.py");
    expect(doc).toContain("performance analysis");
    expect(doc).toContain("replay videos");
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

  it("accepts GamingAgent context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-1016-gamingagent-reviewed-agent",
      baselineWindow: {
        windowId: "gap1016-baseline",
        startedAt: "2026-06-23T10:16:00.000Z",
        endedAt: "2026-06-23T14:16:00.000Z",
        rows: rows("baseline", 0.91, "stable-game-evaluation"),
      },
      liveWindow: {
        windowId: "gap1016-live",
        startedAt: "2026-06-24T10:16:00.000Z",
        endedAt: "2026-06-24T14:16:00.000Z",
        rows: rows("live", 0.48, "drifted-game-evaluation"),
      },
      sourceRefs: [REPO, API, README, BENCH_README, ARXIV],
      now: new Date("2026-06-24T15:16:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([REPO, API, README, BENCH_README, ARXIV]);
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

  it("fails closed when GamingAgent metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.48, "drifted-game-evaluation").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-1016-gamingagent-metadata-agent",
      baselineWindow: {
        windowId: "gap1016-metadata-only-baseline",
        startedAt: "2026-06-23T10:16:00.000Z",
        endedAt: "2026-06-23T14:16:00.000Z",
        rows: rows("baseline", 0.91, "stable-game-evaluation"),
      },
      liveWindow: {
        windowId: "gap1016-metadata-only-live",
        startedAt: "2026-06-24T10:16:00.000Z",
        endedAt: "2026-06-24T14:16:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [REPO, README_API, README],
      now: new Date("2026-06-24T15:16:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add GamingAgent identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("GamingAgent");
      expect(source).not.toContain("lmgame-org/GamingAgent");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
