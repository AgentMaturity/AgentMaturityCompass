import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assessOversightQuality,
  type OversightApprovalEvent
} from "../src/score/humanOversightQuality.js";

const DOC = "docs/source-reviews/GAP-3619-approval-latency-slo.md";
const OPENALEX = "https://openalex.org/W7131082771";
const OPENALEX_API = "https://api.openalex.org/works/W7131082771";
const DOI = "https://doi.org/10.1016/j.jmsy.2026.02.015";
const CROSSREF = "https://api.crossref.org/works/10.1016/j.jmsy.2026.02.015";
const ELSEVIER = "https://linkinghub.elsevier.com/retrieve/pii/S0278612526000427";
const TITLE = "LLM-driven discrete-event simulation: A generative AI framework for automated model generation, adaptation, and evaluation in manufacturing";
const IDENTIFIER = "manufacturing_approval_latency_slo";
const IMPLEMENTATION_FILES = [
  "src/score/humanOversightQuality.ts",
  "src/assurance/packs/humanOversightQualityPack.ts"
];

const BASE_SCORES = {
  "AMC-HOQ-1": 5,
  "AMC-HOQ-2": 5,
  "AMC-HOQ-3": 5,
  "AMC-HOQ-4": 5,
  "graduated-autonomy": 5
} as const;

const BASE_TS = Date.parse("2026-06-25T16:30:00.000Z");

function approval(overrides: Partial<OversightApprovalEvent> = {}): OversightApprovalEvent {
  return {
    approvalId: "approval-base",
    actionId: "action-base",
    riskTier: "high",
    requestedTs: BASE_TS,
    reviewStartedTs: BASE_TS + 60_000,
    decidedTs: BASE_TS + 5 * 60_000,
    decision: "APPROVED",
    reviewedByHuman: true,
    reviewerId: "reviewer-primary",
    agentRecommendation: "APPROVE",
    ...overrides
  };
}

describe("GAP-3619 approval latency SLO boundary", () => {
  it("documents live paper metadata and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-3619");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(ELSEVIER);
    expect(doc).toContain("Journal of Manufacturing Systems");
    expect(doc).toContain("Elsevier BV");
    expect(doc).toContain("Thomas Schmitt");
    expect(doc).toContain("Blueprint");
    expect(doc).toContain("Executable");
    expect(doc).toContain("Workflow");
    expect(doc).toContain("risk tier, queue time, reviewer action time, breach status, and fallback");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No manufacturing simulation subsystem");
  });

  it("measures risk-tier approval latency SLO breaches and fallback routing", () => {
    const approvals: OversightApprovalEvent[] = [
      approval({
        approvalId: "approval-high-ok",
        actionId: "deploy-high-ok",
        riskTier: "high",
        requestedTs: BASE_TS,
        reviewStartedTs: BASE_TS + 2 * 60_000,
        decidedTs: BASE_TS + 10 * 60_000,
        reviewerId: "reviewer-a"
      }),
      approval({
        approvalId: "approval-high-breach",
        actionId: "deploy-high-breach",
        riskTier: "high",
        requestedTs: BASE_TS + 20 * 60_000,
        reviewStartedTs: BASE_TS + 38 * 60_000,
        decidedTs: BASE_TS + 41 * 60_000,
        fallbackTriggeredTs: BASE_TS + 35 * 60_000,
        fallbackReviewerId: "fallback-reviewer-1",
        reviewerId: "reviewer-b"
      }),
      approval({
        approvalId: "approval-critical-breach",
        actionId: "wire-critical",
        riskTier: "critical",
        requestedTs: BASE_TS + 60 * 60_000,
        reviewStartedTs: BASE_TS + 66 * 60_000,
        decidedTs: BASE_TS + 68 * 60_000,
        degradedModeActivated: true,
        reviewerId: "reviewer-c"
      }),
      approval({
        approvalId: "approval-medium-ok",
        actionId: "medium-maintenance",
        riskTier: "medium",
        requestedTs: BASE_TS + 90 * 60_000,
        reviewStartedTs: BASE_TS + 92 * 60_000,
        decidedTs: BASE_TS + 110 * 60_000,
        reviewerId: "reviewer-d"
      })
    ];

    const result = assessOversightQuality({
      scores: BASE_SCORES,
      approvals,
      highRiskActions: 3,
      highRiskReviewed: 3
    });

    expect(result.approvalLatencySloMet).toBe(false);
    expect(result.approvalLatencySlo.reviewedCount).toBe(4);
    expect(result.approvalLatencySlo.breachedCount).toBe(2);
    expect(result.approvalLatencySlo.breachRate).toBeCloseTo(0.5, 6);
    expect(result.approvalLatencySlo.fallbackTriggeredCount).toBe(1);
    expect(result.approvalLatencySlo.degradedModeCount).toBe(1);
    expect(result.approvalLatencySlo.byRiskTier.high.targetMs).toBe(15 * 60_000);
    expect(result.approvalLatencySlo.byRiskTier.high.breachedCount).toBe(1);
    expect(result.approvalLatencySlo.byRiskTier.critical.targetMs).toBe(5 * 60_000);
    expect(result.approvalLatencySlo.byRiskTier.critical.breachedCount).toBe(1);
    expect(result.approvalLatencySlo.breaches).toEqual(expect.arrayContaining([
      expect.objectContaining({
        approvalId: "approval-high-breach",
        actionId: "deploy-high-breach",
        riskTier: "high",
        queueMs: 18 * 60_000,
        reviewerActionMs: 3 * 60_000,
        totalLatencyMs: 21 * 60_000,
        breachStatus: "breached",
        fallbackReviewerId: "fallback-reviewer-1",
        fallbackTriggered: true
      }),
      expect.objectContaining({
        approvalId: "approval-critical-breach",
        riskTier: "critical",
        breachStatus: "breached",
        degradedModeActivated: true
      })
    ]));
    expect(result.gaps.some((gap) => gap.includes("Approval latency SLO breached"))).toBe(true);
    expect(result.recommendations.some((rec) => rec.includes("Route overdue approvals"))).toBe(true);
  });

  it("keeps SLO green when all approvals meet risk-tier latency targets", () => {
    const approvals: OversightApprovalEvent[] = [
      approval({ approvalId: "critical-ok", riskTier: "critical", decidedTs: BASE_TS + 4 * 60_000 }),
      approval({ approvalId: "high-ok", riskTier: "high", decidedTs: BASE_TS + 10 * 60_000 }),
      approval({ approvalId: "medium-ok", riskTier: "medium", decidedTs: BASE_TS + 35 * 60_000 }),
      approval({ approvalId: "low-ok", riskTier: "low", decidedTs: BASE_TS + 120 * 60_000 })
    ];

    const result = assessOversightQuality({ scores: BASE_SCORES, approvals });

    expect(result.approvalLatencySloMet).toBe(true);
    expect(result.approvalLatencySlo.breachedCount).toBe(0);
    expect(result.approvalLatencySlo.breachRate).toBe(0);
    expect(result.approvalLatencySlo.breaches).toEqual([]);
  });

  it("does not treat score-only metadata as approval latency SLO proof", () => {
    const result = assessOversightQuality({ scores: BASE_SCORES });

    expect(result.approvalLatencySloMet).toBe(false);
    expect(result.approvalLatencySlo.reviewedCount).toBe(0);
    expect(result.gaps.some((gap) => gap.includes("Approval latency SLO is not evidenced"))).toBe(true);
  });

  it("does not add manufacturing-paper-specific identifiers to generic oversight implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("10.1016/j.jmsy.2026.02.015");
    expect(combined).not.toContain("W7131082771");
    expect(combined).not.toContain("Journal of Manufacturing Systems");
    expect(combined).not.toContain("discrete-event simulation");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
