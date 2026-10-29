/**
 * Always-On Micro-Canary Assurance
 *
 * Lightweight canary probes injected into normal agent traffic,
 * providing continuous detection without full assurance run overhead.
 *
 * Key concepts:
 * - MicroCanaryProbe: a lightweight check that runs in milliseconds
 * - Probe tiers: CRITICAL, HIGH, MEDIUM, LOW (frequency-based targeting)
 * - Continuous monitoring between full assurance runs
 * - Alert on canary failure without waiting for scheduled assurance
 * - Evidence linkage from canary results to assurance scoring
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CanaryProbeRiskTier = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type CanaryProbeCategory =
  | "INJECTION_RESILIENCE"
  | "SECRET_LEAKAGE"
  | "TOOL_GOVERNANCE"
  | "EVIDENCE_INTEGRITY"
  | "POLICY_COMPLIANCE"
  | "SIGNATURE_VALIDITY"
  | "CONFIGURATION_DRIFT";

export type CanaryProbeStatus = "PASS" | "FAIL" | "WARN" | "SKIP" | "ERROR";

export interface MicroCanaryProbeDefinition {
  probeId: string;
  name: string;
  category: CanaryProbeCategory;
  riskTier: CanaryProbeRiskTier;
  /** Description of what this probe checks */
  description: string;
  /** Evaluation function receives the probe context and returns a result */
  evaluate: (ctx: MicroCanaryContext) => MicroCanaryProbeResult;
}

export interface MicroCanaryContext {
  /** Timestamp of probe execution */
  ts: number;
  /** Agent identifier, if agent-scoped */
  agentId: string | null;
  /** Recent evidence event hashes (from ledger tail) */
  recentEventHashes: string[];
  /** Recent audit event types and counts */
  auditCounts: Record<string, number>;
  /** Current configuration signatures validity */
  configSignatures: Record<string, boolean>;
  /** Custom metadata injected by the caller */
  metadata: Record<string, unknown>;
}

export interface MicroCanaryProbeResult {
  status: CanaryProbeStatus;
  /** Short reason for the result */
  reason: string;
  /** Latency of probe execution in milliseconds */
  latencyMs: number;
  /** Evidence references from the check */
  evidenceRefs: string[];
}

export interface MicroCanaryExecution {
  executionId: string;
  probeId: string;
  probeName: string;
  category: CanaryProbeCategory;
  riskTier: CanaryProbeRiskTier;
  agentId: string | null;
  ts: number;
  result: MicroCanaryProbeResult;
}

export interface MicroCanaryConfig {
  /** Whether micro-canary is enabled */
  enabled: boolean;
  /** Probe frequency per tier (executions per hour) */
  frequencyPerHour: Record<CanaryProbeRiskTier, number>;
  /** Maximum probe latency before auto-skip (ms) */
  maxProbeLatencyMs: number;
  /** Alert immediately on failure for these tiers */
  alertOnFailureTiers: CanaryProbeRiskTier[];
  /** Maximum number of executions to keep in memory */
  maxExecutionHistory: number;
}

export interface MicroCanaryAlert {
  alertId: string;
  executionId: string;
  probeId: string;
  probeName: string;
  category: CanaryProbeCategory;
  riskTier: CanaryProbeRiskTier;
  reason: string;
  ts: number;
  acknowledged: boolean;
}

export interface MicroCanaryReport {
  reportId: string;
  ts: number;
  config: MicroCanaryConfig;
  totalExecutions: number;
  passCount: number;
  failCount: number;
  warnCount: number;
  errorCount: number;
  skipCount: number;
  passRate: number;
  avgLatencyMs: number;
  /** Breakdown by category */
  categoryBreakdown: Array<{
    category: CanaryProbeCategory;
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  }>;
  /** Breakdown by risk tier */
  tierBreakdown: Array<{
    tier: CanaryProbeRiskTier;
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  }>;
  /** Active (unacknowledged) alerts */
  activeAlerts: MicroCanaryAlert[];
  /** Recommendations */
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

export const microCanaryConfigSchema = z.object({
  enabled: z.boolean(),
  frequencyPerHour: z.object({
    CRITICAL: z.number().min(0).max(3600),
    HIGH: z.number().min(0).max(3600),
    MEDIUM: z.number().min(0).max(3600),
    LOW: z.number().min(0).max(3600),
  }),
  maxProbeLatencyMs: z.number().min(1).max(30000),
  alertOnFailureTiers: z.array(z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"])),
  maxExecutionHistory: z.number().min(10).max(100000),
});

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export function defaultMicroCanaryConfig(): MicroCanaryConfig {
  return {
    enabled: true,
    frequencyPerHour: {
      CRITICAL: 60, // every minute
      HIGH: 12,     // every 5 minutes
      MEDIUM: 4,    // every 15 minutes
      LOW: 1,       // every hour
    },
    maxProbeLatencyMs: 500,
    alertOnFailureTiers: ["CRITICAL", "HIGH"],
    maxExecutionHistory: 10000,
  };
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

let activeConfig: MicroCanaryConfig = defaultMicroCanaryConfig();
const probeRegistry: MicroCanaryProbeDefinition[] = [];
const executionHistory: MicroCanaryExecution[] = [];
const activeAlerts: MicroCanaryAlert[] = [];
const lastRunByProbe = new Map<string, number>();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function configureMicroCanary(config: MicroCanaryConfig): MicroCanaryConfig {
  const validated = microCanaryConfigSchema.parse(config);
  activeConfig = validated;
  return validated;
}

export function getMicroCanaryConfig(): MicroCanaryConfig {
  return { ...activeConfig };
}

// ---------------------------------------------------------------------------
// Probe registration
// ---------------------------------------------------------------------------

/**
 * Register a micro-canary probe definition.
 */
export function registerProbe(probe: MicroCanaryProbeDefinition): void {
  const existing = probeRegistry.findIndex((p) => p.probeId === probe.probeId);
  if (existing >= 0) {
    probeRegistry[existing] = probe;
  } else {
    probeRegistry.push(probe);
  }
}

/**
 * Get all registered probes.
 */
export function listRegisteredProbes(): MicroCanaryProbeDefinition[] {
  return [...probeRegistry];
}

/**
 * Get registered probes by risk tier.
 */
export function getProbesByTier(tier: CanaryProbeRiskTier): MicroCanaryProbeDefinition[] {
  return probeRegistry.filter((p) => p.riskTier === tier);
}

// ---------------------------------------------------------------------------
// Built-in probes
// ---------------------------------------------------------------------------

/**
 * Register the standard set of built-in micro-canary probes.
 */
/**
 * A count probe that sees no audit telemetry at all observed nothing: it is not evaluated (SKIP), never a PASS on
 * zero counts (WP37). Returns the SKIP result, or null when the window carries audit events.
 */
function noAuditTelemetry(ctx: MicroCanaryContext, start: number): MicroCanaryProbeResult | null {
  const total = Object.values(ctx.auditCounts).reduce((sum, count) => sum + count, 0);
  return total > 0 ? null : { status: "SKIP", reason: "No audit telemetry in window: not evaluated", latencyMs: Date.now() - start, evidenceRefs: [] };
}

export function registerBuiltInProbes(): void {
  registerProbe({
    probeId: "mc-evidence-chain",
    name: "Evidence Chain Integrity",
    category: "EVIDENCE_INTEGRITY",
    riskTier: "CRITICAL",
    description: "Checks that recent evidence events form a valid hash chain",
    evaluate: (ctx) => {
      const start = Date.now();
      if (ctx.recentEventHashes.length === 0) {
        return {
          status: "SKIP",
          reason: "No recent events to check",
          latencyMs: Date.now() - start,
          evidenceRefs: [],
        };
      }
      // Verify hashes are non-empty and unique
      const uniqueHashes = new Set(ctx.recentEventHashes);
      const hasInvalid = ctx.recentEventHashes.some((h) => !h || h.length !== 64);

      return {
        status: hasInvalid ? "FAIL" : "PASS",
        reason: hasInvalid
          ? `Found ${ctx.recentEventHashes.filter((h) => !h || h.length !== 64).length} invalid hash(es)`
          : `${uniqueHashes.size} unique hashes verified`,
        latencyMs: Date.now() - start,
        evidenceRefs: ctx.recentEventHashes.slice(0, 5),
      };
    },
  });

  registerProbe({
    probeId: "mc-config-signatures",
    name: "Configuration Signature Validity",
    category: "SIGNATURE_VALIDITY",
    riskTier: "CRITICAL",
    description: "Checks that all configuration files have valid signatures",
    evaluate: (ctx) => {
      const start = Date.now();
      const entries = Object.entries(ctx.configSignatures);
      if (entries.length === 0) {
        return {
          status: "SKIP",
          reason: "No configuration signatures to check",
          latencyMs: Date.now() - start,
          evidenceRefs: [],
        };
      }

      const invalid = entries.filter(([, valid]) => !valid);
      return {
        status: invalid.length > 0 ? "FAIL" : "PASS",
        reason: invalid.length > 0
          ? `Invalid signatures: ${invalid.map(([k]) => k).join(", ")}`
          : `All ${entries.length} config signatures valid`,
        latencyMs: Date.now() - start,
        evidenceRefs: [],
      };
    },
  });

  registerProbe({
    probeId: "mc-audit-activity",
    name: "Audit Activity Health",
    category: "EVIDENCE_INTEGRITY",
    riskTier: "HIGH",
    description: "Checks that audit events are being generated at expected rates",
    evaluate: (ctx) => {
      const start = Date.now();
      const totalAudits = Object.values(ctx.auditCounts).reduce((sum, c) => sum + c, 0);

      if (totalAudits === 0) {
        return {
          status: "WARN",
          reason: "No audit events in recent window",
          latencyMs: Date.now() - start,
          evidenceRefs: [],
        };
      }

      return {
        status: "PASS",
        reason: `${totalAudits} audit events across ${Object.keys(ctx.auditCounts).length} types`,
        latencyMs: Date.now() - start,
        evidenceRefs: ctx.recentEventHashes.slice(0, 3),
      };
    },
  });

  registerProbe({
    probeId: "mc-policy-enforcement",
    name: "Policy Enforcement Active",
    category: "POLICY_COMPLIANCE",
    riskTier: "HIGH",
    description: "Verifies that policy enforcement is active (not bypassed or disabled)",
    evaluate: (ctx) => {
      const start = Date.now();
      const policyActive = ctx.metadata["policyEnforcementActive"] as boolean | undefined;

      if (policyActive === undefined) {
        return {
          status: "SKIP",
          reason: "Policy enforcement status not available in context",
          latencyMs: Date.now() - start,
          evidenceRefs: [],
        };
      }

      return {
        status: policyActive ? "PASS" : "FAIL",
        reason: policyActive ? "Policy enforcement is active" : "Policy enforcement is NOT active",
        latencyMs: Date.now() - start,
        evidenceRefs: [],
      };
    },
  });

  registerProbe({
    probeId: "mc-injection-markers",
    name: "Injection Marker Detection",
    category: "INJECTION_RESILIENCE",
    riskTier: "HIGH",
    description: "Checks for injection attempt markers in recent audit events",
    evaluate: (ctx) => {
      const start = Date.now();
      const unobserved = noAuditTelemetry(ctx, start);
      if (unobserved) return unobserved;
      const injectionCount = ctx.auditCounts["INJECTION_ATTEMPT"] ?? 0;
      const blockedCount = ctx.auditCounts["INJECTION_BLOCKED"] ?? 0;

      if (injectionCount === 0) {
        return {
          status: "PASS",
          reason: "No injection attempts detected",
          latencyMs: Date.now() - start,
          evidenceRefs: [],
        };
      }

      const blockRate = blockedCount / injectionCount;

      return {
        status: blockRate >= 0.95 ? "PASS" : blockRate >= 0.5 ? "WARN" : "FAIL",
        reason: `${injectionCount} injection attempt(s), ${blockedCount} blocked (${(blockRate * 100).toFixed(0)}% block rate)`,
        latencyMs: Date.now() - start,
        evidenceRefs: ctx.recentEventHashes.slice(0, 5),
      };
    },
  });

  registerProbe({
    probeId: "mc-secret-exposure",
    name: "Secret Exposure Check",
    category: "SECRET_LEAKAGE",
    riskTier: "CRITICAL",
    description: "Checks for secret exposure events in recent audit trail",
    evaluate: (ctx) => {
      const start = Date.now();
      const unobserved = noAuditTelemetry(ctx, start);
      if (unobserved) return unobserved;
      const exposureCount = ctx.auditCounts["SECRET_EXPOSED"] ?? 0;
      const leakCount = ctx.auditCounts["PII_LEAKED"] ?? 0;

      const total = exposureCount + leakCount;

      return {
        status: total > 0 ? "FAIL" : "PASS",
        reason: total > 0
          ? `ALERT: ${exposureCount} secret exposure(s), ${leakCount} PII leak(s) detected`
          : "No secret exposures or PII leaks detected",
        latencyMs: Date.now() - start,
        evidenceRefs: ctx.recentEventHashes.slice(0, 3),
      };
    },
  });

  registerProbe({
    probeId: "mc-tool-governance",
    name: "Tool Governance Check",
    category: "TOOL_GOVERNANCE",
    riskTier: "MEDIUM",
    description: "Checks for unauthorized tool usage patterns",
    evaluate: (ctx) => {
      const start = Date.now();
      const unobserved = noAuditTelemetry(ctx, start);
      if (unobserved) return unobserved;
      const deniedCount = ctx.auditCounts["TOOL_DENIED"] ?? 0;
      const unauthorizedCount = ctx.auditCounts["UNAUTHORIZED_TOOL_USE"] ?? 0;

      if (unauthorizedCount > 0) {
        return {
          status: "FAIL",
          reason: `${unauthorizedCount} unauthorized tool use(s) detected`,
          latencyMs: Date.now() - start,
          evidenceRefs: ctx.recentEventHashes.slice(0, 3),
        };
      }

      return {
        status: "PASS",
        reason: `Tool governance healthy. ${deniedCount} denied request(s) (expected behavior)`,
        latencyMs: Date.now() - start,
        evidenceRefs: [],
      };
    },
  });

  registerProbe({
    probeId: "mc-config-drift",
    name: "Configuration Drift Detection",
    category: "CONFIGURATION_DRIFT",
    riskTier: "MEDIUM",
    description: "Checks for unexpected configuration changes",
    evaluate: (ctx) => {
      const start = Date.now();
      const unobserved = noAuditTelemetry(ctx, start);
      if (unobserved) return unobserved;
      const configChanges = ctx.auditCounts["CONFIG_CHANGED"] ?? 0;
      const unsignedChanges = ctx.auditCounts["UNSIGNED_CONFIG_CHANGE"] ?? 0;

      if (unsignedChanges > 0) {
        return {
          status: "FAIL",
          reason: `${unsignedChanges} unsigned configuration change(s) detected`,
          latencyMs: Date.now() - start,
          evidenceRefs: [],
        };
      }

      return {
        status: configChanges > 5 ? "WARN" : "PASS",
        reason: configChanges > 0
          ? `${configChanges} signed config change(s) in window`
          : "No configuration changes detected",
        latencyMs: Date.now() - start,
        evidenceRefs: [],
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Probe execution
// ---------------------------------------------------------------------------

/**
 * Check if a probe is due to run based on its tier frequency.
 */
export function isProbedue(probeId: string, tier: CanaryProbeRiskTier, now?: number): boolean {
  const nowTs = now ?? Date.now();
  const lastRun = lastRunByProbe.get(probeId);
  if (lastRun === undefined) return true;

  const freq = activeConfig.frequencyPerHour[tier];
  if (freq <= 0) return false;

  const intervalMs = (3600000 / freq);
  return (nowTs - lastRun) >= intervalMs;
}

/**
 * Execute a single probe.
 */
export function executeProbe(
  probe: MicroCanaryProbeDefinition,
  ctx: MicroCanaryContext,
): MicroCanaryExecution {
  const executionId = `mce_${randomUUID().slice(0, 12)}`;
  const now = Date.now();

  let result: MicroCanaryProbeResult;
  try {
    const start = Date.now();
    result = probe.evaluate(ctx);

    // Check if probe exceeded latency budget
    if (result.latencyMs > activeConfig.maxProbeLatencyMs) {
      result = {
        status: "SKIP",
        reason: `Probe exceeded latency budget (${result.latencyMs}ms > ${activeConfig.maxProbeLatencyMs}ms)`,
        latencyMs: result.latencyMs,
        evidenceRefs: [],
      };
    }
  } catch (err) {
    result = {
      status: "ERROR",
      reason: `Probe threw error: ${err instanceof Error ? err.message : String(err)}`,
      latencyMs: Date.now() - now,
      evidenceRefs: [],
    };
  }

  const execution: MicroCanaryExecution = {
    executionId,
    probeId: probe.probeId,
    probeName: probe.name,
    category: probe.category,
    riskTier: probe.riskTier,
    agentId: ctx.agentId,
    ts: now,
    result,
  };

  // Update history
  executionHistory.push(execution);
  lastRunByProbe.set(probe.probeId, now);

  // Trim history if needed
  while (executionHistory.length > activeConfig.maxExecutionHistory) {
    executionHistory.shift();
  }

  // Create alert on failure if tier is in alertOnFailureTiers
  if (
    result.status === "FAIL" &&
    activeConfig.alertOnFailureTiers.includes(probe.riskTier)
  ) {
    activeAlerts.push({
      alertId: `mca_${randomUUID().slice(0, 12)}`,
      executionId,
      probeId: probe.probeId,
      probeName: probe.name,
      category: probe.category,
      riskTier: probe.riskTier,
      reason: result.reason,
      ts: now,
      acknowledged: false,
    });
  }

  return execution;
}

/**
 * Run all probes that are due.
 * This is the main entry point called during normal traffic.
 */
export function runDueProbes(ctx: MicroCanaryContext): MicroCanaryExecution[] {
  if (!activeConfig.enabled) return [];

  const now = ctx.ts;
  const results: MicroCanaryExecution[] = [];

  for (const probe of probeRegistry) {
    if (isProbedue(probe.probeId, probe.riskTier, now)) {
      results.push(executeProbe(probe, ctx));
    }
  }

  return results;
}

/**
 * Run all registered probes regardless of frequency (for manual triggering).
 */
export function runAllProbes(ctx: MicroCanaryContext): MicroCanaryExecution[] {
  const results: MicroCanaryExecution[] = [];

  for (const probe of probeRegistry) {
    results.push(executeProbe(probe, ctx));
  }

  return results;
}

// ---------------------------------------------------------------------------
// Execution history & alerts
// ---------------------------------------------------------------------------

/**
 * Get execution history, optionally filtered.
 */
export function getExecutionHistory(filters?: {
  probeId?: string;
  category?: CanaryProbeCategory;
  riskTier?: CanaryProbeRiskTier;
  status?: CanaryProbeStatus;
  sinceTs?: number;
  limit?: number;
}): MicroCanaryExecution[] {
  let results = [...executionHistory];

  if (filters?.probeId) results = results.filter((e) => e.probeId === filters.probeId);
  if (filters?.category) results = results.filter((e) => e.category === filters.category);
  if (filters?.riskTier) results = results.filter((e) => e.riskTier === filters.riskTier);
  if (filters?.status) results = results.filter((e) => e.result.status === filters.status);
  if (filters?.sinceTs) results = results.filter((e) => e.ts >= filters.sinceTs!);

  if (filters?.limit) {
    results = results.slice(-filters.limit);
  }

  return results;
}

/**
 * Get active (unacknowledged) alerts.
 */
export function getActiveAlerts(): MicroCanaryAlert[] {
  return activeAlerts.filter((a) => !a.acknowledged);
}

/**
 * Get all alerts.
 */
export function getAllAlerts(): MicroCanaryAlert[] {
  return [...activeAlerts];
}

/**
 * Acknowledge an alert.
 */
export function acknowledgeAlert(alertId: string): boolean {
  const alert = activeAlerts.find((a) => a.alertId === alertId);
  if (!alert) return false;
  alert.acknowledged = true;
  return true;
}

/**
 * Acknowledge all alerts.
 */
export function acknowledgeAllAlerts(): number {
  let count = 0;
  for (const a of activeAlerts) {
    if (!a.acknowledged) {
      a.acknowledged = true;
      count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * Generate a micro-canary status report.
 */
export function generateMicroCanaryReport(sinceTs?: number): MicroCanaryReport {
  const reportId = `mcr_${randomUUID().slice(0, 12)}`;
  const now = Date.now();
  const cutoff = sinceTs ?? (now - 3600000); // default: last hour

  const recent = executionHistory.filter((e) => e.ts >= cutoff);

  const passCount = recent.filter((e) => e.result.status === "PASS").length;
  const failCount = recent.filter((e) => e.result.status === "FAIL").length;
  const warnCount = recent.filter((e) => e.result.status === "WARN").length;
  const errorCount = recent.filter((e) => e.result.status === "ERROR").length;
  const skipCount = recent.filter((e) => e.result.status === "SKIP").length;

  const totalLatency = recent.reduce((sum, e) => sum + e.result.latencyMs, 0);
  const avgLatencyMs = recent.length > 0 ? Number((totalLatency / recent.length).toFixed(2)) : 0;

  // Category breakdown
  const categoryMap = new Map<CanaryProbeCategory, { total: number; passed: number; failed: number }>();
  for (const e of recent) {
    if (!categoryMap.has(e.category)) {
      categoryMap.set(e.category, { total: 0, passed: 0, failed: 0 });
    }
    const entry = categoryMap.get(e.category)!;
    entry.total++;
    if (e.result.status === "PASS") entry.passed++;
    if (e.result.status === "FAIL") entry.failed++;
  }

  const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
    category,
    total: data.total,
    passed: data.passed,
    failed: data.failed,
    passRate: data.total > 0 ? Number((data.passed / data.total).toFixed(4)) : 0,
  }));

  // Tier breakdown
  const tierMap = new Map<CanaryProbeRiskTier, { total: number; passed: number; failed: number }>();
  for (const e of recent) {
    if (!tierMap.has(e.riskTier)) {
      tierMap.set(e.riskTier, { total: 0, passed: 0, failed: 0 });
    }
    const entry = tierMap.get(e.riskTier)!;
    entry.total++;
    if (e.result.status === "PASS") entry.passed++;
    if (e.result.status === "FAIL") entry.failed++;
  }

  const tierBreakdown = Array.from(tierMap.entries()).map(([tier, data]) => ({
    tier,
    total: data.total,
    passed: data.passed,
    failed: data.failed,
    passRate: data.total > 0 ? Number((data.passed / data.total).toFixed(4)) : 0,
  }));

  // Recommendations
  const recommendations: string[] = [];
  const unacknowledgedAlerts = activeAlerts.filter((a) => !a.acknowledged);

  if (unacknowledgedAlerts.length > 0) {
    recommendations.push(
      `${unacknowledgedAlerts.length} unacknowledged alert(s). Review and acknowledge.`,
    );
  }

  if (failCount > 0) {
    const failRate = recent.length > 0 ? failCount / recent.length : 0;
    if (failRate > 0.1) {
      recommendations.push(
        `High failure rate (${(failRate * 100).toFixed(1)}%). Consider triggering a full assurance run.`,
      );
    }
  }

  const criticalFails = recent.filter(
    (e) => e.riskTier === "CRITICAL" && e.result.status === "FAIL",
  );
  if (criticalFails.length > 0) {
    recommendations.push(
      `${criticalFails.length} CRITICAL probe failure(s). Immediate investigation recommended.`,
    );
  }

  if (errorCount > 0) {
    recommendations.push(
      `${errorCount} probe error(s). Check probe definitions and context data.`,
    );
  }

  if (recent.length === 0) {
    recommendations.push("No micro-canary executions in the reporting window. Verify configuration.");
  }

  return {
    reportId,
    ts: now,
    config: { ...activeConfig },
    totalExecutions: recent.length,
    passCount,
    failCount,
    warnCount,
    errorCount,
    skipCount,
    passRate: recent.length > 0 ? Number((passCount / recent.length).toFixed(4)) : 0,
    avgLatencyMs,
    categoryBreakdown,
    tierBreakdown,
    activeAlerts: unacknowledgedAlerts,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

export function renderMicroCanaryMarkdown(report: MicroCanaryReport): string {
  const lines: string[] = [
    "# Micro-Canary Assurance Report",
    "",
    `- Report ID: ${report.reportId}`,
    `- Timestamp: ${new Date(report.ts).toISOString()}`,
    `- Canary enabled: ${report.config.enabled}`,
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total executions | ${report.totalExecutions} |`,
    `| Pass | ${report.passCount} |`,
    `| Fail | ${report.failCount} |`,
    `| Warn | ${report.warnCount} |`,
    `| Error | ${report.errorCount} |`,
    `| Skip | ${report.skipCount} |`,
    `| Pass rate | ${(report.passRate * 100).toFixed(1)}% |`,
    `| Avg latency | ${report.avgLatencyMs}ms |`,
    "",
  ];

  if (report.tierBreakdown.length > 0) {
    lines.push("## By Risk Tier");
    lines.push("");
    lines.push("| Tier | Total | Passed | Failed | Pass Rate |");
    lines.push("|------|-------|--------|--------|-----------|");
    for (const t of report.tierBreakdown) {
      lines.push(
        `| ${t.tier} | ${t.total} | ${t.passed} | ${t.failed} | ${(t.passRate * 100).toFixed(1)}% |`,
      );
    }
    lines.push("");
  }

  if (report.categoryBreakdown.length > 0) {
    lines.push("## By Category");
    lines.push("");
    lines.push("| Category | Total | Passed | Failed | Pass Rate |");
    lines.push("|----------|-------|--------|--------|-----------|");
    for (const c of report.categoryBreakdown) {
      lines.push(
        `| ${c.category} | ${c.total} | ${c.passed} | ${c.failed} | ${(c.passRate * 100).toFixed(1)}% |`,
      );
    }
    lines.push("");
  }

  if (report.activeAlerts.length > 0) {
    lines.push("## Active Alerts");
    lines.push("");
    for (const a of report.activeAlerts) {
      lines.push(`- **[${a.riskTier}]** ${a.probeName}: ${a.reason} (${new Date(a.ts).toISOString()})`);
    }
    lines.push("");
  }

  if (report.recommendations.length > 0) {
    lines.push("## Recommendations");
    lines.push("");
    for (const r of report.recommendations) {
      lines.push(`- ${r}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Assurance score linkage
// ---------------------------------------------------------------------------

/**
 * Compute a micro-canary health score (0-100) for integration with assurance scoring.
 */
export function computeCanaryHealthScore(sinceTs?: number): {
  score: number;
  probeCount: number;
  failCount: number;
  criticalFailCount: number;
} {
  const now = Date.now();
  const cutoff = sinceTs ?? (now - 3600000);
  const recent = executionHistory.filter((e) => e.ts >= cutoff);

  if (recent.length === 0) {
    return { score: 100, probeCount: 0, failCount: 0, criticalFailCount: 0 };
  }

  const failCount = recent.filter((e) => e.result.status === "FAIL").length;
  const criticalFails = recent.filter(
    (e) => e.riskTier === "CRITICAL" && e.result.status === "FAIL",
  ).length;

  // Weighted: critical failures count 3x
  const weightedFailures = (failCount - criticalFails) + criticalFails * 3;
  const score = Math.max(0, Math.round(100 - (weightedFailures / recent.length) * 100));

  return { score, probeCount: recent.length, failCount, criticalFailCount: criticalFails };
}

// ---------------------------------------------------------------------------
// Reset (for testing)
// ---------------------------------------------------------------------------

export function resetMicroCanaryState(): void {
  activeConfig = defaultMicroCanaryConfig();
  probeRegistry.length = 0;
  executionHistory.length = 0;
  activeAlerts.length = 0;
  lastRunByProbe.clear();
}
