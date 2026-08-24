import { sha256Hex } from "../utils/hash.js";

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
