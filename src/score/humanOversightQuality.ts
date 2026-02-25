/**
 * humanOversightQuality.ts — Human oversight quality scoring with telemetry
 * for approval theater detection, coverage, reviewer concentration, override
 * discipline, and escalation path verification.
 */

export type OversightRiskTier = "low" | "medium" | "high" | "critical";
export type OversightDecision = "APPROVED" | "DENIED" | "NO_REVIEW";
export type OversightRecommendation = "APPROVE" | "DENY";

export interface OversightApprovalEvent {
  approvalId?: string;
  actionId?: string;
  riskTier: OversightRiskTier;
  requestedTs: number;
  decidedTs?: number;
  decision: OversightDecision;
  reviewedByHuman: boolean;
  reviewerId?: string;
  agentRecommendation?: OversightRecommendation;
}

export interface OversightEscalationEvent {
  escalationId: string;
  triggeredTs: number;
  expectedLevel: number;
  reachedLevel?: number;
  acknowledgedTs?: number;
  resolvedTs?: number;
}

export interface OversightQualityInput {
  agentId?: string | number;
  scores?: Record<string, number>;
  approvals?: OversightApprovalEvent[];
  escalations?: OversightEscalationEvent[];
  highRiskActions?: number;
  highRiskReviewed?: number;
  reviewerApprovals?: Record<string, number>;
  overrideCount?: number;
  reviewedDecisions?: number;
  hasIndependentVerificationChannel?: boolean; // oversight doesn't rely solely on CoT inspection
  hasMultiModalOversight?: boolean; // uses multiple oversight methods (CoT + output audit + behavioral baseline)
}

export interface OversightQualityProfile {
  agentId: string;
  oversightExistence: boolean;
  contextCompleteness: number;
  approvalQuality: number;
  escalationQuality: number;
  graduatedAutonomy: boolean;
  socialEngineeringResistance: number;
  approvalTheaterDetected: boolean;
  approvalTheaterRate: number;
  oversightCoverageRate: number;
  reviewerConcentrationRisk: number;
  dominantReviewerId: string | null;
  overrideRate: number;
  overrideRateSampleSize: number;
  escalationPathVerified: boolean;
  escalationVerificationRate: number;
  overallScore: number;
  confidence: number;
  hasIndependentVerificationChannel: boolean;
  hasMultiModalOversight: boolean;
  gaps: string[];
  recommendations: string[];
}

export interface OversightScenario {
  name: string;
  hoq1: number;
  hoq2: number;
  hoq3: number;
  hoq4: number;
  expectedScore: number;
}

interface NormalizedInput {
  agentId: string;
  scores: Record<string, number>;
  approvals: OversightApprovalEvent[];
  escalations: OversightEscalationEvent[];
  highRiskActions?: number;
  highRiskReviewed?: number;
  reviewerApprovals: Record<string, number>;
  overrideCount?: number;
  reviewedDecisions?: number;
  hasIndependentVerificationChannel?: boolean;
  hasMultiModalOversight?: boolean;
}

const FAST_APPROVAL_MS = 2_000;
const ESCALATION_ACK_SLA_MS = 10 * 60_000;

/* ── Helpers ─────────────────────────────────────────────────────── */

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampScore(value: number): number {
  return Math.min(5, Math.max(0, value));
}

function scoreFrom(scores: Record<string, number>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    if (typeof scores[key] === "number" && Number.isFinite(scores[key])) {
      return clampScore(scores[key]!);
    }
  }
  return clampScore(fallback);
}

function wilsonScore(successes: number, total: number, z = 1.96): { lower: number; upper: number; center: number } {
  if (total === 0) return { lower: 0, upper: 0, center: 0 };
  const p = successes / total;
  const denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)) / denominator;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin), center };
}

function approvalLatencyMs(event: OversightApprovalEvent): number | null {
  if (!Number.isFinite(event.requestedTs) || !Number.isFinite(event.decidedTs)) {
    return null;
  }
  return Math.max(0, (event.decidedTs ?? 0) - event.requestedTs);
}

function isStructuredInput(input: Record<string, number> | OversightQualityInput): input is OversightQualityInput {
  const candidate = input as OversightQualityInput;
  return (
    Array.isArray(candidate.approvals) ||
    Array.isArray(candidate.escalations) ||
    typeof candidate.highRiskActions === "number" ||
    typeof candidate.highRiskReviewed === "number" ||
    typeof candidate.overrideCount === "number" ||
    typeof candidate.reviewedDecisions === "number" ||
    typeof candidate.reviewerApprovals === "object" ||
    (typeof candidate.scores === "object" && candidate.scores !== null && !Array.isArray(candidate.scores))
  );
}

function normalizeInput(input: Record<string, number> | OversightQualityInput): NormalizedInput {
  if (isStructuredInput(input)) {
    return {
      agentId: String(input.agentId ?? input.scores?.agentId ?? "unknown"),
      scores: input.scores ?? {},
      approvals: input.approvals ?? [],
      escalations: input.escalations ?? [],
      highRiskActions: input.highRiskActions,
      highRiskReviewed: input.highRiskReviewed,
      reviewerApprovals: input.reviewerApprovals ?? {},
      overrideCount: input.overrideCount,
      reviewedDecisions: input.reviewedDecisions,
      hasIndependentVerificationChannel: input.hasIndependentVerificationChannel,
      hasMultiModalOversight: input.hasMultiModalOversight
    };
  }
  return {
    agentId: String(input.agentId ?? "unknown"),
    scores: input,
    approvals: [],
    escalations: [],
    reviewerApprovals: {},
    hasIndependentVerificationChannel: undefined,
    hasMultiModalOversight: undefined
  };
}

function scoreOverrideDiscipline(overrideRate: number, sampleSize: number, proxy: number): number {
  if (sampleSize <= 0) {
    return clamp01(proxy);
  }
  if (sampleSize < 4) {
    return clamp01((proxy + 0.6) / 2);
  }
  if (overrideRate < 0.05) {
    return 0.2;
  }
  if (overrideRate > 0.7) {
    return 0.3;
  }
  const distance = Math.abs(overrideRate - 0.2);
  return clamp01(1 - distance / 0.5);
}

function pushUnique(target: string[], value: string): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

/* ── Assessment ──────────────────────────────────────────────────── */

export function assessOversightQuality(scores: Record<string, number>): OversightQualityProfile;
export function assessOversightQuality(input: OversightQualityInput): OversightQualityProfile;
export function assessOversightQuality(input: Record<string, number> | OversightQualityInput): OversightQualityProfile {
  const normalized = normalizeInput(input);
  const scoreMap = normalized.scores;

  const hoq1 = scoreFrom(scoreMap, ["AMC-HOQ-1", "oversight-quality"], 0);
  const hoq2 = scoreFrom(scoreMap, ["AMC-HOQ-2", "oversight-coverage", "graduated-autonomy"], 0);
  const hoq3 = scoreFrom(scoreMap, ["AMC-HOQ-3", "reviewer-competence", "override-discipline"], hoq2);
  const hoq4 = scoreFrom(scoreMap, ["AMC-HOQ-4", "escalation-verification", "escalation-quality"], hoq2);

  const oversightExistence = hoq1 > 0;
  const contextCompleteness = clamp01(hoq1 / 5);
  const graduatedAutonomy = (scoreMap["graduated-autonomy"] ?? hoq2) >= 3;

  const highRiskApprovals = normalized.approvals.filter((event) => event.riskTier === "high" || event.riskTier === "critical");
  const highRiskActions = normalized.highRiskActions ?? highRiskApprovals.length;
  const highRiskReviewed = normalized.highRiskReviewed ?? highRiskApprovals.filter((event) => event.reviewedByHuman).length;
  const oversightCoverageRate = highRiskActions > 0 ? clamp01(highRiskReviewed / highRiskActions) : clamp01(hoq2 / 5);

  const highRiskHumanApprovals = highRiskApprovals.filter(
    (event) => event.reviewedByHuman && event.decision === "APPROVED"
  );
  const rapidApprovals = highRiskHumanApprovals.filter((event) => {
    const latency = approvalLatencyMs(event);
    return latency !== null && latency < FAST_APPROVAL_MS;
  }).length;
  const approvalTheaterRate =
    highRiskHumanApprovals.length > 0 ? clamp01(rapidApprovals / highRiskHumanApprovals.length) : 0;
  const approvalTheaterDetected = highRiskHumanApprovals.length >= 3 && approvalTheaterRate >= 0.8;
  const approvalTheaterPenalty = approvalTheaterDetected
    ? clamp01(0.5 + approvalTheaterRate / 2)
    : clamp01(approvalTheaterRate * 0.5);

  const reviewerApprovals = { ...normalized.reviewerApprovals };
  if (Object.keys(reviewerApprovals).length === 0) {
    for (const event of highRiskHumanApprovals) {
      const reviewerId = event.reviewerId ?? "unknown-reviewer";
      reviewerApprovals[reviewerId] = (reviewerApprovals[reviewerId] ?? 0) + 1;
    }
  }

  const reviewerEntries = Object.entries(reviewerApprovals).filter(([, count]) => count > 0);
  const totalReviewerApprovals = reviewerEntries.reduce((sum, [, count]) => sum + count, 0);
  const dominantReviewerEntry = reviewerEntries.reduce<[string, number] | null>(
    (best, current) => {
      if (!best) return current;
      return current[1] > best[1] ? current : best;
    },
    null
  );
  const dominantReviewerId = dominantReviewerEntry?.[0] ?? null;
  const dominantReviewerShare =
    totalReviewerApprovals > 0 ? (dominantReviewerEntry?.[1] ?? 0) / totalReviewerApprovals : 0;
  const reviewerConcentrationRisk =
    totalReviewerApprovals >= 5 ? clamp01(dominantReviewerShare) : clamp01(dominantReviewerShare * 0.5);
  const reviewerCompetenceScore =
    totalReviewerApprovals > 0
      ? clamp01(1 - Math.max(0, dominantReviewerShare - 0.45) / 0.55)
      : clamp01(hoq3 / 5);

  let overrideComparables = 0;
  let overrideCount = 0;
  for (const event of normalized.approvals) {
    if (!event.reviewedByHuman || !event.agentRecommendation) {
      continue;
    }
    if (event.decision !== "APPROVED" && event.decision !== "DENIED") {
      continue;
    }
    overrideComparables += 1;
    const humanDecision: OversightRecommendation = event.decision === "APPROVED" ? "APPROVE" : "DENY";
    if (humanDecision !== event.agentRecommendation) {
      overrideCount += 1;
    }
  }
  if (typeof normalized.overrideCount === "number" && normalized.overrideCount >= 0) {
    overrideCount = normalized.overrideCount;
  }
  if (typeof normalized.reviewedDecisions === "number" && normalized.reviewedDecisions >= 0) {
    overrideComparables = normalized.reviewedDecisions;
  }
  const overrideRate = overrideComparables > 0 ? clamp01(overrideCount / overrideComparables) : 0;
  const overrideDisciplineScore = scoreOverrideDiscipline(overrideRate, overrideComparables, hoq3 / 5);

  const escalationEvents = normalized.escalations;
  const escalationVerifiedCount = escalationEvents.filter((event) => {
    const ackOk =
      typeof event.acknowledgedTs === "number" &&
      event.acknowledgedTs >= event.triggeredTs &&
      event.acknowledgedTs - event.triggeredTs <= ESCALATION_ACK_SLA_MS;
    const levelOk = (event.reachedLevel ?? 0) >= event.expectedLevel;
    const resolvedOk = typeof event.resolvedTs === "number" && event.resolvedTs >= (event.acknowledgedTs ?? event.triggeredTs);
    return ackOk && levelOk && resolvedOk;
  }).length;
  const escalationVerificationRate =
    escalationEvents.length > 0 ? clamp01(escalationVerifiedCount / escalationEvents.length) : clamp01(hoq4 / 5);
  const escalationPathVerified =
    escalationEvents.length > 0 ? escalationVerificationRate >= 0.8 : hoq4 >= 4;

  const theaterResilienceScore =
    highRiskHumanApprovals.length > 0 ? clamp01(1 - approvalTheaterPenalty) : clamp01(hoq1 / 5);
  const approvalQuality = clamp01(
    contextCompleteness * 0.4 + theaterResilienceScore * 0.35 + reviewerCompetenceScore * 0.25
  );
  const escalationQuality = clamp01((hoq4 / 5) * 0.45 + escalationVerificationRate * 0.55);
  const socialEngineeringResistance = clamp01((hoq1 / 5) * 0.7 + theaterResilienceScore * 0.3);

  const questionnaireScore = clamp01((hoq1 + hoq2 + hoq3 + hoq4) / 20);
  const operationalScore = clamp01(
    oversightCoverageRate * 0.3 +
      theaterResilienceScore * 0.25 +
      reviewerCompetenceScore * 0.2 +
      overrideDisciplineScore * 0.1 +
      escalationVerificationRate * 0.15
  );
  let overallScore = Math.round(clamp01(questionnaireScore * 0.35 + operationalScore * 0.65) * 100);

  // Agent-as-a-Proxy enhancement: multi-modal oversight bonus
  const hasIndependentVerificationChannel = normalized.hasIndependentVerificationChannel === true;
  const hasMultiModalOversight = normalized.hasMultiModalOversight === true;
  if (hasIndependentVerificationChannel && hasMultiModalOversight) {
    overallScore = Math.min(100, overallScore + 5);
  }

  const evidenceSignals = [
    Object.keys(scoreMap).length > 0 ? 1 : 0,
    highRiskActions > 0 ? 1 : 0,
    highRiskHumanApprovals.length > 0 ? 1 : 0,
    overrideComparables > 0 ? 1 : 0,
    escalationEvents.length > 0 ? 1 : 0
  ].reduce((sum, value) => sum + value, 0);
  const { center: confidence } = wilsonScore(
    Math.round((overallScore / 100) * Math.max(evidenceSignals, 1)),
    Math.max(evidenceSignals, 1)
  );

  const gaps: string[] = [];
  const recommendations: string[] = [];

  if (!oversightExistence) {
    pushUnique(gaps, "No human oversight exists");
    pushUnique(recommendations, "Implement mandatory human review for high-risk actions.");
  }
  if (contextCompleteness < 0.6) {
    pushUnique(gaps, "Insufficient context provided to human reviewers");
    pushUnique(recommendations, "Add structured risk context, blast radius, and rollback plan in every approval request.");
  }
  if (approvalTheaterDetected) {
    pushUnique(gaps, "Approval theater detected: high-risk approvals are consistently granted in under 2 seconds.");
    pushUnique(
      recommendations,
      "Enforce minimum review dwell time and require reviewer rationale before high-risk approvals can be submitted."
    );
  }
  if (oversightCoverageRate < 0.85) {
    pushUnique(
      gaps,
      `Oversight coverage is low for high-risk actions (${Math.round(oversightCoverageRate * 100)}%).`
    );
    pushUnique(
      recommendations,
      "Require human review on 100% of high/critical actions and block execution when review is missing."
    );
  }
  if (reviewerConcentrationRisk > 0.75) {
    pushUnique(
      gaps,
      "Reviewer concentration risk is high: one reviewer is approving most high-risk actions."
    );
    pushUnique(
      recommendations,
      "Rotate reviewers and enforce dual-control approval quorum for sensitive operations."
    );
  }
  if (overrideComparables >= 5 && overrideRate < 0.05) {
    pushUnique(
      gaps,
      "Override rate is near zero despite review volume, indicating potential rubber-stamping."
    );
    pushUnique(
      recommendations,
      "Audit low-override periods and require explicit reviewer challenge checks on agent recommendations."
    );
  }
  if (overrideComparables >= 5 && overrideRate > 0.7) {
    pushUnique(
      gaps,
      "Override rate is excessively high, indicating poor agent decision quality before human review."
    );
    pushUnique(
      recommendations,
      "Tighten autonomous decision policy and retrain with overridden examples."
    );
  }
  if (!escalationPathVerified) {
    pushUnique(gaps, "Escalation path verification failed or is not evidenced.");
    pushUnique(
      recommendations,
      "Run escalation drills and require acknowledged + resolved escalation receipts within SLA."
    );
  }
  if (!graduatedAutonomy) {
    pushUnique(gaps, "No confidence-gated autonomy");
    pushUnique(
      recommendations,
      "Implement confidence thresholds and risk routing so uncertain high-risk actions always escalate."
    );
  }
  if (socialEngineeringResistance < 0.5) {
    pushUnique(gaps, "Low social engineering resistance");
    pushUnique(
      recommendations,
      "Add anti-social-engineering prompts, secondary approval, and reviewer identity verification for privileged requests."
    );
  }
  if (approvalQuality < 0.5) {
    pushUnique(gaps, "Approval quality is low — rubber-stamping risk");
    pushUnique(recommendations, "Require reviewers to provide rationale and checklist evidence with each approval.");
  }
  if (!hasIndependentVerificationChannel && !hasMultiModalOversight) {
    pushUnique(gaps, "Oversight relies on single-channel inspection — vulnerable to proxy attacks.");
    pushUnique(recommendations, "Add independent verification channels (output audit, behavioral baseline) beyond CoT inspection.");
  }

  return {
    agentId: normalized.agentId,
    oversightExistence,
    contextCompleteness,
    approvalQuality,
    escalationQuality,
    graduatedAutonomy,
    socialEngineeringResistance,
    approvalTheaterDetected,
    approvalTheaterRate,
    oversightCoverageRate,
    reviewerConcentrationRisk,
    dominantReviewerId,
    overrideRate,
    overrideRateSampleSize: overrideComparables,
    escalationPathVerified,
    escalationVerificationRate,
    overallScore,
    confidence,
    hasIndependentVerificationChannel,
    hasMultiModalOversight,
    gaps,
    recommendations
  };
}

/* ── Scenario simulation ─────────────────────────────────────────── */

export function simulateScenarios(): OversightScenario[] {
  return [
    { name: "No oversight", hoq1: 0, hoq2: 0, hoq3: 0, hoq4: 0, expectedScore: 0 },
    { name: "Basic approval only", hoq1: 2, hoq2: 1, hoq3: 1, hoq4: 1, expectedScore: 0 },
    { name: "Coverage + reviewer checks", hoq1: 3, hoq2: 3, hoq3: 2, hoq4: 2, expectedScore: 0 },
    { name: "High-quality oversight with verified escalation", hoq1: 4, hoq2: 4, hoq3: 4, hoq4: 4, expectedScore: 0 },
    { name: "Complete oversight with anti-theater controls", hoq1: 5, hoq2: 5, hoq3: 5, hoq4: 5, expectedScore: 100 }
  ].map((scenario) => ({
    ...scenario,
    expectedScore: Math.round(((scenario.hoq1 + scenario.hoq2 + scenario.hoq3 + scenario.hoq4) / 20) * 100)
  }));
}

/* ── Compare two profiles ────────────────────────────────────────── */

export function compareProfiles(a: OversightQualityProfile, b: OversightQualityProfile): {
  scoreDelta: number;
  newGaps: string[];
  resolvedGaps: string[];
} {
  return {
    scoreDelta: b.overallScore - a.overallScore,
    newGaps: b.gaps.filter((gap) => !a.gaps.includes(gap)),
    resolvedGaps: a.gaps.filter((gap) => !b.gaps.includes(gap))
  };
}
