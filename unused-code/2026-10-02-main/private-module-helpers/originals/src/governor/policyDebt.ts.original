/**
 * Policy Debt Register
 *
 * Tracks temporary waivers, overrides, and exceptions with expiry, risk assessment,
 * and auto-escalation when debt expires without resolution.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest, getPrivateKeyPem } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { readdirSync } from "node:fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PolicyDebtType = "waiver" | "override" | "exception";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PolicyDebtEntry {
  debtId: string;
  type: PolicyDebtType;
  reason: string;
  expiryTs: number;
  affectedPolicies: string[];
  riskAssessment: RiskLevel;
  agentId: string;
  createdTs: number;
  createdBy: string;
  resolvedTs: number | null;
  resolved: boolean;
  prev_debt_hash: string;
  debt_hash: string;
  signature: string;
}

export interface DebtAccumulationAlert {
  totalActive: number;
  highRiskCount: number;
  expiredUnresolved: number;
  threshold: number;
  exceeded: boolean;
  message: string;
}

export interface PolicyDebtDashboard {
  agentId: string;
  ts: number;
  activeEntries: PolicyDebtEntry[];
  expiredUnresolved: PolicyDebtEntry[];
  resolvedEntries: PolicyDebtEntry[];
  totalDebt: number;
  riskBreakdown: Record<RiskLevel, number>;
  alert: DebtAccumulationAlert | null;
}

// ---------------------------------------------------------------------------
// File-based Store (.amc/governor/debt/)
// ---------------------------------------------------------------------------

function debtDir(workspace: string): string {
  return join(workspace, ".amc", "governor", "debt");
}

function debtFilePath(workspace: string, debtId: string): string {
  return join(debtDir(workspace), `${debtId}.json`);
}

export function loadAllDebt(workspace: string): PolicyDebtEntry[] {
  const dir = debtDir(workspace);
  if (!pathExists(dir)) return [];
  return readdirSync(dir)
    .filter((f: string) => f.endsWith(".json"))
    .map((f: string) => JSON.parse(readUtf8(join(dir, f))) as PolicyDebtEntry);
}

function getLastDebtHash(workspace: string): string {
  const entries = loadAllDebt(workspace);
  if (entries.length === 0) return "GENESIS_DEBT";
  const sorted = entries.sort((a, b) => a.createdTs - b.createdTs);
  return sorted[sorted.length - 1]!.debt_hash;
}

function saveDebtEntry(workspace: string, entry: PolicyDebtEntry): void {
  const dir = debtDir(workspace);
  ensureDir(dir);
  writeFileAtomic(debtFilePath(workspace, entry.debtId), JSON.stringify(entry, null, 2), 0o644);
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export function addDebtEntry(
  workspace: string,
  params: {
    type: PolicyDebtType;
    reason: string;
    expiryTs: number;
    affectedPolicies: string[];
    riskAssessment: RiskLevel;
    agentId: string;
    createdBy: string;
  },
): PolicyDebtEntry {
  const debtId = `dbt_${randomUUID().slice(0, 12)}`;
  const now = Date.now();
  const prevHash = getLastDebtHash(workspace);

  const body = {
    debtId,
    type: params.type,
    reason: params.reason,
    expiryTs: params.expiryTs,
    affectedPolicies: params.affectedPolicies,
    riskAssessment: params.riskAssessment,
    agentId: params.agentId,
    createdTs: now,
    createdBy: params.createdBy,
    resolvedTs: null as number | null,
    resolved: false,
    prev_debt_hash: prevHash,
  };

  const debtHash = sha256Hex(canonicalize(body));
  let signature = "unsigned";
  try {
    signature = signHexDigest(debtHash, getPrivateKeyPem(workspace, "auditor"));
  } catch { /* no key */ }

  const entry: PolicyDebtEntry = { ...body, debt_hash: debtHash, signature };
  saveDebtEntry(workspace, entry);
  return entry;
}

export function resolveDebtEntry(workspace: string, debtId: string): boolean {
  const entry = loadDebtEntry(workspace, debtId);
  if (!entry) return false;
  entry.resolved = true;
  entry.resolvedTs = Date.now();
  saveDebtEntry(workspace, entry);
  return true;
}

export function loadDebtEntry(workspace: string, debtId: string): PolicyDebtEntry | null {
  const file = debtFilePath(workspace, debtId);
  if (!pathExists(file)) return null;
  return JSON.parse(readUtf8(file)) as PolicyDebtEntry;
}

export function listActiveDebt(workspace: string, agentId?: string): PolicyDebtEntry[] {
  const now = Date.now();
  return loadAllDebt(workspace).filter((d) =>
    !d.resolved && d.expiryTs > now && (!agentId || d.agentId === agentId)
  );
}

export function listExpiredUnresolved(workspace: string, agentId?: string): PolicyDebtEntry[] {
  const now = Date.now();
  return loadAllDebt(workspace).filter((d) =>
    !d.resolved && d.expiryTs <= now && (!agentId || d.agentId === agentId)
  );
}

/** Debt accumulation alert threshold */
const DEBT_THRESHOLD = 5;

export function checkDebtAccumulation(workspace: string, agentId?: string): DebtAccumulationAlert {
  const active = listActiveDebt(workspace, agentId);
  const expiredUnresolved = listExpiredUnresolved(workspace, agentId);
  const highRisk = active.filter((d) => d.riskAssessment === "HIGH" || d.riskAssessment === "CRITICAL");

  const exceeded = active.length >= DEBT_THRESHOLD || expiredUnresolved.length > 0 || highRisk.length >= 3;

  let message = `${active.length} active debt entries`;
  if (exceeded) {
    const reasons: string[] = [];
    if (active.length >= DEBT_THRESHOLD) reasons.push(`active count ${active.length} ≥ ${DEBT_THRESHOLD}`);
    if (expiredUnresolved.length > 0) reasons.push(`${expiredUnresolved.length} expired without resolution`);
    if (highRisk.length >= 3) reasons.push(`${highRisk.length} HIGH/CRITICAL risk entries`);
    message = `ALERT: Policy debt threshold exceeded (${reasons.join(", ")})`;
  }

  return {
    totalActive: active.length,
    highRiskCount: highRisk.length,
    expiredUnresolved: expiredUnresolved.length,
    threshold: DEBT_THRESHOLD,
    exceeded,
    message,
  };
}

export function buildDebtDashboard(workspace: string, agentId: string): PolicyDebtDashboard {
  const all = loadAllDebt(workspace).filter((d) => d.agentId === agentId);
  const now = Date.now();
  const active = all.filter((d) => !d.resolved && d.expiryTs > now);
  const expiredUnresolved = all.filter((d) => !d.resolved && d.expiryTs <= now);
  const resolved = all.filter((d) => d.resolved);

  const riskBreakdown: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const d of active) {
    riskBreakdown[d.riskAssessment]++;
  }

  const alert = checkDebtAccumulation(workspace, agentId);

  return {
    agentId,
    ts: now,
    activeEntries: active,
    expiredUnresolved,
    resolvedEntries: resolved,
    totalDebt: active.length,
    riskBreakdown,
    alert: alert.exceeded ? alert : null,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderDebtDashboardMarkdown(dashboard: PolicyDebtDashboard): string {
  const lines: string[] = [
    "# Policy Debt Register",
    "",
    `Agent: ${dashboard.agentId}`,
    `Active: ${dashboard.activeEntries.length}`,
    `Expired (unresolved): ${dashboard.expiredUnresolved.length}`,
    `Resolved: ${dashboard.resolvedEntries.length}`,
    "",
    "## Risk Breakdown",
    `- LOW: ${dashboard.riskBreakdown.LOW}`,
    `- MEDIUM: ${dashboard.riskBreakdown.MEDIUM}`,
    `- HIGH: ${dashboard.riskBreakdown.HIGH}`,
    `- CRITICAL: ${dashboard.riskBreakdown.CRITICAL}`,
    "",
  ];

  if (dashboard.alert) {
    lines.push(`## ⚠ Alert`);
    lines.push(dashboard.alert.message);
    lines.push("");
  }

  if (dashboard.activeEntries.length > 0) {
    lines.push("## Active Debt");
    for (const d of dashboard.activeEntries) {
      lines.push(`- **${d.debtId}** [${d.type}] ${d.riskAssessment}`);
      lines.push(`  Reason: ${d.reason}`);
      lines.push(`  Expires: ${new Date(d.expiryTs).toISOString()}`);
      lines.push(`  Policies: ${d.affectedPolicies.join(", ")}`);
    }
    lines.push("");
  }

  if (dashboard.expiredUnresolved.length > 0) {
    lines.push("## ⚠ Expired Without Resolution");
    for (const d of dashboard.expiredUnresolved) {
      lines.push(`- ${d.debtId} [${d.type}]: ${d.reason} (expired ${new Date(d.expiryTs).toISOString()})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
