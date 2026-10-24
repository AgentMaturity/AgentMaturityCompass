import { lstatSync, realpathSync, type Stats } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { getSigningKey, verifyHexDigestAny } from "../crypto/keys.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { logSequence } from "../keys/anchorLog.js";
import { assertSigningKeyUsable, getPurposeKeyHistory, getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { assertNeverAnchored, loggedAnchor, machineMark } from "../keys/anchors.js";
import { canonicalSigningKey, signingKeyId } from "../keys/algorithmPolicy.js";
import { assertKeysetComplete, boundProviderKey } from "../keys/keyset.js";
import { CONFIG_REL, configuredRef, keyPolicy, loadKeysConfig, parseKeysSection } from "../keys/keysConfig.js";
import { capturePurposePublication } from "../keys/purposePublication.js";
import { signPurposeRevocationList } from "../keys/purposeProviders.js";
import {
  MAX_REVOCATION_LIST_BYTES, nextRevocationList, publishRevocationList, publishSignedRevocationList,
  encodeSignedRevocationList, readAnchoredRevocationList, recoverPendingRevocationList,
  revocationListSchema, revocationListSha256, type AnchoredListLocation, type RevocationListV1, type SignedRevocationList
} from "../keys/revocationList.js";
import { captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { captureVaultPurposeContinuity, vaultStatus } from "../vault/vault.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { containedExists, ensureContainedDir, readContained, readContainedOrNull, removeContained, writeContained } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
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

/** The revocation-list purpose's admitted keys (the auditor role's before migration), never another auditor purpose's. */
function trustedKeys(workspace: string): string[] {
  return getPurposeKeyHistory(workspace, "revocation-list");
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
  | { kind: "legacy"; store: LeaseRevocations; digest: string; bytes?: Buffer; signatureBytes?: Buffer }
  | { kind: "empty" };

/** The 1.x pair, verified and parsed from one read of the list; a tombstone or partial pair throws. */
function readLegacyPair(workspace: string): { store: LeaseRevocations; digest: string; bytes: Buffer; signatureBytes: Buffer } {
  if (!has(workspace, "legacyFile")) throw new Error("revocation list missing but signature present");
  if (!has(workspace, "legacySig")) throw new Error("revocation signature missing");
  const bytes = readContained(workspace, REL.legacyFile, MAX_LIST_BYTES);
  const signatureBytes = readContained(workspace, REL.legacySig, MAX_SIG_BYTES);
  const signed = JSON.parse(signatureBytes.toString("utf8")) as LegacySignedDigest;
  const digest = sha256Hex(bytes);
  if (signed.digestSha256 !== digest) throw new Error("digest mismatch");
  if (!verifyHexDigestAny(digest, signed.signature, trustedKeys(workspace))) throw new Error("signature verification failed");
  return { store: leaseRevocationsSchema.parse(JSON.parse(bytes.toString("utf8"))), digest, bytes, signatureBytes };
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

type PreparedLeaseChange = {
  list: RevocationListV1;
  source: Current | { kind: "reviewed"; target: string; bytes: Buffer };
};

function prepareLeaseRepair(workspace: string, reviewedDigestSha256: string, reviewed: string): PreparedLeaseChange {
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
    return { list: nextList(workspace, previousOf(current), currentRows(current)), source: { kind: "reviewed", target, bytes } };
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
  return { list: nextList(workspace, { sequence: list.sequence, sha256 }, list.revoked), source: { kind: "reviewed", target, bytes } };
}

function prepareLeaseRevoke(workspace: string, leaseId: string, reason: string, opts: { expiresTs?: number }): PreparedLeaseChange {
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
  return { list: nextList(workspace, previousOf(current), rows), source: current };
}


type MemberName = keyof typeof REL;
type Member = { bytes: Buffer; stamp: string; mode: number } | null;
type Members = Record<MemberName, Member>;
const memberNames: readonly MemberName[] = ["file", "pending", "legacyFile", "legacySig"];
function nativeStat(path: string): Stats | null {
  try { return lstatSync(path); }
  catch (cause) { if ((cause as NodeJS.ErrnoException | null)?.code === "ENOENT") return null; throw cause; }
}
function stamp(stat: Stats | null): string | null {
  return stat === null ? null : `${stat.dev}:${stat.ino}:${stat.mode}:${stat.nlink}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
}
function readMember(workspace: string, name: MemberName): Member {
  const path = join(workspace, REL[name]), first = nativeStat(path);
  const bytes = readContainedOrNull(workspace, REL[name], name === "legacySig" ? MAX_SIG_BYTES : MAX_LIST_BYTES);
  const last = nativeStat(path);
  if (stamp(first) !== stamp(last) || (bytes === null ? last !== null : last === null || bytes.length !== last.size))
    throw new Error("lease revocation member changed during its bounded observation");
  return bytes === null ? null : { bytes, stamp: stamp(last)!, mode: last!.mode & 0o777 };
}
function captureMembers(workspace: string): Members {
  return { file: readMember(workspace, "file"), pending: readMember(workspace, "pending"),
    legacyFile: readMember(workspace, "legacyFile"), legacySig: readMember(workspace, "legacySig") };
}
function sameMember(left: Member, right: Member): boolean {
  return left === null || right === null ? left === right : left.stamp === right.stamp && left.bytes.equals(right.bytes);
}
function assertMembers(workspace: string, expected: Members): void {
  for (const name of memberNames) if (!sameMember(expected[name], readMember(workspace, name)))
    throw new Error("original lease revocation inputs or owned output changed");
}
function assertPreparedSource(prepared: PreparedLeaseChange, state: Members): void {
  const source = prepared.source, equal = (row: Member, bytes: Buffer | undefined) => row !== null && bytes !== undefined && row.bytes.equals(bytes);
  if (state.pending !== null) throw new Error("lease revocation preparation still has a pending member");
  if (source.kind === "signed") {
    if (!equal(state.file, encodeSignedRevocationList(source.signed))) throw new Error("authenticated lease predecessor changed");
  } else if (source.kind === "legacy") {
    if (state.file !== null || !equal(state.legacyFile, source.bytes) || !equal(state.legacySig, source.signatureBytes))
      throw new Error("authenticated legacy revocation pair changed");
  } else if (source.kind === "empty") {
    if (memberNames.some(name => state[name] !== null)) throw new Error("empty lease predecessor gained a member");
  } else if (source.target !== (state.file === null ? REL.legacyFile : REL.file)
    || !equal(source.target === REL.file ? state.file : state.legacyFile, source.bytes)) {
    throw new Error("reviewed lease revocation bytes or source selection changed");
  }
}
function rootObservation(workspace: string): string {
  const stat = lstatSync(workspace);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("lease operation root must remain a real directory");
  return `${realpathSync(workspace)}:${stat.dev}:${stat.ino}`;
}

/** Original actual signing recipes only. Entry may warm; every later private access checks continuity first. */
function captureLeaseChangeAuthority(workspace: string) {
  const captured = capturePurposePublication(workspace, "revocation-list");
  const bound = boundProviderKey(workspace, "revocation-list"), binding = canonicalize(bound);
  const holder = bound?.binding.provider ?? "file";
  const privateCurrent = holder === "file" ? captureVaultPurposeContinuity(workspace, "revocation-list") : null;
  const publicKey = canonicalSigningKey(bound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "revocation-list"));
  if (publicKey === null) throw new Error("original revocation-list public key is unsupported");
  const keyId = signingKeyId(publicKey.pem), raw = readContainedOrNull(workspace, CONFIG_REL, 1024 * 1024);
  const config = canonicalize(parseKeysSection(raw));
  if (canonicalize(loadKeysConfig(workspace)) !== config) throw new Error("original keys config observation disagrees with loaded policy");
  const downstream = captureWorkspaceLogAuthority(workspace);
  const logPrivateCurrent = [downstream.sealSigner, downstream.rootSigner].some(row => row.descriptor.mode === "VAULT" && row.holder === "file")
    ? captureVaultPurposeContinuity(workspace, "artifact-seal") : null;
  const assertCurrent = () => {
    privateCurrent?.(); logPrivateCurrent?.();
    const liveRaw = readContainedOrNull(workspace, CONFIG_REL, 1024 * 1024);
    if ((raw === null ? liveRaw !== null : liveRaw === null || !raw.equals(liveRaw))
      || canonicalize(parseKeysSection(liveRaw)) !== config || canonicalize(loadKeysConfig(workspace)) !== config
      || canonicalize(assertKeysetComplete(workspace)) !== captured.keyset
      || canonicalize(boundProviderKey(workspace, "revocation-list")) !== binding)
      throw new Error("original lease revocation signing authority changed");
    const policy = keyPolicy(loadKeysConfig(workspace));
    if (!policy.allowed.includes(publicKey.algorithm) || (holder === "file" && policy.requireNonExportable))
      throw new Error("original lease revocation key policy refuses signing");
    assertSigningKeyUsable(workspace, "revocation-list", publicKey.pem, holder);
    if (holder === "file") {
      privateCurrent!();
      if (!vaultStatus(workspace).unlocked || configuredRef(loadKeysConfig(workspace), "revocation-list") !== null)
        throw new Error("original revocation-list vault authority is unavailable");
      if (publicKeyFromPrivate(getSigningKey(workspace, "revocation-list")) !== publicKey.pem)
        throw new Error("original revocation-list private purpose changed");
    }
    logPrivateCurrent?.(); downstream.assertIntrinsicCurrent();
  };
  assertCurrent();
  return { assertCurrent, assertReturned(value: Awaited<ReturnType<typeof signPurposeRevocationList>>) {
    assertCurrent();
    const expectedRef = bound === null ? { provider: "file", id: "revocation-list" }
      : { provider: holder, id: bound.binding.id, ...(bound.binding.version === undefined ? {} : { version: bound.binding.version }) };
    if (value.provider !== holder || canonicalize(value.description.ref) !== canonicalize(expectedRef)
      || value.description.publicKeyPem !== publicKey.pem || value.description.keyId !== keyId
      || value.description.algorithm !== publicKey.algorithm) throw new Error("prepared lease list signer differs from original authority");
  } };
}

export interface LeaseRevocationProgress {
  readonly firstLockAttempted: boolean; readonly firstLockEntered: boolean; readonly firstLockReturned: boolean;
  readonly secondLockAttempted: boolean; readonly secondLockEntered: boolean; readonly secondLockReturned: boolean;
  readonly publicationAttempted: boolean; readonly publicationReturned: boolean; readonly publicationAcknowledged: boolean;
  readonly tombstoneAttempted: boolean; readonly tombstoneReturned: boolean; readonly tombstoneAcknowledged: boolean;
  readonly legacyRemoveAttempted: boolean; readonly legacyRemoveReturned: boolean; readonly legacyRemoveAcknowledged: boolean;
  readonly complete: boolean;
}
export class LeaseRevocationPublicationError extends Error {
  constructor(readonly progress: Readonly<LeaseRevocationProgress>, readonly hasPrimaryCause: boolean,
    readonly primaryCause: unknown, cause: unknown) {
    super("lease revocation publication did not complete; inspect actual progress before retrying", { cause });
    this.name = "LeaseRevocationPublicationError";
  }
}
export interface LeaseRevocationAttempt {
  readonly store: LeaseRevocations;
  readonly progress: Readonly<LeaseRevocationProgress>;
  assertCurrent(): void;
}

/** Fixed internal recipe owner; only the two source-defined operations below select its actual preparation. */
async function publishLeaseChange(inputWorkspace: string, prepare: (workspace: string) => PreparedLeaseChange,
  beforeSign?: () => void): Promise<LeaseRevocationAttempt> {
  const workspace = resolve(inputWorkspace), originalRoot = rootObservation(workspace), originalNoSign = process.env.AMC_NO_SIGN === "1";
  const actor = beforeSign;
  let failed = false, firstCause: unknown;
  const guard = (operation: () => void) => {
    if (failed) throw firstCause;
    try { operation(); } catch (cause) { failed = true; firstCause = cause; throw cause; }
  };
  const progress = { firstLockAttempted: false, firstLockEntered: false, firstLockReturned: false,
    secondLockAttempted: false, secondLockEntered: false, secondLockReturned: false,
    publicationAttempted: false, publicationReturned: false, publicationAcknowledged: false,
    tombstoneAttempted: false, tombstoneReturned: false, tombstoneAcknowledged: false,
    legacyRemoveAttempted: false, legacyRemoveReturned: false, legacyRemoveAcknowledged: false, complete: false };
  const observedProgress = () => Object.freeze({ ...progress });
  try {
    progress.firstLockAttempted = true;
    const initial = withRevocationsLock(workspace, () => {
      progress.firstLockEntered = true;
      const prepared = prepare(workspace), state = captureMembers(workspace);
      assertPreparedSource(prepared, state); assertMembers(workspace, state);
      return { prepared, state, keys: canonicalize(trustedKeys(workspace)),
        anchor: canonicalize(loggedAnchor(workspace, ANCHOR, listIdFor(workspace))),
        mark: canonicalize(machineMark(workspace, ANCHOR, listIdFor(workspace))) };
    });
    progress.firstLockReturned = true;
    // Preserve genuine initial recovery before enforcing the entry no-sign refusal or warming a private key.
    if (originalNoSign || process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize lease revocation signing");
    if (resolve(inputWorkspace) !== workspace || rootObservation(workspace) !== originalRoot)
      throw new Error("original lease operation root changed before signing preparation");
    const authority = captureLeaseChangeAuthority(workspace), candidate = canonicalize(initial.prepared.list);
    let expected = initial.state, expectedAnchor = initial.anchor, expectedMark = initial.mark;
    const assertAuthority = () => guard(() => {
      if (originalNoSign || process.env.AMC_NO_SIGN === "1" || resolve(inputWorkspace) !== workspace
        || rootObservation(workspace) !== originalRoot) throw new Error("original lease operation root or no-sign authority changed");
      authority.assertCurrent();
    });
    const intrinsic = () => guard(() => {
      assertAuthority(); assertMembers(workspace, expected);
      if (canonicalize(trustedKeys(workspace)) !== initial.keys
        || canonicalize(loggedAnchor(workspace, ANCHOR, listIdFor(workspace))) !== expectedAnchor
        || canonicalize(machineMark(workspace, ANCHOR, listIdFor(workspace))) !== expectedMark)
        throw new Error("original lease predecessor anchors or trusted candidates changed");
    });
    const fence = () => guard(() => { intrinsic(); actor?.(); intrinsic(); });
    const signed = await signPurposeRevocationList(workspace, initial.prepared.list, { beforeSign: fence });
    fence(); authority.assertReturned(signed);
    if (canonicalize(signed.signed.list) !== candidate || signed.signed.anchor !== null)
      throw new Error("prepared revocation-list signature does not name the original candidate");
    fence();
    progress.secondLockAttempted = true;
    const published = withRevocationsLock(workspace, () => {
      progress.secondLockEntered = true;
      intrinsic();
      progress.publicationAttempted = true;
      const result = publishSignedRevocationList(location(workspace), signed.signed, target => {
        assertAuthority(); // Own pending staging is legitimate: never replay predecessor CAS here.
        return logSequence(target); // Actual synchronous downstream seal/Merkle Sign remains a source successor.
      });
      progress.publicationReturned = true;
      const own = captureMembers(workspace), bytes = encodeSignedRevocationList(result);
      if (own.file === null || !own.file.bytes.equals(bytes) || own.file.mode !== 0o644 || own.pending !== null
        || !sameMember(expected.legacyFile, own.legacyFile) || !sameMember(expected.legacySig, own.legacySig))
        throw new Error("returned lease publication does not match exact own final state");
      const anchor = loggedAnchor(workspace, ANCHOR, listIdFor(workspace));
      if (anchor === null || anchor.sequence !== result.list.sequence || anchor.sha256 !== revocationListSha256(result.list)
        || anchor.entryHash !== result.anchor?.transparencyEntryHash) throw new Error("returned lease publication anchor differs");
      // The actual publisher may warn and retain no durable machine mark on a read-only home.
      const mark = machineMark(workspace, ANCHOR, listIdFor(workspace));
      expected = own; expectedAnchor = canonicalize(anchor); expectedMark = canonicalize(mark);
      progress.publicationAcknowledged = true;
      intrinsic();
      if (has(workspace, "legacyFile") || has(workspace, "legacySig")) {
        const tombstone = Buffer.from(JSON.stringify({ type: "amc.revocation-list-moved", to: "revocations.signed.json", previousSha256: result.list.previousSha256 }));
        progress.tombstoneAttempted = true;
        writeContained(workspace, REL.legacySig, tombstone, 0o644);
        progress.tombstoneReturned = true;
        const signature = readMember(workspace, "legacySig");
        if (signature === null || !signature.bytes.equals(tombstone) || signature.mode !== 0o644)
          throw new Error("returned legacy tombstone differs from own exact bytes");
        expected.legacySig = signature;
        progress.tombstoneAcknowledged = true;
        intrinsic();
        progress.legacyRemoveAttempted = true;
        removeContained(workspace, REL.legacyFile);
        progress.legacyRemoveReturned = true;
        if (readMember(workspace, "legacyFile") !== null) throw new Error("returned legacy body removal is not absent");
        expected.legacyFile = null;
        progress.legacyRemoveAcknowledged = true;
      }
      intrinsic(); return result;
    });
    progress.secondLockReturned = true;
    intrinsic(); progress.complete = true;
    const assertCompletedCurrent = () => {
      try { intrinsic(); }
      catch (cause) { throw new LeaseRevocationPublicationError(observedProgress(), failed, firstCause, cause); }
    };
    return Object.freeze({ store: leaseRevocationsSchema.parse(legacyView(published.list)), progress: observedProgress(), assertCurrent: assertCompletedCurrent });
  } catch (cause) {
    if (progress.publicationAttempted || progress.tombstoneAttempted || progress.legacyRemoveAttempted)
      throw new LeaseRevocationPublicationError(observedProgress(), failed, firstCause, cause);
    throw cause;
  }
}

export function revokeLeaseAsync(workspace: string, leaseId: string, reason: string,
  opts: { expiresTs?: number; beforeSign?: () => void } = {}): Promise<LeaseRevocationAttempt> {
  const expiresTs = opts.expiresTs, beforeSign = opts.beforeSign;
  return publishLeaseChange(workspace, root => prepareLeaseRevoke(root, leaseId, reason, { expiresTs }), beforeSign);
}
export function signLeaseRevocationsAsync(workspace: string, reviewedDigestSha256: string,
  opts: { beforeSign?: () => void } = {}): Promise<LeaseRevocationAttempt> {
  leaseRevocationPaths(workspace);
  const reviewed = reviewedDigestSha256.trim().toLowerCase(), beforeSign = opts.beforeSign;
  return publishLeaseChange(workspace, root => prepareLeaseRepair(root, reviewedDigestSha256, reviewed), beforeSign);
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
    const prepared = prepareLeaseRepair(workspace, reviewedDigestSha256, reviewed);
    return legacyView(publishLocked(workspace, prepared.list).list);
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
    const prepared = prepareLeaseRevoke(workspace, leaseId, reason, opts);
    return legacyView(publishLocked(workspace, prepared.list).list);
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
