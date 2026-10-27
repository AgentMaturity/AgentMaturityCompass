import { appendFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import type { z } from "zod";
import { assertPolicySignerCurrent, describePolicySigner, signDigestWithPolicyAsync,
  type PolicySignerDescriptor } from "../crypto/signing/signer.js";
import type { SignedDigest } from "../crypto/signing/signerTypes.js";
import { verifyArtifactBindingLogSignature, verifyWorkspaceLogSignature, type WorkspaceLogKind } from "./workspaceSignature.js";
import { assertPurposePublicationCurrent, capturePurposePublication } from "../keys/purposePublication.js";
import { assertKeysetComplete, boundProviderKey } from "../keys/keyset.js";
import { KeyProviderError, type KeyProviderId } from "../keys/provider.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { assertSigningKeyUsable, getSigningKey } from "../keys/signingKeys.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { vaultStatus } from "../vault/vault.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { transparencyEntrySchema, transparencySealSchema, transparencySealSignatureSchema,
  type TransparencyArtifactKind, type TransparencyEntry } from "./logSchema.js";
import { entryTreeRoot, type MerkleAlgorithm } from "./merkle.js";
import { merkleCurrentRootPath, merkleCurrentRootSigPath, merkleMigrationPath, merkleMigrationSigPath, merklePendingPath } from "./merklePaths.js";
import { prepareMerklePendingMarkerBytes, TransparencyAppendRootCoveredError, TransparencyMerkleLagError } from "./merkleIndexState.js";
import { merkleMigrationSchema, merkleRootRowSchema, rootSignatureSchema } from "./merkleRows.js";
import { prepareMerkle, preparedRootSignature, publishPreparedMerkle, type PreparedMerkleMember } from "./preparedMerkle.js";
import { assertTransparencyStateCurrent, captureTransparencyState, captureTransparencyAppendPublication, withTransparencyPublicationLock, stateBytes,
  workspaceLogPath, workspaceSealPath, workspaceSealSigPath, type TransparencyState, type TransparencyAppendProgress } from "./workspacePublication.js";

export interface TransparencyAppendInput {
  workspace: string; type: string; agentId: string;
  artifact: { kind: TransparencyArtifactKind; sha256: string; id?: string };
}

function readSignedSnapshot<T>(workspace: string, state: TransparencyState, body: string, sidecar: string, schema: z.ZodType<T>, kind: WorkspaceLogKind, admission: "ordinary" | "artifact-binding"): T | null {
  const bytes = stateBytes(state, body), signature = stateBytes(state, sidecar);
  if (bytes === null && signature === null) return null;
  if (bytes === null || signature === null) throw new Error("transparency signed predecessor is incomplete");
  const row = schema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
  const sig = rootSignatureSchema.parse(JSON.parse(signature.toString("utf8")) as unknown), digest = sha256Hex(bytes);
  if (sig.digestSha256 !== digest || !(admission === "artifact-binding" ? verifyArtifactBindingLogSignature : verifyWorkspaceLogSignature)(workspace, kind, digest, sig)) {
    throw new Error("transparency signed predecessor is invalid");
  }
  return row;
}

/** Reads/validates only the captured bytes. It neither initializes nor repairs authenticated state. */
function verifiedPredecessor(workspace: string, state: TransparencyState, admission: "ordinary" | "artifact-binding" = "ordinary") {
  const entries = (stateBytes(state, workspaceLogPath(workspace))?.toString("utf8") ?? "").split(/\r?\n/)
    .map(line => line.trim()).filter(Boolean).map(line => transparencyEntrySchema.parse(JSON.parse(line) as unknown));
  let tail = "";
  for (const entry of entries) {
    const { hash, ...payload } = entry;
    if (entry.prev !== tail || sha256Hex(canonicalize(payload)) !== hash) throw new Error("transparency predecessor chain is invalid");
    tail = hash;
  }
  const seal = readSignedSnapshot(workspace, state, workspaceSealPath(workspace), workspaceSealSigPath(workspace), transparencySealSchema, "TRANSPARENCY_ROOT", admission);
  if ((seal === null && entries.length > 0) || (seal !== null && seal.lastHash !== tail)) throw new Error("transparency predecessor seal does not cover the log");
  const root = readSignedSnapshot(workspace, state, merkleCurrentRootPath(workspace), merkleCurrentRootSigPath(workspace), merkleRootRowSchema, "MERKLE_ROOT", admission);
  if (root === null && entries.length > 0) throw new Error("transparency predecessor root is missing; repair the index first");
  const hashes = entries.map(entry => entry.hash);
  if (root !== null && (root.leafCount > hashes.length || (hashes[root.leafCount - 1] ?? "") !== root.lastEntryHash
    || entryTreeRoot(root.algorithm ?? "amc-legacy-v1", hashes.slice(0, root.leafCount)) !== root.root)) {
    throw new Error("transparency predecessor root does not cover its claimed prefix");
  }
  const migration = readSignedSnapshot(workspace, state, merkleMigrationPath(workspace), merkleMigrationSigPath(workspace), merkleMigrationSchema, "MERKLE_ROOT", admission);
  if (migration !== null) {
    const prefix = hashes.slice(0, migration.leafCount);
    if (migration.leafCount > hashes.length || (prefix.at(-1) ?? "") !== migration.lastEntryHash
      || entryTreeRoot("amc-legacy-v1", prefix) !== migration.legacyRoot || entryTreeRoot("rfc9162-sha256", prefix) !== migration.rfc9162Root) {
      throw new Error("transparency migration predecessor does not cover the log");
    }
  }
  const legacy = root !== null && (root.algorithm ?? "amc-legacy-v1") === "amc-legacy-v1";
  if (legacy && (migration !== null || seal?.merkleAlgorithm === "rfc9162-sha256")) throw new Error("transparency predecessor attempts a tree downgrade");
  return { entries, signedRootLeafCount: root?.leafCount ?? 0, algorithm: (legacy && migration === null && seal !== null && (seal.merkleAlgorithm ?? "amc-legacy-v1") === "amc-legacy-v1"
    ? "amc-legacy-v1" : "rfc9162-sha256") as MerkleAlgorithm };
}

/** Fixed internal owner preflight/recovery; captured bytes only, no init, signing or arbitrary trust parameter. */
export function captureArtifactBindingPredecessor(workspace: string) {
  const state = captureTransparencyState(workspace, true);
  const verified = verifiedPredecessor(workspace, state, "artifact-binding");
  assertTransparencyStateCurrent(state);
  return { state, ...verified };
}

/** Fixed receipt-owner preflight; receipt transition never replaces the current artifact log authority. */
export function captureReceiptOwnerPredecessor(workspace: string) {
  const state = captureTransparencyState(workspace, true), verified = verifiedPredecessor(workspace, state);
  assertTransparencyStateCurrent(state); return { state, ...verified };
}

function signingEnabled() { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); }
function captureSigner(workspace: string, descriptor: PolicySignerDescriptor) {
  const purpose = descriptor.mode === "VAULT" ? capturePurposePublication(workspace, "artifact-seal") : null;
  const holder: KeyProviderId = boundProviderKey(workspace, "artifact-seal")?.binding.provider ?? "file";
  return { descriptor, purpose, holder, policy: purpose === null ? null : canonicalize(keyPolicy(loadKeysConfig(workspace))) };
}
function assertSignerCurrent(workspace: string, original: ReturnType<typeof captureSigner>, signed?: SignedDigest): void {
  assertPolicySignerCurrent(workspace, original.descriptor);
  if (original.purpose !== null) {
    if (canonicalize(keyPolicy(loadKeysConfig(workspace))) !== original.policy)
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", original.holder, "the original transparency key policy changed while preparing publication");
    if (signed === undefined) {
      // Before this kind has signed, check its real captured authority; never invent signature material or recapture/warm a new authority.
      const current = assertKeysetComplete(workspace), policy = keyPolicy(loadKeysConfig(workspace));
      if (current === null || canonicalize(current) !== original.purpose.keyset)
        throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", original.holder, "the original transparency purpose authority changed while signing was prepared");
      if (!policy.allowed.includes(original.descriptor.algorithm) || (original.holder === "file" && policy.requireNonExportable))
        throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", original.holder, "the current key policy refuses the original transparency signer");
      assertSigningKeyUsable(workspace, "artifact-seal", original.descriptor.publicKeyPem, original.holder);
      if (original.holder === "file") {
        if (!vaultStatus(workspace).unlocked) throw new Error("🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup. Use --no-sign to skip signing where supported.");
        if (publicKeyFromPrivate(getSigningKey(workspace, "artifact-seal")) !== original.descriptor.publicKeyPem)
          throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the original transparency vault purpose key changed while signing was prepared");
      }
      return;
    }
    if (signed.envelope === undefined) throw new Error("prepared transparency signature envelope is missing");
    assertPurposePublicationCurrent(workspace, original.purpose, { provider: original.holder, algorithm: signed.envelope.alg,
      publicKeyPem: original.descriptor.publicKeyPem, keyId: original.descriptor.fingerprint, signature: Buffer.from(signed.signature, "base64") });
  }
}

/** Internal fixed TR/Merkle authority for the actual producer phase before an earlier await. */
export function captureWorkspaceLogAuthority(workspace: string, beforeCommit?: () => void) {
  signingEnabled(); beforeCommit?.(); signingEnabled();
  const sealSigner = captureSigner(workspace, describePolicySigner(workspace, "TRANSPARENCY_ROOT"));
  const rootSigner = captureSigner(workspace, describePolicySigner(workspace, "MERKLE_ROOT"));
  const policy = JSON.stringify(loadTrustConfig(workspace)), keyset = canonicalize(assertKeysetComplete(workspace));
  const assertIntrinsicCurrent = (signedSeal?: SignedDigest, signedRoot?: SignedDigest) => {
    signingEnabled();
    assertSignerCurrent(workspace, sealSigner, signedSeal); assertSignerCurrent(workspace, rootSigner, signedRoot);
    if (canonicalize(assertKeysetComplete(workspace)) !== keyset) throw new Error("transparency original keyset changed while signing was prepared");
    if (JSON.stringify(loadTrustConfig(workspace)) !== policy) throw new Error("transparency signing policy changed while signing was prepared");
  };
  const assertCurrent = (signedSeal?: SignedDigest, signedRoot?: SignedDigest) => { signingEnabled(); beforeCommit?.(); signingEnabled(); assertIntrinsicCurrent(signedSeal, signedRoot); };
  assertCurrent(); return { sealSigner, rootSigner, assertCurrent, assertIntrinsicCurrent };
}

/** Internal trusted negative seams. Neither callback can select a signer or provide positive authority. */
export interface TransparencyAppendOptions {
  /** Legacy preparation-only gate: capture, each real Sign, and final pre-first-write. May retain OLD proof/log state. */
  beforeCommit?: () => void;
  /** Stable actor/static-input gate: capture/each Sign/pre-line, each member and final continuation; tolerates own log progress. */
  beforeMember?: () => void;
}
export interface TransparencyAppendAttempt {
  readonly entry: TransparencyEntry;
  /** Intrinsic original TR/Merkle authority + exact owned postimages; no external/predecessor callbacks. */
  assertCurrent(): void;
}
/** Setup or append is incomplete without exact line acknowledgment. No committed-entry claim is made. */
class TransparencyAppendPublicationError extends Error {
  readonly code = "TRANSPARENCY_APPEND_INCOMPLETE";
  constructor(readonly candidateEntry: TransparencyEntry, readonly progress: TransparencyAppendProgress, cause: unknown) {
    super("transparency append did not complete; inspect native-return and acknowledgment progress before retrying", { cause });
    this.name = "TransparencyAppendPublicationError";
  }
}

/** Actual one-attempt path. Every real Sign completes before any publication lock; no automatic predecessor retry. */
export async function appendTransparencyEntryAttemptAsync(input: TransparencyAppendInput, options: TransparencyAppendOptions = {}): Promise<TransparencyAppendAttempt> {
  const params = { workspace: input.workspace, type: input.type, agentId: input.agentId, artifact: { ...input.artifact } };
  const beforeCommit = options.beforeCommit, memberCaller = options.beforeMember, workspace = params.workspace;
  const beforeMember = () => { signingEnabled(); memberCaller?.(); signingEnabled(); };
  beforeMember();
  const original = captureWorkspaceLogAuthority(workspace, beforeCommit), { sealSigner, rootSigner } = original;
  const publication = captureTransparencyAppendPublication(workspace), before = publication.state, predecessor = verifiedPredecessor(workspace, before);
  publication.assertCurrent();
  const payload = { v: 1 as const, ts: Date.now(), type: params.type, agentId: params.agentId,
    artifact: { kind: params.artifact.kind, sha256: params.artifact.sha256, ...(params.artifact.id ? { id: params.artifact.id } : {}) },
    prev: predecessor.entries.at(-1)?.hash ?? "" };
  const entry = transparencyEntrySchema.parse({ ...payload, hash: sha256Hex(canonicalize(payload)) });
  const seal = Buffer.from(JSON.stringify(transparencySealSchema.parse({ v: 1, ts: Date.now(), lastHash: entry.hash,
    signerFingerprint: sealSigner.descriptor.fingerprint, merkleAlgorithm: predecessor.algorithm }), null, 2));
  const plan = prepareMerkle({ workspace, algorithm: predecessor.algorithm, log: stateBytes(before, workspaceLogPath(workspace)),
    append: { entryHash: entry.hash, prevEntryHash: entry.prev }, rebuild: true });
  const assertPreparing = (signedSeal?: SignedDigest, signedRoot?: SignedDigest) => {
    beforeMember?.(); original.assertCurrent(signedSeal, signedRoot); publication.assertCurrent();
  };
  assertPreparing();
  const signedSeal = await signDigestWithPolicyAsync({ workspace, kind: "TRANSPARENCY_ROOT", digestHex: sha256Hex(seal), expectedSigner: sealSigner.descriptor,
    beforeSign: () => assertPreparing() });
  const sealSignature = Buffer.from(JSON.stringify(transparencySealSignatureSchema.parse({ digestSha256: sha256Hex(seal),
    signature: signedSeal.signature, signedTs: signedSeal.signedTs, signer: "auditor", envelope: signedSeal.envelope }), null, 2));
  assertPreparing(signedSeal);
  const signedRoot = await signDigestWithPolicyAsync({ workspace, kind: "MERKLE_ROOT", digestHex: plan.digest, expectedSigner: rootSigner.descriptor,
    beforeSign: () => assertPreparing(signedSeal) });
  const rootSignature = preparedRootSignature(plan, signedRoot);
  const logPath = workspaceLogPath(workspace), pendingPath = merklePendingPath(workspace);
  const oldLog = stateBytes(before, logPath), separator = oldLog !== null && oldLog.length > 0 && oldLog[oldLog.length - 1] !== 10 ? "\n" : "";
  const line = Buffer.from(separator + JSON.stringify(entry) + "\n");
  let phase = "lock-setup", lockSetupAttempted = false, lockEntered = false, attemptedPath: string | null = null;
  let lineWriteReturned = false, lineAcknowledged = false, rootCovered = false;
  const directoryAttempts: string[] = [], directoryReturns: string[] = [];
  const returnedMembers: { path: string; operation: "append" | "replace" | "remove" }[] = [];
  const progress = (): TransparencyAppendProgress => Object.freeze({ phase, lockSetupAttempted, lockEntered,
    directoryAttempts: Object.freeze([...directoryAttempts]), directoryReturns: Object.freeze([...directoryReturns]),
    returnedMembers: Object.freeze(returnedMembers.map(row => Object.freeze({ ...row }))), attemptedPath,
    lineWriteReturned, lineAcknowledged, rootCovered });
  const intrinsic = () => original.assertIntrinsicCurrent(signedSeal, signedRoot);
  const assertStable = () => { beforeMember?.(); intrinsic(); publication.assertCurrent(); };
  const directory = (path: string) => {
    phase = `directory:${path}`; directoryAttempts.push(path); ensureDir(path); directoryReturns.push(path);
  };
  // This sink is fixed owned native plumbing, never forwarded from caller input/options.
  const publishMember = (member: PreparedMerkleMember, diagnostic = false) => {
    attemptedPath = null; phase = `${member.operation}:${member.path}`;
    const gate = diagnostic ? () => publication.assertCurrent() : assertStable;
    gate(); directory(dirname(member.path)); phase = `${member.operation}:${member.path}`; gate();
    const previous = member.operation === "append" ? publication.appendBytes(member.path) : null;
    const expected = member.operation === "append" ? Buffer.concat([previous ?? Buffer.alloc(0), member.bytes]) : Buffer.from(member.bytes);
    const mode = member.operation === "append" ? publication.mode(member.path) ?? (0o666 & ~process.umask()) : member.mode ?? (0o666 & ~process.umask());
    attemptedPath = member.path; // Enter the actual writer only after all negative gates and directory setup.
    if (member.operation === "append") appendFileSync(member.path, member.bytes); else writeFileAtomic(member.path, member.bytes, member.mode);
    returnedMembers.push({ path: member.path, operation: member.operation });
    if (member.path === logPath) lineWriteReturned = true;
    publication.acknowledge(member.path, expected, mode, member.operation);
    if (member.path === logPath) lineAcknowledged = true;
    if (member.path === merkleCurrentRootSigPath(workspace)) rootCovered = true;
    attemptedPath = null;
  };
  lockSetupAttempted = true;
  // Lock/contender setup may have local effects even when a later pure first gate refuses with attemptedPath=null.
  try { return withTransparencyPublicationLock(workspace, () => {
    lockEntered = true;
    // Preserve the legacy external gate through the final PRE-LINE point only.
    assertPreparing(signedSeal, signedRoot);
    try {
      publishMember({ path: logPath, bytes: line, operation: "append" });
      publishMember({ path: workspaceSealPath(workspace), bytes: seal, operation: "replace", mode: 0o644 });
      publishMember({ path: workspaceSealSigPath(workspace), bytes: sealSignature, operation: "replace", mode: 0o644 });
      publishPreparedMerkle(workspace, plan, rootSignature, publishMember);
      attemptedPath = null; phase = "pending-clear"; assertStable();
      if (publication.present(pendingPath)) {
        attemptedPath = pendingPath;
        try { unlinkSync(pendingPath); } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause; }
        returnedMembers.push({ path: pendingPath, operation: "remove" });
      }
      publication.acknowledgeAbsent(pendingPath); attemptedPath = null;
      phase = "final-continuation"; assertStable();
      const assertCurrent = () => { intrinsic(); publication.assertCurrent(); };
      return Object.freeze({ entry, assertCurrent });
    } catch (cause) {
      const failed = progress();
      if (!lineAcknowledged) {
        if (attemptedPath === null && returnedMembers.length === 0 && directoryAttempts.length === 0) throw cause; // Genuine pure first refusal stays typed; later setup progress is retained.
        throw new TransparencyAppendPublicationError(entry, failed, cause);
      }
      const reason = cause instanceof Error ? cause.message : String(cause);
      if (rootCovered) throw new TransparencyAppendRootCoveredError({ entryHash: entry.hash, pendingRecorded: false, reason, cause, progress: failed });
      // The unsigned diagnostic marker must remain possible after a signing refusal. It cannot overwrite changed expected state.
      let pendingRecorded = false, pendingCause: unknown;
      try { publishMember({ path: pendingPath, bytes: prepareMerklePendingMarkerBytes({ ts: Date.now(), entryHash: entry.hash, reason }), operation: "replace", mode: 0o644 }, true); pendingRecorded = true; }
      catch (error) { pendingCause = error; }
      throw new TransparencyMerkleLagError({ entryHash: entry.hash, pendingRecorded, reason, cause, progress: failed, pendingCause, pendingProgress: progress() });
    }
  }); } catch (cause) {
    if (!lockEntered) throw new TransparencyAppendPublicationError(entry, progress(), cause); // Setup/contender failure, no file-attempt claim.
    throw cause;
  }
}

/** Compatibility API: the real same attempt path still returns exactly the historical entry value. */
export async function appendTransparencyEntryAsync(input: TransparencyAppendInput, options: TransparencyAppendOptions = {}): Promise<TransparencyEntry> {
  return (await appendTransparencyEntryAttemptAsync(input, options)).entry;
}
