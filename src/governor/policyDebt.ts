/**
 * Policy Debt Register
 *
 * Tracks temporary waivers, overrides, and exceptions with expiry, risk assessment,
 * and auto-escalation when debt expires without resolution.
 */

import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest, getSigningKey } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { readFileSync, readdirSync } from "node:fs";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { vaultStatus } from "../vault/vault.js";

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

function saveDebtEntry(workspace: string, entry: PolicyDebtEntry, bytes = JSON.stringify(entry, null, 2)): void {
  const dir = debtDir(workspace);
  ensureDir(dir);
  writeFileAtomic(debtFilePath(workspace, entry.debtId), bytes, 0o644);
}

/** Internal debt-family publication only: no Sign, initializer or await in the operation. */
export function withDebtPublicationLock<T>(workspace: string, operation: () => T): T {
  return withControlFileLock({ root: debtDir(workspace), name: "policy-debt", operation });
}
function captureDebtState(workspace: string, debtId: string) {
  try {
    const file = resolve(debtFilePath(workspace, debtId));
    return { file, head: getLastDebtHash(workspace), target: pathExists(file) ? readFileSync(file) : null };
  } catch { throw new Error("policy debt state is unreadable"); }
}
function assertDebtStateCurrent(workspace: string, debtId: string, before: ReturnType<typeof captureDebtState>): void {
  const current = captureDebtState(workspace, debtId);
  if (current.file !== before.file || current.head !== before.head || (before.target === null ? current.target !== null
    : current.target === null || !current.target.equals(before.target))) {
    throw new Error("policy debt predecessor or destination changed while signing was prepared; retry");
  }
}
function debtBody(params: Parameters<typeof addDebtEntry>[1], debtId: string, createdTs: number, prev_debt_hash: string) {
  return { debtId, type: params.type, reason: params.reason, expiryTs: params.expiryTs, affectedPolicies: params.affectedPolicies,
    riskAssessment: params.riskAssessment, agentId: params.agentId, createdTs, createdBy: params.createdBy,
    resolvedTs: null as number | null, resolved: false, prev_debt_hash };
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
  const before = captureDebtState(workspace, debtId);
  const body = debtBody(params, debtId, now, before.head);

  const debtHash = sha256Hex(canonicalize(body));
  let signature = "unsigned";
  try {
    signature = signHexDigest(debtHash, getSigningKey(workspace, "artifact-seal"));
  } catch { /* no key */ }

  const entry: PolicyDebtEntry = { ...body, debt_hash: debtHash, signature };
  const bytes = JSON.stringify(entry, null, 2);
  return withDebtPublicationLock(workspace, () => {
    assertDebtStateCurrent(workspace, debtId, before);
    saveDebtEntry(workspace, entry, bytes);
    return entry;
  });
}

/** Internal preparation used by both actual add layers; the captured body is never exposed before publication. */
export async function prepareDebtEntryAsync(workspace: string, params: Parameters<typeof addDebtEntry>[1],
  options: { beforePublish?: () => void } = {}): Promise<{ publish(): PolicyDebtEntry }> {
  const root = resolve(workspace), input = { ...params, affectedPolicies: [...params.affectedPolicies] }, beforePublish = options.beforePublish;
  beforePublish?.();
  const debtId = `dbt_${randomUUID().slice(0, 12)}`, now = Date.now(), before = captureDebtState(root, debtId);
  const body = debtBody(input, debtId, now, before.head), captured = capturePurposePublication(root, "artifact-seal");
  const hash = sha256Hex(canonicalize(body)), signed = await signWithPurposeKey(root, "artifact-seal", Buffer.from(hash, "hex"), { beforeSign: beforePublish });
  const assertVaultCurrent = () => { if (signed.provider === "file" && !vaultStatus(root).unlocked) throw new Error("🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup."); };
  beforePublish?.(); assertVaultCurrent();
  const entry: PolicyDebtEntry = { ...body, debt_hash: hash, signature: signed.signature.toString("base64") }, bytes = JSON.stringify(entry, null, 2);
  return Object.freeze({ publish(): PolicyDebtEntry {
    beforePublish?.(); assertVaultCurrent();
    assertPurposePublicationCurrent(root, captured, signed);
    assertDebtStateCurrent(root, debtId, before);
    saveDebtEntry(root, entry, bytes);
    return entry;
  } });
}

/** Maintained awaitable durable add; legacy unsigned behavior remains only in the synchronous API. */
export async function addDebtEntryAsync(workspace: string, params: Parameters<typeof addDebtEntry>[1]): Promise<PolicyDebtEntry> {
  const root = resolve(workspace), prepared = await prepareDebtEntryAsync(root, params);
  return withDebtPublicationLock(root, () => prepared.publish());
}

export function resolveDebtEntry(workspace: string, debtId: string): boolean {
  return withDebtPublicationLock(workspace, () => {
    const entry = loadDebtEntry(workspace, debtId);
    if (!entry) return false;
    entry.resolved = true;
    entry.resolvedTs = Date.now();
    saveDebtEntry(workspace, entry);
    return true;
  });
}

function loadDebtEntry(workspace: string, debtId: string): PolicyDebtEntry | null {
  const file = debtFilePath(workspace, debtId);
  if (!pathExists(file)) return null;
  return JSON.parse(readUtf8(file)) as PolicyDebtEntry;
}

function listActiveDebt(workspace: string, agentId?: string): PolicyDebtEntry[] {
  const now = Date.now();
  return loadAllDebt(workspace).filter((d) =>
    !d.resolved && d.expiryTs > now && (!agentId || d.agentId === agentId)
  );
}

function listExpiredUnresolved(workspace: string, agentId?: string): PolicyDebtEntry[] {
  const now = Date.now();
  return loadAllDebt(workspace).filter((d) =>
    !d.resolved && d.expiryTs <= now && (!agentId || d.agentId === agentId)
  );
}

/** Debt accumulation alert threshold */
const DEBT_THRESHOLD = 5;

function checkDebtAccumulation(workspace: string, agentId?: string): DebtAccumulationAlert {
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
