/**
 * Policy Canary Mode — Observation-Only Enforcement
 *
 * Applies policy in observation-only mode before enforcement.
 * Records what WOULD have been blocked/modified during canary period.
 * Generates summary report after canary period.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest, getPrivateKeyPem } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CanaryModeConfig {
  canaryId: string;
  agentId: string;
  policyPackId: string;
  mode: "canary";          // observation-only
  startedTs: number;
  durationMs: number;
  expiresTs: number;
}

export interface CanaryObservation {
  observationId: string;
  canaryId: string;
  ts: number;
  actionType: string;
  wouldBlock: boolean;
  wouldModify: boolean;
  policyRule: string;
  details: string;
}

export interface CanaryModeReport {
  reportId: string;
  canaryId: string;
  agentId: string;
  policyPackId: string;
  startedTs: number;
  endedTs: number;
  totalObservations: number;
  wouldHaveBlocked: number;
  wouldHaveModified: number;
  passed: number;
  observations: CanaryObservation[];
  summary: string;
  recommendation: "PROMOTE" | "REJECT" | "EXTEND";
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const activeCanaries = new Map<string, CanaryModeConfig>();
const observations = new Map<string, CanaryObservation[]>();

/**
 * Start a canary mode for a policy pack.
 */
export function startCanaryMode(
  agentId: string,
  policyPackId: string,
  durationMs: number,
): CanaryModeConfig {
  const canaryId = `cny_${randomUUID().slice(0, 12)}`;
  const now = Date.now();
  const config: CanaryModeConfig = {
    canaryId,
    agentId,
    policyPackId,
    mode: "canary",
    startedTs: now,
    durationMs,
    expiresTs: now + durationMs,
  };
  activeCanaries.set(canaryId, config);
  observations.set(canaryId, []);
  return config;
}

/**
 * Get active canary for an agent.
 */
export function getActiveCanaryMode(agentId: string): CanaryModeConfig | null {
  for (const config of activeCanaries.values()) {
    if (config.agentId === agentId && Date.now() < config.expiresTs) {
      return config;
    }
  }
  return null;
}

/**
 * Record what a policy WOULD have done during canary mode.
 */
export function recordCanaryObservation(
  canaryId: string,
  actionType: string,
  wouldBlock: boolean,
  wouldModify: boolean,
  policyRule: string,
  details: string,
): CanaryObservation {
  const obs: CanaryObservation = {
    observationId: `obs_${randomUUID().slice(0, 8)}`,
    canaryId,
    ts: Date.now(),
    actionType,
    wouldBlock,
    wouldModify,
    policyRule,
    details,
  };

  const list = observations.get(canaryId) ?? [];
  list.push(obs);
  observations.set(canaryId, list);
  return obs;
}

/**
 * Generate the canary mode report.
 */
export function generateCanaryModeReport(canaryId: string): CanaryModeReport | null {
  const config = activeCanaries.get(canaryId);
  if (!config) return null;

  const obs = observations.get(canaryId) ?? [];
  const wouldHaveBlocked = obs.filter((o) => o.wouldBlock).length;
  const wouldHaveModified = obs.filter((o) => o.wouldModify && !o.wouldBlock).length;
  const passed = obs.length - wouldHaveBlocked - wouldHaveModified;

  const now = Date.now();
  const summary = `During canary period: ${obs.length} actions observed, ${wouldHaveBlocked} would have been blocked, ${wouldHaveModified} would have been modified, ${passed} passed unchanged.`;

  let recommendation: "PROMOTE" | "REJECT" | "EXTEND" = "PROMOTE";
  if (wouldHaveBlocked > obs.length * 0.3 && obs.length > 5) {
    recommendation = "REJECT";
  } else if (obs.length < 10 && now < config.expiresTs) {
    recommendation = "EXTEND";
  }

  return {
    reportId: `cmr_${randomUUID().slice(0, 12)}`,
    canaryId,
    agentId: config.agentId,
    policyPackId: config.policyPackId,
    startedTs: config.startedTs,
    endedTs: Math.min(now, config.expiresTs),
    totalObservations: obs.length,
    wouldHaveBlocked,
    wouldHaveModified,
    passed,
    observations: obs,
    summary,
    recommendation,
  };
}

/**
 * Generate report for agent's active or most recent canary.
 */
export function generateCanaryReportForAgent(agentId: string): CanaryModeReport | null {
  for (const [canaryId, config] of activeCanaries.entries()) {
    if (config.agentId === agentId) {
      return generateCanaryModeReport(canaryId);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderCanaryModeReportMarkdown(report: CanaryModeReport): string {
  const lines: string[] = [
    "# Policy Canary Mode Report",
    "",
    `- Report: ${report.reportId}`,
    `- Canary: ${report.canaryId}`,
    `- Agent: ${report.agentId}`,
    `- Policy Pack: ${report.policyPackId}`,
    `- Period: ${new Date(report.startedTs).toISOString()} → ${new Date(report.endedTs).toISOString()}`,
    "",
    "## Summary",
    "",
    report.summary,
    "",
    `- Total observations: ${report.totalObservations}`,
    `- Would have blocked: ${report.wouldHaveBlocked}`,
    `- Would have modified: ${report.wouldHaveModified}`,
    `- Passed unchanged: ${report.passed}`,
    `- Recommendation: **${report.recommendation}**`,
    "",
  ];

  if (report.observations.length > 0) {
    lines.push("## Observations (last 20)");
    for (const o of report.observations.slice(-20)) {
      const flag = o.wouldBlock ? "🚫 BLOCK" : o.wouldModify ? "⚠️ MODIFY" : "✅ PASS";
      lines.push(`- [${flag}] ${o.actionType} → ${o.policyRule}: ${o.details}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Reset (for testing)
// ---------------------------------------------------------------------------

export function resetCanaryModeState(): void {
  activeCanaries.clear();
  observations.clear();
}
