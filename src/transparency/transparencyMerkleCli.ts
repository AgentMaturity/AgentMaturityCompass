import type { TrustContext } from "../trust/trustContext.js";
import {
  currentTransparencyMerkleRoot,
  ensureTransparencyMerkleInitialized,
  exportTransparencyProofBundle,
  listTransparencyMerkleRoots,
  rebuildTransparencyMerkle,
  verifyTransparencyMerkle,
  verifyTransparencyProofBundle
} from "./merkleIndexStore.js";

export function transparencyMerkleRebuildCli(workspace: string): ReturnType<typeof rebuildTransparencyMerkle> {
  return rebuildTransparencyMerkle(workspace);
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
