import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0906-clawsafety-live-drift.md";
const REPO = "weibowen555/ClawSafety";
const URL = "https://github.com/weibowen555/ClawSafety";
const TITLE = "ClawSafety: \"Safe\" LLMs, Unsafe Agents";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0906-${prefix}-trace-${index}`,
    scenarioId: `gap0906-clawsafety-score-${index}`,
    timestamp: `2026-06-22T1${index}:06:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: prefix === "baseline",
    errored: prefix === "live" && index === 3,
    behaviorSignature: `${behavior}:prompt-injection-safety:${index}`,
    taskCategory: "clawsafety-score-live-drift",
    domain: "agent-evaluation-safety",
    agentEvaluationDimension: "observed_prompt_injection_score_behavior_drift",
    interactionTurnCount: prefix === "live" ? 20 + index : 9 + index,
    invalidActionRate0to1: prefix === "live" ? 0.16 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.08 : 0.01,
    toolCallCount: prefix === "live" ? 8 : 3,
    latencyMs: prefix === "live" ? 3600 : 1300,
    costUsd: prefix === "live" ? 0.062 : 0.016,
    evidenceRefs: [`ev-gap0906-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0906-${prefix}-${index}`],
  }));
}

describe("GAP-0906 ClawSafety live-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0906");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("CC-BY-4.0");
    expect(doc).toContain("Star 17");
    expect(doc).toContain("Fork 2");
    expect(doc).toContain("Issues 2");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("19 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Python 100.0%");
    expect(doc).toContain("docs");
    expect(doc).toContain("scenarios/ s2_financial");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("SECURITY.md");
    expect(doc).toContain("s2_workspace.tar.gz");
    expect(doc).toContain("scenario_template.py");
    expect(doc).toContain("Safe LLMs, Unsafe Agents");
    expect(doc).toContain("realistic prompt injection");
    expect(doc).toContain("personal AI agents");
    expect(doc).toContain("OpenClaw");
    expect(doc).toContain("elevated privileges");
    expect(doc).toContain("leak credentials");
    expect(doc).toContain("redirect financial transactions");
    expect(doc).toContain("destroy files");
    expect(doc).toContain("120 adversarial test cases");
    expect(doc).toContain("5 professional domains");
    expect(doc).toContain("3 injection vectors");
    expect(doc).toContain("5 harmful action types");
    expect(doc).toContain("40-75%");
    expect(doc).toContain("8.6pp");
    expect(doc).toContain("0% ASR");
    expect(doc).toContain("Software Engineering");
    expect(doc).toContain("Financial Ops");
    expect(doc).toContain("Healthcare");
    expect(doc).toContain("Legal");
    expect(doc).toContain("DevOps");
    expect(doc).toContain("Skill injection");
    expect(doc).toContain("Email injection");
    expect(doc).toContain("Web injection");
    expect(doc).toContain("Data exfiltration");
    expect(doc).toContain("Config modification");
    expect(doc).toContain("Destination substitution");
    expect(doc).toContain("Credential forwarding");
    expect(doc).toContain("Destructive action");
    expect(doc).toContain("50+ files");
    expect(doc).toContain("64-turn multi-phase conversation");
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

  it("uses existing Watch live-drift receipts for prompt-injection safety changes", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0906-clawsafety-reviewed-agent",
      baselineWindow: {
        windowId: "gap0906-baseline",
        startedAt: "2026-06-21T10:06:00.000Z",
        endedAt: "2026-06-21T13:06:00.000Z",
        rows: rows("baseline", 0.92, "stable-prompt-injection-safety"),
      },
      liveWindow: {
        windowId: "gap0906-live",
        startedAt: "2026-06-22T10:06:00.000Z",
        endedAt: "2026-06-22T13:06:00.000Z",
        rows: rows("live", 0.49, "drifted-prompt-injection-safety"),
      },
      sourceRefs: [URL],
      now: new Date("2026-06-22T14:06:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([URL]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "invalidActionRate0to1",
      "latencyMsP95",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when ClawSafety source metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.49, "drifted-prompt-injection-safety").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0906-clawsafety-reviewed-agent",
      baselineWindow: {
        windowId: "gap0906-metadata-only-baseline",
        startedAt: "2026-06-21T10:06:00.000Z",
        endedAt: "2026-06-21T13:06:00.000Z",
        rows: rows("baseline", 0.92, "stable-prompt-injection-safety"),
      },
      liveWindow: {
        windowId: "gap0906-metadata-only-live",
        startedAt: "2026-06-22T10:06:00.000Z",
        endedAt: "2026-06-22T13:06:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [URL],
      now: new Date("2026-06-22T14:06:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(false);
  });

  it("does not add ClawSafety identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("clawsafety_live_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
