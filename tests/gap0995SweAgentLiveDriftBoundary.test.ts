import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0995-swe-agent-live-drift.md";
const REPO = "https://github.com/SWE-agent/SWE-agent";
const API = "https://api.github.com/repos/SWE-agent/SWE-agent";
const README = "https://raw.githubusercontent.com/SWE-agent/SWE-agent/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/SWE-agent/SWE-agent/main/LICENSE";
const PYPROJECT = "https://raw.githubusercontent.com/SWE-agent/SWE-agent/main/pyproject.toml";
const RELEASE = "https://github.com/SWE-agent/SWE-agent/releases/tag/v1.1.0";
const DOCS = "https://swe-agent.com/latest/";
const ARXIV = "https://arxiv.org/abs/2405.15793";
const MINI_SWE_AGENT = "https://github.com/SWE-agent/mini-swe-agent/";
const ENIGMA = "https://enigma-agent.com/";
const HEAD = "abd7d69724d1413b30fea43d4724bb5b463906b4";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0995-${prefix}-trace-${index}`,
    scenarioId: `gap0995-software-agent-eval-${index}`,
    timestamp: `2026-06-24T1${index}:41:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:software-agent-eval-${index}`,
    taskCategory: "software-engineering-agent-live-drift",
    domain: "agent-evaluation-and-benchmarks",
    agentEvaluationDimension: "observed_software_agent_behavior_drift",
    invalidActionRate0to1: prefix === "live" ? 0.2 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.14 : 0.01,
    toolCallCount: prefix === "live" ? 23 : 11,
    latencyMs: prefix === "live" ? 5900 : 1720,
    costUsd: prefix === "live" ? 0.084 : 0.019,
    evidenceRefs: [`ev-gap0995-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0995-${prefix}-${index}`],
  }));
}

describe("GAP-0995 SWE-agent live-drift boundary", () => {
  it("documents SWE-agent live source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0995");
    expect(doc).toContain("SWE-agent/SWE-agent");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(MINI_SWE_AGENT);
    expect(doc).toContain(ENIGMA);
    expect(doc).toContain(HEAD);
    expect(doc).toContain("MIT License");
    expect(doc).toContain("Python");
    expect(doc).toContain("19,609 stars");
    expect(doc).toContain("2,145 forks");
    expect(doc).toContain("28 open issues");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("pushed_at `2026-06-22T21:51:09Z`");
    expect(doc).toContain("updated_at `2026-06-24T12:39:38Z`");
    expect(doc).toContain("latest release `v1.1.0`");
    expect(doc).toContain("published_at `2025-05-22T16:11:39Z`");
    expect(doc).toContain("requires-python `>=3.11`");
    expect(doc).toContain("litellm");
    expect(doc).toContain("swe-rex>=1.4.0");
    expect(doc).toContain("textual>=1.0.0");
    expect(doc).toContain("mini-swe-agent");
    expect(doc).toContain("SWE-bench");
    expect(doc).toContain("EnIGMA");
    expect(doc).toContain("NeurIPS 2024");
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

  it("accepts SWE-agent context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0995-swe-agent-reviewed-agent",
      baselineWindow: {
        windowId: "gap0995-baseline",
        startedAt: "2026-06-23T10:41:00.000Z",
        endedAt: "2026-06-23T13:41:00.000Z",
        rows: rows("baseline", 0.89, "stable-software-agent"),
      },
      liveWindow: {
        windowId: "gap0995-live",
        startedAt: "2026-06-24T10:41:00.000Z",
        endedAt: "2026-06-24T13:41:00.000Z",
        rows: rows("live", 0.5, "drifted-software-agent"),
      },
      sourceRefs: [REPO, README, DOCS, ARXIV],
      now: new Date("2026-06-24T14:41:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([REPO, README, DOCS, ARXIV]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "errorRate0to1",
      "invalidActionRate0to1",
      "errorAttributionRate0to1",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when SWE-agent metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.5, "drifted-software-agent").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0995-swe-agent-reviewed-agent",
      baselineWindow: {
        windowId: "gap0995-metadata-only-baseline",
        startedAt: "2026-06-23T10:41:00.000Z",
        endedAt: "2026-06-23T13:41:00.000Z",
        rows: rows("baseline", 0.89, "stable-software-agent"),
      },
      liveWindow: {
        windowId: "gap0995-metadata-only-live",
        startedAt: "2026-06-24T10:41:00.000Z",
        endedAt: "2026-06-24T13:41:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [REPO],
      now: new Date("2026-06-24T14:41:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add SWE-agent identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("SWE-agent/SWE-agent");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("swe_agent_live_drift");
      expect(source).not.toContain("SWE-agent live drift");
    }
  });
});
