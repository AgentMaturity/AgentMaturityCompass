import { join } from "node:path";

/**
 * One home for the transparency Merkle store's file layout.
 *
 * The store and the incremental-update state both need these paths, and a
 * second private copy of `join(workspace, ".amc", "transparency", "merkle")`
 * is how two modules end up writing to two different directories after a
 * refactor.
 */
export function transparencyMerkleDir(workspace: string): string {
  return join(workspace, ".amc", "transparency", "merkle");
}

export function merkleLeavesPath(workspace: string): string {
  return join(transparencyMerkleDir(workspace), "leaves.jsonl");
}

export function merkleRootsPath(workspace: string): string {
  return join(transparencyMerkleDir(workspace), "roots.jsonl");
}

export function merkleCurrentRootPath(workspace: string): string {
  return join(transparencyMerkleDir(workspace), "current.root.json");
}

export function merkleCurrentRootSigPath(workspace: string): string {
  return join(transparencyMerkleDir(workspace), "current.root.sig");
}

/** The O(log n) resume state for incremental appends. A cache, never an authority. */
export function merkleFrontierPath(workspace: string): string {
  return join(transparencyMerkleDir(workspace), "frontier.json");
}

/** Records that the signed root is known to lag the log. Presence means "not repaired yet". */
export function merklePendingPath(workspace: string): string {
  return join(transparencyMerkleDir(workspace), "pending.json");
}

/** P1-26: the signed record binding the legacy root to the RFC 9162 root over the same entries. */
export function merkleMigrationPath(workspace: string): string {
  return join(transparencyMerkleDir(workspace), "migration.json");
}

export function merkleMigrationSigPath(workspace: string): string {
  return join(transparencyMerkleDir(workspace), "migration.sig");
}
