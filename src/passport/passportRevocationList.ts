/**
 * Passport revocations an outsider can check: `.amc/passport/revocations.signed.json`, an amc.revocation-list
 * (src/keys/revocationList.ts) with listId `passports:<workspaceId>`. The workspace's revocation-list key signs it; it
 * carries an issue time, a sequence number and the digest of the list before it, and each sequence is anchored in the
 * workspace transparency log and this machine's high-water mark, so an older copy is refused here. A reader outside the
 * workspace checks it with the standalone verifier against the revocation-list key its own trust list pins, and passes
 * `--known-sequence passports:<workspaceId>=<n>` to refuse a list older than one it has seen.
 *
 * The older unsigned `.amc/passport/revocations.json` is still written and read for this workspace's own checks: it can
 * only add revocations, never remove one.
 */
import { join } from "node:path";
import { getSigningKey } from "../crypto/keys.js";
import { logSequence } from "../keys/anchorLog.js";
import { assertNeverAnchored } from "../keys/anchors.js";
import {
  nextRevocationList, publishRevocationList, readAnchoredRevocationList, recoverPendingRevocationList, revocationListSha256,
  type AnchoredListLocation, type SignedRevocationList
} from "../keys/revocationList.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { ensureContainedDir } from "../utils/containedFs.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";

const DIR = ".amc/passport";
export const PASSPORT_REVOCATION_LIST_REL = `${DIR}/revocations.signed.json`;
/** A row for a passport that expired this long ago is dropped on the next write: verifiers refuse expired passports anyway. */
const PRUNE_GRACE_MS = 24 * 60 * 60 * 1000;

export function passportRevocationListId(workspace: string): string {
  return `passports:${workspaceIdFromDirectory(workspace)}`;
}

function location(workspace: string): AnchoredListLocation {
  return { workspace, rel: PASSPORT_REVOCATION_LIST_REL, listId: passportRevocationListId(workspace),
    trustedPublicKeyPems: getPurposeKeyHistory(workspace, "revocation-list") };
}

/**
 * The verified, rollback-checked signed list; null only when none was ever published. Throws the reason when the list
 * does not verify, is older than one already anchored, or was removed after one was anchored.
 */
export function readPassportRevocationList(workspace: string): SignedRevocationList | null {
  const loc = location(workspace);
  const signed = readAnchoredRevocationList(loc);
  if (signed === null) assertNeverAnchored(workspace, "REVOCATION_LIST", loc.listId);
  return signed;
}

/** The signed list's row for `passportId`, or null. Throws when the list cannot be read or proven current. */
export function signedPassportRevocation(workspace: string, passportId: string): { revokedAt: string; reason: string } | null {
  const row = readPassportRevocationList(workspace)?.list.revoked.find(entry => entry.kind === "passport" && entry.id === passportId);
  return row === undefined ? null : { revokedAt: row.revokedAt, reason: row.reason };
}

/**
 * Adds `passportId` to the signed list and publishes the next sequence. Nothing is written unless the vault can sign
 * with the revocation-list key. A passport revoked before keeps its first revocation time.
 */
export function publishPassportRevocation(workspace: string, input: { passportId: string; reason: string; expiresTs?: number | null }): {
  path: string; listId: string; sequence: number; issuedAt: string;
} {
  ensureContainedDir(workspace, DIR);
  return withControlFileLock({ root: join(workspace, ".amc", "passport"), name: "passport-revocations", operation: () => {
    const loc = location(workspace);
    recoverPendingRevocationList(loc);
    const current = readPassportRevocationList(workspace);
    const rows = current?.list.revoked ?? [];
    const earlier = rows.find(row => row.kind === "passport" && row.id === input.passportId);
    const row = {
      id: input.passportId, kind: "passport" as const, revokedAt: earlier?.revokedAt ?? new Date().toISOString(),
      reason: input.reason.trim() || "unspecified",
      ...(typeof input.expiresTs === "number" ? { expiresAt: new Date(input.expiresTs).toISOString() } : {})
    };
    const previous = current === null ? null : { sequence: current.list.sequence, sha256: revocationListSha256(current.list) };
    const list = nextRevocationList(loc.listId, previous, [...rows.filter(entry => entry !== earlier), row], PRUNE_GRACE_MS);
    const published = publishRevocationList(loc, list, getSigningKey(workspace, "revocation-list"), logSequence);
    return { path: join(workspace, PASSPORT_REVOCATION_LIST_REL), listId: loc.listId, sequence: published.list.sequence, issuedAt: published.list.issuedAt };
  } });
}
