/** Internal artifact/blob owner anchors. No first-bind CLI/SDK or arbitrary signing authority. */
import { statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { publicKeyFromPrivate, verifyKeyHistoryEnvelope } from "../crypto/keyHistoryEnvelope.js";
import { assertPolicySignerCurrent, describePolicySigner, type PolicySignerDescriptor } from "../crypto/signing/signer.js";
import { assertOwnerMode } from "../mode/mode.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { readContainedOrNull } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { getVaultPurposeKeyPem, markWrittenHistories, vaultStatus } from "../vault/vault.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { appendTransparencyEntryAsync, captureArtifactBindingPredecessor } from "../transparency/asyncWorkspaceAppend.js";
import { TransparencyMerkleLagError } from "../transparency/merkleIndexState.js";
import { publishTransparencyState, stateBytes, workspaceLogPath } from "../transparency/workspacePublication.js";
import { anchorArtifact, markSequence, type AnchorTarget } from "./anchors.js";
import { signingKeyId } from "./algorithmPolicy.js";
import { readBlobAuthorityState } from "./blobIndexState.js";
import { assertKeysetComplete, boundProviderKey, keysetCommittedMark, keysetFileRel, type Keyset, type KeysetWrite } from "./keyset.js";
import { CONFIG_REL } from "./keysConfig.js";
import { keyRevocationLocation } from "./keyRevocations.js";
import type { ProviderPurposeRotationPlan } from "./purposeKeys.js";
import { parseRotationStatement } from "./rotationStatement.js";
import { encodeSignedRevocationList, readAnchoredRevocationList, readStagedRevocationList } from "./revocationList.js";
import { getSigningPublicKeyPem } from "./signingKeys.js";

const HISTORY = "keys/artifact-seal_history.json", MAX_KEY = 256 * 1024 * 1024;
type Snapshot = ReturnType<typeof captureArtifactBindingPredecessor>;
type Target = { target: Omit<AnchorTarget, "fileSha256" | "entryHash">; history?: KeysetWrite };
type Commit = { generation: number; keyset: Keyset };
type Completion = Commit & { rotation: ProviderPurposeRotationPlan | null; historyWrites: readonly KeysetWrite[] };
declare const opaqueBoundary: unique symbol;
export interface ArtifactBlobAnchorBoundary {
  readonly [opaqueBoundary]: true;
  assertPreparedCurrent(): void;
  withAnchorBoundary<T>(operation: () => T): T;
  complete(input: Completion): Promise<void>;
}
const boundaries = new WeakMap<object, { workspace: string; previousPublicKeyPem: string; assertCurrent: () => void }>();

export class ArtifactAnchorRepairRequiredError extends Error {
  readonly code = "REPAIR_REQUIRED";
  constructor(cause?: unknown) {
    super("workspace transparency signed coverage is incomplete; repair it before artifact anchoring", { cause });
    this.name = "ArtifactAnchorRepairRequiredError";
  }
}
export class ArtifactBlobAnchoringError extends Error {
  readonly code = "ARTIFACT_BLOB_ANCHOR_INCOMPLETE";
  readonly committed = true;
  readonly entryHash: string | undefined;
  readonly pendingRecorded: boolean | undefined;
  constructor(readonly generation: number, readonly phase: string, cause: unknown,
    readonly completedTargets: readonly { type: string; id: string; sequence: number; sha256: string }[] = [], entryHash?: string) {
    super("the artifact/blob generation is committed but its workspace anchor did not complete", { cause });
    this.name = "ArtifactBlobAnchoringError";
    this.entryHash = cause instanceof TransparencyMerkleLagError ? cause.entryHash : entryHash;
    this.pendingRecorded = cause instanceof TransparencyMerkleLagError ? cause.pendingRecorded : undefined;
  }
}

function snapshot(workspace: string): Snapshot {
  let value: Snapshot;
  try { value = captureArtifactBindingPredecessor(workspace); }
  catch (cause) { throw new ArtifactAnchorRepairRequiredError(cause); }
  if (value.signedRootLeafCount !== value.entries.length) throw new ArtifactAnchorRepairRequiredError();
  return value;
}
const optional = (workspace: string, path: string, max = MAX_KEY) => readContainedOrNull(workspace, path, max);
function ownerInputs(workspace: string): string {
  const location = keyRevocationLocation(workspace), list = readAnchoredRevocationList(location), pending = readStagedRevocationList(location);
  if (list === null) throw new Error("the workspace key revocation list is missing; restore it before artifact anchoring");
  const digest = (bytes: Buffer | null) => bytes === null ? null : sha256Hex(bytes);
  return canonicalize({ vault: digest(optional(workspace, ".amc/vault.amcvault")),
    config: digest(optional(workspace, CONFIG_REL, 1024 * 1024)), signature: digest(optional(workspace, `${CONFIG_REL}.sig`, 64 * 1024)),
    revocations: digest(encodeSignedRevocationList(list)), pending: pending === null ? null : digest(encodeSignedRevocationList(pending)) });
}
function owner(workspace: string, command: "keys rotate" | "keys resume") {
  assertOwnerMode(workspace, command);
  if (process.env.AMC_NO_SIGN === "1") throw new Error("artifact anchoring is unavailable in no-sign mode");
  if (!vaultStatus(workspace).unlocked) throw new Error("the vault is locked; artifact anchoring requires the original owner");
  const publicKeyPem = publicKeyFromPrivate(getVaultPurposeKeyPem(workspace, "artifact-seal"));
  if (publicKeyPem !== getSigningPublicKeyPem(workspace, "artifact-seal")) throw new Error("the vault artifact owner differs from its committed public key");
  const inputs = ownerInputs(workspace);
  return () => {
    assertOwnerMode(workspace, command);
    if (process.env.AMC_NO_SIGN === "1") throw new Error("artifact anchoring is unavailable in no-sign mode");
    if (!vaultStatus(workspace).unlocked || publicKeyFromPrivate(getVaultPurposeKeyPem(workspace, "artifact-seal")) !== publicKeyPem) throw new Error("the original artifact owner is no longer available");
    if (ownerInputs(workspace) !== inputs) throw new Error("the original vault, signed config or revocations changed during artifact anchoring");
  };
}
const descriptors = (workspace: string) => [
  describePolicySigner(workspace, "TRANSPARENCY_ROOT"), describePolicySigner(workspace, "MERKLE_ROOT")
];
function assertPolicy(workspace: string, policy: string, expected: readonly PolicySignerDescriptor[]): void {
  for (const descriptor of expected) assertPolicySignerCurrent(workspace, descriptor);
  if (JSON.stringify(loadTrustConfig(workspace)) !== policy) throw new Error("the original workspace signing policy changed during artifact anchoring");
}
function assertCommitted(workspace: string, expected: Keyset): void {
  const current = assertKeysetComplete(workspace), mark = keysetCommittedMark(workspace), bytes = canonicalize(expected);
  if (current === null || canonicalize(current) !== bytes || mark?.sequence !== expected.generation || mark.sha256 !== sha256Hex(bytes)) {
    throw new Error("artifact anchoring requires the exact current locally committed keyset identity");
  }
}
function readPinned(workspace: string, keyset: Keyset, rel: string): Buffer {
  const bytes = optional(workspace, keysetFileRel(rel));
  if (bytes === null || keyset.files[rel] !== sha256Hex(bytes)) throw new Error("an artifact anchor target is missing or is not pinned by the committed generation");
  return bytes;
}
function historyTarget(workspace: string, keyset: Keyset): Target {
  const bytes = readPinned(workspace, keyset, HISTORY), publicKeyPem = getSigningPublicKeyPem(workspace, "artifact-seal");
  const envelope = verifyKeyHistoryEnvelope(JSON.parse(bytes.toString("utf8")), "artifact-seal", publicKeyPem).envelope;
  if (envelope === null) throw new Error("the committed exact artifact history is not authenticated");
  const binding = boundProviderKey(workspace, "artifact-seal");
  if (binding === null || !envelope.entries.some(entry => entry.publicKeyPem === binding.publicKeyPem)) throw new Error("the committed artifact history omits its provider issuer");
  return { target: { workspace, type: "KEY_HISTORY_REVISION", id: `${workspaceIdFromDirectory(workspace)}:artifact-seal`,
    sequence: envelope.revision, sha256: sha256Hex(canonicalize(envelope)) },
    history: { path: join(workspace, ".amc", HISTORY), bytes, mode: statSync(join(workspace, ".amc", HISTORY)).mode & 0o777 } };
}
function latestRotation(workspace: string, keyset: Keyset): Target | null {
  const paths = Object.keys(keyset.files).filter(path => /^keys\/statements\/artifact-seal\/[1-9][0-9]{0,15}\.json$/.test(path))
    .sort((a, b) => Number(a.split("/").at(-1)!.slice(0, -5)) - Number(b.split("/").at(-1)!.slice(0, -5)));
  const path = paths.at(-1);
  if (path === undefined) return null;
  const bytes = readPinned(workspace, keyset, path), signed = parseRotationStatement(bytes), binding = boundProviderKey(workspace, "artifact-seal");
  if (signed.statement.workspaceId !== workspaceIdFromDirectory(workspace) || signed.statement.purpose !== "artifact-seal"
    || signed.statement.nextKeyId !== binding?.binding.keyId || path !== `keys/statements/artifact-seal/${signed.statement.sequence}.json`) {
    throw new Error("the committed artifact rotation target is not its current provider issuer");
  }
  return { target: { workspace, type: "KEY_ROTATION", id: `${workspaceIdFromDirectory(workspace)}:artifact-seal`,
    sequence: signed.statement.sequence, sha256: sha256Hex(bytes) } };
}
function committedTargets(workspace: string, keyset: Keyset): Target[] {
  const state = readBlobAuthorityState(workspace);
  if (state === null) throw new Error("artifact anchor recovery requires a committed blob authority");
  const rotation = latestRotation(workspace, keyset);
  return [...(rotation === null ? [] : [rotation]), historyTarget(workspace, keyset)];
}
function completeTarget(predecessor: Snapshot, target: Target["target"]): boolean {
  const artifact = anchorArtifact(target);
  let found = false;
  for (const entry of predecessor.entries) {
    if (entry.type !== target.type || entry.artifact.kind !== artifact.kind || !entry.artifact.id?.startsWith(`${target.id}#`)) continue;
    const sequence = Number(entry.artifact.id.slice(target.id.length + 1));
    if (sequence > target.sequence || (sequence === target.sequence && entry.artifact.sha256 !== target.sha256)) throw new Error("the workspace anchor is ahead of or forks its committed artifact target");
    if (entry.artifact.id === artifact.id && entry.artifact.sha256 === artifact.sha256) {
      found = true;
    }
  }
  return found;
}
function assertPrefix(workspace: string, original: Buffer | null): void {
  if (original === null) return;
  const current = optional(workspace, ".amc/transparency/log.jsonl", 2 * 1024 * 1024 * 1024 - 1);
  if (current === null || current.length < original.length || !current.subarray(0, original.length).equals(original)) {
    throw new Error("the original workspace-log prefix changed during artifact anchoring");
  }
}
async function anchorTargets(workspace: string, keyset: Keyset, targets: readonly Target[], gate: () => void): Promise<void> {
  let phase = "predecessor", entryHash: string | undefined;
  const completed: Array<{ type: string; id: string; sequence: number; sha256: string }> = [];
  try {
    for (const row of targets) {
      phase = "predecessor";
      entryHash = undefined;
      gate();
      const before = snapshot(workspace);
      if (!completeTarget(before, row.target)) {
        phase = row.target.type === "KEY_ROTATION" ? "rotation-log" : "history-log";
        const entry = await appendTransparencyEntryAsync({ workspace, type: row.target.type, agentId: "workspace", artifact: anchorArtifact(row.target) }, { beforeCommit: gate });
        entryHash = entry.hash;
      }
      phase = row.target.type === "KEY_ROTATION" ? "rotation-mark" : "history-mark";
      gate();
      if (row.history === undefined) markSequence(row.target);
      else markWrittenHistories(workspace, [row.history]);
      const { type, id, sequence, sha256 } = row.target;
      completed.push({ type, id, sequence, sha256 });
    }
  } catch (cause) { throw new ArtifactBlobAnchoringError(keyset.generation, phase, cause, completed, entryHash); }
}
function relativeWrite(workspace: string, write: KeysetWrite): string {
  const rel = relative(join(workspace, ".amc"), write.path).split(sep).join("/");
  keysetFileRel(rel);
  return rel;
}

/** Capture after real owner unlock, before Describe/PoP. Returned methods never grant a replacement signer. */
export function captureArtifactBlobAnchorBoundary(workspace: string): ArtifactBlobAnchorBoundary {
  const root = resolve(workspace), recheckOwner = owner(root, "keys rotate"), keyset = assertKeysetComplete(root);
  if (keyset === null) throw new Error("artifact anchoring requires an existing complete keyset");
  const keysetBytes = canonicalize(keyset), policy = JSON.stringify(loadTrustConfig(root)), selected = descriptors(root), before = snapshot(root);
  const history = optional(root, keysetFileRel(HISTORY), 1024 * 1024), prefix = stateBytes(before.state, workspaceLogPath(root));
  if (boundProviderKey(root, "artifact-seal") !== null) {
    for (const row of committedTargets(root, keyset)) if (!completeTarget(before, row.target)) throw new Error("the prior artifact anchors are incomplete; run amc keys rotate --resume before another owner transition");
  }
  const assertCurrent = () => {
    recheckOwner();
    const current = assertKeysetComplete(root);
    if (current === null || canonicalize(current) !== keysetBytes) throw new Error("the original artifact owner generation changed while preparing");
    const currentHistory = optional(root, keysetFileRel(HISTORY), 1024 * 1024);
    if (history === null ? currentHistory !== null : currentHistory === null || !history.equals(currentHistory)) throw new Error("the original artifact history changed while preparing");
    assertPolicy(root, policy, selected);
  };
  const boundary = {
    assertPreparedCurrent: assertCurrent,
    withAnchorBoundary<T>(operation: () => T): T {
      return publishTransparencyState(root, before.state, () => { assertCurrent(); return operation(); });
    },
    async complete(input: Completion): Promise<void> {
      const committed = JSON.parse(canonicalize(input.keyset)) as Keyset;
      if (input.generation !== committed.generation || committed.generation !== keyset.generation + 1) throw new Error("artifact anchors require the actual next committed generation");
      assertCommitted(root, committed);
      const writes = input.historyWrites.map(write => ({ ...write, bytes: Buffer.from(write.bytes) }));
      if (writes.length !== 1 || relativeWrite(root, writes[0]!) !== HISTORY) throw new Error("artifact anchors require the one prepared exact artifact history");
      for (const write of writes) if (!readPinned(root, committed, relativeWrite(root, write)).equals(write.bytes)) throw new Error("the committed artifact history differs from its prepared bytes");
      const binding = boundProviderKey(root, "artifact-seal");
      if (binding === null) throw new Error("the committed artifact provider is missing");
      if (input.rotation !== null) {
        const bytes = Buffer.from(input.rotation.bytes), signed = parseRotationStatement(bytes), path = relativeWrite(root, { path: input.rotation.path, bytes, mode: 0o644 });
        if (input.rotation.purpose !== "artifact-seal" || sha256Hex(bytes) !== input.rotation.sha256 || !readPinned(root, committed, path).equals(bytes)
          || signed.statement.nextKeyId !== binding.binding.keyId) throw new Error("the committed artifact rotation differs from its prepared statement");
      } else if (binding.binding.keyId !== (keyset.providers?.["artifact-seal"]?.keyId ?? signingKeyId(getSigningPublicKeyPem(root, "artifact-seal")))) {
        throw new Error("a changed artifact issuer has no prepared P1-08 rotation");
      }
      const currentDescriptors = descriptors(root);
      for (const [index, descriptor] of currentDescriptors.entries()) {
        const original = selected[index]!;
        if (descriptor.mode !== original.mode || (descriptor.mode === "NOTARY" && canonicalize(descriptor) !== canonicalize(original))
          || (descriptor.mode === "VAULT" && descriptor.fingerprint !== binding.binding.keyId)) throw new Error("the postcommit log signer differs from the prepared artifact transition");
      }
      const gate = () => { recheckOwner(); assertCommitted(root, committed); assertPolicy(root, policy, currentDescriptors); assertPrefix(root, prefix); };
      await anchorTargets(root, committed, committedTargets(root, committed), gate);
    }
  } as ArtifactBlobAnchorBoundary;
  boundaries.set(boundary, { workspace: root, previousPublicKeyPem: boundProviderKey(root, "artifact-seal")?.publicKeyPem ?? getSigningPublicKeyPem(root, "artifact-seal"), assertCurrent });
  return Object.freeze(boundary);
}

/** No caller-created object or function stub can bypass the fixed transition preflight. */
export function assertArtifactBlobAnchorBoundary(workspace: string, boundary: ArtifactBlobAnchorBoundary, previousPublicKeyPem: string): void {
  const captured = boundaries.get(boundary);
  if (captured === undefined || captured.workspace !== resolve(workspace) || captured.previousPublicKeyPem !== previousPublicKeyPem) throw new Error("artifact rotation requires its actual captured owner boundary and previous issuer");
  captured.assertCurrent();
}

/** Actual maintained --resume suffix only; no first-bind CLI, reissue, arbitrary target, or adopted-keyset admission. */
export async function resumeArtifactBlobAnchors(workspace: string): Promise<{ generation: number; complete: true } | null> {
  const root = resolve(workspace), binding = boundProviderKey(root, "artifact-seal");
  if (binding?.binding.blobIndexAuthoritySha256 === undefined) return null;
  const recheckOwner = owner(root, "keys resume"), keyset = assertKeysetComplete(root);
  if (keyset === null) throw new Error("artifact anchor recovery requires a complete committed keyset");
  assertCommitted(root, keyset);
  const policy = JSON.stringify(loadTrustConfig(root)), selected = descriptors(root), before = snapshot(root), targets = committedTargets(root, keyset);
  const prefix = stateBytes(before.state, workspaceLogPath(root));
  const gate = () => { recheckOwner(); assertCommitted(root, keyset); assertPolicy(root, policy, selected); assertPrefix(root, prefix); };
  await anchorTargets(root, keyset, targets, gate);
  return { generation: keyset.generation, complete: true };
}
