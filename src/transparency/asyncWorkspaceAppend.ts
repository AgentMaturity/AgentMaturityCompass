import { appendFileSync } from "node:fs";
import type { z } from "zod";
import { assertPolicySignerCurrent, describePolicySigner, signDigestWithPolicyAsync,
  type PolicySignerDescriptor } from "../crypto/signing/signer.js";
import type { SignedDigest } from "../crypto/signing/signerTypes.js";
import { verifyWorkspaceLogSignature, type WorkspaceLogKind } from "./workspaceSignature.js";
import { assertPurposePublicationCurrent, capturePurposePublication } from "../keys/purposePublication.js";
import { boundProviderKey } from "../keys/keyset.js";
import type { KeyProviderId } from "../keys/provider.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { transparencyEntrySchema, transparencySealSchema, transparencySealSignatureSchema,
  type TransparencyArtifactKind, type TransparencyEntry } from "./logSchema.js";
import { entryTreeRoot, type MerkleAlgorithm } from "./merkle.js";
import { merkleCurrentRootPath, merkleCurrentRootSigPath, merkleMigrationPath, merkleMigrationSigPath } from "./merklePaths.js";
import { clearMerklePendingMarker, TransparencyMerkleLagError, writeMerklePendingMarker } from "./merkleIndexState.js";
import { merkleMigrationSchema, merkleRootRowSchema, rootSignatureSchema } from "./merkleRows.js";
import { prepareMerkle, preparedRootSignature, publishPreparedMerkle } from "./preparedMerkle.js";
import { assertTransparencyStateCurrent, captureTransparencyState, publishTransparencyState, stateBytes,
  workspaceLogPath, workspaceSealPath, workspaceSealSigPath, type TransparencyState } from "./workspacePublication.js";

export interface TransparencyAppendInput {
  workspace: string; type: string; agentId: string;
  artifact: { kind: TransparencyArtifactKind; sha256: string; id?: string };
}

function readSignedSnapshot<T>(workspace: string, state: TransparencyState, body: string, sidecar: string, schema: z.ZodType<T>, kind: WorkspaceLogKind): T | null {
  const bytes = stateBytes(state, body), signature = stateBytes(state, sidecar);
  if (bytes === null && signature === null) return null;
  if (bytes === null || signature === null) throw new Error("transparency signed predecessor is incomplete");
  const row = schema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
  const sig = rootSignatureSchema.parse(JSON.parse(signature.toString("utf8")) as unknown), digest = sha256Hex(bytes);
  if (sig.digestSha256 !== digest || !verifyWorkspaceLogSignature(workspace, kind, digest, sig)) {
    throw new Error("transparency signed predecessor is invalid");
  }
  return row;
}

/** Reads/validates only the captured bytes. It neither initializes nor repairs authenticated state. */
function verifiedPredecessor(workspace: string, state: TransparencyState): { entries: TransparencyEntry[]; algorithm: MerkleAlgorithm } {
  const entries = (stateBytes(state, workspaceLogPath(workspace))?.toString("utf8") ?? "").split(/\r?\n/)
    .map(line => line.trim()).filter(Boolean).map(line => transparencyEntrySchema.parse(JSON.parse(line) as unknown));
  let tail = "";
  for (const entry of entries) {
    const { hash, ...payload } = entry;
    if (entry.prev !== tail || sha256Hex(canonicalize(payload)) !== hash) throw new Error("transparency predecessor chain is invalid");
    tail = hash;
  }
  const seal = readSignedSnapshot(workspace, state, workspaceSealPath(workspace), workspaceSealSigPath(workspace), transparencySealSchema, "TRANSPARENCY_ROOT");
  if ((seal === null && entries.length > 0) || (seal !== null && seal.lastHash !== tail)) throw new Error("transparency predecessor seal does not cover the log");
  const root = readSignedSnapshot(workspace, state, merkleCurrentRootPath(workspace), merkleCurrentRootSigPath(workspace), merkleRootRowSchema, "MERKLE_ROOT");
  if (root === null && entries.length > 0) throw new Error("transparency predecessor root is missing; repair the index first");
  const hashes = entries.map(entry => entry.hash);
  if (root !== null && (root.leafCount > hashes.length || (hashes[root.leafCount - 1] ?? "") !== root.lastEntryHash
    || entryTreeRoot(root.algorithm ?? "amc-legacy-v1", hashes.slice(0, root.leafCount)) !== root.root)) {
    throw new Error("transparency predecessor root does not cover its claimed prefix");
  }
  const migration = readSignedSnapshot(workspace, state, merkleMigrationPath(workspace), merkleMigrationSigPath(workspace), merkleMigrationSchema, "MERKLE_ROOT");
  if (migration !== null) {
    const prefix = hashes.slice(0, migration.leafCount);
    if (migration.leafCount > hashes.length || (prefix.at(-1) ?? "") !== migration.lastEntryHash
      || entryTreeRoot("amc-legacy-v1", prefix) !== migration.legacyRoot || entryTreeRoot("rfc9162-sha256", prefix) !== migration.rfc9162Root) {
      throw new Error("transparency migration predecessor does not cover the log");
    }
  }
  const legacy = root !== null && (root.algorithm ?? "amc-legacy-v1") === "amc-legacy-v1";
  if (legacy && (migration !== null || seal?.merkleAlgorithm === "rfc9162-sha256")) throw new Error("transparency predecessor attempts a tree downgrade");
  return { entries, algorithm: legacy && migration === null && seal !== null && (seal.merkleAlgorithm ?? "amc-legacy-v1") === "amc-legacy-v1"
    ? "amc-legacy-v1" : "rfc9162-sha256" };
}

function captureSigner(workspace: string, descriptor: PolicySignerDescriptor) {
  const purpose = descriptor.mode === "VAULT" ? capturePurposePublication(workspace, "artifact-seal") : null;
  const holder: KeyProviderId = boundProviderKey(workspace, "artifact-seal")?.binding.provider ?? "file";
  return { descriptor, purpose, holder };
}
function assertSignerCurrent(workspace: string, original: ReturnType<typeof captureSigner>, signed: SignedDigest): void {
  assertPolicySignerCurrent(workspace, original.descriptor);
  if (original.purpose !== null) {
    if (signed.envelope === undefined) throw new Error("prepared transparency signature envelope is missing");
    assertPurposePublicationCurrent(workspace, original.purpose, { provider: original.holder, algorithm: signed.envelope.alg,
      publicKeyPem: original.descriptor.publicKeyPem, keyId: original.descriptor.fingerprint, signature: Buffer.from(signed.signature, "base64") });
  }
}

/** One prepared attempt. A competing writer refuses before this attempt appends; callers may explicitly retry. */
export async function appendTransparencyEntryAsync(input: TransparencyAppendInput, options: { beforeCommit?: () => void } = {}): Promise<TransparencyEntry> {
  const params = { workspace: input.workspace, type: input.type, agentId: input.agentId, artifact: { ...input.artifact } };
  const beforeCommit = options.beforeCommit, workspace = params.workspace;
  const sealSigner = captureSigner(workspace, describePolicySigner(workspace, "TRANSPARENCY_ROOT"));
  const rootSigner = captureSigner(workspace, describePolicySigner(workspace, "MERKLE_ROOT"));
  const policy = JSON.stringify(loadTrustConfig(workspace));
  const before = captureTransparencyState(workspace, true), predecessor = verifiedPredecessor(workspace, before);
  assertTransparencyStateCurrent(before);
  const payload = { v: 1 as const, ts: Date.now(), type: params.type, agentId: params.agentId,
    artifact: { kind: params.artifact.kind, sha256: params.artifact.sha256, ...(params.artifact.id ? { id: params.artifact.id } : {}) },
    prev: predecessor.entries.at(-1)?.hash ?? "" };
  const entry = transparencyEntrySchema.parse({ ...payload, hash: sha256Hex(canonicalize(payload)) });
  const seal = Buffer.from(JSON.stringify(transparencySealSchema.parse({ v: 1, ts: Date.now(), lastHash: entry.hash,
    signerFingerprint: sealSigner.descriptor.fingerprint, merkleAlgorithm: predecessor.algorithm }), null, 2));
  const plan = prepareMerkle({ workspace, algorithm: predecessor.algorithm, log: stateBytes(before, workspaceLogPath(workspace)),
    append: { entryHash: entry.hash, prevEntryHash: entry.prev }, rebuild: true });
  const signedSeal = await signDigestWithPolicyAsync({ workspace, kind: "TRANSPARENCY_ROOT", digestHex: sha256Hex(seal), expectedSigner: sealSigner.descriptor });
  const sealSignature = Buffer.from(JSON.stringify(transparencySealSignatureSchema.parse({ digestSha256: sha256Hex(seal),
    signature: signedSeal.signature, signedTs: signedSeal.signedTs, signer: "auditor", envelope: signedSeal.envelope }), null, 2));
  const signedRoot = await signDigestWithPolicyAsync({ workspace, kind: "MERKLE_ROOT", digestHex: plan.digest, expectedSigner: rootSigner.descriptor });
  const rootSignature = preparedRootSignature(plan, signedRoot);
  return publishTransparencyState(workspace, before, () => {
    // Internal maintained-consumer gate: synchronous local checks only, no signing/history initialization or await.
    beforeCommit?.();
    assertSignerCurrent(workspace, sealSigner, signedSeal); assertSignerCurrent(workspace, rootSigner, signedRoot);
    if (JSON.stringify(loadTrustConfig(workspace)) !== policy) throw new Error("transparency signing policy changed while signing was prepared");
    assertTransparencyStateCurrent(before);
    const oldLog = stateBytes(before, workspaceLogPath(workspace));
    const separator = oldLog !== null && oldLog.length > 0 && oldLog[oldLog.length - 1] !== 10 ? "\n" : "";
    appendFileSync(workspaceLogPath(workspace), separator + JSON.stringify(entry) + "\n", "utf8");
    try {
      writeFileAtomic(workspaceSealPath(workspace), seal, 0o644); writeFileAtomic(workspaceSealSigPath(workspace), sealSignature, 0o644);
      publishPreparedMerkle(workspace, plan, rootSignature); clearMerklePendingMarker(workspace); return entry;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const pendingRecorded = writeMerklePendingMarker({ workspace, entryHash: entry.hash, reason });
      throw new TransparencyMerkleLagError({ entryHash: entry.hash, pendingRecorded, reason, cause: error });
    }
  });
}
