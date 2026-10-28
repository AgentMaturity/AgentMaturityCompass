/**
 * Appends P1-08 anchors to the workspace transparency log. It lives apart from src/keys/anchors.ts so that reading a key
 * (src/crypto/keys.ts, src/vault/vault.ts) never loads the log writer and its import graph, which reaches the ledger
 * and the question bank and would close an import cycle through them.
 */
import { signingRoute, withRevocationLogRoute } from "../crypto/signing/signer.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { anchorArtifact, registerAnchorLogWriter, type AnchorTarget } from "./anchors.js";
import { assertVaultMaySign } from "./signingKeys.js";

/** Appends the transparency entry for `target` and returns its hash. Raise the machine mark once the file is final. */
export function logSequence(target: Omit<AnchorTarget, "fileSha256" | "entryHash">): string {
  return appendTransparencyEntry({ workspace: target.workspace, type: target.type, agentId: "workspace", artifact: anchorArtifact(target) }).hash;
}

/** logSequence for a key revocation: a refused trust config never blocks it (P0-37, see withRevocationLogRoute). */
export function logRevocationSequence(target: Omit<AnchorTarget, "fileSha256" | "entryHash">): string {
  return withRevocationLogRoute(target.workspace, () => logSequence(target));
}

registerAnchorLogWriter(logSequence, workspace => {
  // The seal of every log append is signed by the route the trust config names; an unverifiable config refuses here,
  // and so does a vault route whose artifact-seal key is held by a key provider (P2-08).
  if (signingRoute(workspace, "TRANSPARENCY_ROOT") === "vault") assertVaultMaySign(workspace, "artifact-seal");
});
