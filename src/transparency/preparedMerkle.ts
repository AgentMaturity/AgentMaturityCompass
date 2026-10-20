import { appendFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SignedDigest } from "../crypto/signing/signerTypes.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { transparencyEntrySchema } from "./logSchema.js";
import { entryLeafHash, type MerkleAlgorithm } from "./merkle.js";
import { appendLeafToFrontier, buildFrontierFromEntryHashes, frontierRoot, type MerkleFrontier } from "./merkleFrontier.js";
import { frontierResumeBlocker, leavesFileBytes, readMerkleFrontierState, writeMerkleFrontierState } from "./merkleIndexState.js";
import { merkleCurrentRootPath, merkleCurrentRootSigPath, merkleLeavesPath, merkleRootsPath } from "./merklePaths.js";
import { merkleLeafRowSchema, merkleRootRowSchema, rootSignatureSchema } from "./merkleRows.js";

export interface TransparencyMerkleUpdate {
  readonly mode: "incremental" | "rebuild";
  readonly reason: string | null;
  readonly leafCount: number;
  readonly root: string;
}
export interface PreparedMerkle {
  readonly update: TransparencyMerkleUpdate;
  readonly row: ReturnType<typeof merkleRootRowSchema.parse>;
  readonly bytes: Buffer;
  readonly digest: string;
  readonly leaves: string;
  readonly frontier: MerkleFrontier;
}
function leafLine(entryHash: string, index: number, algorithm: MerkleAlgorithm): string {
  return JSON.stringify(merkleLeafRowSchema.parse({ v: 1, index, entryHash, leafHash: entryLeafHash(algorithm, entryHash) }));
}
export function entryHashesFromBytes(bytes: Buffer | null): string[] {
  return (bytes?.toString("utf8") ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    .map(line => transparencyEntrySchema.parse(JSON.parse(line) as unknown).hash);
}

/** Pure tree preparation except the existing optional resume-cache reads. No writer or signer is called. */
export function prepareMerkle(input: {
  workspace: string; algorithm: MerkleAlgorithm; log: Buffer | null;
  append?: { entryHash: string; prevEntryHash: string; alreadyLogged?: boolean };
  rebuild?: boolean;
  resumeRoot?: { row: ReturnType<typeof merkleRootRowSchema.parse> | null; errors: readonly string[] };
}): PreparedMerkle {
  let reason: string | null = null, frontier: MerkleFrontier | null = null, leafCount = 0, leaves = "";
  if (input.append !== undefined && !input.rebuild) {
    const state = readMerkleFrontierState(input.workspace);
    reason = state === null ? "no usable merkle frontier state" : frontierResumeBlocker({ state,
      expectedPrevEntryHash: input.append.prevEntryHash, leavesBytes: leavesFileBytes(input.workspace), algorithm: input.algorithm });
    const signed = input.resumeRoot;
    if (state !== null && reason === null && (signed === undefined || signed.row === null || signed.errors.length > 0
      || signed.row.root !== state.root || signed.row.leafCount !== state.leafCount || signed.row.lastEntryHash !== state.lastEntryHash
      || (signed.row.algorithm ?? "amc-legacy-v1") !== input.algorithm)) reason = "frontier does not match the authenticated current root";
    if (state !== null && reason === null) {
      frontier = appendLeafToFrontier(state.frontier, input.append.entryHash, input.algorithm);
      leafCount = state.leafCount + 1;
      leaves = leafLine(input.append.entryHash, state.leafCount, input.algorithm) + "\n";
    }
  }
  const mode = frontier === null ? "rebuild" : "incremental";
  let lastEntryHash = input.append?.entryHash ?? "";
  if (frontier === null) {
    const hashes = entryHashesFromBytes(input.log);
    if (input.append !== undefined && !input.append.alreadyLogged) hashes.push(input.append.entryHash);
    frontier = buildFrontierFromEntryHashes(hashes, input.algorithm); leafCount = hashes.length;
    lastEntryHash = hashes.at(-1) ?? "";
    leaves = hashes.map((hash, index) => leafLine(hash, index, input.algorithm)).join("\n");
    if (leaves.length > 0) leaves += "\n";
  }
  const root = frontierRoot(frontier, input.algorithm);
  const row = merkleRootRowSchema.parse({ v: 1, ts: Date.now(), leafCount, root, lastEntryHash, algorithm: input.algorithm });
  const bytes = Buffer.from(JSON.stringify(row, null, 2));
  return { update: { mode, reason, leafCount, root }, row, bytes, digest: sha256Hex(bytes), leaves, frontier };
}

export function preparedRootSignature(plan: PreparedMerkle, signed: SignedDigest): Buffer {
  return Buffer.from(JSON.stringify(rootSignatureSchema.parse({ digestSha256: plan.digest, signature: signed.signature,
    signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }), null, 2));
}

/** Called only inside the common short publication lock, with the signature already checked/prepared. */
export function publishPreparedMerkle(workspace: string, plan: PreparedMerkle, signature: Buffer): void {
  const leaves = merkleLeavesPath(workspace); ensureDir(dirname(leaves));
  if (plan.update.mode === "incremental") appendFileSync(leaves, plan.leaves, "utf8");
  else writeFileAtomic(leaves, plan.leaves, 0o644);
  const frontier = () => writeMerkleFrontierState({ workspace, frontier: plan.frontier, leafCount: plan.row.leafCount,
    lastEntryHash: plan.row.lastEntryHash, root: plan.row.root });
  // Retain rebuild/incremental publication order and append-only historical rows.
  if (plan.update.mode === "rebuild") frontier();
  const roots = merkleRootsPath(workspace); ensureDir(dirname(roots)); appendFileSync(roots, JSON.stringify(plan.row) + "\n", "utf8");
  writeFileAtomic(merkleCurrentRootPath(workspace), plan.bytes, 0o644);
  writeFileAtomic(merkleCurrentRootSigPath(workspace), signature, 0o644);
  if (plan.update.mode === "incremental") frontier();
}
