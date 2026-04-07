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
  overallScore: number;
  backendResilience: number;
  compressionFidelity: number;
  crossSessionConsistency: number;
  poisoningResistance: number;
  ttlPolicyCompliance: number;
  capacityManagement: number;
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
    overallScore: 0,
    backendResilience: 0,
    compressionFidelity: 0,
    crossSessionConsistency: 0,
    poisoningResistance: 0,
    ttlPolicyCompliance: 0,
    capacityManagement: 0,
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

  let backendResilience: number;
  if (failures === 0) {
    // No failures observed — neutral score (no evidence of resilience testing)
    backendResilience = 0.5;
  } else {
    const recoveryRate = recovered / failures;
    const fallbackRate = failures > 0 ? fallbackActivated / failures : 0;
    const fallbackReliability = fallbackActivated > 0
      ? 1 - (fallbackFailed / fallbackActivated)
      : 1;
    backendResilience = clamp01(
      recoveryRate * 0.5 + fallbackRate * 0.25 + fallbackReliability * 0.25,
    );
  }

  // ── Compression Fidelity (0.20) ────────────────────────────────────
  const compressions = count(events, "compression_executed");
  const verified = count(events, "compression_verified");
  const lossy = count(events, "compression_lossy");
  const factsLost = count(events, "fact_lost");

  let compressionFidelity: number;
  if (compressions === 0) {
    compressionFidelity = 0.5; // no compression observed
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

  let crossSessionConsistency: number;
  if (boundaries === 0) {
    crossSessionConsistency = 0.5; // single-session, can't evaluate
  } else {
    const mergeRate = boundaries > 0 ? Math.min(1, merges / boundaries) : 0;
    const contradictionRate = boundaries > 0 ? contradictions / boundaries : 0;
    const resolutionRate = contradictions > 0 ? resolved / contradictions : 1;
    crossSessionConsistency = clamp01(
      mergeRate * 0.3 + (1 - contradictionRate) * 0.4 + resolutionRate * 0.3,
    );
  }

  // ── Poisoning Resistance (0.20) ────────────────────────────────────
  const injAttempts = count(events, "injection_attempted");
  const injBlocked = count(events, "injection_blocked");
  const injSucceeded = count(events, "injection_succeeded");
  const washDetected = count(events, "memory_wash_detected");
  const anomalies = count(events, "anomaly_flagged");

  let poisoningResistance: number;
  if (injAttempts === 0 && washDetected === 0) {
    poisoningResistance = 0.5; // no adversarial testing observed
  } else {
    const blockRate = injAttempts > 0 ? injBlocked / injAttempts : 1;
    const successPenalty = injAttempts > 0 ? injSucceeded / injAttempts : 0;
    const detectionBonus = (washDetected > 0 ? 0.1 : 0) + (anomalies > 0 ? 0.1 : 0);
    poisoningResistance = clamp01(
      blockRate * 0.6 + (1 - successPenalty) * 0.2 + detectionBonus + 0.1,
    );
  }

  // ── TTL Policy Compliance (0.10) ───────────────────────────────────
  const ttlEnforced = count(events, "ttl_enforced");
  const ttlViolated = count(events, "ttl_violated");
  const deletionAudited = count(events, "deletion_audited");

  let ttlPolicyCompliance: number;
  const totalTtl = ttlEnforced + ttlViolated;
  if (totalTtl === 0) {
    ttlPolicyCompliance = 0.5; // no TTL events
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

  let capacityManagement: number;
  if (warnings === 0 && evictions === 0 && budgetExceeded === 0 && degradation === 0) {
    capacityManagement = 0.5; // no capacity events
  } else {
    const evictionResponse = warnings > 0 ? Math.min(1, evictions / warnings) : 1;
    const budgetPenalty = (warnings + evictions) > 0
      ? budgetExceeded / (warnings + evictions + budgetExceeded)
      : 0;
    const degradationPenalty = (warnings + evictions) > 0
      ? degradation / (warnings + evictions + degradation)
      : 0;
    capacityManagement = clamp01(
      evictionResponse * 0.5 + (1 - budgetPenalty) * 0.3 + (1 - degradationPenalty) * 0.2,
    );
  }

  // ── Weighted overall ──────────────────────────────────────────────
  const overallScore =
    backendResilience * 0.20 +
    compressionFidelity * 0.20 +
    crossSessionConsistency * 0.20 +
    poisoningResistance * 0.20 +
    ttlPolicyCompliance * 0.10 +
    capacityManagement * 0.10;

  // ── Signals & Recommendations ─────────────────────────────────────
  const maturitySignals: string[] = [];
  const recommendations: string[] = [];

  if (backendResilience > 0.8) maturitySignals.push("Memory backend shows strong failure recovery");
  if (compressionFidelity > 0.8) maturitySignals.push("Memory compression preserves fact fidelity");
  if (crossSessionConsistency > 0.8) maturitySignals.push("Cross-session memory is coherent");
  if (poisoningResistance > 0.8) maturitySignals.push("Memory system resists adversarial poisoning");
  if (ttlPolicyCompliance > 0.8) maturitySignals.push("TTL and retention policies are enforced");
  if (capacityManagement > 0.8) maturitySignals.push("Memory capacity is well-managed");

  if (backendResilience < 0.5) recommendations.push("Implement backend fallback and automatic reconnection for memory stores");
  if (compressionFidelity < 0.5) recommendations.push("Add semantic verification after memory compression to prevent fact loss");
  if (crossSessionConsistency < 0.5) recommendations.push("Implement cross-session merge and contradiction resolution");
  if (poisoningResistance < 0.5) recommendations.push("Add anomaly detection and injection blocking on memory writes");
  if (ttlViolated > 0) recommendations.push(`${ttlViolated} TTL violations detected — enforce retention policies and add audit trails`);
  if (budgetExceeded > 0) recommendations.push(`Memory budget exceeded ${budgetExceeded} time(s) — implement priority-based eviction`);
  if (factsLost > 0) recommendations.push(`${factsLost} fact(s) lost during compression — implement key entity retention checks`);
  if (injSucceeded > 0) recommendations.push(`${injSucceeded} injection(s) succeeded — harden memory write path against adversarial input`);

  return {
    overallScore: Math.round(overallScore * 1000) / 1000,
    backendResilience: Math.round(backendResilience * 1000) / 1000,
    compressionFidelity: Math.round(compressionFidelity * 1000) / 1000,
    crossSessionConsistency: Math.round(crossSessionConsistency * 1000) / 1000,
    poisoningResistance: Math.round(poisoningResistance * 1000) / 1000,
    ttlPolicyCompliance: Math.round(ttlPolicyCompliance * 1000) / 1000,
    capacityManagement: Math.round(capacityManagement * 1000) / 1000,
    maturitySignals,
    recommendations,
  };
}
