import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildOverrideNearMissAnalyticsReceipt,
  buildOverrideNearMissWatchAlerts,
  type OverrideNearMissEvent,
  type OverrideNearMissTrendWindow,
} from "../src/watch/overrideNearMissAnalytics.js";

const DOC = "docs/source-reviews/GAP-3746-self-hosting-override-near-miss-analytics.md";
const REPO = "https://github.com/mikeroyal/Self-Hosting-Guide";
const API = "https://api.github.com/repos/mikeroyal/Self-Hosting-Guide";
const README = "https://raw.githubusercontent.com/mikeroyal/Self-Hosting-Guide/main/README.md";
const CONTRIBUTING = "https://raw.githubusercontent.com/mikeroyal/Self-Hosting-Guide/main/CONTRIBUTING.md";
const CONTENTS = "https://api.github.com/repos/mikeroyal/Self-Hosting-Guide/contents?ref=main";

const implementationFiles = [
  "src/watch/overrideNearMissAnalytics.ts",
  "src/watch/index.ts",
  "src/index.ts",
];

function window(): OverrideNearMissTrendWindow {
  return {
    start: "2026-06-26T03:00:00.000Z",
    end: "2026-06-26T04:00:00.000Z",
    evidenceRefs: ["trend-window-receipt"],
  };
}

function event(eventId: string, overrides: Partial<OverrideNearMissEvent> = {}): OverrideNearMissEvent {
  return {
    eventId,
    agentId: "agent-gap3746",
    useCaseId: "refund-support",
    timestamp: "2026-06-26T03:10:00.000Z",
    eventType: "human_override",
    reasonCode: "policy_risk",
    actionTaken: "blocked_action_and_retrained_fixture",
    nearMissLink: "near-miss-gap3746-001",
    failureMode: "policy_gap",
    riskEvent: "refund_over_limit",
    promptBoundary: "support-triage",
    toolBoundary: "refund-tool",
    latencyMs: 1_900,
    costUsd: 0.04,
    remediationState: "closed",
    reviewerId: "reviewer-1",
    evidenceRefs: [`${eventId}-row-hash`, `${eventId}-operator-note`],
    ...overrides,
  };
}

describe("GAP-3746 Self-Hosting-Guide override and near-miss analytics boundary", () => {
  it("documents live Self-Hosting-Guide metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-3746");
    expect(doc).toContain("mikeroyal/Self-Hosting-Guide");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(CONTRIBUTING);
    expect(doc).toContain(CONTENTS);
    expect(doc).toContain("Self-Hosting Guide");
    expect(doc).toContain("locally hosting");
    expect(doc).toContain("private web servers");
    expect(doc).toContain("LLMs");
    expect(doc).toContain("Automation");
    expect(doc).toContain("observability");
    expect(doc).toContain("privacy");
    expect(doc).toContain("Override event, reason code, trend window, near-miss link, and action taken");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("tracks overrides, ignored escalations, near misses, and repeated approval patterns", () => {
    const receipt = buildOverrideNearMissAnalyticsReceipt({
      generatedAt: "2026-06-26T04:05:00.000Z",
      sourceRefs: [REPO, API],
      window: window(),
      events: [
        event("override-1"),
        event("near-miss-1", {
          eventType: "near_miss",
          actionTaken: "added_guardrail_fixture",
          nearMissLink: "near-miss-gap3746-002",
          failureMode: "human_review_gap",
          riskEvent: "unsafe_autonomy",
          promptBoundary: "approval-review",
          toolBoundary: "crm-update",
          remediationState: "mitigated",
          latencyMs: 2_800,
          costUsd: 0.08,
        }),
        event("ignored-escalation-1", {
          eventType: "ignored_escalation",
          reasonCode: "review_queue_saturated",
          actionTaken: "paged_oncall_and_reopened_case",
          nearMissLink: "near-miss-gap3746-003",
          failureMode: "escalation_ignored",
          riskEvent: "unreviewed_high_risk_action",
          promptBoundary: "supervisor-escalation",
          toolBoundary: "case-router",
          remediationState: "open",
          latencyMs: 5_400,
          costUsd: 0.12,
        }),
        event("approval-repeat-1", {
          eventType: "approval",
          reasonCode: "policy_risk",
          actionTaken: "approved_with_manual_condition",
          reviewerId: "reviewer-2",
        }),
        event("approval-repeat-2", {
          eventType: "approval",
          reasonCode: "policy_risk",
          actionTaken: "approved_with_manual_condition",
          reviewerId: "reviewer-2",
          timestamp: "2026-06-26T03:20:00.000Z",
        }),
      ],
    });

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaceBindings).toEqual(["Watch", "Studio", "API"]);
    expect(receipt.traceIndex.searchFields).toEqual([
      "eventId",
      "agentId",
      "useCaseId",
      "eventType",
      "reasonCode",
      "riskEvent",
      "failureMode",
      "promptToolBoundary",
      "remediationState",
    ]);
    expect(receipt.traceIndex.entries.map((entry) => entry.eventId)).toEqual([
      "approval-repeat-1",
      "approval-repeat-2",
      "ignored-escalation-1",
      "near-miss-1",
      "override-1",
    ]);
    expect(receipt.traceIndex.entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.rowHash))).toBe(true);
    expect(receipt.failureClusters.map((cluster) => cluster.failureMode)).toEqual(expect.arrayContaining([
      "escalation_ignored",
      "human_review_gap",
      "policy_gap",
    ]));
    expect(receipt.liveTrends).toMatchObject({
      eventCount: 5,
      agentCount: 1,
      useCaseCount: 1,
      overrideCount: 1,
      nearMissCount: 1,
      ignoredEscalationCount: 1,
      approvalCount: 2,
      totalCostUsd: 0.32,
      p95LatencyMs: 5_400,
    });
    expect(receipt.repeatedApprovalPatterns[0]).toMatchObject({
      agentId: "agent-gap3746",
      useCaseId: "refund-support",
      reasonCode: "policy_risk",
      actionTaken: "approved_with_manual_condition",
      count: 2,
      reviewerIds: ["reviewer-2"],
    });
    expect(buildOverrideNearMissWatchAlerts(receipt)).toEqual([
      expect.objectContaining({
        source: "override-near-miss-analytics",
        severity: "warning",
        metricId: "ignoredEscalationCount",
      }),
    ]);
  });

  it("fails closed when repository metadata replaces override and near-miss evidence", () => {
    const receipt = buildOverrideNearMissAnalyticsReceipt({
      generatedAt: "2026-06-26T04:05:00.000Z",
      sourceRefs: [REPO, API, README],
      window: {
        start: "2026-06-26T03:00:00.000Z",
        end: "2026-06-26T04:00:00.000Z",
        evidenceRefs: [],
      },
      events: [],
    });

    expect(receipt.status).toBe("fail_closed");
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "events:missing",
      "trendWindowEvidence:missing",
    ]));
    expect(receipt.traceIndex.entries).toEqual([]);
    expect(receipt.failureClusters).toEqual([]);
    expect(buildOverrideNearMissWatchAlerts(receipt)[0]).toMatchObject({
      source: "override-near-miss-analytics",
      severity: "critical",
      status: "fail_closed",
    });
  });

  it("requires reason code, action taken, near-miss link, and evidence refs", () => {
    const receipt = buildOverrideNearMissAnalyticsReceipt({
      generatedAt: "2026-06-26T04:05:00.000Z",
      sourceRefs: [REPO],
      window: window(),
      events: [
        event("bad-near-miss", {
          eventType: "near_miss",
          reasonCode: "",
          actionTaken: "",
          nearMissLink: "",
          evidenceRefs: [],
        }),
      ],
    });

    expect(receipt.status).toBe("fail_closed");
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "bad-near-miss:reasonCode:missing",
      "bad-near-miss:actionTaken:missing",
      "bad-near-miss:nearMissLink:missing",
      "bad-near-miss:evidenceRefs:missing",
    ]));
  });

  it("does not add Self-Hosting-Guide identifiers to generic implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Self-Hosting-Guide");
      expect(source).not.toContain("mikeroyal");
      expect(source).not.toContain("self-hosting-guide");
    }
  });
});
