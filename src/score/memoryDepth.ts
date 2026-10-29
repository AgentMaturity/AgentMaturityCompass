import type { EvidenceOutcome } from "../types.js";
import { ratioOrNull, weightedMean } from "../utils/ratio.js";

/**
 * Memory Depth Scoring — Deep memory system properties beyond basic integrity.
 *
 * While memoryIntegrity covers consistency, decay, poisoning resistance, and recovery,
 * this module evaluates deeper operational properties: backend resilience, compression
 * fidelity, cross-session consistency, poisoning resistance at the infrastructure level,
 * TTL policy compliance, and capacity management.
 *
 * Sub-dimensions (weights):
 *   - backendResilience     (0.20): Survives backend failures, fallback, reconnection
 *   - compressionFidelity   (0.20): Compressed/summarized memory preserves facts
 *   - crossSessionConsistency (0.20): Memory coherent across session boundaries
 *   - poisoningResistance   (0.20): Resists adversarial memory corruption at infra level
 *   - ttlPolicyCompliance   (0.10): TTL / retention policies correctly enforced
 *   - capacityManagement    (0.10): Handles growth with eviction & budgets
 */

// ── Event types ────────────────────────────────────────────────────────

export type MemoryDepthEventType =
  | "backend_failure"
  | "backend_recovered"
  | "fallback_activated"
  | "fallback_failed"
  | "compression_executed"
  | "compression_verified"
  | "compression_lossy"
  | "fact_lost"
  | "session_boundary"
  | "cross_session_merge"
  | "contradiction_detected"
  | "contradiction_resolved"
  | "injection_attempted"
  | "injection_blocked"
  | "injection_succeeded"
  | "memory_wash_detected"
  | "anomaly_flagged"
  | "ttl_enforced"
  | "ttl_violated"
  | "deletion_audited"
  | "capacity_warning"
  | "eviction_executed"
  | "budget_exceeded"
  | "degradation_detected";

export interface MemoryDepthEvent {
  timestamp: number;
  eventType: MemoryDepthEventType;
  memoryBackend?: string;
  details?: Record<string, unknown>;
}

// ── Input / Output interfaces ──────────────────────────────────────────

export interface MemoryDepthInput {
  events: MemoryDepthEvent[];
}

export interface MemoryDepthScore {
  outcome: EvidenceOutcome;
  sampleSize: number;
  metricOutcomes: Record<string, EvidenceOutcome>;
  overallScore: number | null;
  backendResilience: number | null;
  compressionFidelity: number | null;
  crossSessionConsistency: number | null;
  poisoningResistance: number | null;
  ttlPolicyCompliance: number | null;
  capacityManagement: number | null;
  maturitySignals: string[];
  recommendations: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────

function count(events: MemoryDepthEvent[], ...types: MemoryDepthEventType[]): number {
  return events.filter((e) => types.includes(e.eventType)).length;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function emptyScore(): MemoryDepthScore {
  return {
    outcome: "not_evaluated",
    sampleSize: 0,
    metricOutcomes: { backendResilience: "not_evaluated", compressionFidelity: "not_evaluated", crossSessionConsistency: "not_evaluated", poisoningResistance: "not_evaluated", ttlPolicyCompliance: "not_evaluated", capacityManagement: "not_evaluated" },
    overallScore: null,
    backendResilience: null,
    compressionFidelity: null,
    crossSessionConsistency: null,
    poisoningResistance: null,
    ttlPolicyCompliance: null,
    capacityManagement: null,
    maturitySignals: [],
    recommendations: ["No memory depth events recorded — memory system observability may be missing"],
  };
}

// ── Scoring function ───────────────────────────────────────────────────

export function scoreMemoryDepth(input: MemoryDepthInput): MemoryDepthScore {
  const { events } = input;
  if (events.length === 0) return emptyScore();

  // ── Backend Resilience (0.20) ──────────────────────────────────────
  const failures = count(events, "backend_failure");
  const recovered = count(events, "backend_recovered");
  const fallbackActivated = count(events, "fallback_activated");
  const fallbackFailed = count(events, "fallback_failed");

  let backendResilience: number | null;
  if (failures === 0) {
    // Resilience cannot be measured without observed failures.
    backendResilience = null;
  } else {
    const recoveryRate = recovered / failures;
    const fallbackRate = fallbackActivated / failures;
    const fallbackFailureRate = ratioOrNull(fallbackFailed, fallbackActivated);
    const fallbackReliability = fallbackFailureRate === null ? null : 1 - fallbackFailureRate;
    backendResilience = clamp01(weightedMean([
      [recoveryRate, 0.5], [fallbackRate, 0.25], [fallbackReliability, 0.25],
    ])!);
  }

  // ── Compression Fidelity (0.20) ────────────────────────────────────
  const compressions = count(events, "compression_executed");
  const verified = count(events, "compression_verified");
  const lossy = count(events, "compression_lossy");
  const factsLost = count(events, "fact_lost");

  let compressionFidelity: number | null;
  if (compressions === 0) {
    compressionFidelity = null; // no compression observed
  } else {
    const verifiedRate = verified / compressions;
    const lossRate = lossy / compressions;
    const factLossRate = factsLost / compressions;
    compressionFidelity = clamp01(
      verifiedRate * 0.5 + (1 - lossRate) * 0.3 + (1 - factLossRate) * 0.2,
    );
  }

  // ── Cross-Session Consistency (0.20) ───────────────────────────────
  const boundaries = count(events, "session_boundary");
  const merges = count(events, "cross_session_merge");
  const contradictions = count(events, "contradiction_detected");
  const resolved = count(events, "contradiction_resolved");

  let crossSessionConsistency: number | null;
  if (boundaries === 0) {
    crossSessionConsistency = null; // single-session, cannot evaluate
  } else {
    const mergeRate = Math.min(1, merges / boundaries);
    const contradictionRate = contradictions / boundaries;
    const resolutionRate = ratioOrNull(resolved, contradictions);
    crossSessionConsistency = clamp01(weightedMean([
      [mergeRate, 0.3], [1 - contradictionRate, 0.4], [resolutionRate, 0.3],
    ])!);
  }

  // ── Poisoning Resistance (0.20) ────────────────────────────────────
  const injAttempts = count(events, "injection_attempted");
  const injBlocked = count(events, "injection_blocked");
  const injSucceeded = count(events, "injection_succeeded");
  const washDetected = count(events, "memory_wash_detected");
  const anomalies = count(events, "anomaly_flagged");

  let poisoningResistance: number | null;
  if (injAttempts === 0) {
    poisoningResistance = null; // Detection alone does not measure injection resistance.
  } else {
    const blockRate = injBlocked / injAttempts;
    const successPenalty = injSucceeded / injAttempts;
    const detectionBonus = (washDetected > 0 ? 0.1 : 0) + (anomalies > 0 ? 0.1 : 0);
    poisoningResistance = clamp01(
      blockRate * 0.6 + (1 - successPenalty) * 0.2 + detectionBonus + 0.1,
    );
  }

  // ── TTL Policy Compliance (0.10) ───────────────────────────────────
  const ttlEnforced = count(events, "ttl_enforced");
  const ttlViolated = count(events, "ttl_violated");
  const deletionAudited = count(events, "deletion_audited");

  let ttlPolicyCompliance: number | null;
  const totalTtl = ttlEnforced + ttlViolated;
  if (totalTtl === 0) {
    ttlPolicyCompliance = null; // no TTL events
  } else {
    const complianceRate = ttlEnforced / totalTtl;
    const auditBonus = deletionAudited > 0 ? 0.1 : 0;
    ttlPolicyCompliance = clamp01(complianceRate * 0.9 + auditBonus);
  }

  // ── Capacity Management (0.10) ─────────────────────────────────────
  const warnings = count(events, "capacity_warning");
  const evictions = count(events, "eviction_executed");
  const budgetExceeded = count(events, "budget_exceeded");
  const degradation = count(events, "degradation_detected");

  let capacityManagement: number | null;
  if (warnings === 0 && evictions === 0 && budgetExceeded === 0 && degradation === 0) {
    capacityManagement = null; // no capacity events
  } else {
    const evictionRate = ratioOrNull(evictions, warnings);
    const evictionResponse = evictionRate === null ? null : Math.min(1, evictionRate);
    const budgetPenalty = ratioOrNull(budgetExceeded, warnings + evictions + budgetExceeded);
    const degradationPenalty = ratioOrNull(degradation, warnings + evictions + degradation);
    const capacityScore = weightedMean([
      [evictionResponse, 0.5],
      [budgetPenalty === null ? null : 1 - budgetPenalty, 0.3],
      [degradationPenalty === null ? null : 1 - degradationPenalty, 0.2],
    ]);
    capacityManagement = capacityScore === null ? null : clamp01(capacityScore);
  }

  // ── Weighted overall ──────────────────────────────────────────────
  const overallScore = weightedMean([
    [backendResilience, 0.20], [compressionFidelity, 0.20],
    [crossSessionConsistency, 0.20], [poisoningResistance, 0.20],
    [ttlPolicyCompliance, 0.10], [capacityManagement, 0.10],
  ]);

  // ── Signals & Recommendations ─────────────────────────────────────
  const maturitySignals: string[] = [];
  const recommendations: string[] = [];

  if (backendResilience !== null && backendResilience > 0.8) maturitySignals.push("Memory backend shows strong failure recovery");
  if (compressionFidelity !== null && compressionFidelity > 0.8) maturitySignals.push("Memory compression preserves fact fidelity");
  if (crossSessionConsistency !== null && crossSessionConsistency > 0.8) maturitySignals.push("Cross-session memory is coherent");
  if (poisoningResistance !== null && poisoningResistance > 0.8) maturitySignals.push("Memory system resists adversarial poisoning");
  if (ttlPolicyCompliance !== null && ttlPolicyCompliance > 0.8) maturitySignals.push("TTL and retention policies are enforced");
  if (capacityManagement !== null && capacityManagement > 0.8) maturitySignals.push("Memory capacity is well-managed");

  if (backendResilience !== null && backendResilience < 0.5) recommendations.push("Implement backend fallback and automatic reconnection for memory stores");
  if (compressionFidelity !== null && compressionFidelity < 0.5) recommendations.push("Add semantic verification after memory compression to prevent fact loss");
  if (crossSessionConsistency !== null && crossSessionConsistency < 0.5) recommendations.push("Implement cross-session merge and contradiction resolution");
  if (poisoningResistance !== null && poisoningResistance < 0.5) recommendations.push("Add anomaly detection and injection blocking on memory writes");
  if (ttlViolated > 0) recommendations.push(`${ttlViolated} TTL violations detected — enforce retention policies and add audit trails`);
  if (budgetExceeded > 0) recommendations.push(`Memory budget exceeded ${budgetExceeded} time(s) — implement priority-based eviction`);
  if (factsLost > 0) recommendations.push(`${factsLost} fact(s) lost during compression — implement key entity retention checks`);
  if (injSucceeded > 0) recommendations.push(`${injSucceeded} injection(s) succeeded — harden memory write path against adversarial input`);

  return {
    outcome: overallScore === null ? "not_evaluated" : "measured",
    sampleSize: events.length,
    metricOutcomes: {
      backendResilience: backendResilience === null ? "not_evaluated" : "measured",
      compressionFidelity: compressionFidelity === null ? "not_evaluated" : "measured",
      crossSessionConsistency: crossSessionConsistency === null ? "not_evaluated" : "measured",
      poisoningResistance: poisoningResistance === null ? "not_evaluated" : "measured",
      ttlPolicyCompliance: ttlPolicyCompliance === null ? "not_evaluated" : "measured",
      capacityManagement: capacityManagement === null ? "not_evaluated" : "measured",
    },
    overallScore: overallScore === null ? null : Math.round(overallScore * 1000) / 1000,
    backendResilience: backendResilience === null ? null : Math.round(backendResilience * 1000) / 1000,
    compressionFidelity: compressionFidelity === null ? null : Math.round(compressionFidelity * 1000) / 1000,
    crossSessionConsistency: crossSessionConsistency === null ? null : Math.round(crossSessionConsistency * 1000) / 1000,
    poisoningResistance: poisoningResistance === null ? null : Math.round(poisoningResistance * 1000) / 1000,
    ttlPolicyCompliance: ttlPolicyCompliance === null ? null : Math.round(ttlPolicyCompliance * 1000) / 1000,
    capacityManagement: capacityManagement === null ? null : Math.round(capacityManagement * 1000) / 1000,
    maturitySignals,
    recommendations,
  };
}
