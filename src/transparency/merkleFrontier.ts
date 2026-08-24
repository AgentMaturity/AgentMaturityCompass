import { MERKLE_EMPTY_ROOT, merkleLeafHash, merkleNodeHash } from "./merkle.js";

/**
 * The O(log n) state an incremental Merkle writer needs.
 *
 * The transparency tree duplicates its odd last node (Bitcoin style: see
 * merkle.ts), so appending one leaf rewrites the entire right spine — the
 * previous root alone is not enough to compute the next one. What IS enough is
 * the set of *complete perfect subtrees* the log has accumulated so far: their
 * sizes are the set bits of the leaf count, and none of them can ever change,
 * because a perfect subtree contains no duplicated node. That set is the
 * frontier, and it is exactly `popcount(n)` hashes.
 *
 * This module is pure so the equivalence property — incremental root ==
 * full-rebuild root, for every n — is testable without touching a workspace.
 * That property is not a nicety: verifyTransparencyMerkle recomputes the root
 * from the log and compares it to the signed current.root.json, so any divergence
 * turns every subsequent verification into a hard failure.
 */
export interface MerkleFrontierNode {
  readonly level: number;
  readonly hash: string;
}

/** Frontier nodes, largest subtree first (levels strictly descending). */
export type MerkleFrontier = readonly MerkleFrontierNode[];

export const EMPTY_MERKLE_FRONTIER: MerkleFrontier = Object.freeze([]);

/**
 * Adds one leaf, carrying like a binary counter.
 *
 * A new leaf enters at level 0; whenever the two rightmost nodes sit at the
 * same level they merge into one node a level up. This is the same pairing the
 * full rebuild performs, just done once per append instead of once per level
 * per append.
 */
export function appendLeafToFrontier(frontier: MerkleFrontier, entryHash: string): MerkleFrontier {
  const next: MerkleFrontierNode[] = [...frontier, { level: 0, hash: merkleLeafHash(entryHash) }];
  while (next.length >= 2) {
    const right = next[next.length - 1]!;
    const left = next[next.length - 2]!;
    if (right.level !== left.level) {
      break;
    }
    next.length -= 2;
    next.push({ level: left.level + 1, hash: merkleNodeHash(left.hash, right.hash) });
  }
  return next;
}

/**
 * Folds the frontier into the root the full rebuild would produce.
 *
 * Read right to left. The rightmost subtree is the ragged tail, and the tree's
 * odd-node rule says a tail is promoted by hashing it against itself until it
 * reaches the level of the subtree on its left — which is precisely what the
 * inner `while` does. Then the two combine, and the fold continues one level up.
 */
export function frontierRoot(frontier: MerkleFrontier): string {
  if (frontier.length === 0) {
    return MERKLE_EMPTY_ROOT;
  }
  const tail = frontier[frontier.length - 1]!;
  let current = tail.hash;
  let level = tail.level;
  for (let i = frontier.length - 2; i >= 0; i -= 1) {
    const node = frontier[i]!;
    while (level < node.level) {
      current = merkleNodeHash(current, current);
      level += 1;
    }
    current = merkleNodeHash(node.hash, current);
    level = node.level + 1;
  }
  return current;
}

/** Builds the frontier from scratch. Used by the repair path, which already reads every hash. */
export function buildFrontierFromEntryHashes(entryHashes: readonly string[]): MerkleFrontier {
  let frontier: MerkleFrontier = EMPTY_MERKLE_FRONTIER;
  for (const entryHash of entryHashes) {
    frontier = appendLeafToFrontier(frontier, entryHash);
  }
  return frontier;
}

/**
 * Whether a frontier's shape is the one `leafCount` leaves must produce.
 *
 * The frontier is a persisted cache, so it is attacker-writable in the same
 * threat model as everything else under `.amc/`. This is the cheap structural
 * half of the resume check: subtree levels must be exactly the set bits of the
 * leaf count, descending. A frontier that fails it cannot have come from this
 * log at this length, whatever its hashes claim.
 */
export function frontierMatchesLeafCount(frontier: MerkleFrontier, leafCount: number): boolean {
  if (!Number.isSafeInteger(leafCount) || leafCount < 0) {
    return false;
  }
  const expected: number[] = [];
  for (let bit = 47; bit >= 0; bit -= 1) {
    if (Math.floor(leafCount / 2 ** bit) % 2 === 1) {
      expected.push(bit);
    }
  }
  if (expected.length !== frontier.length) {
    return false;
  }
  return expected.every((level, index) => frontier[index]!.level === level);
}
