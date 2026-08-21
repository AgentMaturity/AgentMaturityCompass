/**
 * Rollback packs and emergency overrides.
 *
 * Split out of policyCanary.ts, which had grown past its line budget while
 * gaining persistence. Both registers previously accepted a `workspace` but
 * used it only to sign, never to store, so `amc rollback-create` and
 * `amc emergency-override` reported success and `amc canary-report` then
 * showed "Rollback packs: 0 / Active overrides: 0" — and an override that
 * required a postmortem disappeared from the drift report that chases it.
 */
import { randomUUID } from "node:crypto";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest, getPrivateKeyPem } from "../crypto/keys.js";
import {
  saveWorkspaceRecord,
  loadWorkspaceRecords,
  updateWorkspaceRecord
} from "../storage/workspaceRecordStore.js";
// Type-only, so it is erased at compile time and creates no runtime cycle with
// policyCanary.ts, which imports the values from here.
import type { RollbackPack, EmergencyOverride } from "./policyCanary.js";

/** Where canary governance records live under .amc/. */
const ROLLBACK_PACKS_AT = { area: ["governor"], kind: "rollback-packs" };
const OVERRIDES_AT = { area: ["governor"], kind: "emergency-overrides" };

/** Clears the in-process caches. Used by resetPolicyCanaryState(). */
export function resetCanaryRegisters(): void {
  rollbackPacks.length = 0;
  emergencyOverrides.length = 0;
}

// ---------------------------------------------------------------------------
// Rollback packs
// ---------------------------------------------------------------------------

/**
 * In-process cache. The `workspace` argument was used only for signing, never
 * for persistence, so `amc rollback-create` reported success and
 * `amc canary-report` then said "Rollback packs: 0".
 */
const rollbackPacks: RollbackPack[] = [];

/**
 * Create a rollback pack — a signed snapshot of a known-good policy.
 */
export function createRollbackPack(
  agentId: string,
  policyContent: string,
  reason: string,
  workspace?: string,
): RollbackPack {
  const packId = `rbp_${randomUUID().slice(0, 12)}`;
  const policyFileSha256 = sha256Hex(policyContent);
  const now = Date.now();

  const body = { packId, agentId, policyFileSha256, reason, createdTs: now };
  const digest = sha256Hex(canonicalize(body));

  let signature = "unsigned";
  if (workspace) {
    try {
      signature = signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
    } catch { /* no key */ }
  }

  const pack: RollbackPack = {
    ...body,
    policyContent,
    signature,
  };

  rollbackPacks.push(pack);
  if (workspace) {
    saveWorkspaceRecord(workspace, ROLLBACK_PACKS_AT, pack.packId, { ...pack }, now);
  }
  return pack;
}

/** Live entries plus any persisted earlier, deduped by id. */
function mergeStored<T>(live: T[], stored: T[], id: (item: T) => string): T[] {
  const seen = new Set(live.map(id));
  return [...live, ...stored.filter((item) => !seen.has(id(item)))];
}

/**
 * Get all rollback packs for an agent.
 */
export function getRollbackPacks(agentId: string, workspace?: string): RollbackPack[] {
  const all = mergeStored(
    rollbackPacks,
    workspace ? loadWorkspaceRecords<RollbackPack>(workspace, ROLLBACK_PACKS_AT) : [],
    (p) => p.packId
  );
  return all.filter((p) => p.agentId === agentId).sort((a, b) => a.createdTs - b.createdTs);
}

/**
 * Get the latest rollback pack for an agent.
 */
export function getLatestRollbackPack(agentId: string, workspace?: string): RollbackPack | null {
  const packs = getRollbackPacks(agentId, workspace);
  return packs.length > 0 ? packs[packs.length - 1]! : null;
}

// ---------------------------------------------------------------------------
// Emergency overrides
// ---------------------------------------------------------------------------

/**
 * In-process cache; see rollbackPacks above. An override that vanished also
 * disappeared from `governance-drift`, so the postmortem it required was never
 * chased.
 */
const emergencyOverrides: EmergencyOverride[] = [];

/**
 * Activate an emergency override with strict TTL.
 */
export function activateEmergencyOverride(
  params: {
    agentId: string;
    reason: string;
    actionDescription: string;
    ttlMs: number;
  },
  workspace?: string,
): EmergencyOverride {
  const overrideId = `emo_${randomUUID().slice(0, 12)}`;
  const now = Date.now();

  const body = {
    overrideId,
    agentId: params.agentId,
    reason: params.reason,
    actionDescription: params.actionDescription,
    ttlMs: params.ttlMs,
    startedTs: now,
    expiresTs: now + params.ttlMs,
  };

  const digest = sha256Hex(canonicalize(body));
  let signature = "unsigned";
  if (workspace) {
    try {
      signature = signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
    } catch { /* no key */ }
  }

  const override: EmergencyOverride = {
    ...body,
    postmortemFiled: false,
    postmortemArtifactId: null,
    signature,
  };

  emergencyOverrides.push(override);
  if (workspace) {
    saveWorkspaceRecord(workspace, OVERRIDES_AT, override.overrideId, { ...override }, now);
  }
  return override;
}

/** Live overrides plus any persisted earlier. */
function allOverrides(workspace?: string): EmergencyOverride[] {
  return mergeStored(
    emergencyOverrides,
    workspace ? loadWorkspaceRecords<EmergencyOverride>(workspace, OVERRIDES_AT) : [],
    (o) => o.overrideId
  );
}

/**
 * Check if an emergency override is currently active for an agent.
 */
export function getActiveOverrides(agentId: string, workspace?: string): EmergencyOverride[] {
  const now = Date.now();
  return allOverrides(workspace).filter((o) => o.agentId === agentId && o.expiresTs > now);
}

/**
 * File a postmortem for an emergency override.
 */
export function filePostmortem(
  overrideId: string,
  artifactId: string,
  workspace?: string,
): boolean {
  const live = emergencyOverrides.find((o) => o.overrideId === overrideId);
  const override = live ?? allOverrides(workspace).find((o) => o.overrideId === overrideId);
  if (!override) return false;
  override.postmortemFiled = true;
  override.postmortemArtifactId = artifactId;
  if (live) {
    live.postmortemFiled = true;
    live.postmortemArtifactId = artifactId;
  }
  if (workspace) {
    updateWorkspaceRecord(workspace, OVERRIDES_AT, override.overrideId, { ...override }, Date.now());
  }
  return true;
}

/**
 * Get overrides missing postmortems.
 */
export function getOverridesMissingPostmortem(agentId: string, workspace?: string): EmergencyOverride[] {
  const now = Date.now();
  return allOverrides(workspace).filter(
    (o) => o.agentId === agentId && o.expiresTs <= now && !o.postmortemFiled,
  );
}
