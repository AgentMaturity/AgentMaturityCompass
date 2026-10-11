import { dirname, join } from "node:path";
import { getSigningKey, getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { logSequence } from "../keys/anchorLog.js";
import { assertNeverAnchored, loggedAnchor } from "../keys/anchors.js";
import {
  MAX_REVOCATION_LIST_BYTES, nextRevocationList, publishRevocationList, readAnchoredRevocationList, recoverPendingRevocationList,
  revocationListSchema, revocationListSha256, type AnchoredListLocation, type RevocationListV1, type SignedRevocationList
} from "../keys/revocationList.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { containedExists, ensureContainedDir, readContained, readContainedOrNull, removeContained, writeContained } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { leaseRevocationsSchema, type LeaseRevocations } from "./leaseSchema.js";

/**
 * Lease revocations (P1-08): one signed, sequenced file, `.amc/studio/leases/revocations.signed.json` (an
 * amc.revocation-list, src/keys/revocationList.ts), anchored in the workspace transparency log and in this machine's
 * high-water mark. An older list, a list with other content at an accepted sequence, or a missing list once one was
 * anchored is refused, so restoring an old copy or deleting the store never un-revokes a lease.
 *
 * Before the first write a workspace may still hold the 1.x pair (revocations.json + revocations.json.sig); readers
 * accept it only while nothing was anchored. The first write signs its content as sequence 1 with previousSha256 = the
 * old list's digest, then replaces the old signature with a tombstone and removes the old list, so a 1.x binary sees
 * "list missing but signature present" and refuses every lease instead of reading an empty store.
 */

interface LegacySignedDigest {
  digestSha256: string;
  signature: string;
}

export function leaseRevocationPaths(workspace: string): { file: string; pending: string; legacyFile: string; legacySig: string } {
  const dir = join(workspace, ".amc", "studio", "leases");
  const legacyFile = join(dir, "revocations.json");
  const file = join(dir, "revocations.signed.json");
  return { file, pending: `${file}.pending`, legacyFile, legacySig: `${legacyFile}.sig` };
}

const MAX_LIST_BYTES = MAX_REVOCATION_LIST_BYTES;
const MAX_SIG_BYTES = 64 * 1024;
/** A revocation of a credential that expired this long ago is pruned on the next write: verifiers refuse it anyway. */
const PRUNE_GRACE_MS = 5 * 60 * 1000;
const ANCHOR = "REVOCATION_LIST" as const;

function listIdFor(workspace: string): string {
  return `leases:${workspaceIdFromDirectory(workspace)}`;
}

function trustedKeys(workspace: string): string[] {
  return getPublicKeyHistory(workspace, "auditor");
}

// Every store file is reached through src/utils/containedFs.ts: real directories below the workspace, no symlink,
// special file or hard link in a file's place.
const LEASES = ".amc/studio/leases";
const REL = {
  file: `${LEASES}/revocations.signed.json`,
  pending: `${LEASES}/revocations.signed.json.pending`,
  legacyFile: `${LEASES}/revocations.json`,
  legacySig: `${LEASES}/revocations.json.sig`
} as const;
const has = (workspace: string, which: keyof typeof REL) => containedExists(workspace, REL[which]);

function location(workspace: string): AnchoredListLocation {
  return { workspace, rel: REL.file, listId: listIdFor(workspace), trustedPublicKeyPems: trustedKeys(workspace) };
}

function defaultLeaseRevocations(): LeaseRevocations {
  return { v: 1, updatedTs: Date.now(), revocations: [] };
}

/** The 1.x view every existing consumer reads: lease rows only. */
function legacyView(list: RevocationListV1): LeaseRevocations {
  return {
    v: 1,
    updatedTs: Date.parse(list.issuedAt),
    revocations: list.revoked.filter(row => row.kind === "lease").map(row => ({ leaseId: row.id, revokedTs: Date.parse(row.revokedAt), reason: row.reason }))
  };
}

type Current =
  | { kind: "signed"; signed: SignedRevocationList }
  | { kind: "legacy"; store: LeaseRevocations; digest: string }
  | { kind: "empty" };

/** The 1.x pair, verified and parsed from one read of the list; a tombstone or partial pair throws. */
function readLegacyPair(workspace: string): { store: LeaseRevocations; digest: string } {
  if (!has(workspace, "legacyFile")) throw new Error("revocation list missing but signature present");
  if (!has(workspace, "legacySig")) throw new Error("revocation signature missing");
  const bytes = readContained(workspace, REL.legacyFile, MAX_LIST_BYTES);
  const signed = JSON.parse(readContained(workspace, REL.legacySig, MAX_SIG_BYTES).toString("utf8")) as LegacySignedDigest;
  const digest = sha256Hex(bytes);
  if (signed.digestSha256 !== digest) throw new Error("digest mismatch");
  if (!verifyHexDigestAny(digest, signed.signature, trustedKeys(workspace))) throw new Error("signature verification failed");
  return { store: leaseRevocationsSchema.parse(JSON.parse(bytes.toString("utf8"))), digest };
}

/** One verified read; the caller holds the revocations lock or has seen no interrupted write. Throws the reason. */
function readCurrent(workspace: string): Current {
  if (has(workspace, "file")) return { kind: "signed", signed: readAnchoredRevocationList(location(workspace))! };
  // No signed list: the 1.x pair, or nothing, may stand only if no signed list was ever anchored.
  assertNeverAnchored(workspace, ANCHOR, listIdFor(workspace));
  if (has(workspace, "legacyFile") || has(workspace, "legacySig")) return { kind: "legacy", ...readLegacyPair(workspace) };
  return { kind: "empty" };
}

/** Publishes the next list, then replaces a superseded 1.x pair with a tombstone. Caller holds the revocations lock. */
function publishLocked(workspace: string, list: RevocationListV1): SignedRevocationList {
  const published = publishRevocationList(location(workspace), list, getSigningKey(workspace, "revocation-list"), logSequence);
  if (has(workspace, "legacyFile") || has(workspace, "legacySig")) {
    writeContained(workspace, REL.legacySig, JSON.stringify({ type: "amc.revocation-list-moved", to: "revocations.signed.json", previousSha256: list.previousSha256 }), 0o644);
    removeContained(workspace, REL.legacyFile);
  }
  return published;
}

/** What the next list follows: the signed list's sequence and digest, or sequence 0 and the 1.x list's digest. */
function previousOf(current: Current): { sequence: number; sha256: string } | null {
  if (current.kind === "signed") return { sequence: current.signed.list.sequence, sha256: revocationListSha256(current.signed.list) };
  return current.kind === "legacy" ? { sequence: 0, sha256: current.digest } : null;
}

function nextList(workspace: string, previous: { sequence: number; sha256: string } | null, rows: RevocationListV1["revoked"]): RevocationListV1 {
  return nextRevocationList(listIdFor(workspace), previous, rows, PRUNE_GRACE_MS);
}

function currentRows(current: Current): RevocationListV1["revoked"] {
  if (current.kind === "signed") return current.signed.list.revoked;
  if (current.kind === "legacy") {
    return current.store.revocations.map(row => ({ id: row.leaseId, kind: "lease" as const, revokedAt: new Date(row.revokedTs).toISOString(), reason: row.reason }));
  }
  return [];
}

function withRevocationsLock<T>(workspace: string, operation: () => T): T {
  ensureContainedDir(workspace, LEASES);
  return withControlFileLock({ root: dirname(leaseRevocationPaths(workspace).file), name: "revocations", operation: () => {
    recoverPendingRevocationList(location(workspace));
    return operation();
  } });
}

/** The current store, unverified, in the 1.x shape. Decisions use readVerifiedLeaseRevocations. */
export function loadLeaseRevocations(workspace: string): LeaseRevocations {
  const signed = readContainedOrNull(workspace, REL.file, MAX_LIST_BYTES);
  if (signed !== null) return legacyView(revocationListSchema.parse((JSON.parse(signed.toString("utf8")) as { list?: unknown } | null)?.list));
  const legacy = readContainedOrNull(workspace, REL.legacyFile, MAX_LIST_BYTES);
  return legacy === null ? defaultLeaseRevocations() : leaseRevocationsSchema.parse(JSON.parse(legacy.toString("utf8")) as unknown);
}

/**
 * First-store bootstrap: publish an empty sequence 1, only while no store file exists (checked under the lock, so a
 * file dropped after a caller's unlocked check is never signed) and never once a list was anchored. Returns whether it
 * published.
 */
export function bootstrapLeaseRevocations(workspace: string): boolean {
  return withRevocationsLock(workspace, () => {
    if (has(workspace, "file") || has(workspace, "legacyFile") || has(workspace, "legacySig")) return false;
    assertNeverAnchored(workspace, ANCHOR, listIdFor(workspace));
    publishLocked(workspace, nextList(workspace, null, []));
    return true;
  });
}

/**
 * The deliberate repair, signing only the store whose bytes have the digest the operator reviewed (checked under the
 * lock, on the bytes signed). A 1.x list is signed into the new format as sequence 1, and only while nothing was
 * anchored. A signed list is re-signed as the next sequence only when its content is what this workspace last
 * accepted, so repair can restore a broken signature but never un-revoke. A list that fails the schema is refused.
 */
export function signLeaseRevocations(workspace: string, reviewedDigestSha256: string): LeaseRevocations {
  const paths = leaseRevocationPaths(workspace);
  const reviewed = reviewedDigestSha256.trim().toLowerCase();
  return withRevocationsLock(workspace, () => {
    const target = has(workspace, "file") ? REL.file : has(workspace, "legacyFile") ? REL.legacyFile : null;
    if (target === null) throw new Error("revocation list missing; restore the reviewed list before re-signing. Nothing was signed.");
    const bytes = readContained(workspace, target, MAX_LIST_BYTES);
    const digest = sha256Hex(bytes);
    if (digest !== reviewed) {
      throw new Error(`revocation list sha256 is ${digest}, not the reviewed ${reviewedDigestSha256}; nothing was signed. Review the current list again.`);
    }
    const listId = listIdFor(workspace);
    if (target === REL.legacyFile) {
      const parsed = leaseRevocationsSchema.safeParse(JSON.parse(bytes.toString("utf8")));
      if (!parsed.success) throw new Error("revocation list does not match the revocation schema; nothing was signed");
      assertNeverAnchored(workspace, ANCHOR, listId);
      const current: Current = { kind: "legacy", store: parsed.data, digest };
      return legacyView(publishLocked(workspace, nextList(workspace, previousOf(current), currentRows(current))).list);
    }
    const parsed = revocationListSchema.safeParse((JSON.parse(bytes.toString("utf8")) as { list?: unknown } | null)?.list);
    if (!parsed.success) throw new Error("revocation list does not match the revocation schema; nothing was signed");
    const list = parsed.data;
    if (list.listId !== listId) throw new Error(`revocation list is ${list.listId}, not ${listId}; nothing was signed`);
    const sha256 = revocationListSha256(list);
    const logged = loggedAnchor(workspace, ANCHOR, listId);
    if (logged === null || logged.sequence !== list.sequence || logged.sha256 !== sha256) {
      throw new Error("revocation list content is not the content this workspace last anchored; repair cannot un-revoke. Restore the newest list. Nothing was signed.");
    }
    return legacyView(publishLocked(workspace, nextList(workspace, { sequence: list.sequence, sha256 }, list.revoked)).list);
  });
}

export function verifyLeaseRevocationsSignature(workspace: string): { valid: boolean; signatureExists: boolean; reason: string | null } {
  let signatureExists = true; // something unreadable in a store file's place still is a store
  try { signatureExists = (["file", "legacyFile", "legacySig", "pending"] as const).some(which => has(workspace, which)); } catch { /* refused by the read below */ }
  const read = readVerifiedLeaseRevocations(workspace);
  if (!read.ok) return { valid: false, signatureExists, reason: read.reason };
  // A 1.x pair restored beside the signed list is ignored for every decision, and said here.
  const stale = has(workspace, "file") && has(workspace, "legacyFile");
  return { valid: true, signatureExists, reason: stale ? "a superseded revocations.json pair is present and ignored" : null };
}

/**
 * Append one revocation and re-sign as the next sequence. Serialized across processes (Studio retires native task
 * leases on every runtime stop while an operator may run `amc lease revoke`), so a concurrent writer cannot republish
 * a list without this row. `expiresTs`, taken from the verified lease payload, lets a later write prune the row.
 */
export function revokeLease(workspace: string, leaseId: string, reason: string, opts: { expiresTs?: number } = {}): LeaseRevocations {
  return withRevocationsLock(workspace, () => {
    let current: Current;
    // Revoke is not the deliberate repair command. Authenticate the exact bytes used for this update.
    try {
      current = readCurrent(workspace);
    } catch {
      throw new Error("lease revocation store unverifiable; revoke made no changes. Restore and review the approved revocation history before a deliberate repair; revoking another lease must not re-sign damaged state.");
    }
    const now = new Date().toISOString();
    const rows = [
      ...currentRows(current).filter(row => !(row.kind === "lease" && row.id === leaseId)),
      { id: leaseId, kind: "lease" as const, revokedAt: now, reason, ...(opts.expiresTs === undefined ? {} : { expiresAt: new Date(opts.expiresTs).toISOString() }) }
    ];
    return legacyView(publishLocked(workspace, nextList(workspace, previousOf(current), rows)).list);
  });
}

/** The store from ONE verified read, in the 1.x shape, or why that failed. */
export function readVerifiedLeaseRevocations(workspace: string): { ok: true; store: LeaseRevocations } | { ok: false; reason: string } {
  try {
    const current = has(workspace, "pending") ? withRevocationsLock(workspace, () => readCurrent(workspace)) : readCurrent(workspace);
    return { ok: true, store: current.kind === "signed" ? legacyView(current.signed.list) : current.kind === "legacy" ? current.store : defaultLeaseRevocations() };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The revoked lease ids from ONE verified read (`readVerifiedLeaseRevocations`), or why that failed.
 * Every consumer decides on this set: a list swapped on disk after the check is never read.
 */
export function readRevokedLeaseIds(workspace: string): { ok: true; ids: Set<string> } | { ok: false; reason: string } {
  const read = readVerifiedLeaseRevocations(workspace);
  return read.ok ? { ok: true, ids: new Set(read.store.revocations.map((row) => row.leaseId)) } : read;
}

/**
 * The revoked lease ids, from a store whose signature verifies and that no anchor shows to be rolled back.
 *
 * Throws when it does not. This used to answer an unverifiable store with an
 * EMPTY SET, which reads as "nothing is revoked" -- so tampering with one file
 * un-revoked every lease ever revoked. A revocation list is a security answer;
 * when the question cannot be answered, the only safe response is to refuse,
 * and every caller then refuses every lease until the store is repaired.
 */
export function revokedLeaseIdSet(workspace: string): Set<string> {
  const read = readRevokedLeaseIds(workspace);
  if (!read.ok) throw new Error(`lease revocation store unverifiable (${read.reason}); refusing to treat it as empty`);
  return read.ids;
}
