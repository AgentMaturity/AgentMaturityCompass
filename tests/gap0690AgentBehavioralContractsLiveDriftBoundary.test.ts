import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLiveDriftWatchAlerts,
  runLiveScoreBehaviorDrift,
  verifyLiveDriftReceipt,
  type LiveDriftSampleRow,
} from "../src/watch/liveDriftAlerts.js";

const DOC = "docs/source-reviews/GAP-0690-agent-behavioral-contracts-live-drift.md";
const DOI = "10.48550/arxiv.2602.22302";
const OPENALEX = "W7131872410";
const ARXIV = "https://arxiv.org/abs/2602.22302";

const implementationFiles = [
  "src/watch/liveDriftAlerts.ts",
  "src/drift/continuousMonitor.ts",
  "src/score/index.ts",
];

function rows(prefix: "baseline" | "live", score0to1: number, behavior: string): LiveDriftSampleRow[] {
  return [0, 1, 2, 3].map((index) => ({
    traceId: `gap0690-${prefix}-trace-${index}`,
    scenarioId: `gap0690-behavioral-contract-${index}`,
    timestamp: `2026-06-21T1${index}:50:00.000Z`,
    score0to1,
    passed: prefix === "baseline",
    refused: false,
    errored: prefix === "live" && index === 2,
    behaviorSignature: `${behavior}:${index}`,
    taskCategory: "agent-behavioral-contract-runtime-enforcement",
    domain: "autonomous-agent-governance",
    agentEvaluationDimension: "contract_compliance_behavior_drift",
    interactionTurnCount: prefix === "live" ? 20 + index : 10 + index,
    invalidActionRate0to1: prefix === "live" ? 0.14 : 0.02,
    errorAttributionRate0to1: prefix === "live" ? 0.09 : 0.01,
    toolCallCount: prefix === "live" ? 9 : 4,
    latencyMs: prefix === "live" ? 3450 : 1250,
    costUsd: prefix === "live" ? 0.047 : 0.015,
    evidenceRefs: [`ev-gap0690-${prefix}-${index}`],
    signedEvidenceRefs: [`ledger-gap0690-${prefix}-${index}`],
  }));
}

describe("GAP-0690 Agent Behavioral Contracts live-drift boundary", () => {
  it("documents live Agent Behavioral Contracts metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0690");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain("Agent Behavioral Contracts: Formal Specification and Runtime Enforcement for Reliable Autonomous AI Agents");
    expect(doc).toContain("Submitted on 25 Feb 2026");
    expect(doc).toContain("Preconditions");
    expect(doc).toContain("Invariants");
    expect(doc).toContain("Governance policies");
    expect(doc).toContain("Recovery mechanisms");
    expect(doc).toContain("(p, delta, k)-satisfaction");
    expect(doc).toContain("AgentAssert");
    expect(doc).toContain("AgentContract-Bench");
    expect(doc).toContain("200 scenarios");
    expect(doc).toContain("7 models from 6 vendors");
    expect(doc).toContain("1,980 sessions");
    expect(doc).toContain("D* < 0.27");
    expect(doc).toContain("overhead < 10 ms per action");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing Watch live-drift receipts for behavioral-contract compliance drift", () => {
    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0690-contract-governed-agent",
      baselineWindow: {
        windowId: "gap0690-baseline",
        startedAt: "2026-06-20T10:50:00.000Z",
        endedAt: "2026-06-20T14:50:00.000Z",
        rows: rows("baseline", 0.93, "stable-contract-compliance-workflow"),
      },
      liveWindow: {
        windowId: "gap0690-live",
        startedAt: "2026-06-21T10:50:00.000Z",
        endedAt: "2026-06-21T14:50:00.000Z",
        rows: rows("live", 0.61, "drifted-contract-compliance-workflow"),
      },
      sourceRefs: [`https://openalex.org/${OPENALEX}`, `https://doi.org/${DOI}`, ARXIV],
      now: new Date("2026-06-21T15:50:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.recommendation).toBe("alert");
    expect(receipt.sourceRefs).toEqual([`https://openalex.org/${OPENALEX}`, `https://doi.org/${DOI}`, ARXIV]);
    expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "scoreMean0to1",
      "behaviorSignature",
      "latencyMsP95",
      "costUsdMean",
    ]));
    expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
    expect(buildLiveDriftWatchAlerts(receipt).every((alert) => alert.source === "live-score-behavior-drift")).toBe(true);
  });

  it("fails closed when Agent Behavioral Contracts paper metadata replaces signed live-drift evidence", () => {
    const metadataOnlyLiveRows = rows("live", 0.61, "drifted-contract-compliance-workflow").map((row) => ({
      ...row,
      evidenceRefs: [],
      signedEvidenceRefs: [],
    }));

    const receipt = runLiveScoreBehaviorDrift({
      agentId: "gap-0690-contract-governed-agent",
      baselineWindow: {
        windowId: "gap0690-metadata-only-baseline",
        startedAt: "2026-06-20T10:50:00.000Z",
        endedAt: "2026-06-20T14:50:00.000Z",
        rows: rows("baseline", 0.93, "stable-contract-compliance-workflow"),
      },
      liveWindow: {
        windowId: "gap0690-metadata-only-live",
        startedAt: "2026-06-21T10:50:00.000Z",
        endedAt: "2026-06-21T14:50:00.000Z",
        rows: metadataOnlyLiveRows,
      },
      sourceRefs: [ARXIV],
      now: new Date("2026-06-21T15:50:00.000Z"),
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.alerts.map((alert) => alert.metricId)).toContain("signedEvidenceRefs");
  });

  it("does not add Agent Behavioral Contracts identifiers to Watch, Drift, or Score modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("AgentAssert");
      expect(source).not.toContain("AgentContract-Bench");
      expect(source).not.toContain("agent_behavioral_contracts_live_drift");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
    }
  });
});
