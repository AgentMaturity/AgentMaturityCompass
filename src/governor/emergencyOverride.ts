/**
 * Emergency Override Mode
 *
 * Signed, TTL-limited bypass of governance controls.
 * Requires a verifiable auditor signature + explicit reason; an override whose
 * signature does not verify is reported as INVALID_SIGNATURE and never honoured.
 * Mandatory postmortem artifact within 48h of override expiry.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signOverrideDigest, verifyOverrideDigest, type OverrideSignatureCheck } from "./overrideSignature.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { readdirSync } from "node:fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OverrideMode = "execute" | "dry-run";

export interface EmergencyOverrideEntry {
  overrideId: string;
  agentId: string;
  reason: string;
  ttlMs: number;
  mode: OverrideMode;
  startedTs: number;
  expiresTs: number;
  active: boolean;
  /** All actions during override are logged with this flag */
  actionLog: OverrideAction[];
  postmortemRequired: boolean;
  postmortemDueTs: number;     // 48h after expiry
  postmortemFiled: boolean;
  postmortemArtifactPath: string | null;
  prev_override_hash: string;
  override_hash: string;
  signature: string;
}

export interface OverrideAction {
  actionId: string;
  ts: number;
  actionType: string;
  details: string;
  flag: "OVERRIDE";
}

export interface OverrideAlert {
  overrideId: string;
  agentId: string;
  alertType: "ACTIVE" | "EXPIRING_SOON" | "POSTMORTEM_DUE" | "POSTMORTEM_OVERDUE" | "INVALID_SIGNATURE";
  message: string;
  ts: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TTL_MS = 24 * 60 * 60 * 1000;         // 24h default max
const POSTMORTEM_DEADLINE_MS = 48 * 60 * 60 * 1000; // 48h after expiry

// ---------------------------------------------------------------------------
// File-based Store
// ---------------------------------------------------------------------------

function overrideDir(workspace: string): string {
  return join(workspace, ".amc", "governor", "overrides");
}

function overrideFilePath(workspace: string, overrideId: string): string {
  return join(overrideDir(workspace), `${overrideId}.json`);
}

function loadAllOverrides(workspace: string): EmergencyOverrideEntry[] {
  const dir = overrideDir(workspace);
  if (!pathExists(dir)) return [];
  return readdirSync(dir)
    .filter((f: string) => f.endsWith(".json"))
    .map((f: string) => JSON.parse(readUtf8(join(dir, f))) as EmergencyOverrideEntry);
}

function saveOverride(workspace: string, entry: EmergencyOverrideEntry): void {
  const dir = overrideDir(workspace);
  ensureDir(dir);
  writeFileAtomic(overrideFilePath(workspace, entry.overrideId), JSON.stringify(entry, null, 2), 0o644);
}

function getLastOverrideHash(workspace: string): string {
  const entries = loadAllOverrides(workspace);
  if (entries.length === 0) return "GENESIS_OVERRIDES";
  const sorted = entries.sort((a, b) => a.startedTs - b.startedTs);
  return sorted[sorted.length - 1]!.override_hash;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Activate an emergency override. Requires explicit reason.
 * TTL is clamped to MAX_TTL_MS (configurable).
 */
export function activateOverride(
  workspace: string,
  params: {
    agentId: string;
    reason: string;
    ttlMs: number;
    mode: OverrideMode;
    maxTtlMs?: number;
  },
): EmergencyOverrideEntry {
  const maxTtl = params.maxTtlMs ?? MAX_TTL_MS;
  const ttl = Math.min(params.ttlMs, maxTtl);
  if (ttl <= 0) throw new Error("TTL must be positive");
  if (!params.reason || params.reason.trim().length < 10) {
    throw new Error("Emergency override requires a meaningful reason (>= 10 chars)");
  }

  const overrideId = `eor_${randomUUID().slice(0, 12)}`;
  const now = Date.now();
  const prevHash = getLastOverrideHash(workspace);

  const body = {
    overrideId,
    agentId: params.agentId,
    reason: params.reason,
    ttlMs: ttl,
    mode: params.mode,
    startedTs: now,
    expiresTs: now + ttl,
    active: true,
    postmortemRequired: true,
    postmortemDueTs: now + ttl + POSTMORTEM_DEADLINE_MS,
    postmortemFiled: false,
    postmortemArtifactPath: null as string | null,
    prev_override_hash: prevHash,
  };

  const overrideHash = sha256Hex(canonicalize(body));
  // Throws before anything is written: unsigned overrides are never recorded.
  const signature = signOverrideDigest(workspace, overrideHash);

  const entry: EmergencyOverrideEntry = {
    ...body,
    actionLog: [],
    override_hash: overrideHash,
    signature,
  };

  saveOverride(workspace, entry);
  return entry;
}

/**
 * Log an action taken during an active override.
 */
export function logOverrideAction(
  workspace: string,
  overrideId: string,
  actionType: string,
  details: string,
): OverrideAction | null {
  const entry = loadOverride(workspace, overrideId);
  if (!entry || !entry.active || !verifyOverrideEntry(workspace, entry).valid) return null;

  const action: OverrideAction = {
    actionId: `oa_${randomUUID().slice(0, 8)}`,
    ts: Date.now(),
    actionType,
    details,
    flag: "OVERRIDE",
  };

  entry.actionLog.push(action);
  saveOverride(workspace, entry);
  return action;
}

/**
 * File a postmortem for an override.
 */
export function fileOverridePostmortem(
  workspace: string,
  overrideId: string,
  artifactPath: string,
): boolean {
  const entry = loadOverride(workspace, overrideId);
  if (!entry) return false;
  entry.postmortemFiled = true;
  entry.postmortemArtifactPath = artifactPath;
  saveOverride(workspace, entry);
  return true;
}

function loadOverride(workspace: string, overrideId: string): EmergencyOverrideEntry | null {
  const file = overrideFilePath(workspace, overrideId);
  if (!pathExists(file)) return null;
  return JSON.parse(readUtf8(file)) as EmergencyOverrideEntry;
}

/**
 * Checks an override against its activation-time body. `active`,
 * `postmortemFiled` and `postmortemArtifactPath` change after signing, so the
 * hash is recomputed with their activation values, not over the current file.
 */
export function verifyOverrideEntry(workspace: string, entry: EmergencyOverrideEntry): OverrideSignatureCheck {
  const body = {
    overrideId: entry.overrideId,
    agentId: entry.agentId,
    reason: entry.reason,
    ttlMs: entry.ttlMs,
    mode: entry.mode,
    startedTs: entry.startedTs,
    expiresTs: entry.expiresTs,
    active: true,
    postmortemRequired: true,
    postmortemDueTs: entry.postmortemDueTs,
    postmortemFiled: false,
    postmortemArtifactPath: null,
    prev_override_hash: entry.prev_override_hash,
  };
  if (sha256Hex(canonicalize(body)) !== entry.override_hash) {
    return { valid: false, code: "HASH_MISMATCH", reason: "the override does not match the hash recorded at activation" };
  }
  return verifyOverrideDigest(workspace, entry.override_hash, entry.signature);
}

/**
 * Get active overrides for an agent, expiring inactive ones. Only overrides
 * whose signature verifies count.
 */
export function getActiveOverrides(workspace: string, agentId: string): EmergencyOverrideEntry[] {
  const now = Date.now();
  const all = loadAllOverrides(workspace).filter(
    (o) => o.agentId === agentId && verifyOverrideEntry(workspace, o).valid,
  );

  // Auto-expire
  for (const o of all) {
    if (o.active && now > o.expiresTs) {
      o.active = false;
      saveOverride(workspace, o);
    }
  }

  return all.filter((o) => o.active && now <= o.expiresTs);
}

/**
 * Check if any override is active for an agent.
 */
export function isOverrideActive(workspace: string, agentId: string): boolean {
  return getActiveOverrides(workspace, agentId).length > 0;
}

/**
 * Generate alerts for override states.
 */
export function getOverrideAlerts(workspace: string, agentId: string): OverrideAlert[] {
  const now = Date.now();
  const all = loadAllOverrides(workspace).filter((o) => o.agentId === agentId);
  const alerts: OverrideAlert[] = [];

  for (const o of all) {
    const check = verifyOverrideEntry(workspace, o);
    if (!check.valid) {
      alerts.push({
        overrideId: o.overrideId,
        agentId,
        alertType: "INVALID_SIGNATURE",
        message: `Override ${o.overrideId} is not honoured: ${check.code} (${check.reason}). Overrides recorded without a key by AMC 1.2.0 or earlier are invalid; re-issue it with a signing key if it is still needed.`,
        ts: now,
      });
      continue;
    }
    if (o.active && now <= o.expiresTs) {
      alerts.push({
        overrideId: o.overrideId,
        agentId,
        alertType: "ACTIVE",
        message: `Emergency override ${o.overrideId} is active. Reason: ${o.reason}. Expires: ${new Date(o.expiresTs).toISOString()}`,
        ts: now,
      });

      // Check if expiring soon (< 1h)
      if (o.expiresTs - now < 60 * 60 * 1000) {
        alerts.push({
          overrideId: o.overrideId,
          agentId,
          alertType: "EXPIRING_SOON",
          message: `Emergency override ${o.overrideId} expires in ${Math.round((o.expiresTs - now) / 60000)} minutes`,
          ts: now,
        });
      }
    }

    // Check postmortem status for expired overrides
    if (!o.active || now > o.expiresTs) {
      if (!o.postmortemFiled) {
        if (now > o.postmortemDueTs) {
          alerts.push({
            overrideId: o.overrideId,
            agentId,
            alertType: "POSTMORTEM_OVERDUE",
            message: `OVERDUE: Postmortem for override ${o.overrideId} was due ${new Date(o.postmortemDueTs).toISOString()}`,
            ts: now,
          });
        } else if (now > o.expiresTs) {
          alerts.push({
            overrideId: o.overrideId,
            agentId,
            alertType: "POSTMORTEM_DUE",
            message: `Postmortem required for override ${o.overrideId} by ${new Date(o.postmortemDueTs).toISOString()}`,
            ts: now,
          });
        }
      }
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderOverrideMarkdown(entry: EmergencyOverrideEntry): string {
  const lines: string[] = [
    "# Emergency Override",
    "",
    `- Override ID: ${entry.overrideId}`,
    `- Agent: ${entry.agentId}`,
    `- Mode: ${entry.mode}`,
    `- Reason: ${entry.reason}`,
    `- Active: ${entry.active}`,
    `- Started: ${new Date(entry.startedTs).toISOString()}`,
    `- Expires: ${new Date(entry.expiresTs).toISOString()}`,
    `- TTL: ${Math.round(entry.ttlMs / 3600000)}h`,
    `- Postmortem filed: ${entry.postmortemFiled}`,
    `- Postmortem due: ${new Date(entry.postmortemDueTs).toISOString()}`,
    "",
  ];

  if (entry.actionLog.length > 0) {
    lines.push("## Actions Taken During Override");
    for (const a of entry.actionLog) {
      lines.push(`- [${a.flag}] ${new Date(a.ts).toISOString()} ${a.actionType}: ${a.details}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function renderOverrideAlertsMarkdown(alerts: OverrideAlert[]): string {
  if (alerts.length === 0) return "No override alerts.";
  const lines: string[] = ["# Override Alerts", ""];
  for (const a of alerts) {
    lines.push(`- [${a.alertType}] ${a.message}`);
  }
  return lines.join("\n");
}
