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
import { assertOverridePublicationCurrent, BreakGlassSigningError, prepareOverrideDigestSignature, signOverrideDigest, verifyOverrideDigest, type OverrideSignatureCheck } from "./overrideSignature.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { readdirSync, readFileSync } from "node:fs";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { capturePurposePublication } from "../keys/purposePublication.js";
import { assertKeysetComplete } from "../keys/keyset.js";
import { getSigningKey } from "../keys/signingKeys.js";
import { breakGlassAlerts } from "./breakGlass.js";

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
  const next = new Map<string, EmergencyOverrideEntry>(), hashes = new Set<string>();
  for (const entry of entries) {
    if (!verifyOverrideEntry(workspace, entry).valid || hashes.has(entry.override_hash) || next.has(entry.prev_override_hash)) throw new Error("override register has no unique verified chain");
    hashes.add(entry.override_hash); next.set(entry.prev_override_hash, entry);
  }
  let head = "GENESIS_OVERRIDES", visited = 0;
  while (next.has(head) && visited <= entries.length) { head = next.get(head)!.override_hash; visited++; }
  if (visited !== entries.length) throw new Error("override register has no unique verified chain");
  return head;
}

function overrideRegisterSnapshot(workspace: string): string {
  const dir = overrideDir(workspace);
  return pathExists(dir) ? canonicalize(readdirSync(dir).filter(name => name.endsWith(".json")).sort()
    .map(name => ({ name, sha256: sha256Hex(readFileSync(join(dir, name))) }))) : "[]";
}

function publishOverride(workspace: string, entry: EmergencyOverrideEntry, predecessor: string, assertAuthority: () => void): EmergencyOverrideEntry {
  return withControlFileLock({ root: overrideDir(workspace), name: "override-register", operation: () => {
    assertAuthority();
    if (overrideRegisterSnapshot(workspace) !== predecessor || getLastOverrideHash(workspace) !== entry.prev_override_hash) throw new Error("override register changed while signing was prepared; retry");
    if (!Number.isFinite(entry.expiresTs) || Date.now() > entry.expiresTs) throw new Error("override expired while signing was prepared");
    if (pathExists(overrideFilePath(workspace, entry.overrideId))) throw new Error("override publication destination already exists");
    saveOverride(workspace, entry); return entry;
  } });
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
  const predecessor = overrideRegisterSnapshot(workspace);
  let captured: ReturnType<typeof capturePurposePublication>;
  try { captured = capturePurposePublication(workspace, "config-signature"); }
  catch { throw new BreakGlassSigningError(); }
  const entry = prepareOverrideEntry(workspace, params);
  entry.signature = signOverrideDigest(workspace, entry.override_hash);
  return publishOverride(workspace, entry, predecessor, () => {
    if (canonicalize(assertKeysetComplete(workspace)) !== captured.keyset) throw new BreakGlassSigningError();
    getSigningKey(workspace, "config-signature");
  });
}

type OverrideActivationInput = Parameters<typeof activateOverride>[1];
function prepareOverrideEntry(workspace: string, params: OverrideActivationInput): EmergencyOverrideEntry {
  const maxTtl = params.maxTtlMs ?? MAX_TTL_MS;
  const ttl = Math.min(params.ttlMs, maxTtl);
  if (!Number.isFinite(ttl) || ttl <= 0) throw new Error("TTL must be finite and positive");
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
  const entry: EmergencyOverrideEntry = {
    ...body,
    actionLog: [],
    override_hash: overrideHash,
    signature: "",
  };

  return entry;
}

/** Actual async provider-backed activation. No override or lock directory is created before signing succeeds. */
export async function activateOverrideAsync(workspace: string, params: OverrideActivationInput): Promise<EmergencyOverrideEntry> {
  const input = { ...params }, predecessor = overrideRegisterSnapshot(workspace), entry = prepareOverrideEntry(workspace, input);
  const prepared = await prepareOverrideDigestSignature(workspace, entry.override_hash);
  entry.signature = prepared.signed.signature.toString("base64");
  return publishOverride(workspace, entry, predecessor, () => assertOverridePublicationCurrent(workspace, prepared.captured, prepared.signed));
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
 * Generate alerts for legacy override states and for signed break-glass records (P2-24): an overdue post-hoc review is
 * `POSTMORTEM_OVERDUE`, and a break-glass file that does not verify is `INVALID_SIGNATURE`.
 */
export function getOverrideAlerts(workspace: string, agentId: string): OverrideAlert[] {
  const now = Date.now();
  const all = loadAllOverrides(workspace).filter((o) => o.agentId === agentId);
  const alerts: OverrideAlert[] = [...breakGlassAlerts(workspace, agentId, now)];

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
