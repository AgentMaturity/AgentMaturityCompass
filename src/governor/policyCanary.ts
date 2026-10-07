/**
 * Policy Canary Mode & Rollback Packs
 *
 * Provides gradual policy rollout and instant rollback:
 * - Policy canary mode: enforce on X% of requests, log-only on rest
 * - Policy rollback packs with signed one-command recovery
 * - Emergency override mode with strict TTL + mandatory postmortem artifact
 * - Policy debt register (temporary waivers with expiry dates)
 * - Governance drift detection (runtime behavior vs policy intent)
 * - Governance SLOs (policy decision latency, approval latency, false block rate)
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest, getPrivateKeyPem } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { join } from "node:path";
import { addDebtEntry, loadAllDebt } from "./policyDebt.js";
// Rollback packs and emergency overrides live in canaryRegisters.ts; they are
// re-exported here so the public surface is unchanged.
import {
  createRollbackPack,
  getRollbackPacks,
  getLatestRollbackPack,
  activateEmergencyOverride,
  getActiveOverrides,
  filePostmortem,
  getOverridesMissingPostmortem,
  getInvalidOverrides,
  resetCanaryRegisters
} from "./canaryRegisters.js";

export {
  createRollbackPack,
  getRollbackPacks,
  getLatestRollbackPack,
  activateEmergencyOverride,
  getActiveOverrides,
  filePostmortem,
  getOverridesMissingPostmortem
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CanaryMode = "ENFORCE" | "LOG_ONLY" | "DISABLED";

export interface CanaryConfig {
  /** Percentage of requests to enforce (0-100) */
  enforcePercentage: number;
  /** Log-only for the remaining percentage */
  logOnlyPercentage: number;
  /** Whether canary is active */
  enabled: boolean;
  /** Which policy version is being canaried */
  candidatePolicySha256: string;
  /** The stable policy to fall back to */
  stablePolicySha256: string;
  /** Start time of canary */
  startedTs: number;
  /** Duration before auto-promote or auto-rollback (ms) */
  durationMs: number;
  /** Auto-promote if no failures detected during canary window */
  autoPromote: boolean;
  /** Failure threshold: rollback if failure ratio exceeds this */
  failureThresholdRatio: number;
}

export interface CanaryDecision {
  requestId: string;
  mode: CanaryMode;
  policyUsed: "candidate" | "stable";
  ts: number;
  passed: boolean;
  reason: string;
}

export interface CanaryStats {
  totalRequests: number;
  candidateRequests: number;
  stableRequests: number;
  candidateFailures: number;
  stableFailures: number;
  candidateFailureRatio: number;
  stableFailureRatio: number;
  isHealthy: boolean;
  elapsedMs: number;
  remainingMs: number;
  shouldPromote: boolean;
  shouldRollback: boolean;
}

export interface RollbackPack {
  packId: string;
  agentId: string;
  policyFileSha256: string;
  policyContent: string; // serialized policy YAML/JSON
  createdTs: number;
  reason: string;
  signature: string;
}

export interface EmergencyOverride {
  overrideId: string;
  agentId: string;
  reason: string;
  /** What the override does (e.g., "allow DEPLOY for agent-1") */
  actionDescription: string;
  /** Strict TTL in milliseconds */
  ttlMs: number;
  startedTs: number;
  expiresTs: number;
  /** Whether a postmortem has been filed */
  postmortemFiled: boolean;
  postmortemArtifactId: string | null;
  signature: string;
}

export interface PolicyDebtEntry {
  debtId: string;
  agentId: string;
  /** What policy requirement is being waived */
  waivedRequirement: string;
  /** Why the waiver was granted */
  justification: string;
  /** When the waiver expires */
  expiresTs: number;
  /** Whether the waiver is still active */
  active: boolean;
  createdTs: number;
  createdBy: string;
  signature: string;
}

export interface GovernanceSLO {
  /** Policy decision latency: P95 in milliseconds */
  policyDecisionLatencyP95Ms: number;
  /** Approval decision latency: P95 in milliseconds */
  approvalDecisionLatencyP95Ms: number;
  /** False block rate: percentage of legitimate requests blocked */
  falseBlockRatePercent: number;
  /** Policy evaluation error rate */
  policyErrorRatePercent: number;
}

export interface GovernanceSLOTarget {
  maxPolicyDecisionLatencyP95Ms: number;
  maxApprovalDecisionLatencyP95Ms: number;
  maxFalseBlockRatePercent: number;
  maxPolicyErrorRatePercent: number;
}

export interface GovernanceDriftResult {
  drifted: boolean;
  driftItems: Array<{
    category: string;
    description: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
  }>;
}

export interface PolicyCanaryReport {
  reportId: string;
  agentId: string;
  ts: number;
  canaryActive: boolean;
  canaryConfig: CanaryConfig | null;
  canaryStats: CanaryStats | null;
  rollbackPacks: number;
  activeOverrides: number;
  /** Overrides whose signature does not verify; never counted as active. */
  invalidOverrides: number;
  activeDebtEntries: number;
  expiredDebtEntries: number;
  sloStatus: GovernanceSLO | null;
  sloTarget: GovernanceSLOTarget | null;
  sloMet: boolean;
  driftResult: GovernanceDriftResult | null;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

export const canaryConfigSchema = z.object({
  enforcePercentage: z.number().min(0).max(100),
  logOnlyPercentage: z.number().min(0).max(100),
  enabled: z.boolean(),
  candidatePolicySha256: z.string().length(64),
  stablePolicySha256: z.string().length(64),
  startedTs: z.number().int(),
  durationMs: z.number().int().min(60000), // at least 1 minute
  autoPromote: z.boolean(),
  failureThresholdRatio: z.number().min(0).max(1),
});

// ---------------------------------------------------------------------------
// Canary decision engine
// ---------------------------------------------------------------------------

const canaryDecisions: CanaryDecision[] = [];
let activeCanaryConfig: CanaryConfig | null = null;

/**
 * Start a policy canary with a candidate policy.
 */
export function startCanary(config: CanaryConfig): CanaryConfig {
  const validated = canaryConfigSchema.parse(config);
  activeCanaryConfig = validated;
  canaryDecisions.length = 0; // reset decisions
  return validated;
}

/**
 * Stop the current canary.
 */
export function stopCanary(): void {
  activeCanaryConfig = null;
}

/**
 * Get current canary config.
 */
export function getCanaryConfig(): CanaryConfig | null {
  return activeCanaryConfig;
}

/**
 * Make a canary decision for a request.
 * Returns whether to use the candidate policy or the stable one.
 */
export function makeCanaryDecision(requestId?: string): CanaryDecision {
  const id = requestId ?? randomUUID().slice(0, 12);
  const now = Date.now();

  if (!activeCanaryConfig || !activeCanaryConfig.enabled) {
    return {
      requestId: id,
      mode: "DISABLED",
      policyUsed: "stable",
      ts: now,
      passed: true,
      reason: "Canary not active",
    };
  }

  // Check if canary window has expired
  const elapsed = now - activeCanaryConfig.startedTs;
  if (elapsed > activeCanaryConfig.durationMs) {
    return {
      requestId: id,
      mode: "DISABLED",
      policyUsed: "stable",
      ts: now,
      passed: true,
      reason: "Canary window expired",
    };
  }

  // Deterministic decision based on request hash
  const hashValue = parseInt(sha256Hex(id).slice(0, 8), 16);
  const threshold = (activeCanaryConfig.enforcePercentage / 100) * 0xFFFFFFFF;

  const useCandidate = hashValue < threshold;

  const decision: CanaryDecision = {
    requestId: id,
    mode: useCandidate ? "ENFORCE" : "LOG_ONLY",
    policyUsed: useCandidate ? "candidate" : "stable",
    ts: now,
    passed: true, // will be updated by caller
    reason: useCandidate
      ? `Canary: using candidate (${activeCanaryConfig.enforcePercentage}%)`
      : `Canary: using stable (log-only for candidate)`,
  };

  canaryDecisions.push(decision);
  return decision;
}

/**
 * Record the outcome of a canary decision.
 */
export function recordCanaryOutcome(
  requestId: string,
  passed: boolean,
  reason?: string,
): void {
  const decision = canaryDecisions.find((d) => d.requestId === requestId);
  if (decision) {
    decision.passed = passed;
    if (reason) decision.reason = reason;
  }
}

/**
 * Compute current canary stats.
 */
export function computeCanaryStats(): CanaryStats | null {
  if (!activeCanaryConfig) return null;

  const now = Date.now();
  const elapsed = now - activeCanaryConfig.startedTs;
  const remaining = Math.max(0, activeCanaryConfig.durationMs - elapsed);

  const candidateDecisions = canaryDecisions.filter((d) => d.policyUsed === "candidate");
  const stableDecisions = canaryDecisions.filter((d) => d.policyUsed === "stable");

  const candidateFailures = candidateDecisions.filter((d) => !d.passed).length;
  const stableFailures = stableDecisions.filter((d) => !d.passed).length;

  const candidateFailureRatio = candidateDecisions.length > 0
    ? candidateFailures / candidateDecisions.length
    : 0;
  const stableFailureRatio = stableDecisions.length > 0
    ? stableFailures / stableDecisions.length
    : 0;

  const shouldRollback = candidateFailureRatio > activeCanaryConfig.failureThresholdRatio;
  const shouldPromote = !shouldRollback &&
    remaining === 0 &&
    activeCanaryConfig.autoPromote &&
    candidateDecisions.length > 0;

  return {
    totalRequests: canaryDecisions.length,
    candidateRequests: candidateDecisions.length,
    stableRequests: stableDecisions.length,
    candidateFailures,
    stableFailures,
    candidateFailureRatio: Number(candidateFailureRatio.toFixed(4)),
    stableFailureRatio: Number(stableFailureRatio.toFixed(4)),
    isHealthy: !shouldRollback,
    elapsedMs: elapsed,
    remainingMs: remaining,
    shouldPromote,
    shouldRollback,
  };
}

// ---------------------------------------------------------------------------
// Policy debt register
// ---------------------------------------------------------------------------

const policyDebtRegister: PolicyDebtEntry[] = [];

/**
 * Register a temporary policy waiver (debt).
 */
export function registerPolicyDebt(
  params: {
    agentId: string;
    waivedRequirement: string;
    justification: string;
    expiresTs: number;
    createdBy: string;
  },
  workspace?: string,
): PolicyDebtEntry {
  const debtId = `pdb_${randomUUID().slice(0, 12)}`;
  const now = Date.now();

  const body = {
    debtId,
    agentId: params.agentId,
    waivedRequirement: params.waivedRequirement,
    justification: params.justification,
    expiresTs: params.expiresTs,
    createdTs: now,
    createdBy: params.createdBy,
  };

  const digest = sha256Hex(canonicalize(body));
  let signature = "unsigned";
  if (workspace) {
    try {
      signature = signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
    } catch { /* no key */ }
  }

  const entry: PolicyDebtEntry = {
    ...body,
    active: true,
    signature,
  };

  policyDebtRegister.push(entry);

  // Persist through the durable, hash-chained store. This previously lived only
  // in the module-level array above, so a governance waiver recorded here
  // vanished when the process exited and neither list command could see it.
  if (workspace) {
    try {
      addDebtEntry(workspace, {
        type: "waiver",
        reason: `${params.waivedRequirement}: ${params.justification}`,
        expiryTs: params.expiresTs,
        affectedPolicies: [params.waivedRequirement],
        riskAssessment: "MEDIUM",
        agentId: params.agentId,
        createdBy: params.createdBy
      });
    } catch (error) {
      // A waiver that cannot be persisted must not look recorded.
      throw new Error(
        `policy debt could not be persisted: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return entry;
}

/**
 * Get active policy debt entries (not expired).
 */
export function getActivePolicyDebt(agentId: string, workspace?: string): PolicyDebtEntry[] {
  const now = Date.now();
  const inMemory = policyDebtRegister.filter(
    (d) => d.agentId === agentId && d.active && d.expiresTs > now,
  );
  if (!workspace) return inMemory;

  // Include waivers persisted by any earlier process.
  const persisted = loadAllDebt(workspace)
    .filter((d) => d.agentId === agentId && !d.resolved && d.expiryTs > now)
    .map((d): PolicyDebtEntry => ({
      debtId: d.debtId,
      agentId: d.agentId,
      waivedRequirement: d.affectedPolicies[0] ?? d.type,
      justification: d.reason,
      expiresTs: d.expiryTs,
      createdTs: d.createdTs,
      createdBy: d.createdBy,
      active: true,
      signature: d.signature
    }));

  const seen = new Set(inMemory.map((d) => d.debtId));
  return [...inMemory, ...persisted.filter((d) => !seen.has(d.debtId))];
}

/**
 * Get expired policy debt entries.
 */
export function getExpiredPolicyDebt(agentId: string): PolicyDebtEntry[] {
  const now = Date.now();
  return policyDebtRegister.filter(
    (d) => d.agentId === agentId && (d.expiresTs <= now || !d.active),
  );
}

/**
 * Expire all overdue debt entries.
 */
export function expirePolicyDebt(agentId: string): string[] {
  const now = Date.now();
  const expired: string[] = [];
  for (const entry of policyDebtRegister) {
    if (entry.agentId === agentId && entry.active && entry.expiresTs <= now) {
      entry.active = false;
      expired.push(entry.debtId);
    }
  }
  return expired;
}

// ---------------------------------------------------------------------------
// Governance SLO tracking
// ---------------------------------------------------------------------------

const sloMeasurements: Array<{
  type: "policy_decision" | "approval_decision" | "false_block" | "policy_error";
  latencyMs?: number;
  ts: number;
}> = [];

export function recordSLOMeasurement(
  type: "policy_decision" | "approval_decision" | "false_block" | "policy_error",
  latencyMs?: number,
): void {
  sloMeasurements.push({ type, latencyMs, ts: Date.now() });
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

export function computeGovernanceSLO(windowMs?: number): GovernanceSLO {
  const cutoff = Date.now() - (windowMs ?? 3600000); // default 1 hour
  const recent = sloMeasurements.filter((m) => m.ts >= cutoff);

  const policyDecisions = recent.filter((m) => m.type === "policy_decision" && m.latencyMs !== undefined);
  const approvalDecisions = recent.filter((m) => m.type === "approval_decision" && m.latencyMs !== undefined);
  const falseBlocks = recent.filter((m) => m.type === "false_block");
  const policyErrors = recent.filter((m) => m.type === "policy_error");

  const totalDecisions = policyDecisions.length + approvalDecisions.length;

  return {
    policyDecisionLatencyP95Ms: percentile(
      policyDecisions.map((m) => m.latencyMs!),
      95,
    ),
    approvalDecisionLatencyP95Ms: percentile(
      approvalDecisions.map((m) => m.latencyMs!),
      95,
    ),
    falseBlockRatePercent: totalDecisions > 0
      ? Number(((falseBlocks.length / totalDecisions) * 100).toFixed(2))
      : 0,
    policyErrorRatePercent: totalDecisions > 0
      ? Number(((policyErrors.length / totalDecisions) * 100).toFixed(2))
      : 0,
  };
}

export function defaultGovernanceSLOTarget(): GovernanceSLOTarget {
  return {
    maxPolicyDecisionLatencyP95Ms: 100,
    maxApprovalDecisionLatencyP95Ms: 500,
    maxFalseBlockRatePercent: 5,
    maxPolicyErrorRatePercent: 1,
  };
}

export function checkSLOCompliance(
  slo: GovernanceSLO,
  target?: GovernanceSLOTarget,
): { met: boolean; violations: string[] } {
  const t = target ?? defaultGovernanceSLOTarget();
  const violations: string[] = [];

  if (slo.policyDecisionLatencyP95Ms > t.maxPolicyDecisionLatencyP95Ms) {
    violations.push(
      `Policy decision P95 ${slo.policyDecisionLatencyP95Ms}ms > ${t.maxPolicyDecisionLatencyP95Ms}ms`,
    );
  }
  if (slo.approvalDecisionLatencyP95Ms > t.maxApprovalDecisionLatencyP95Ms) {
    violations.push(
      `Approval decision P95 ${slo.approvalDecisionLatencyP95Ms}ms > ${t.maxApprovalDecisionLatencyP95Ms}ms`,
    );
  }
  if (slo.falseBlockRatePercent > t.maxFalseBlockRatePercent) {
    violations.push(
      `False block rate ${slo.falseBlockRatePercent}% > ${t.maxFalseBlockRatePercent}%`,
    );
  }
  if (slo.policyErrorRatePercent > t.maxPolicyErrorRatePercent) {
    violations.push(
      `Policy error rate ${slo.policyErrorRatePercent}% > ${t.maxPolicyErrorRatePercent}%`,
    );
  }

  return { met: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Governance drift detection
// ---------------------------------------------------------------------------

/**
 * Detect governance drift: gap between policy intent and runtime behavior.
 */
export function detectGovernanceDrift(
  agentId: string,
  workspace?: string,
): GovernanceDriftResult {
  const driftItems: GovernanceDriftResult["driftItems"] = [];

  // Check for expired overrides without postmortems
  const missingPostmortems = getOverridesMissingPostmortem(agentId, workspace);
  if (missingPostmortems.length > 0) {
    driftItems.push({
      category: "OVERRIDE_HYGIENE",
      description: `${missingPostmortems.length} emergency override(s) expired without postmortem`,
      severity: "HIGH",
    });
  }

  // Check for active policy debt
  const activeDebt = getActivePolicyDebt(agentId);
  if (activeDebt.length > 3) {
    driftItems.push({
      category: "POLICY_DEBT",
      description: `${activeDebt.length} active policy waivers indicate accumulating debt`,
      severity: "MEDIUM",
    });
  }

  // Check canary health
  const canaryStats = computeCanaryStats();
  if (canaryStats && canaryStats.shouldRollback) {
    driftItems.push({
      category: "CANARY_FAILURE",
      description: `Canary failure ratio ${(canaryStats.candidateFailureRatio * 100).toFixed(1)}% exceeds threshold`,
      severity: "HIGH",
    });
  }

  return {
    drifted: driftItems.length > 0,
    driftItems,
  };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

export function generatePolicyCanaryReport(agentId: string, workspace?: string): PolicyCanaryReport {
  const reportId = `pcr_${randomUUID().slice(0, 12)}`;
  const now = Date.now();

  const config = getCanaryConfig();
  const stats = computeCanaryStats();
  const packs = getRollbackPacks(agentId, workspace);
  const activeOverrides = getActiveOverrides(agentId, workspace);
  const activeDebt = getActivePolicyDebt(agentId);
  const expiredDebt = getExpiredPolicyDebt(agentId);
  const slo = computeGovernanceSLO();
  const sloTarget = defaultGovernanceSLOTarget();
  const sloCompliance = checkSLOCompliance(slo, sloTarget);
  const drift = detectGovernanceDrift(agentId, workspace);

  const recommendations: string[] = [];
  if (stats?.shouldRollback) {
    recommendations.push("URGENT: Canary failure threshold exceeded. Consider rolling back.");
  }
  if (stats?.shouldPromote) {
    recommendations.push("Canary window completed successfully. Promote candidate policy.");
  }
  if (!sloCompliance.met) {
    for (const v of sloCompliance.violations) {
      recommendations.push(`SLO violation: ${v}`);
    }
  }
  if (drift.drifted) {
    for (const item of drift.driftItems) {
      recommendations.push(`[${item.severity}] ${item.category}: ${item.description}`);
    }
  }
  if (packs.length === 0) {
    recommendations.push("No rollback packs created. Create one before deploying policy changes.");
  }

  return {
    reportId,
    agentId,
    ts: now,
    canaryActive: config?.enabled ?? false,
    canaryConfig: config,
    canaryStats: stats,
    rollbackPacks: packs.length,
    activeOverrides: activeOverrides.length,
    invalidOverrides: getInvalidOverrides(agentId, workspace).length,
    activeDebtEntries: activeDebt.length,
    expiredDebtEntries: expiredDebt.length,
    sloStatus: slo,
    sloTarget,
    sloMet: sloCompliance.met,
    driftResult: drift,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

export function renderPolicyCanaryMarkdown(report: PolicyCanaryReport): string {
  const lines: string[] = [
    "# Policy Canary Report",
    "",
    `- Report ID: ${report.reportId}`,
    `- Agent: ${report.agentId}`,
    `- Timestamp: ${new Date(report.ts).toISOString()}`,
    "",
    "## Canary Status",
    `- Active: ${report.canaryActive}`,
  ];

  if (report.canaryStats) {
    const s = report.canaryStats;
    lines.push(`- Candidate requests: ${s.candidateRequests}`);
    lines.push(`- Stable requests: ${s.stableRequests}`);
    lines.push(`- Candidate failure ratio: ${(s.candidateFailureRatio * 100).toFixed(1)}%`);
    lines.push(`- Healthy: ${s.isHealthy}`);
    lines.push(`- Should promote: ${s.shouldPromote}`);
    lines.push(`- Should rollback: ${s.shouldRollback}`);
  }

  lines.push("");
  lines.push("## Governance");
  lines.push(`- Rollback packs: ${report.rollbackPacks}`);
  lines.push(`- Active overrides: ${report.activeOverrides}`);
  lines.push(`- Invalid overrides (not honoured): ${report.invalidOverrides}`);
  lines.push(`- Active policy debt: ${report.activeDebtEntries}`);
  lines.push(`- Expired policy debt: ${report.expiredDebtEntries}`);
  lines.push(`- SLO met: ${report.sloMet}`);
  lines.push("");

  if (report.recommendations.length > 0) {
    lines.push("## Recommendations");
    for (const r of report.recommendations) {
      lines.push(`- ${r}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Reset (for testing)
// ---------------------------------------------------------------------------

export function resetPolicyCanaryState(): void {
  activeCanaryConfig = null;
  canaryDecisions.length = 0;
  resetCanaryRegisters();
  policyDebtRegister.length = 0;
  sloMeasurements.length = 0;
}
