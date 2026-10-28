/**
 * The owner erasure action (P2-36; design §16 item 12): `POST /api/v1/a4/projects/:id/private/erase`. It destroys the
 * project's key (a4Blobs.destroyProjectKey: a tombstone, then the vault wrap secret and `key.enc`), so every
 * `private/*.enc` blob (personal context, brief free text, comment bodies) becomes unreadable, and records an ERASED
 * transition. The inline rows keep their salted hashes, so the chain still verifies. The key destruction runs inside a
 * fresh P2-01 deletion gate (an acknowledged DELETION_ALLOWED audit row first; a hold or an unreadable hold registry
 * refuses it), before the transition commits: an erasure that committed nothing is retried, never claimed.
 *
 * Erasure is not refused by a hold, a freeze or retirement: it removes data, it changes nothing the agent runs. It is
 * effective only once every backup, WORM segment and mirror older than it has been rotated out (ERASURE_EFFECT_NOTE).
 */
import { assertOwnerMode } from "../mode/mode.js";
import { DeletionDenied, withDeletionGate } from "../residency/deletionGate.js";
import { A4BlobError, destroyProjectKey } from "./a4Blobs.js";
import { livePrincipal, type A4Call } from "./a4Gates.js";
import { A4StoreError, readOnlyNow, type A4Store, type A4TransitionResult } from "./a4Store.js";

const A4_ERASURE_EXECUTOR = "a4-private-erase";
export const ERASURE_EFFECT_NOTE = "Erasure is effective only once every backup, WORM segment and mirror older than it has been rotated out: "
  + "each still holds the project's key file and the vault envelope with its wrap secret.";

export function eraseProjectPrivate(store: A4Store, projectId: string, input: A4Call & { reason: string; expectedHeadSeq: number }): A4TransitionResult {
  const principal = livePrincipal(store, input);
  assertOwnerMode(store.workspace, "a4 erase");
  if (readOnlyNow(store.workspace) !== false) throw new A4StoreError(409, "READ_ONLY_MODE", "Workspace signatures require read-only operation; nothing was erased.");
  return store.transition(projectId, principal, () => {
    store.assertOwner(projectId, principal);
    const chain = store.readChain(projectId);
    if (chain.some((link) => link.kind === "ERASED")) throw new A4StoreError(409, "A4_ALREADY_ERASED", "This project's private text is already erased.");
    try {
      withDeletionGate({ workspace: store.workspace, executor: A4_ERASURE_EXECUTOR, target: { kind: "blobs" } }, () => destroyProjectKey(store.workspace, projectId));
    } catch (error) {
      if (error instanceof DeletionDenied) {
        throw new A4StoreError(409, "DELETION_DENIED", error.message, { verdict: error.verdict, auditPersisted: error.auditPersisted });
      }
      if (error instanceof A4BlobError && error.code === "VAULT_LOCKED") throw new A4StoreError(423, "A4_VAULT_LOCKED", "Unlock the vault to erase.");
      throw error;
    }
    return { kind: "ERASED", payload: { reason: input.reason, keySha256: chain[0]?.body.projectPublicKeySha256 ?? null, executor: A4_ERASURE_EXECUTOR,
      deletionTarget: "blobs", effective: ERASURE_EFFECT_NOTE } };
  }, { expectedHeadSeq: input.expectedHeadSeq, request: input.request });
}
