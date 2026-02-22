import { describe, expect, it } from "vitest";
import {
  assessOversightQuality,
  compareProfiles
} from "../src/score/humanOversightQuality.js";
import type {
  OversightApprovalEvent,
  OversightEscalationEvent
} from "../src/score/humanOversightQuality.js";

const BASE_SCORES = {
  "AMC-HOQ-1": 5,
  "AMC-HOQ-2": 5,
  "AMC-HOQ-3": 5,
  "AMC-HOQ-4": 5
} as const;

const BASE_TS = 1_730_000_000_000;

function makeApproval(overrides: Partial<OversightApprovalEvent> = {}): OversightApprovalEvent {
  return {
    riskTier: "high",
    requestedTs: BASE_TS,
    decidedTs: BASE_TS + 5_000,
    decision: "APPROVED",
    reviewedByHuman: true,
    reviewerId: "reviewer-1",
    agentRecommendation: "APPROVE",
    ...overrides
  };
}

function makeEscalation(overrides: Partial<OversightEscalationEvent> = {}): OversightEscalationEvent {
  return {
    escalationId: "esc-1",
    triggeredTs: BASE_TS,
    expectedLevel: 2,
    reachedLevel: 2,
    acknowledgedTs: BASE_TS + 60_000,
    resolvedTs: BASE_TS + 120_000,
    ...overrides
  };
}

describe("human oversight quality scoring signals", () => {
  it("returns approval-theater and coverage fields", () => {
    const result = assessOversightQuality({ scores: BASE_SCORES });
    expect(result).toHaveProperty("approvalTheaterDetected");
    expect(result).toHaveProperty("approvalTheaterRate");
    expect(result).toHaveProperty("oversightCoverageRate");
    expect(result).toHaveProperty("reviewerConcentrationRisk");
    expect(result).toHaveProperty("overrideRate");
    expect(result).toHaveProperty("escalationPathVerified");
  });

  it("detects approval theater when high-risk approvals are consistently under 2s", () => {
    const approvals = Array.from({ length: 5 }, (_, idx) =>
      makeApproval({
        approvalId: `appr-fast-${idx}`,
        requestedTs: BASE_TS + idx * 10_000,
        decidedTs: BASE_TS + idx * 10_000 + 1_200,
        reviewerId: "reviewer-fast"
      })
    );
    const result = assessOversightQuality({ scores: BASE_SCORES, approvals });
    expect(result.approvalTheaterDetected).toBe(true);
    expect(result.approvalTheaterRate).toBe(1);
  });

  it("does not flag approval theater for normal review durations", () => {
    const approvals = Array.from({ length: 5 }, (_, idx) =>
      makeApproval({
        approvalId: `appr-slow-${idx}`,
        requestedTs: BASE_TS + idx * 10_000,
        decidedTs: BASE_TS + idx * 10_000 + 5_500,
        reviewerId: `reviewer-${idx % 2}`
      })
    );
    const result = assessOversightQuality({ scores: BASE_SCORES, approvals });
    expect(result.approvalTheaterDetected).toBe(false);
    expect(result.approvalTheaterRate).toBe(0);
  });

  it("computes oversight coverage rate from high-risk totals", () => {
    const result = assessOversightQuality({
      scores: BASE_SCORES,
      highRiskActions: 10,
      highRiskReviewed: 6
    });
    expect(result.oversightCoverageRate).toBeCloseTo(0.6, 6);
  });

  it("flags reviewer concentration risk when one reviewer dominates approvals", () => {
    const approvals: OversightApprovalEvent[] = [
      ...Array.from({ length: 8 }, (_, idx) =>
        makeApproval({
          approvalId: `a-${idx}`,
          reviewerId: "alice",
          requestedTs: BASE_TS + idx * 10_000,
          decidedTs: BASE_TS + idx * 10_000 + 4_500
        })
      ),
      makeApproval({
        approvalId: "a-9",
        reviewerId: "bob",
        requestedTs: BASE_TS + 90_000,
        decidedTs: BASE_TS + 95_000
      })
    ];
    const result = assessOversightQuality({ scores: BASE_SCORES, approvals });
    expect(result.dominantReviewerId).toBe("alice");
    expect(result.reviewerConcentrationRisk).toBeGreaterThan(0.75);
  });

  it("tracks override rate from agent-vs-human decision differences", () => {
    const approvals: OversightApprovalEvent[] = [
      makeApproval({ approvalId: "o1", decision: "DENIED", agentRecommendation: "APPROVE" }), // override
      makeApproval({ approvalId: "o2", decision: "DENIED", agentRecommendation: "DENY" }), // same
      makeApproval({ approvalId: "o3", decision: "APPROVED", agentRecommendation: "APPROVE" }), // same
      makeApproval({ approvalId: "o4", decision: "APPROVED", agentRecommendation: "DENY" }) // override
    ];
    const result = assessOversightQuality({ scores: BASE_SCORES, approvals });
    expect(result.overrideRateSampleSize).toBe(4);
    expect(result.overrideRate).toBeCloseTo(0.5, 6);
  });

  it("verifies escalation path when acknowledgement and resolution meet SLA", () => {
    const escalations: OversightEscalationEvent[] = [
      makeEscalation({ escalationId: "esc-ok-1" }),
      makeEscalation({
        escalationId: "esc-ok-2",
        triggeredTs: BASE_TS + 500_000,
        acknowledgedTs: BASE_TS + 560_000,
        resolvedTs: BASE_TS + 620_000
      })
    ];
    const result = assessOversightQuality({ scores: BASE_SCORES, escalations });
    expect(result.escalationPathVerified).toBe(true);
    expect(result.escalationVerificationRate).toBe(1);
  });

  it("fails escalation verification when acknowledgement is missing or late", () => {
    const escalations: OversightEscalationEvent[] = [
      makeEscalation({ escalationId: "esc-bad-1", acknowledgedTs: undefined, resolvedTs: undefined }),
      makeEscalation({
        escalationId: "esc-bad-2",
        triggeredTs: BASE_TS + 100_000,
        acknowledgedTs: BASE_TS + 100_000 + 11 * 60_000, // beyond 10 minute SLA
        resolvedTs: BASE_TS + 100_000 + 12 * 60_000
      })
    ];
    const result = assessOversightQuality({ scores: BASE_SCORES, escalations });
    expect(result.escalationPathVerified).toBe(false);
    expect(result.escalationVerificationRate).toBe(0);
  });

  it("penalizes overall score when approval theater is present", () => {
    const slowApprovals = Array.from({ length: 6 }, (_, idx) =>
      makeApproval({
        approvalId: `slow-${idx}`,
        reviewerId: idx % 2 === 0 ? "r1" : "r2",
        requestedTs: BASE_TS + idx * 10_000,
        decidedTs: BASE_TS + idx * 10_000 + 4_000
      })
    );
    const fastApprovals = Array.from({ length: 6 }, (_, idx) =>
      makeApproval({
        approvalId: `fast-${idx}`,
        reviewerId: "r1",
        requestedTs: BASE_TS + idx * 10_000,
        decidedTs: BASE_TS + idx * 10_000 + 1_000
      })
    );

    const healthy = assessOversightQuality({ scores: BASE_SCORES, approvals: slowApprovals });
    const theater = assessOversightQuality({ scores: BASE_SCORES, approvals: fastApprovals });

    expect(theater.approvalTheaterDetected).toBe(true);
    expect(theater.overallScore).toBeLessThan(healthy.overallScore);
  });

  it("emits targeted gaps for theater, low coverage, and escalation chain failures", () => {
    const approvals = Array.from({ length: 4 }, (_, idx) =>
      makeApproval({
        approvalId: `gap-${idx}`,
        reviewerId: "reviewer-1",
        requestedTs: BASE_TS + idx * 5_000,
        decidedTs: BASE_TS + idx * 5_000 + 1_000
      })
    );
    const result = assessOversightQuality({
      scores: { "AMC-HOQ-1": 2, "AMC-HOQ-2": 1, "AMC-HOQ-3": 1, "AMC-HOQ-4": 1 },
      approvals,
      highRiskActions: 10,
      highRiskReviewed: 2,
      escalations: [makeEscalation({ escalationId: "esc-gap", acknowledgedTs: undefined, resolvedTs: undefined })]
    });
    expect(result.gaps.some((gap) => gap.includes("Approval theater detected"))).toBe(true);
    expect(result.gaps.some((gap) => gap.includes("Oversight coverage is low"))).toBe(true);
    expect(result.gaps.some((gap) => gap.includes("Escalation path verification failed"))).toBe(true);
  });

  it("keeps backward compatibility for score-only input maps", () => {
    const result = assessOversightQuality({ "AMC-HOQ-1": 5, "AMC-HOQ-2": 5 });
    expect(result.overallScore).toBe(100);
    expect(result.escalationPathVerified).toBe(true);
    expect(result.oversightExistence).toBe(true);
  });

  it("compareProfiles reports deltas and resolved gaps", () => {
    const low = assessOversightQuality({ "AMC-HOQ-1": 0, "AMC-HOQ-2": 0 });
    const high = assessOversightQuality({ "AMC-HOQ-1": 5, "AMC-HOQ-2": 5, "AMC-HOQ-3": 5, "AMC-HOQ-4": 5 });
    const cmp = compareProfiles(low, high);
    expect(cmp.scoreDelta).toBeGreaterThan(0);
    expect(cmp.resolvedGaps.length).toBeGreaterThan(0);
  });
});
