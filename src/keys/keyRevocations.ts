/**
 * The workspace key revocation list (P1-08): `.amc/keys/revocations.signed.json`, an amc.revocation-list with listId
 * `keys:<workspaceId>`, signed by the revocation-list purpose key. Every key set writes it (empty at creation), so once a
 * workspace has a key set a missing list is refused, never read as "no revocations". It is checked at every key use:
 * an unreadable, unverifiable, rolled-back or forked list refuses every key, and a revoked current key refuses itself.
 * Verification trusts the revocation-list key history read from the public files, never a key the list names.
 */
import { join } from "node:path";
import { verifyKeyHistoryEnvelope } from "../crypto/keyHistoryEnvelope.js";
import { containedExists, readContainedOrNull, statStamp } from "../utils/containedFs.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { assertNeverAnchored } from "./anchors.js";
import { highWaterPath } from "./highWater.js";
import { readAnchoredRevocationList, readStagedRevocationList, type AnchoredListLocation } from "./revocationList.js";

export const KEY_REVOCATION_REASONS = ["key-compromise", "superseded", "unspecified"] as const;
export type KeyRevocationReason = (typeof KEY_REVOCATION_REASONS)[number];
export interface KeyRevocation { keyId: string; revokedAt: string; reason: KeyRevocationReason }

function keysDir(workspace: string): string {
  return join(workspace, ".amc", "keys");
}

const LIST_REL = ".amc/keys/revocations.signed.json";
const keyFile = (workspace: string, name: string) => readContainedOrNull(workspace, `.amc/keys/${name}`, 1024 * 1024)?.toString("utf8") ?? null;

/** The revocation-list key history from the public files; a history that does not authenticate trusts only the current key. */
function trustedRevocationKeys(workspace: string): string[] {
  const current = keyFile(workspace, "revocation-list.pub");
  if (current === null) throw new Error("revocation-list.pub is missing; the key revocation list cannot be verified");
  let history: string[] = [];
  try {
    history = verifyKeyHistoryEnvelope(JSON.parse(keyFile(workspace, "revocation-list_history.json") ?? "null"), "revocation-list", current).envelope?.entries.map(entry => entry.publicKeyPem) ?? [];
  } catch { /* an unauthenticated history adds no keys */ }
  return [...new Set([...history, current])];
}

/** Where the list lives; `trusted` overrides the keys read from the public files (a writer that holds them already). */
export function keyRevocationLocation(workspace: string, trusted?: readonly string[]): AnchoredListLocation {
  return { workspace, rel: LIST_REL, listId: `keys:${workspaceIdFromDirectory(workspace)}`, trustedPublicKeyPems: trusted ?? trustedRevocationKeys(workspace) };
}

const memo = new Map<string, { stamp: string; rows: KeyRevocation[] }>();

/**
 * The workspace's key revocations from one verified, rollback-checked read. `required` (the workspace has a key set):
 * a missing list is refused. Throws whenever the list cannot be read or proven current.
 */
export function readKeyRevocations(workspace: string, required: boolean): KeyRevocation[] {
  const path = join(keysDir(workspace), "revocations.signed.json");
  const now = statStamp([path, `${path}.pending`, highWaterPath()]);
  const cached = memo.get(workspace);
  if (cached && cached.stamp === now) return cached.rows;
  if (!containedExists(workspace, LIST_REL)) {
    if (required) throw new Error(`the workspace key revocation list ${path} is missing; refusing every key until it is restored`);
    // No key set either: a list is absent only if neither anchor ever recorded one.
    assertNeverAnchored(workspace, "REVOCATION_LIST", `keys:${workspaceIdFromDirectory(workspace)}`);
    return [];
  }
  const location = keyRevocationLocation(workspace);
  const signed = readAnchoredRevocationList(location)!;
  // A staged next list (a write in progress, or one a crash interrupted) must verify, and its rows count too: in the
  // conservative direction, any revocation observed is enforced until the next writer completes or discards it.
  const staged = readStagedRevocationList(location);
  const rows = [...signed.list.revoked, ...(staged?.list.revoked ?? [])].filter(row => row.kind === "key").map(row => ({
    keyId: row.id, revokedAt: row.revokedAt,
    reason: KEY_REVOCATION_REASONS.find(reason => row.reason.startsWith(`${reason}:`)) ?? "unspecified"
  }));
  memo.set(workspace, { stamp: now, rows });
  return rows;
}

/** Throws when `keyId` is revoked; the use-time check behind every signing key. */
export function assertKeyNotRevoked(workspace: string, required: boolean, keyId: string, purpose: string): void {
  const revoked = readKeyRevocations(workspace, required).find(row => row.keyId === keyId);
  if (revoked) throw new Error(`the ${purpose} key ${keyId} was revoked at ${revoked.revokedAt} (${revoked.reason}); rotate it with amc keys rotate --purpose ${purpose}`);
}
