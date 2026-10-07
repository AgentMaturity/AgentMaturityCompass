import { sha256Hex } from "../utils/hash.js";
import * as rfc9162 from "./rfc9162.js";

export interface MerkleProofStep {
  position: "left" | "right";
  hash: string;
}

function hashText(text: string): string {
  return sha256Hex(Buffer.from(text, "utf8"));
}

export function merkleLeafHash(entryHash: string): string {
  return hashText(`leaf:${entryHash}`);
}

export function merkleNodeHash(left: string, right: string): string {
  return hashText(`node:${left}:${right}`);
}

/**
 * The root of a log with no entries.
 *
 * Exported because the incremental writer (merkleFrontier.ts) has to reproduce
 * the full rebuild byte-for-byte at every leaf count, n = 0 included. Two
 * copies of `hashText("empty")` would be two places to get that wrong.
 */
export const MERKLE_EMPTY_ROOT: string = hashText("empty");

export function buildMerkleRootFromEntryHashes(entryHashes: string[]): string {
  if (entryHashes.length === 0) {
    return MERKLE_EMPTY_ROOT;
  }
  let level = entryHashes.map((hash) => merkleLeafHash(hash));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      next.push(merkleNodeHash(left, right));
    }
    level = next;
  }
  return level[0]!;
}

export function buildMerkleProofFromEntryHashes(entryHashes: string[], index: number): {
  entryHash: string;
  leafIndex: number;
  proofPath: MerkleProofStep[];
  root: string;
} {
  if (index < 0 || index >= entryHashes.length) {
    throw new Error(`invalid leaf index ${index} for ${entryHashes.length} entries`);
  }
  let level = entryHashes.map((hash) => merkleLeafHash(hash));
  let idx = index;
  const proofPath: MerkleProofStep[] = [];
  while (level.length > 1) {
    const siblingIndex = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (siblingIndex < level.length) {
      proofPath.push({
        position: idx % 2 === 0 ? "right" : "left",
        hash: level[siblingIndex]!
      });
    } else {
      proofPath.push({
        position: "right",
        hash: level[idx]!
      });
    }
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      next.push(merkleNodeHash(left, right));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return {
    entryHash: entryHashes[index]!,
    leafIndex: index,
    proofPath,
    root: level[0]!
  };
}

export function verifyMerkleProof(params: {
  entryHash: string;
  proofPath: MerkleProofStep[];
  root: string;
}): boolean {
  let current = merkleLeafHash(params.entryHash);
  for (const step of params.proofPath) {
    current = step.position === "left" ? merkleNodeHash(step.hash, current) : merkleNodeHash(current, step.hash);
  }
  return current === params.root;
}

/**
 * P1-26: the two trees a transparency log can use. `amc-legacy-v1` is the tree above: it hashes hex text with ad-hoc
 * prefixes and duplicates an odd last node, so leaves [a, b, c] and [a, b, c, c] share a root. It stays only so that
 * existing logs, passports and certificates keep verifying. `rfc9162-sha256` is the RFC 9162 tree over the entry
 * hashes' raw 32 bytes. A signed root or proof without an algorithm is legacy.
 */
export const MERKLE_ALGORITHMS = ["amc-legacy-v1", "rfc9162-sha256"] as const;
export type MerkleAlgorithm = (typeof MERKLE_ALGORITHMS)[number];

export function entryLeafHash(algorithm: MerkleAlgorithm, entryHash: string): string {
  return algorithm === "rfc9162-sha256" ? rfc9162.leafHash(Buffer.from(entryHash, "hex")) : merkleLeafHash(entryHash);
}

export function entryTreeRoot(algorithm: MerkleAlgorithm, entryHashes: readonly string[]): string {
  return algorithm === "rfc9162-sha256"
    ? rfc9162.rootHash(entryHashes.map((hash) => entryLeafHash(algorithm, hash)))
    : buildMerkleRootFromEntryHashes([...entryHashes]);
}

/** An inclusion proof for entry `index`. RFC 9162 sides are derived from the index and tree size, for display only. */
export function entryInclusionProof(algorithm: MerkleAlgorithm, entryHashes: readonly string[], index: number): {
  proofPath: MerkleProofStep[];
  root: string;
} {
  if (algorithm === "amc-legacy-v1") {
    const legacy = buildMerkleProofFromEntryHashes([...entryHashes], index);
    return { proofPath: legacy.proofPath, root: legacy.root };
  }
  const leaves = entryHashes.map((hash) => entryLeafHash(algorithm, hash));
  const hashes = rfc9162.inclusionProof(leaves, index);
  const sides = rfc9162.inclusionSides(index, leaves.length, hashes.length) ?? [];
  return { proofPath: hashes.map((hash, i) => ({ position: sides[i] ?? "right", hash })), root: rfc9162.rootHash(leaves) };
}

/**
 * Verifies an entry's inclusion under its algorithm. RFC 9162 needs the leaf index and tree size, which the caller
 * should take from the signed root it checks against, and ignores the steps' position flags.
 */
export function verifyEntryInclusion(input: {
  algorithm: MerkleAlgorithm;
  entryHash: string;
  leafIndex: number | undefined;
  treeSize: number | undefined;
  proofPath: readonly MerkleProofStep[];
  root: string;
}): boolean {
  if (input.algorithm === "amc-legacy-v1") {
    return verifyMerkleProof({ entryHash: input.entryHash, proofPath: [...input.proofPath], root: input.root });
  }
  if (input.leafIndex === undefined || input.treeSize === undefined || !/^[0-9a-f]{64}$/.test(input.entryHash)) return false;
  return rfc9162.verifyInclusion({ leafHash: entryLeafHash(input.algorithm, input.entryHash), leafIndex: input.leafIndex, treeSize: input.treeSize,
    proof: input.proofPath.map((step) => step.hash), rootHash: input.root });
}
