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
import { resolve } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest, getSigningKey } from "../crypto/keys.js";
import { BreakGlassSigningError, prepareOverrideDigestSignature, signOverrideDigest, verifyOverrideDigest } from "./overrideSignature.js";
import { canaryOverrideDigest as overrideDigest, publishCanaryOverride } from "./canaryOverridePublication.js";
import { saveWorkspaceRecord, loadWorkspaceRecords, captureWorkspaceRecordPredecessor, prepareWorkspaceRecordAsync, withWorkspaceRecordPublicationLock } from "../storage/workspaceRecordStore.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
// Type-only, so it is erased at compile time and creates no runtime cycle with
// policyCanary.ts, which imports the values from here.
import type { RollbackPack, EmergencyOverride } from "./policyCanary.js";

/** Where canary governance records live under .amc/. */
const ROLLBACK_PACKS_AT = { area: ["governor"], kind: "rollback-packs" };
const OVERRIDES_AT = { area: ["governor"], kind: "emergency-overrides" };

/** Clears the in-process rollback-pack cache. Used by resetPolicyCanaryState(). */
export function resetCanaryRegisters(): void {
  rollbackPacks.length = 0;
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
      signature = signHexDigest(digest, getSigningKey(workspace, "artifact-seal"));
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

/** Two checked signatures before durable publication; the retained synchronous API keeps its legacy unsigned behavior. */
export async function createRollbackPackAsync(agentId: string, policyContent: string, reason: string, workspace?: string): Promise<RollbackPack> {
  if (!workspace) return createRollbackPack(agentId, policyContent, reason, workspace);
  const root = resolve(workspace), now = Date.now();
  const body = { packId: `rbp_${randomUUID().slice(0, 12)}`, agentId, policyFileSha256: sha256Hex(policyContent), reason, createdTs: now };
  const captured = capturePurposePublication(root, "artifact-seal");
  const signed = await signWithPurposeKey(root, "artifact-seal", Buffer.from(sha256Hex(canonicalize(body)), "hex"));
  const pack: RollbackPack = { ...body, policyContent, signature: signed.signature.toString("base64") };
  const prepared = await prepareWorkspaceRecordAsync(root, ROLLBACK_PACKS_AT, pack.packId, { ...pack }, now, undefined,
    { beforePublish: () => assertPurposePublicationCurrent(root, captured, signed) });
  return withWorkspaceRecordPublicationLock(root, ROLLBACK_PACKS_AT, () => {
    assertPurposePublicationCurrent(root, captured, signed);
    prepared.publish();
    rollbackPacks.push(pack);
    return pack;
  });
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

// Overrides live only in the workspace record store. Activation always needs a
// workspace, and an in-process cache not keyed by workspace leaked one
// workspace's overrides into another's report, where they failed verification.

function isVerified(o: EmergencyOverride, workspace?: string): boolean {
  return workspace !== undefined && verifyOverrideDigest(workspace, overrideDigest(o), o.signature).valid;
}

/**
 * The record store replaces `signature` with its own record signature, so the
 * override's signature is persisted as `override_signature` and restored on load.
 */
function persistOverride(workspace: string, o: EmergencyOverride, now: number): void {
  saveWorkspaceRecord(workspace, OVERRIDES_AT, o.overrideId, { ...o, override_signature: o.signature }, now);
}

/**
 * Activate an emergency override with strict TTL. Throws BreakGlassSigningError
 * unless the workspace auditor key signs it; nothing is recorded on failure.
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

  if (workspace === undefined) {
    throw new BreakGlassSigningError("Emergency override requires a workspace with an auditor signing key");
  }
  const signature = signOverrideDigest(workspace, sha256Hex(canonicalize(body)));

  const override: EmergencyOverride = {
    ...body,
    postmortemFiled: false,
    postmortemArtifactId: null,
    signature,
  };

  persistOverride(workspace, override, now);
  return override;
}

/** Actual runtime activation: config-purpose domain signature and artifact-purpose record signature both precede publication. */
export async function activateEmergencyOverrideAsync(params: Parameters<typeof activateEmergencyOverride>[0], workspace?: string): Promise<EmergencyOverride> {
  if (workspace === undefined) throw new BreakGlassSigningError("Emergency override requires a workspace with an auditor signing key");
  const input = { ...params }, now = Date.now();
  if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0) throw new Error("canary override TTL must be finite and positive");
  const body = { overrideId: `emo_${randomUUID().slice(0, 12)}`, agentId: input.agentId, reason: input.reason,
    actionDescription: input.actionDescription, ttlMs: input.ttlMs, startedTs: now, expiresTs: now + input.ttlMs };
  const prepared = await prepareOverrideDigestSignature(workspace, overrideDigest(body));
  const override: EmergencyOverride = { ...body, postmortemFiled: false, postmortemArtifactId: null, signature: prepared.signed.signature.toString("base64") };
  return publishCanaryOverride(workspace, override, prepared);
}

/** The workspace's stored overrides, verified or not; none without a workspace (not evaluated). */
function allOverrides(workspace?: string): EmergencyOverride[] {
  return workspace
    ? loadWorkspaceRecords<EmergencyOverride & { override_signature?: string }>(workspace, OVERRIDES_AT)
      .map((o) => ({ ...o, signature: o.override_signature ?? "" }))
    : [];
}

/** Overrides whose signature verifies against the workspace auditor key history. */
function verifiedOverrides(agentId: string, workspace?: string): EmergencyOverride[] {
  return allOverrides(workspace).filter((o) => o.agentId === agentId && isVerified(o, workspace));
}

/** Overrides that are never honoured because their signature does not verify. */
export function getInvalidOverrides(agentId: string, workspace?: string): EmergencyOverride[] {
  return allOverrides(workspace).filter((o) => o.agentId === agentId && !isVerified(o, workspace));
}

/**
 * Check if an emergency override is currently active for an agent. Only
 * verified overrides count, so without a workspace none do.
 */
export function getActiveOverrides(agentId: string, workspace?: string): EmergencyOverride[] {
  const now = Date.now();
  return verifiedOverrides(agentId, workspace).filter((o) => o.expiresTs > now);
}

/**
 * File a postmortem for an emergency override.
 */
export function filePostmortem(
  overrideId: string,
  artifactId: string,
  workspace?: string,
): boolean {
  const override = allOverrides(workspace).find((o) => o.overrideId === overrideId);
  if (!workspace || !override) return false;
  persistOverride(workspace, { ...override, postmortemFiled: true, postmortemArtifactId: artifactId }, Date.now());
  return true;
}

/** Checked outer-record replacement; the existing override domain signature and read admission are unchanged. */
export async function filePostmortemAsync(overrideId: string, artifactId: string, workspace?: string): Promise<boolean> {
  if (!workspace || !allOverrides(workspace).some(override => override.overrideId === overrideId)) return false;
  const root = resolve(workspace), ownId = overrideId, ownArtifactId = artifactId;
  const predecessor = captureWorkspaceRecordPredecessor(root, OVERRIDES_AT, ownId);
  let stored: (EmergencyOverride & { override_signature?: string }) | null = null;
  try { stored = predecessor.target === null ? null : JSON.parse(predecessor.target.toString("utf8")) as EmergencyOverride & { override_signature?: string }; } catch { /* Unreadable legacy records are not selected. */ }
  if (stored === null || stored.overrideId !== ownId) return false;
  const override = { ...stored, signature: stored.override_signature ?? "" };
  const next = { ...override, postmortemFiled: true, postmortemArtifactId: ownArtifactId };
  const prepared = await prepareWorkspaceRecordAsync(root, OVERRIDES_AT, ownId, { ...next, override_signature: next.signature }, Date.now(), predecessor);
  return withWorkspaceRecordPublicationLock(root, OVERRIDES_AT, () => {
    prepared.publish();
    return true;
  });
}

/**
 * Get overrides missing postmortems.
 */
export function getOverridesMissingPostmortem(agentId: string, workspace?: string): EmergencyOverride[] {
  const now = Date.now();
  return verifiedOverrides(agentId, workspace).filter((o) => o.expiresTs <= now && !o.postmortemFiled);
}
