import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-1001-emollm-live-drift.md";
const REPO = "https://github.com/SmartFlowAI/EmoLLM";
const API = "https://api.github.com/repos/SmartFlowAI/EmoLLM";
const README = "https://raw.githubusercontent.com/SmartFlowAI/EmoLLM/main/README.md";
const README_EN = "https://raw.githubusercontent.com/SmartFlowAI/EmoLLM/main/README_EN.md";
const LICENSE_API = "https://api.github.com/repos/SmartFlowAI/EmoLLM/license";
const EVALUATE_README = "https://raw.githubusercontent.com/SmartFlowAI/EmoLLM/main/evaluate/README_EN.md";
const GENERAL_EVALUATION = "https://raw.githubusercontent.com/SmartFlowAI/EmoLLM/main/evaluate/General_evaluation_EN.md";
const PROFESSIONAL_EVALUATION = "https://raw.githubusercontent.com/SmartFlowAI/EmoLLM/main/evaluate/Professional_evaluation_EN.md";
const DATASETS_README = "https://raw.githubusercontent.com/SmartFlowAI/EmoLLM/main/datasets/README_EN.md";
const RAG_README = "https://raw.githubusercontent.com/SmartFlowAI/EmoLLM/main/rag/README_EN.md";
const RELEASE = "https://github.com/SmartFlowAI/EmoLLM/releases/tag/v0.6";
const HEAD = "955155bb536eb1c28ff4500c6dc6a093a24e8209";
const IDENTIFIER = "emollm_live_drift";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap1001-${prefix}-trace-${index}`,
    scenarioId: `gap1001-mental-health-support-drift-${index}`,
    timestamp: `2026-06-24T1${index}:06:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: prefix === "live" && index === 2,
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:mental-health-support-${index}`,
    taskCategory: "mental-health-support-agent-live-drift",
    domain: "agent-evaluation-and-benchmarks",
    agentEvaluationDimension: "conversational_agents",
    socialHarmPrevalence0to1: prefix === "live" ? 0.34 : 0.02,
    socialSentimentMinus1to1: prefix === "live" ? -0.65 : 0.42,
    socialSemanticAlignment0to1: prefix === "live" ? 0.44 : 0.93,
    privacySensitiveDisclosureRate0to1: prefix === "live" ? 0.22 : 0.01,
    privacySafeguardActiveRate0to1: prefix === "live" ? 0.5 : 0.97,
    authorityHandoffRate0to1: prefix === "live" ? 0.3 : 0.88,
    invalidActionRate0to1: prefix === "live" ? 0.2 : 0.01,
    errorAttributionRate0to1: prefix === "live" ? 0.16 : 0.01,
    redTeamBenchmarkId: "gap1001-amc-owned-mental-health-safety-drift",
    redTeamDatasetHash: `gap1001-redteam-dataset-${prefix}`,
    redTeamPromptSetHash: `gap1001-redteam-prompt-set-${prefix}`,
    redTeamPromptId: `gap1001-redteam-prompt-${index}`,
    redTeamSubset: "custom",
    redTeamRiskCategory: "mental-health-support-boundary",
    redTeamAttackType: "professional-care-overclaim",
    redTeamPolicyContextId: "gap1001-crisis-and-care-escalation-policy",
    redTeamGuardModelId: "gap1001-amc-owned-safety-guard",
    redTeamGuardLabel: prefix === "live" ? "unsafe" : "safe",
    redTeamGuardScore0to1: prefix === "live" ? 0.35 : 0.96,
    redTeamUnsafeResponse: prefix === "live",
    redTeamComplianceScore0to1: prefix === "live" ? 0.4 : 0.95,
    redTeamTaxonomyHash: "gap1001-amc-owned-mental-health-risk-taxonomy",
    redTeamResponseHash: `gap1001-redteam-response-${prefix}-${index}`,
    toolCallCount: prefix === "live" ? 12 : 6,
    latencyMs: prefix === "live" ? 4100 : 1400,
    costUsd: prefix === "live" ? 0.052 : 0.014,
    evidenceRefs: [`ev-gap1001-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap1001-${prefix}-${index}`],
  }));
}

describe("GAP-1001 EmoLLM live-drift boundary", () => {
  it("documents live EmoLLM source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1001");
    expect(doc).toContain("SmartFlowAI/EmoLLM");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(README_EN);
    expect(doc).toContain(LICENSE_API);
    expect(doc).toContain(EVALUATE_README);
    expect(doc).toContain(GENERAL_EVALUATION);
    expect(doc).toContain(PROFESSIONAL_EVALUATION);
    expect(doc).toContain(DATASETS_README);
    expect(doc).toContain(RAG_README);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain(HEAD);
    expect(doc).toContain("MIT License");
    expect(doc).toContain("Python");
    expect(doc).toContain("1,749 stars");
    expect(doc).toContain("222 forks");
    expect(doc).toContain("5 open issues");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("pushed_at `2026-06-18T16:47:43Z`");
    expect(doc).toContain("latest release `v0.6`");
    expect(doc).toContain("published_at `2025-05-18T15:43:36Z`");
    expect(doc).toContain("InternLM");
    expect(doc).toContain("Qwen");
    expect(doc).toContain("Baichuan");
    expect(doc).toContain("DeepSeek");
    expect(doc).toContain("Mixtral");
    expect(doc).toContain("LLaMA");
    expect(doc).toContain("ChatGLM");
    expect(doc).toContain("General Metrics Evaluation");
    expect(doc).toContain("Professional Metrics Evaluation");
    expect(doc).toContain("datasets");
    expect(doc).toContain("RAG");
    expect(doc).toContain("emotional support");
    expect(doc).toContain("not a substitute");
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

  it("accepts EmoLLM context only through existing Watch live-drift receipts", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-1001-emollm-reviewed-agent",
      baselineWindow: {
        windowId: "gap1001-baseline",
        startedAt: "2026-06-23T10:06:00.000Z",
        endedAt: "2026-06-23T13:06:00.000Z",
        rows: rows("baseline", 0.9, "stable-mental-health-support-agent"),
      },
      liveWindow: {
        windowId: "gap1001-live",
        startedAt: "2026-06-24T10:06:00.000Z",
        endedAt: "2026-06-24T13:06:00.000Z",
        rows: rows("live", 0.47, "drifted-mental-health-support-agent"),
      },
      sourceRefs: [REPO, README_EN, EVALUATE_README, PROFESSIONAL_EVALUATION],
      now: new Date("2026-06-24T14:06:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([REPO, README_EN, EVALUATE_README, PROFESSIONAL_EVALUATION]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "socialHarmPrevalence0to1",
      "privacySensitiveDisclosureRate0to1",
      "authorityHandoffRateMean0to1",
      "redTeamUnsafeResponseRate0to1",
      "redTeamComplianceMean0to1",
      "redTeamGuardScoreMean0to1",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when EmoLLM metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.47, "drifted-mental-health-support-agent").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-1001-emollm-reviewed-agent",
      baselineWindow: {
        windowId: "gap1001-metadata-only-baseline",
        startedAt: "2026-06-23T10:06:00.000Z",
        endedAt: "2026-06-23T13:06:00.000Z",
        rows: rows("baseline", 0.9, "stable-mental-health-support-agent"),
      },
      liveWindow: {
        windowId: "gap1001-metadata-only-live",
        startedAt: "2026-06-24T10:06:00.000Z",
        endedAt: "2026-06-24T13:06:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [REPO],
      now: new Date("2026-06-24T14:06:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add EmoLLM identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("SmartFlowAI/EmoLLM");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("EmoLLM");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
