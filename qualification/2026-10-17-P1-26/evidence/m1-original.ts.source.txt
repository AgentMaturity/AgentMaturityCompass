import { createHash } from "node:crypto";

/**
 * The RFC 9162 §2.1 Merkle tree (the RFC 6962 §2.1 construction) with SHA-256 (P1-26). Leaves and nodes are domain
 * separated (0x00 and 0x01), and an unpaired subtree is promoted, never duplicated, so two different leaf lists never
 * share a root. Hashes are lowercase hex. Proofs follow §2.1.3 (inclusion) and §2.1.4 (consistency); verification
 * takes the leaf index and tree sizes as inputs and never trusts position flags. Pure: node:crypto only, so offline
 * verifiers can use it without a workspace.
 */
const HEX64 = /^[0-9a-f]{64}$/;

function sha256(...parts: Uint8Array[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}

/** MTH({}) = SHA-256 of empty input. */
export const RFC9162_EMPTY_ROOT: string = sha256();

/** SHA-256(0x00 || data). */
export function leafHash(data: Uint8Array): string {
  return sha256(Uint8Array.of(0), data);
}

/** SHA-256(0x01 || left || right), over the raw 32-byte hashes. */
export function nodeHash(left: string, right: string): string {
  return sha256(Uint8Array.of(1), Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

/** k: the largest power of two smaller than n (n > 1). */
function split(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

function mth(leaves: readonly string[], start: number, end: number): string {
  const n = end - start;
  if (n === 0) return RFC9162_EMPTY_ROOT;
  if (n === 1) return leaves[start]!;
  const k = split(n);
  return nodeHash(mth(leaves, start, start + k), mth(leaves, start + k, end));
}

/** MTH over leaf hashes (§2.1.1). */
export function rootHash(leafHashes: readonly string[]): string {
  return mth(leafHashes, 0, leafHashes.length);
}

/** PATH(m, D[n]) (§2.1.3.1): the audit path for leaf `leafIndex`, nearest sibling first. */
export function inclusionProof(leafHashes: readonly string[], leafIndex: number): string[] {
  if (!Number.isSafeInteger(leafIndex) || leafIndex < 0 || leafIndex >= leafHashes.length) {
    throw new Error(`invalid leaf index ${leafIndex} for ${leafHashes.length} leaves`);
  }
  const path = (m: number, start: number, end: number): string[] => {
    if (end - start <= 1) return [];
    const k = split(end - start);
    return m < k ? [...path(m, start, start + k), mth(leafHashes, start + k, end)]
      : [...path(m - k, start + k, end), mth(leafHashes, start, start + k)];
  };
  return path(leafIndex, 0, leafHashes.length);
}

/**
 * The side of each audit-path hash from the §2.1.3.2 walk ("left": the path hash is the left child), or null when a
 * path of `length` hashes cannot belong to leaf `leafIndex` of a tree of `treeSize` leaves.
 */
export function inclusionSides(leafIndex: number, treeSize: number, length: number): Array<"left" | "right"> | null {
  if (!Number.isSafeInteger(leafIndex) || !Number.isSafeInteger(treeSize) || leafIndex < 0 || leafIndex >= treeSize) return null;
  let fn = leafIndex;
  let sn = treeSize - 1;
  const sides: Array<"left" | "right"> = [];
  for (let i = 0; i < length; i += 1) {
    if (sn === 0) return null;
    if (fn % 2 === 1 || fn === sn) {
      sides.push("left");
      while (fn % 2 === 0 && fn !== 0) {
        fn /= 2;
        sn = Math.floor(sn / 2);
      }
    } else {
      sides.push("right");
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 ? sides : null;
}

/** §2.1.3.2: `leafHash` is leaf `leafIndex` of the tree of `treeSize` leaves whose root is `rootHash`. */
export function verifyInclusion(input: { leafHash: string; leafIndex: number; treeSize: number; proof: readonly string[]; rootHash: string }): boolean {
  if (![input.leafHash, input.rootHash, ...input.proof].every(hash => HEX64.test(hash))) return false;
  const sides = inclusionSides(input.leafIndex, input.treeSize, input.proof.length);
  if (sides === null) return false;
  const computed = input.proof.reduce((r, p, i) => sides[i] === "left" ? nodeHash(p, r) : nodeHash(r, p), input.leafHash);
  return computed === input.rootHash;
}

/** PROOF(m, D[n]) (§2.1.4.1); empty when m is 0 or n. */
export function consistencyProof(leafHashes: readonly string[], oldSize: number): string[] {
  const n = leafHashes.length;
  if (!Number.isSafeInteger(oldSize) || oldSize < 0 || oldSize > n) throw new Error(`invalid old tree size ${oldSize} for ${n} leaves`);
  if (oldSize === 0 || oldSize === n) return [];
  const subproof = (m: number, start: number, end: number, complete: boolean): string[] => {
    if (m === end - start) return complete ? [] : [mth(leafHashes, start, end)];
    const k = split(end - start);
    return m <= k ? [...subproof(m, start, start + k, complete), mth(leafHashes, start + k, end)]
      : [...subproof(m - k, start + k, end, false), mth(leafHashes, start, start + k)];
  };
  return subproof(oldSize, 0, n, true);
}

/**
 * §2.1.4.2: the tree of `newSize` leaves with root `newRoot` extends the tree of `oldSize` leaves with root `oldRoot`.
 * Equal sizes need equal roots and an empty proof; every tree extends the empty tree.
 */
export function verifyConsistency(input: { oldSize: number; newSize: number; oldRoot: string; newRoot: string; proof: readonly string[] }): boolean {
  const { oldSize, newSize, oldRoot, newRoot, proof } = input;
  if (!Number.isSafeInteger(oldSize) || !Number.isSafeInteger(newSize) || oldSize < 0 || newSize < oldSize) return false;
  if (![oldRoot, newRoot, ...proof].every(hash => HEX64.test(hash))) return false;
  if (oldSize === newSize) return proof.length === 0 && oldRoot === newRoot;
  if (oldSize === 0) return proof.length === 0 && oldRoot === RFC9162_EMPTY_ROOT;
  if (proof.length === 0) return false;
  const path = split(oldSize + 1) === oldSize ? [oldRoot, ...proof] : [...proof]; // oldSize is a power of two
  let fn = oldSize - 1;
  let sn = newSize - 1;
  while (fn % 2 === 1) {
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  let fr = path[0]!;
  let sr = path[0]!;
  for (const c of path.slice(1)) {
    if (sn === 0) return false;
    if (fn % 2 === 1 || fn === sn) {
      fr = nodeHash(c, fr);
      sr = nodeHash(c, sr);
      while (fn % 2 === 0 && fn !== 0) {
        fn /= 2;
        sn = Math.floor(sn / 2);
      }
    } else {
      sr = nodeHash(sr, c);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return fr === oldRoot && sr === newRoot && sn === 0;
}
