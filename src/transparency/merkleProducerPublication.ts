import { appendFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { currentTreeAlgorithm, verifyTransparencyMerkle, readSignedCurrentRoot } from "./merkleIndexStore.js";
import { assertPolicySignerCurrent, describePolicySigner, signDigestWithPolicyAsync } from "../crypto/signing/signer.js";
import type { SignedDigest } from "../crypto/signing/signerTypes.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { assertKeysetComplete, boundProviderKey } from "../keys/keyset.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { assertSigningKeyUsable, getSigningKey } from "../keys/signingKeys.js";
import { vaultStatus } from "../vault/vault.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { canonicalize } from "../utils/json.js";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { physicalPathWithMissingSuffix } from "../utils/pathSafety.js";
import { sha256Hex } from "../utils/hash.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { entryTreeRoot, type MerkleAlgorithm } from "./merkle.js";
import { merkleMigrationSchema, merkleRootRowSchema, rootSignatureSchema } from "./merkleRows.js";
import { transparencyEntrySchema, transparencySealSchema, transparencySealSignatureSchema } from "./logSchema.js";
import { captureReceiptOwnerPredecessor, captureWorkspaceLogAuthority } from "./asyncWorkspaceAppend.js";
import { captureTransparencyAppendPublication, stateBytes, withTransparencyPublicationLock,
  workspaceLogPath, workspaceSealPath, workspaceSealSigPath, type TransparencyAppendProgress } from "./workspacePublication.js";
import { prepareMerkle, preparedRootSignature, publishPreparedMerkle, type PreparedMerkle, type PreparedMerkleMember } from "./preparedMerkle.js";
import { merkleCurrentRootPath, merkleCurrentRootSigPath, merkleMigrationPath, merkleMigrationSigPath, merklePendingPath } from "./merklePaths.js";
import { prepareMerklePendingMarkerBytes, TransparencyAppendRootCoveredError, TransparencyMerkleLagError } from "./merkleIndexState.js";
import { verifyWorkspaceLogSignature } from "./workspaceSignature.js";

export interface MerkleProducerOptions { beforePublish?: () => void; assertInputsCurrent?: () => void }
/** Fixed MERKLE_ROOT authority. No caller-selected kind, provider, key, response or positive admission parameter. */
export function captureMerkleProducerSigner(workspace: string) {
  const descriptor = describePolicySigner(workspace, "MERKLE_ROOT"), purpose = descriptor.mode === "VAULT" ? capturePurposePublication(workspace, "artifact-seal") : null;
  const keyset = canonicalize(assertKeysetComplete(workspace)), trust = canonicalize(loadTrustConfig(workspace));
  const holder = boundProviderKey(workspace, "artifact-seal")?.binding.provider ?? "file", responses: SignedDigest[] = [];
  const assertCurrent = () => {
    assertPolicySignerCurrent(workspace, descriptor);
    if (canonicalize(assertKeysetComplete(workspace)) !== keyset || canonicalize(loadTrustConfig(workspace)) !== trust)
      throw new Error("original MERKLE_ROOT operation authority changed");
    if (purpose !== null) {
      const policy = keyPolicy(loadKeysConfig(workspace));
      if (canonicalize(assertKeysetComplete(workspace)) !== purpose.keyset || !policy.allowed.includes(descriptor.algorithm)
        || (holder === "file" && policy.requireNonExportable)) throw new Error("original MERKLE_ROOT purpose is refused");
      assertSigningKeyUsable(workspace, "artifact-seal", descriptor.publicKeyPem, holder);
      if (holder === "file" && (!vaultStatus(workspace).unlocked || publicKeyFromPrivate(getSigningKey(workspace, "artifact-seal")) !== descriptor.publicKeyPem))
        throw new Error("original MERKLE_ROOT vault is locked or changed");
      for (const signed of responses) assertPurposePublicationCurrent(workspace, purpose, { provider: holder, algorithm: descriptor.algorithm,
        publicKeyPem: descriptor.publicKeyPem, keyId: descriptor.fingerprint, signature: Buffer.from(signed.signature, "base64") });
    }
  };
  assertCurrent();
  return { assertCurrent, async sign(digestHex: string, negative: () => void) {
    const beforeSign = () => { assertCurrent(); negative(); };
    beforeSign();
    const signed = await signDigestWithPolicyAsync({ workspace, kind: "MERKLE_ROOT", digestHex, expectedSigner: descriptor, beforeSign });
    responses.push(signed); beforeSign(); return signed;
  } };
}

export class MerkleProducerPublicationError extends Error {
  readonly code = "MERKLE_PRODUCER_INCOMPLETE";
  constructor(readonly progress: TransparencyAppendProgress, readonly migrationDigest: string | null, cause: unknown,
    readonly entryHash: string | null = null, readonly priorCoverAcknowledged = false) {
    super("Merkle producer did not complete; inspect acknowledged members, setup and attempted native progress before retrying", { cause });
    this.name = "MerkleProducerPublicationError";
  }
}
function publication(workspace: string, stableAuthority: () => void) {
  const owned = captureTransparencyAppendPublication(workspace), modeMask = process.umask(), directories: string[] = [], directoryReturns: string[] = [];
  const physical = new Map([...owned.state.keys()].map(path => [path, physicalPathWithMissingSuffix(path)]));
  const returned: { path: string; operation: "append" | "replace" | "remove" }[] = [];
  let phase = "prepared", attemptedPath: string | null = null, lockSetupAttempted = false, lockEntered = false;
  let lineWriteReturned = false, lineAcknowledged = false, rootCovered = false, coveredBeforeReplacement = false, candidateEntryHash: string | null = null, migrationDigest: string | null = null;
  const assertOwned = () => {
    for (const [path, selected] of physical) if (physicalPathWithMissingSuffix(path) !== selected) throw new Error("original Merkle producer physical destination changed");
    owned.assertCurrent();
  };
  const stable = () => { stableAuthority(); if (process.umask() !== modeMask) throw new Error("original Merkle producer file mode changed"); assertOwned(); };
  const progress = (): TransparencyAppendProgress => Object.freeze({ phase, attemptedPath, lockSetupAttempted, lockEntered,
    directoryAttempts: Object.freeze([...directories]), directoryReturns: Object.freeze([...directoryReturns]),
    returnedMembers: Object.freeze(returned.map(row => Object.freeze({ ...row }))), lineWriteReturned, lineAcknowledged, rootCovered });
  const member = (row: PreparedMerkleMember, diagnostic = false) => {
    const gate = diagnostic ? assertOwned : stable;
    attemptedPath = null; phase = `directory:${dirname(row.path)}`; gate(); directories.push(dirname(row.path));
    ensureDir(dirname(row.path)); directoryReturns.push(dirname(row.path)); gate();
    const old = row.operation === "append" ? owned.appendBytes(row.path) : null;
    const expected = row.operation === "append" ? Buffer.concat([old ?? Buffer.alloc(0), row.bytes]) : Buffer.from(row.bytes);
    const mode = row.operation === "append" ? owned.mode(row.path) ?? (0o666 & ~modeMask) : row.mode ?? (0o666 & ~modeMask);
    phase = `${row.operation}:${row.path}`; attemptedPath = row.path;
    if (row.path === merkleCurrentRootPath(workspace)) { if (rootCovered) coveredBeforeReplacement = true; rootCovered = false; }
    if (row.operation === "append") appendFileSync(row.path, row.bytes); else writeFileAtomic(row.path, row.bytes, row.mode);
    returned.push({ path: row.path, operation: row.operation });
    if (row.path === workspaceLogPath(workspace)) lineWriteReturned = true;
    owned.acknowledge(row.path, expected, mode, row.operation);
    if (row.path === workspaceLogPath(workspace)) lineAcknowledged = true;
    if (row.path === merkleCurrentRootSigPath(workspace)) { rootCovered = true; coveredBeforeReplacement = false; }
    attemptedPath = null;
  };
  const clearPending = () => {
    attemptedPath = null; phase = "pending-clear"; stable(); const path = merklePendingPath(workspace);
    if (owned.present(path)) {
      attemptedPath = path;
      try { unlinkSync(path); returned.push({ path, operation: "remove" }); }
      catch (cause) { if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause; }
    }
    owned.acknowledgeAbsent(path); attemptedPath = null;
  };
  const failure = (cause: unknown): Error => {
    if (cause instanceof TransparencyMerkleLagError || cause instanceof MerkleProducerPublicationError) return cause;
    if (!lockSetupAttempted && returned.length === 0 && directories.length === 0 && attemptedPath === null && cause instanceof Error) return cause;
    if (!lineAcknowledged || candidateEntryHash === null) return new MerkleProducerPublicationError(progress(), migrationDigest, cause);
    if (coveredBeforeReplacement) return new MerkleProducerPublicationError(progress(), migrationDigest, cause, candidateEntryHash, true);
    const reason = cause instanceof Error ? cause.message : String(cause), failed = progress();
    if (rootCovered) return new TransparencyAppendRootCoveredError({ entryHash: candidateEntryHash, pendingRecorded: false, reason, cause, progress: failed });
    let pendingRecorded = false, pendingCause: unknown;
    try { member({ path: merklePendingPath(workspace), bytes: prepareMerklePendingMarkerBytes({ ts: Date.now(), entryHash: candidateEntryHash, reason }), operation: "replace", mode: 0o644 }, true); pendingRecorded = true; }
    catch (error) { pendingCause = error; }
    return new TransparencyMerkleLagError({ entryHash: candidateEntryHash, pendingRecorded, reason, cause, progress: failed, pendingCause, pendingProgress: progress() });
  };
  return { owned, assertOwned, stable, member, clearPending, progress, failure,
    setMigration(digest: string) { migrationDigest = digest; }, setCandidateEntry(hash: string) { candidateEntryHash = hash; },
    run<T>(prepareOnly: () => void, write: () => T): T {
      lockSetupAttempted = true; lockEntered = false; phase = "lock-setup";
      try { return withTransparencyPublicationLock(workspace, () => {
        lockEntered = true;
        try { prepareOnly(); stable(); const result = write(); phase = "final-continuation"; stable(); return result; }
        catch (cause) { throw failure(cause); }
      }); } catch (cause) { if (lockEntered) throw cause; throw failure(cause); }
    }
  };
}
function rebuilt(workspace: string, plan: PreparedMerkle, algorithm: MerkleAlgorithm) {
  return { leafCount: plan.update.leafCount, root: plan.update.root, algorithm,
    currentRootPath: merkleCurrentRootPath(workspace), currentRootSigPath: merkleCurrentRootSigPath(workspace) };
}
/** Genuine internal cold-init attempt. Its original/prepared output bytes never come from a request or fresh winner. */
export async function rebuildTransparencyMerkleAttemptAsync(workspace: string, options: MerkleProducerOptions = {}) {
  const caller = { ...options }; caller.beforePublish?.(); caller.assertInputsCurrent?.();
  const signer = captureMerkleProducerSigner(workspace), pub = publication(workspace, () => { caller.beforePublish?.(); signer.assertCurrent(); });
  const algorithm = currentTreeAlgorithm(workspace), plan = prepareMerkle({ workspace, algorithm, log: stateBytes(pub.owned.state, workspaceLogPath(workspace)), rebuild: true });
  const preparing = () => { caller.assertInputsCurrent?.(); pub.stable();
    if (currentTreeAlgorithm(workspace) !== algorithm) throw new Error("original Merkle rebuild algorithm decision changed"); };
  const signed = await signer.sign(plan.digest, preparing), signature = preparedRootSignature(plan, signed);
  pub.run(preparing, () => { publishPreparedMerkle(workspace, plan, signature, pub.member); pub.clearPending(); });
  const assertCurrent = () => { signer.assertCurrent(); pub.assertOwned(); };
  return Object.freeze({ result: rebuilt(workspace, plan, algorithm), rootBytes: Buffer.from(plan.bytes), signatureBytes: Buffer.from(signature), assertCurrent });
}
export async function rebuildTransparencyMerkleAsync(workspace: string, options: MerkleProducerOptions = {}) {
  return (await rebuildTransparencyMerkleAttemptAsync(workspace, options)).result;
}
export async function ensureTransparencyMerkleInitializedAsync(workspace: string, options: MerkleProducerOptions = {}): Promise<void> {
  if (!pathExists(merkleCurrentRootPath(workspace)) || !pathExists(merkleCurrentRootSigPath(workspace))) await rebuildTransparencyMerkleAsync(workspace, options);
}
function capturedPairAdmission(workspace: string, pub: ReturnType<typeof publication>, body: string, sidecar: string, kind: "TRANSPARENCY_ROOT" | "MERKLE_ROOT") {
  const bytes = stateBytes(pub.owned.state, body), sigBytes = stateBytes(pub.owned.state, sidecar);
  if (bytes === null || sigBytes === null) throw new Error("original legacy migration predecessor pair is missing");
  const sig = rootSignatureSchema.parse(JSON.parse(sigBytes.toString("utf8"))), digest = sha256Hex(bytes);
  if (sig.digestSha256 !== digest || !verifyWorkspaceLogSignature(workspace, kind, digest, sig)) throw new Error("original legacy migration predecessor is no longer admitted");
}
/** The only permitted intermediate legacy-root/migration-record combination belongs to this actual owned transition. */
export async function rebuildTransparencyMerkleWithMigrationAsync(workspace: string, input: { algorithm?: MerkleAlgorithm } = {}, options: MerkleProducerOptions = {}) {
  const opts = { ...input }, caller = { ...options }, current = currentTreeAlgorithm(workspace);
  if (opts.algorithm === "amc-legacy-v1" && current !== "amc-legacy-v1") throw new Error("refusing to rebuild as amc-legacy-v1: the legacy tree is ambiguous, and logs migrate only to rfc9162-sha256");
  if (opts.algorithm !== "rfc9162-sha256" || current !== "amc-legacy-v1") return { ...await rebuildTransparencyMerkleAsync(workspace, caller), migration: null };
  caller.beforePublish?.(); caller.assertInputsCurrent?.();
  const original = captureWorkspaceLogAuthority(workspace), signer = captureMerkleProducerSigner(workspace);
  const sealPublicKey = getPublicKeyHistory(workspace, "auditor")[0] ?? "";
  let signedSeal: SignedDigest | undefined, preparingInputs = true, beforeLine: () => void = () => {};
  const pub = publication(workspace, () => { caller.beforePublish?.(); signer.assertCurrent(); original.assertIntrinsicCurrent(signedSeal);
    if ((getPublicKeyHistory(workspace, "auditor")[0] ?? "") !== sealPublicKey) throw new Error("original migration seal fingerprint selection changed"); beforeLine(); });
  const predecessor = captureReceiptOwnerPredecessor(workspace), verified = verifyTransparencyMerkle(workspace);
  if (predecessor.algorithm !== "amc-legacy-v1" || !verified.ok || verified.root === null)
    throw new Error(`migrate only a legacy root that verifies; run \`amc transparency merkle rebuild\` first (${verified.errors.join("; ")})`);
  if (pub.owned.present(merkleMigrationPath(workspace)) || pub.owned.present(merkleMigrationSigPath(workspace))) throw new Error("migration requires an originally absent migration pair");
  if (canonicalize([...predecessor.state]) !== canonicalize([...pub.owned.state]) || pub.owned.present(merklePendingPath(workspace)))
    throw new Error("original legacy migration predecessor changed or has pending repair");
  const originalLog = stateBytes(pub.owned.state, workspaceLogPath(workspace));
  if (originalLog !== null && originalLog.length > 0 && originalLog[originalLog.length - 1] !== 10) throw new Error("migration requires the original JSONL log to end with LF; repair the reviewed log first");
  const entryHashes = predecessor.entries.map(entry => entry.hash);
  const originalRoot = merkleRootRowSchema.parse(JSON.parse(stateBytes(pub.owned.state, merkleCurrentRootPath(workspace))!.toString("utf8")));
  if (originalRoot.root !== verified.root || originalRoot.root !== entryTreeRoot("amc-legacy-v1", entryHashes)
    || originalRoot.leafCount !== entryHashes.length || originalRoot.lastEntryHash !== (entryHashes.at(-1) ?? "")) throw new Error("captured legacy root does not cover the original full log");
  const record = merkleMigrationSchema.parse({ v: 1, ts: Date.now(), legacyRoot: verified.root, rfc9162Root: entryTreeRoot("rfc9162-sha256", entryHashes),
    leafCount: entryHashes.length, lastEntryHash: entryHashes.at(-1) ?? "" });
  const path = merkleMigrationPath(workspace), bytes = Buffer.from(JSON.stringify(record, null, 2)), digest = sha256Hex(bytes);
  beforeLine = () => {
    if (pub.progress().lineAcknowledged) return;
    capturedPairAdmission(workspace, pub, merkleCurrentRootPath(workspace), merkleCurrentRootSigPath(workspace), "MERKLE_ROOT");
    capturedPairAdmission(workspace, pub, workspaceSealPath(workspace), workspaceSealSigPath(workspace), "TRANSPARENCY_ROOT");
  };
  const prefix = () => { if (preparingInputs) caller.assertInputsCurrent?.(); pub.stable(); };
  try {
    const signedRecord = await signer.sign(digest, () => { prefix(); if (currentTreeAlgorithm(workspace) !== "amc-legacy-v1") throw new Error("original legacy algorithm decision changed"); });
    const signature = Buffer.from(JSON.stringify(rootSignatureSchema.parse({ digestSha256: digest, signature: signedRecord.signature,
      signedTs: signedRecord.signedTs, signer: "auditor", envelope: signedRecord.envelope }), null, 2));
    pub.setMigration(digest);
    pub.run(prefix, () => { pub.member({ path, bytes, operation: "replace", mode: 0o644 }); pub.member({ path: merkleMigrationSigPath(workspace), bytes: signature, operation: "replace", mode: 0o644 }); });
    preparingInputs = false;
    const payload = { v: 1 as const, ts: Date.now(), type: "MERKLE_TREE_MIGRATED", agentId: "workspace",
      artifact: { kind: "merkle-migration" as const, sha256: digest, id: "rfc9162-sha256" }, prev: entryHashes.at(-1) ?? "" };
    const entry = transparencyEntrySchema.parse({ ...payload, hash: sha256Hex(canonicalize(payload)) }); pub.setCandidateEntry(entry.hash);
    // Preserve the old seal fingerprint recipe; only genuine selected-kind signatures may authorize the bytes.
    prefix();
    const seal = Buffer.from(JSON.stringify(transparencySealSchema.parse({ v: 1, ts: Date.now(), lastHash: entry.hash,
      signerFingerprint: sha256Hex(Buffer.from(sealPublicKey, "utf8")), merkleAlgorithm: "rfc9162-sha256" }), null, 2));
    signedSeal = await signDigestWithPolicyAsync({ workspace, kind: "TRANSPARENCY_ROOT", digestHex: sha256Hex(seal), expectedSigner: original.sealSigner.descriptor, beforeSign: prefix });
    prefix();
    const sealSignature = Buffer.from(JSON.stringify(transparencySealSignatureSchema.parse({ digestSha256: sha256Hex(seal), signature: signedSeal.signature,
      signedTs: signedSeal.signedTs, signer: "auditor", envelope: signedSeal.envelope }), null, 2));
    const plan = prepareMerkle({ workspace, algorithm: "rfc9162-sha256", log: stateBytes(pub.owned.state, workspaceLogPath(workspace)),
      append: { entryHash: entry.hash, prevEntryHash: entry.prev }, resumeRoot: readSignedCurrentRoot(workspace) });
    const rootSigned = await signer.sign(plan.digest, prefix), rootSignature = preparedRootSignature(plan, rootSigned);
    pub.run(prefix, () => {
      pub.member({ path: workspaceLogPath(workspace), bytes: Buffer.from(JSON.stringify(entry) + "\n"), operation: "append" });
      pub.member({ path: workspaceSealPath(workspace), bytes: seal, operation: "replace", mode: 0o644 });
      pub.member({ path: workspaceSealSigPath(workspace), bytes: sealSignature, operation: "replace", mode: 0o644 });
      publishPreparedMerkle(workspace, plan, rootSignature, pub.member); pub.clearPending();
    });
    // Final rebuild is the historical fourth Sign phase. Original prefix predicates stop after this attempt's own log line.
    const finalPlan = prepareMerkle({ workspace, algorithm: "rfc9162-sha256", log: pub.owned.appendBytes(workspaceLogPath(workspace)), rebuild: true });
    const finalSigned = await signer.sign(finalPlan.digest, pub.stable), finalSignature = preparedRootSignature(finalPlan, finalSigned);
    pub.run(pub.stable, () => { publishPreparedMerkle(workspace, finalPlan, finalSignature, pub.member); pub.clearPending(); });
    return { ...rebuilt(workspace, finalPlan, "rfc9162-sha256"), migration: { path, entryHash: entry.hash } };
  } catch (cause) { throw pub.failure(cause); }
}
