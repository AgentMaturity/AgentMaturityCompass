import type { TrustContext } from "../trust/trustContext.js";
import type { MerkleAlgorithm } from "./merkle.js";
import { appendTransparencyEntry } from "./logChain.js";
import {
  currentTransparencyMerkleRoot,
  currentTreeAlgorithm,
  ensureTransparencyMerkleInitialized,
  exportTransparencyProofBundle,
  listTransparencyMerkleRoots,
  rebuildTransparencyMerkle,
  verifyTransparencyMerkle,
  verifyTransparencyProofBundle,
  writeMerkleMigrationRecord
} from "./merkleIndexStore.js";
export { verifyWorkspaceProofBundle } from "./workspaceProofBundle.js";

/**
 * Rebuilds the index in the workspace's tree. `--algorithm rfc9162-sha256` on a legacy log migrates it (P1-26): a
 * signed record binds both roots, and a log entry naming that record re-seals the log as RFC 9162, so the move is
 * part of the hash chain and one-way. Asking for the legacy tree on an RFC 9162 log is refused.
 */
export function transparencyMerkleRebuildCli(workspace: string, opts: { algorithm?: MerkleAlgorithm } = {}): ReturnType<typeof rebuildTransparencyMerkle> & {
  migration: { path: string; entryHash: string } | null;
} {
  const current = currentTreeAlgorithm(workspace);
  if (opts.algorithm === "amc-legacy-v1" && current !== "amc-legacy-v1") {
    throw new Error("refusing to rebuild as amc-legacy-v1: the legacy tree is ambiguous, and logs migrate only to rfc9162-sha256");
  }
  let migration: { path: string; entryHash: string } | null = null;
  if (opts.algorithm === "rfc9162-sha256" && current === "amc-legacy-v1") {
    const record = writeMerkleMigrationRecord(workspace);
    const entry = appendTransparencyEntry({ workspace, type: "MERKLE_TREE_MIGRATED", agentId: "workspace",
      artifact: { kind: "merkle-migration", sha256: record.sha256, id: "rfc9162-sha256" } });
    migration = { path: record.path, entryHash: entry.hash };
  }
  return { ...rebuildTransparencyMerkle(workspace), migration };
}

export function transparencyMerkleRootCli(workspace: string): {
  current: ReturnType<typeof currentTransparencyMerkleRoot>;
  history: ReturnType<typeof listTransparencyMerkleRoots>;
  verify: ReturnType<typeof verifyTransparencyMerkle>;
} {
  ensureTransparencyMerkleInitialized(workspace);
  return {
    current: currentTransparencyMerkleRoot(workspace),
    history: listTransparencyMerkleRoots(workspace, 20),
    verify: verifyTransparencyMerkle(workspace)
  };
}

export function transparencyMerkleProofCli(params: {
  workspace: string;
  entryHash: string;
  outFile: string;
}): ReturnType<typeof exportTransparencyProofBundle> {
  ensureTransparencyMerkleInitialized(params.workspace);
  return exportTransparencyProofBundle(params);
}

export function transparencyMerkleVerifyProofCli(bundleFile: string, trust: TrustContext, pubkeyPem?: string | null): ReturnType<typeof verifyTransparencyProofBundle> {
  return verifyTransparencyProofBundle(bundleFile, trust, pubkeyPem);
}
