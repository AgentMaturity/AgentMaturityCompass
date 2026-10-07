/**
 * Per-Claim Confidence with Citation-Backed Scoring
 *
 * Extends AMC's run-level and question-level confidence calibration to
 * per-claim granular confidence. Each claim gets:
 *  - A confidence score (0.0-1.0) backed by citation quality
 *  - A citation quality score measuring evidence strength
 *  - Domain-specific confidence bins (facts, policy, risk, execution)
 *  - Governor integration: block actions below confidence threshold
 *
 * Key concepts from prior art:
 *  - "Confidence without citation" → hard penalty for high-risk claims
 *  - "Self-knowledge loss" → confidence should vary by component/domain
 *  - "Unsupported confidence penalty" → when confidence and evidence diverge
 */

import Database from "better-sqlite3";
import { z } from "zod";
import type { Claim, ClaimProvenanceTag } from "./claimTypes.js";
import { getClaimsByAgent, getClaimById } from "./claimStore.js";
import type { EvidenceEvent, TrustTier } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfidenceDomain = "FACTS" | "POLICY" | "RISK" | "EXECUTION" | "GENERAL";

export interface CitationQualityScore {
  /** Number of distinct evidence events backing this claim */
  evidenceCount: number;
  /** Number of distinct sessions providing evidence */
  sessionCount: number;
  /** Highest trust tier among evidence */
  highestTrustTier: TrustTier;
  /** Ratio of OBSERVED evidence vs total */
  observedRatio: number;
  /** Whether any evidence is ATTESTED (externally verified) */
  hasAttestedEvidence: boolean;
  /** Citation quality score (0.0-1.0) */
  qualityScore: number;
}

export interface ClaimConfidenceAssessment {
  claimId: string;
  agentId: string;
  questionId: string;
  domain: ConfidenceDomain;
  /** Raw confidence from claim */
  rawConfidence: number;
  /** Citation quality score */
  citationQuality: CitationQualityScore;
  /** Adjusted confidence after penalties */
  adjustedConfidence: number;
  /** Penalties applied */
  penalties: ConfidencePenalty[];
  /** Whether this claim passes the confidence threshold */
  passesThreshold: boolean;
  /** Threshold used */
  threshold: number;
}

export interface ConfidencePenalty {
  type: "NO_CITATION" | "LOW_CITATION_QUALITY" | "UNSUPPORTED_CONFIDENCE" | "HYPOTHESIS_PENALTY" | "SESSION_LOCAL_PENALTY";
  amount: number;
  reason: string;
}

export interface ConfidenceThresholdPolicy {
  /** Minimum confidence for any claim to be actionable */
  globalMinConfidence: number;
  /** Domain-specific minimums */
  domainMinConfidence: Record<ConfidenceDomain, number>;
  /** Penalty for claims with zero citations */
  noCitationPenalty: number;
  /** Penalty for low citation quality (quality < 0.3) */
  lowCitationPenalty: number;
  /** Penalty when raw confidence > citation quality by more than 0.3 */
  unsupportedConfidencePenalty: number;
  /** Penalty for HYPOTHESIS provenance claims */
  hypothesisPenalty: number;
  /** Penalty for SESSION_LOCAL claims */
  sessionLocalPenalty: number;
  /** Block actions if any governing claim is below threshold */
  blockBelowThreshold: boolean;
}

export interface ConfidenceHistogram {
  domain: ConfidenceDomain;
  bins: ConfidenceHistogramBin[];
  totalClaims: number;
  avgConfidence: number;
  medianConfidence: number;
  belowThresholdCount: number;
}

export interface ConfidenceHistogramBin {
  lowerBound: number;
  upperBound: number;
  count: number;
  claimIds: string[];
}

export interface ClaimConfidenceReport {
  reportId: string;
  agentId: string;
  ts: number;
  totalClaims: number;
  assessments: ClaimConfidenceAssessment[];
  histograms: ConfidenceHistogram[];
  overallAvgConfidence: number;
  overallAvgCitationQuality: number;
  belowThresholdCount: number;
  penaltyBreakdown: Record<string, number>;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Default policy
// ---------------------------------------------------------------------------

export function defaultConfidenceThresholdPolicy(): ConfidenceThresholdPolicy {
  return {
    globalMinConfidence: 0.3,
    domainMinConfidence: {
      FACTS: 0.4,
      POLICY: 0.5,
      RISK: 0.6,
      EXECUTION: 0.5,
      GENERAL: 0.3,
    },
    noCitationPenalty: 0.4,
    lowCitationPenalty: 0.15,
    unsupportedConfidencePenalty: 0.25,
    hypothesisPenalty: 0.2,
    sessionLocalPenalty: 0.15,
    blockBelowThreshold: true,
  };
}

// ---------------------------------------------------------------------------
// Confidence domain classification
// ---------------------------------------------------------------------------

/**
 * Classify a claim into a confidence domain based on question ID pattern.
 */
export function classifyConfidenceDomain(questionId: string): ConfidenceDomain {
  // AMC question ID patterns:
  // Layer 1: Strategic Agent Operations → EXECUTION
  // Layer 2: Leadership & Autonomy → POLICY
  // Layer 3: Culture & Alignment → RISK
  // Layer 4: Resilience → FACTS
  // Layer 5: Skills → EXECUTION

  const prefix = questionId.split("-")[1]?.split(".")[0] ?? "";
  const layerNum = parseInt(prefix, 10);

  switch (layerNum) {
    case 1: return "EXECUTION";
    case 2: return "POLICY";
    case 3: return "RISK";
    case 4: return "FACTS";
    case 5: return "EXECUTION";
    default: return "GENERAL";
  }
}

// ---------------------------------------------------------------------------
// Citation quality scoring
// ---------------------------------------------------------------------------

const TRUST_TIER_WEIGHTS: Record<TrustTier, number> = {
  SELF_REPORTED: 0.2,
  ATTESTED: 0.6,
  OBSERVED: 0.8,
  OBSERVED_HARDENED: 1.0,
};

/**
 * Compute citation quality score for a claim based on its evidence references.
 */
export function computeCitationQuality(
  claim: Claim,
  evidenceEvents: EvidenceEvent[],
): CitationQualityScore {
  const claimEvidenceIds = new Set(claim.evidenceRefs);
  const relevantEvents = evidenceEvents.filter((e) => claimEvidenceIds.has(e.id));

  const evidenceCount = relevantEvents.length;
  const uniqueSessions = new Set(relevantEvents.map((e) => e.session_id));
  const sessionCount = uniqueSessions.size;

  if (evidenceCount === 0) {
    return {
      evidenceCount: 0,
      sessionCount: 0,
      highestTrustTier: "SELF_REPORTED",
      observedRatio: 0,
      hasAttestedEvidence: false,
      qualityScore: 0,
    };
  }

  // Determine highest trust tier
  const trustTierOrder: TrustTier[] = ["SELF_REPORTED", "ATTESTED", "OBSERVED", "OBSERVED_HARDENED"];
  let highestTrustTier: TrustTier = "SELF_REPORTED";

  // Use the claim's trust tier as the best info we have
  const tierIndex = trustTierOrder.indexOf(claim.trustTier);
  if (tierIndex >= 0) {
    highestTrustTier = claim.trustTier;
  }

  // Count runtime-based observations
  const observedEvents = relevantEvents.filter(
    (e) => e.event_type === "stdout" || e.event_type === "metric" || e.event_type === "test" ||
           e.event_type === "tool_result" || e.event_type === "output_validated",
  );
  const observedRatio = observedEvents.length / evidenceCount;

  const hasAttestedEvidence = relevantEvents.some(
    (e) => e.event_type === "audit" || e.event_type === "review",
  );

  // Compute quality score based on evidence richness
  const evidenceDepthScore = Math.min(1.0, evidenceCount / 5); // 5+ events = max
  const sessionDiversityScore = Math.min(1.0, sessionCount / 3); // 3+ sessions = max
  const trustWeight = TRUST_TIER_WEIGHTS[highestTrustTier] ?? 0.2;
  const attestationBonus = hasAttestedEvidence ? 0.1 : 0;

  const qualityScore = Math.min(
    1.0,
    evidenceDepthScore * 0.3 +
    sessionDiversityScore * 0.25 +
    observedRatio * 0.2 +
    trustWeight * 0.15 +
    attestationBonus +
    0.0, // rounding buffer
  );

  return {
    evidenceCount,
    sessionCount,
    highestTrustTier,
    observedRatio,
    hasAttestedEvidence,
    qualityScore: Number(qualityScore.toFixed(4)),
  };
}

// ---------------------------------------------------------------------------
// Confidence assessment
// ---------------------------------------------------------------------------

/**
 * Assess a single claim's confidence with citation-backed scoring.
 */
export function assessClaimConfidence(
  claim: Claim,
  evidenceEvents: EvidenceEvent[],
  policy?: Partial<ConfidenceThresholdPolicy>,
): ClaimConfidenceAssessment {
  const cfg = { ...defaultConfidenceThresholdPolicy(), ...policy };
  const domain = classifyConfidenceDomain(claim.questionId);
  const citationQuality = computeCitationQuality(claim, evidenceEvents);
  const rawConfidence = claim.confidence;

  // Compute penalties
  const penalties: ConfidencePenalty[] = [];

  // Penalty 1: No citation at all
  if (citationQuality.evidenceCount === 0) {
    penalties.push({
      type: "NO_CITATION",
      amount: cfg.noCitationPenalty,
      reason: "Claim has zero evidence citations",
    });
  }

  // Penalty 2: Low citation quality
  if (citationQuality.qualityScore > 0 && citationQuality.qualityScore < 0.3) {
    penalties.push({
      type: "LOW_CITATION_QUALITY",
      amount: cfg.lowCitationPenalty,
      reason: `Citation quality ${citationQuality.qualityScore.toFixed(2)} is below 0.3`,
    });
  }

  // Penalty 3: Unsupported confidence (confidence >> evidence quality)
  const confidenceGap = rawConfidence - citationQuality.qualityScore;
  if (confidenceGap > 0.3 && citationQuality.evidenceCount > 0) {
    penalties.push({
      type: "UNSUPPORTED_CONFIDENCE",
      amount: cfg.unsupportedConfidencePenalty,
      reason: `Confidence ${rawConfidence.toFixed(2)} exceeds citation quality ${citationQuality.qualityScore.toFixed(2)} by ${confidenceGap.toFixed(2)}`,
    });
  }

  // Penalty 4: HYPOTHESIS provenance
  if (claim.provenanceTag === "HYPOTHESIS") {
    penalties.push({
      type: "HYPOTHESIS_PENALTY",
      amount: cfg.hypothesisPenalty,
      reason: "Claim has HYPOTHESIS provenance tag",
    });
  }

  // Penalty 5: SESSION_LOCAL provenance
  if (claim.provenanceTag === "SESSION_LOCAL") {
    penalties.push({
      type: "SESSION_LOCAL_PENALTY",
      amount: cfg.sessionLocalPenalty,
      reason: "Claim has SESSION_LOCAL provenance tag",
    });
  }

  // Compute adjusted confidence
  const totalPenalty = penalties.reduce((sum, p) => sum + p.amount, 0);
  const adjustedConfidence = Math.max(0, Number((rawConfidence - totalPenalty).toFixed(4)));

  // Check threshold
  const domainThreshold = cfg.domainMinConfidence[domain] ?? cfg.globalMinConfidence;
  const threshold = Math.max(cfg.globalMinConfidence, domainThreshold);
  const passesThreshold = adjustedConfidence >= threshold;

  return {
    claimId: claim.claimId,
    agentId: claim.agentId,
    questionId: claim.questionId,
    domain,
    rawConfidence,
    citationQuality,
    adjustedConfidence,
    penalties,
    passesThreshold,
    threshold,
  };
}

// ---------------------------------------------------------------------------
// Batch assessment
// ---------------------------------------------------------------------------

/**
 * Assess confidence for all claims of an agent.
 */
export function assessAgentClaimConfidence(
  db: Database.Database,
  agentId: string,
  evidenceEvents: EvidenceEvent[],
  policy?: Partial<ConfidenceThresholdPolicy>,
): ClaimConfidenceAssessment[] {
  const claims = getClaimsByAgent(db, agentId);
  return claims.map((claim) => assessClaimConfidence(claim, evidenceEvents, policy));
}

// ---------------------------------------------------------------------------
// Governor confidence gate
// ---------------------------------------------------------------------------

/**
 * Check if all claims relevant to a set of question IDs pass confidence thresholds.
 * Used by the governor to block actions when governing claims are below threshold.
 */
export function checkConfidenceGate(
  db: Database.Database,
  agentId: string,
  questionIds: string[],
  evidenceEvents: EvidenceEvent[],
  policy?: Partial<ConfidenceThresholdPolicy>,
): {
  pass: boolean;
  failingClaims: ClaimConfidenceAssessment[];
  reasons: string[];
} {
  const cfg = { ...defaultConfidenceThresholdPolicy(), ...policy };
  const claims = getClaimsByAgent(db, agentId);
  const relevantClaims = claims.filter((c) => questionIds.includes(c.questionId));

  if (!cfg.blockBelowThreshold || relevantClaims.length === 0) {
    return { pass: true, failingClaims: [], reasons: [] };
  }

  const assessments = relevantClaims.map((c) =>
    assessClaimConfidence(c, evidenceEvents, policy),
  );

  const failing = assessments.filter((a) => !a.passesThreshold);

  if (failing.length === 0) {
    return { pass: true, failingClaims: [], reasons: [] };
  }

  const reasons = failing.map(
    (f) =>
      `Claim ${f.claimId} (${f.questionId}, domain ${f.domain}): adjusted confidence ${f.adjustedConfidence.toFixed(2)} < threshold ${f.threshold.toFixed(2)}`,
  );

  return { pass: false, failingClaims: failing, reasons };
}

// ---------------------------------------------------------------------------
// Confidence histograms
// ---------------------------------------------------------------------------

function buildHistogramBins(numBins: number): ConfidenceHistogramBin[] {
  const bins: ConfidenceHistogramBin[] = [];
  for (let i = 0; i < numBins; i++) {
    bins.push({
      lowerBound: Number((i / numBins).toFixed(2)),
      upperBound: Number(((i + 1) / numBins).toFixed(2)),
      count: 0,
      claimIds: [],
    });
  }
  return bins;
}

/**
 * Build confidence histograms grouped by domain.
 */
export function buildConfidenceHistograms(
  assessments: ClaimConfidenceAssessment[],
  numBins: number = 10,
  policy?: Partial<ConfidenceThresholdPolicy>,
): ConfidenceHistogram[] {
  const cfg = { ...defaultConfidenceThresholdPolicy(), ...policy };
  const domains: ConfidenceDomain[] = ["FACTS", "POLICY", "RISK", "EXECUTION", "GENERAL"];
  const histograms: ConfidenceHistogram[] = [];

  for (const domain of domains) {
    const domainAssessments = assessments.filter((a) => a.domain === domain);
    if (domainAssessments.length === 0) continue;

    const bins = buildHistogramBins(numBins);

    for (const assessment of domainAssessments) {
      const binIndex = Math.min(
        numBins - 1,
        Math.floor(assessment.adjustedConfidence * numBins),
      );
      const bin = bins[binIndex];
      if (bin) {
        bin.count++;
        bin.claimIds.push(assessment.claimId);
      }
    }

    const confidences = domainAssessments.map((a) => a.adjustedConfidence);
    const sorted = [...confidences].sort((a, b) => a - b);
    const avg = confidences.reduce((s, c) => s + c, 0) / confidences.length;
    const median = sorted.length % 2 === 0
      ? ((sorted[sorted.length / 2 - 1] ?? 0) + (sorted[sorted.length / 2] ?? 0)) / 2
      : sorted[Math.floor(sorted.length / 2)] ?? 0;

    const threshold = cfg.domainMinConfidence[domain] ?? cfg.globalMinConfidence;
    const belowThreshold = domainAssessments.filter(
      (a) => a.adjustedConfidence < threshold,
    ).length;

    histograms.push({
      domain,
      bins,
      totalClaims: domainAssessments.length,
      avgConfidence: Number(avg.toFixed(4)),
      medianConfidence: Number(median.toFixed(4)),
      belowThresholdCount: belowThreshold,
    });
  }

  return histograms;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

export function generateClaimConfidenceReport(
  db: Database.Database,
  agentId: string,
  evidenceEvents: EvidenceEvent[],
  policy?: Partial<ConfidenceThresholdPolicy>,
): ClaimConfidenceReport {
  const assessments = assessAgentClaimConfidence(db, agentId, evidenceEvents, policy);
  const histograms = buildConfidenceHistograms(assessments, 10, policy);

  const totalClaims = assessments.length;
  const overallAvgConfidence = totalClaims > 0
    ? assessments.reduce((s, a) => s + a.adjustedConfidence, 0) / totalClaims
    : 0;
  const overallAvgCitationQuality = totalClaims > 0
    ? assessments.reduce((s, a) => s + a.citationQuality.qualityScore, 0) / totalClaims
    : 0;
  const belowThresholdCount = assessments.filter((a) => !a.passesThreshold).length;

  // Penalty breakdown
  const penaltyBreakdown: Record<string, number> = {};
  for (const a of assessments) {
    for (const p of a.penalties) {
      penaltyBreakdown[p.type] = (penaltyBreakdown[p.type] ?? 0) + 1;
    }
  }

  // Recommendations
  const recommendations: string[] = [];
  if (belowThresholdCount > 0) {
    recommendations.push(
      `${belowThresholdCount} claim(s) are below confidence threshold. Add evidence citations to improve.`,
    );
  }
  const noCitationCount = penaltyBreakdown["NO_CITATION"] ?? 0;
  if (noCitationCount > 0) {
    recommendations.push(
      `${noCitationCount} claim(s) have zero citations. Link evidence events to claims.`,
    );
  }
  const unsupportedCount = penaltyBreakdown["UNSUPPORTED_CONFIDENCE"] ?? 0;
  if (unsupportedCount > 0) {
    recommendations.push(
      `${unsupportedCount} claim(s) have unsupported confidence (confidence >> evidence quality).`,
    );
  }

  return {
    reportId: `ccr_${Math.random().toString(36).slice(2, 14)}`, // amc-allow-random: id
    agentId,
    ts: Date.now(),
    totalClaims,
    assessments,
    histograms,
    overallAvgConfidence: Number(overallAvgConfidence.toFixed(4)),
    overallAvgCitationQuality: Number(overallAvgCitationQuality.toFixed(4)),
    belowThresholdCount,
    penaltyBreakdown,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

export function renderClaimConfidenceMarkdown(report: ClaimConfidenceReport): string {
  const lines: string[] = [
    "# Claim Confidence Report",
    "",
    `- Report ID: ${report.reportId}`,
    `- Agent: ${report.agentId}`,
    `- Timestamp: ${new Date(report.ts).toISOString()}`,
    "",
    "## Summary",
    `- Total claims: ${report.totalClaims}`,
    `- Avg adjusted confidence: ${report.overallAvgConfidence.toFixed(3)}`,
    `- Avg citation quality: ${report.overallAvgCitationQuality.toFixed(3)}`,
    `- Below threshold: ${report.belowThresholdCount}`,
    "",
  ];

  // Penalty breakdown
  if (Object.keys(report.penaltyBreakdown).length > 0) {
    lines.push("## Penalty Breakdown");
    lines.push("| Penalty Type | Count |");
    lines.push("|---|---:|");
    for (const [type, count] of Object.entries(report.penaltyBreakdown)) {
      lines.push(`| ${type} | ${count} |`);
    }
    lines.push("");
  }

  // Histograms
  if (report.histograms.length > 0) {
    lines.push("## Confidence Histograms by Domain");
    for (const h of report.histograms) {
      lines.push(`### ${h.domain} (${h.totalClaims} claims)`);
      lines.push(`- Avg: ${h.avgConfidence.toFixed(3)} | Median: ${h.medianConfidence.toFixed(3)} | Below threshold: ${h.belowThresholdCount}`);

      // Simple ASCII histogram
      const maxCount = Math.max(...h.bins.map((b) => b.count), 1);
      for (const bin of h.bins) {
        const barLength = Math.round((bin.count / maxCount) * 20);
        const bar = "█".repeat(barLength);
        lines.push(`  ${bin.lowerBound.toFixed(1)}-${bin.upperBound.toFixed(1)}: ${bar} (${bin.count})`);
      }
      lines.push("");
    }
  }

  // Top failing claims
  const failing = report.assessments
    .filter((a) => !a.passesThreshold)
    .sort((a, b) => a.adjustedConfidence - b.adjustedConfidence)
    .slice(0, 10);

  if (failing.length > 0) {
    lines.push("## Claims Below Threshold");
    lines.push("| Claim | Question | Domain | Raw | Adjusted | Threshold | Penalties |");
    lines.push("|---|---|---|---:|---:|---:|---|");
    for (const f of failing) {
      const penaltyTypes = f.penalties.map((p) => p.type).join(", ");
      lines.push(
        `| ${f.claimId.slice(0, 12)}... | ${f.questionId} | ${f.domain} | ${f.rawConfidence.toFixed(2)} | ${f.adjustedConfidence.toFixed(2)} | ${f.threshold.toFixed(2)} | ${penaltyTypes} |`,
      );
    }
    lines.push("");
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    lines.push("## Recommendations");
    for (const r of report.recommendations) {
      lines.push(`- ${r}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
