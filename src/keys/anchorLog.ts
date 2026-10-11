/**
 * Appends P1-08 anchors to the workspace transparency log. It lives apart from src/keys/anchors.ts so that reading a key
 * (src/crypto/keys.ts, src/vault/vault.ts) never loads the log writer and its import graph, which reaches the ledger
 * and the question bank and would close an import cycle through them.
 */
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { anchorArtifact, registerAnchorLogWriter, type AnchorTarget } from "./anchors.js";

/** Appends the transparency entry for `target` and returns its hash. Raise the machine mark once the file is final. */
export function logSequence(target: Omit<AnchorTarget, "fileSha256" | "entryHash">): string {
  return appendTransparencyEntry({ workspace: target.workspace, type: target.type, agentId: "workspace", artifact: anchorArtifact(target) }).hash;
}

registerAnchorLogWriter(logSequence);
