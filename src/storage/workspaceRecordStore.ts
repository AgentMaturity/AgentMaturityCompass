/**
 * Durable, signed, hash-chained record store scoped to a workspace.
 *
 * Residency policies, tenant boundaries and legal holds lived only in
 * module-level arrays (`let policies`, `let tenants`, `let legalHolds` in
 * dataResidency.ts), so every CLI invocation started empty while the commands
 * reported success. The observable result:
 *
 *   amc tenant-register --tenant acme --region eu-west-1
 *     -> "Tenant acme registered in eu-west-1 (strict)"
 *   amc legal-hold --issue --tenant acme --reason litigation
 *     -> "Legal hold issued: lh_0c540bbd-f34"
 *   amc legal-hold --list
 *     -> "No active legal holds."
 *   amc residency-report --tenant acme
 *     -> "Tenant: acme | Region: us-east-1"  ... "**COMPLIANT**"
 *
 * An auditor-facing compliance report named the wrong data region, omitted an
 * active legal hold, and stamped COMPLIANT on a configuration it had never
 * read. A legal hold that silently disappears is spoliation-relevant, so these
 * records are hash-chained and signed like the governance debt register they
 * are modelled on.
 */
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest, getSigningKey, getSigningPublicKeyPem, verifyHexDigestAny } from "../crypto/keys.js";
import { captureRunHashAuthority, runHashVerificationKeys } from "../ledger/runHashSignature.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { openLedger } from "../ledger/ledger.js";
import { inlinePlaintextOrNull, isEncryptedField } from "../ledger/encryption/ledgerCipher.js";
import { appendOpsAuditEvent } from "../ops/audit.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { assertPurposePublicationCurrent, capturePurposePublication } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { keysetDeclared } from "../keys/keyset.js";
import { vaultStatus } from "../vault/vault.js";
import { purposeKeyPaths, vaultPaths } from "../vault/vaultPaths.js";

/**
 * Where a family of records lives, relative to the workspace root.
 *
 * e.g. { area: ["compliance", "residency"], kind: "legal-holds" } stores under
 * .amc/compliance/residency/legal-holds/.
 */
export interface RecordLocation {
  area: string[];
  kind: string;
  /** The body field that holds the id a record is filed under (`<id>.json`); a record filed under another name is refused. */
  idField?: string;
}

/** Chain and signature fields appended to every stored record. */
export interface RecordEnvelope {
  prev_record_hash: string;
  record_hash: string;
  signature: string;
  storedTs: number;
}

function recordDir(workspace: string, at: RecordLocation): string {
  return join(workspace, ".amc", ...at.area, at.kind);
}

/** Reads every stored record of one kind. Unreadable files are skipped. */
export function loadWorkspaceRecords<T>(workspace: string, at: RecordLocation): T[] {
  const dir = recordDir(workspace, at);
  if (!pathExists(dir)) return [];
  const out: T[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(readUtf8(join(dir, file))) as T);
    } catch {
      // A corrupt record must not hide the rest of the register.
    }
  }
  return out;
}

/** Superseded versions kept by an update, so the chain a later record links to still resolves (WP37). */
const REVISIONS_DIR = "revisions";
/**
 * The newest record_hash, rewritten under the publication lock after every record write. Records name their
 * predecessor, so only this anchor notices a deleted or rolled-back newest record (WP37). `lost` carries forward every
 * anchored head that was already missing when a later record was written, so the next write does not hide it. The
 * anchor is signed like a record (WP37 review): `signature` covers sha256(canonical {record_hash, lost}) under the
 * artifact-seal key, in the same file so that one atomic write never leaves an anchor and a signature that disagree.
 */
const UNREADABLE_ANCHOR = "unreadable", UNVERIFIED_ANCHOR = "unverified";
/** Carried by an anchor written over records that had none: never anchored, or (per the ledger) its anchor was removed. */
const UNANCHORED_MARK = "unanchored", REMOVED_ANCHOR_MARK = "anchor-removed";
interface HeadAnchor { head: string; lost: string[] }
type StoredAnchor = HeadAnchor | "absent" | typeof UNREADABLE_ANCHOR | typeof UNVERIFIED_ANCHOR;

/** Beside the record directory, never in it: strict readers of a record directory refuse any non-record entry. */
function headAnchorPath(workspace: string, at: RecordLocation): string {
  return join(workspace, ".amc", ...at.area, `${at.kind}.head.json`);
}

const anchorDigest = (head: string, lost: readonly string[]): string => sha256Hex(canonicalize({ record_hash: head, lost }));

/**
 * The anchor; "absent" for a store written before anchoring, "unreadable" when it is corrupt, "unverified" when its
 * signature does not verify, or it is unsigned in a keyed workspace (the same rule a record's signature meets).
 */
function readHeadAnchor(workspace: string, at: RecordLocation, seal: { keys: string[]; keyed: boolean } = sealKeys(workspace)): StoredAnchor {
  const file = headAnchorPath(workspace, at);
  if (!pathExists(file)) return "absent";
  let anchor: HeadAnchor & { signature: unknown };
  try {
    const row = JSON.parse(readUtf8(file)) as { record_hash?: unknown; lost?: unknown; signature?: unknown };
    const lost = row.lost ?? [];
    if (typeof row.record_hash !== "string" || row.record_hash.length === 0 || !Array.isArray(lost)
      || !lost.every((item) => typeof item === "string")) return UNREADABLE_ANCHOR;
    anchor = { head: row.record_hash, lost: lost as string[], signature: row.signature };
  } catch {
    return UNREADABLE_ANCHOR;
  }
  const { head, lost, signature } = anchor;
  const signed = typeof signature === "string" && signature !== "unsigned";
  if (signed ? !verifyHexDigestAny(anchorDigest(head, lost), signature, seal.keys) : seal.keyed) return UNVERIFIED_ANCHOR;
  return { head, lost };
}

/** record_hash of every stored record of one kind, current and kept revisions; unreadable files are skipped. */
function storedRecordHashes(workspace: string, at: RecordLocation): Set<string> {
  const dir = recordDir(workspace, at);
  return new Set([dir, join(dir, REVISIONS_DIR)].flatMap((folder) => !pathExists(folder) ? []
    : readdirSync(folder).filter((name) => name.endsWith(".json")).flatMap((name) => {
      try { return [String((JSON.parse(readUtf8(join(folder, name))) as RecordEnvelope).record_hash)]; } catch { return []; }
    })));
}

/**
 * What the next anchor carries forward: an earlier head that is no longer stored, the marker of a bad anchor, or, when
 * records exist with no anchor at all, whether that store was never anchored or lost its anchor (WP37 review). Only the
 * explicit adoption of `head`, a record already stored, starts clean over existing records.
 */
function lostAfter(workspace: string, at: RecordLocation, prior: StoredAnchor, stored: Set<string>, head: string, keyed: boolean): string[] {
  if (prior === "absent") {
    if (stored.size === 0 || stored.has(head)) return [];
    return [keyed && anchoredBefore(workspace, at) !== false ? REMOVED_ANCHOR_MARK : UNANCHORED_MARK];
  }
  if (typeof prior === "string") return [prior];
  return stored.has(prior.head) ? [...prior.lost] : [...prior.lost, prior.head];
}

/**
 * An anchor signed before the publication lock is taken, so the lock never waits on a signer. `adopted`: it anchors a
 * record already stored, which only the one-time anchoring of older history does.
 */
export interface PreparedHeadAnchor {
  readonly head: string; readonly first: boolean; readonly adopted: boolean; readonly verified: boolean;
  readonly lost: readonly string[]; readonly bytes: string;
}

function headAnchorBasis(workspace: string, at: RecordLocation, recordHash: string) {
  const seal = sealKeys(workspace), prior = readHeadAnchor(workspace, at, seal), stored = storedRecordHashes(workspace, at);
  const lost = lostAfter(workspace, at, prior, stored, recordHash, seal.keyed);
  return { seal, digest: anchorDigest(recordHash, lost),
    finish: (signature: string): PreparedHeadAnchor => Object.freeze({ head: recordHash, first: prior === "absent",
      adopted: stored.has(recordHash), lost, verified: signature !== "unsigned" && verifyHexDigestAny(anchorDigest(recordHash, lost), signature, seal.keys),
      bytes: JSON.stringify({ record_hash: recordHash, lost, signature }, null, 2) }) };
}

/**
 * The synchronous compatibility writer's anchor, signed with the vault's artifact-seal key like its record; on a
 * refused key both stay unsigned, which a keyed workspace reads as UNSIGNED and HEAD_UNVERIFIED.
 */
function prepareWorkspaceRecordHead(workspace: string, at: RecordLocation, recordHash: string): PreparedHeadAnchor {
  const basis = headAnchorBasis(workspace, at, recordHash);
  let signature = "unsigned";
  try { signature = signHexDigest(basis.digest, getSigningKey(workspace, "artifact-seal")); } catch { /* retained compatibility */ }
  return basis.finish(signature);
}

/**
 * The prepared publishers' anchor (WP37 review): signed by the very key that signed its record, never unsigned. In this
 * release the artifact-seal purpose is held only by the vault ("file"; a provider binding for it is refused), so the
 * vault key signs the anchor and must verify as `record.publicKeyPem`; any other holder refuses rather than sign twice
 * through a provider or fall back to another key.
 */
export function prepareWorkspaceRecordHeadFor(workspace: string, at: RecordLocation, recordHash: string,
  record: { provider: string; publicKeyPem: string }): PreparedHeadAnchor {
  if (record.provider !== "file") throw new Error(`the ${record.provider} artifact-seal key cannot sign a head anchor; refusing an anchor by another key`);
  const basis = headAnchorBasis(workspace, at, recordHash);
  const signature = signHexDigest(basis.digest, getSigningKey(workspace, "artifact-seal"));
  if (!verifyHexDigestAny(basis.digest, signature, [record.publicKeyPem])) throw new Error("the head anchor was signed by another key than its record");
  return basis.finish(signature);
}

/**
 * Publishes a prepared anchor around the record write it anchors, under that store's publication lock: refuses before
 * `writeRecord` runs when the anchor it would replace changed while it was signed. Every verified anchor of a store
 * the ledger has no WORKSPACE_RECORD_HEAD_ANCHORED row for records one first, so a later deletion of the anchor is
 * never taken for older history and anchored again (adoptWorkspaceRecordHead).
 */
export function anchorWorkspaceRecordHead(workspace: string, at: RecordLocation, prepared: PreparedHeadAnchor, writeRecord: () => void): void {
  const seal = sealKeys(workspace), prior = readHeadAnchor(workspace, at, seal);
  if ((prior === "absent") !== prepared.first
    || canonicalize(lostAfter(workspace, at, prior, storedRecordHashes(workspace, at), prepared.head, seal.keyed)) !== canonicalize(prepared.lost)) {
    throw new Error("workspace record head anchor changed while signing was prepared; retry");
  }
  if (prepared.verified && anchoredBefore(workspace, at) !== true) recordHeadAnchored(workspace, at, prepared.head, prepared.adopted);
  writeRecord();
  writeFileAtomic(headAnchorPath(workspace, at), prepared.bytes, 0o644);
}

function recordHeadAnchored(workspace: string, at: RecordLocation, recordHash: string, adopted: boolean): void {
  appendOpsAuditEvent({ workspace, auditType: "WORKSPACE_RECORD_HEAD_ANCHORED", severity: adopted ? "MEDIUM" : "LOW",
    payload: { area: at.area.join("/"), kind: at.kind, recordHash, adopted } });
}

/** appendOpsAuditEvent opens each audit's session as `ops-<auditType lowercased>-…`: an indexed range, never a scan. */
const HEAD_ANCHORED_SESSIONS = ["ops-workspace_record_head_anchored-", "ops-workspace_record_head_anchored."] as const;

/** Whether the ledger records an earlier anchoring of this store; null when the ledger cannot say. */
function anchoredBefore(workspace: string, at: RecordLocation): boolean | null {
  try {
    const ledger = openLedger(workspace, { readonly: true });
    try {
      return (ledger.db.prepare("SELECT id, payload_inline FROM evidence_events WHERE session_id >= ? AND session_id < ?")
        .all(...HEAD_ANCHORED_SESSIONS) as Array<{ id: string; payload_inline: string | null }>).some((row) => {
        const text = isEncryptedField(row.payload_inline) ? inlinePlaintextOrNull(workspace, row.id, row.payload_inline) : row.payload_inline;
        if (text === null) throw new Error("an anchoring row cannot be read");
        const payload = JSON.parse(text) as { area?: unknown; kind?: unknown };
        return payload.area === at.area.join("/") && payload.kind === at.kind;
      });
    } finally { ledger.close(); }
  } catch {
    return null;
  }
}

export type HeadAdoption = { status: "present" | "recorded" | "empty" } | { status: "adopted"; head: string } | { status: "deleted" | "refused"; reason: string };

/** The one current record no stored record (current or kept revision) names as its predecessor; null when not exactly one. */
function chainTip(workspace: string, at: RecordLocation): { tip: string | null; findings: WorkspaceRecordFinding[]; records: number } {
  const { current, revisions, findings } = verifyStoredRecords(workspace, at);
  const named = new Set([...current, ...revisions].map((row) => row.record.prev_record_hash));
  const tips = current.filter((row) => !named.has(row.record.record_hash));
  return { tip: tips.length === 1 ? tips[0]!.record.record_hash : null, findings, records: current.length };
}

/**
 * The explicit, one-time anchoring of a store whose records predate head anchors (WP37 review), run only by `amc
 * doctor`, never by a read. It anchors the chain tip, signed by the vault artifact-seal key, with its ledger
 * row, and refuses a store the ledger shows anchored before ("deleted": its anchor was removed, which stays a finding),
 * a ledger that cannot answer, a store with record-level findings and a chain without exactly one tip. A verified
 * anchor with no ledger row (written before rows existed) gets its row ("recorded").
 */
export function adoptWorkspaceRecordHead(workspace: string, at: RecordLocation): HeadAdoption {
  const anchor = readHeadAnchor(workspace, at);
  if (anchor !== "absent") {
    if (typeof anchor === "string" || anchoredBefore(workspace, at) !== false) return { status: "present" };
    try {
      withWorkspaceRecordPublicationLock(workspace, at, () => {
        const now = readHeadAnchor(workspace, at);
        if (typeof now !== "object" || now.head !== anchor.head) throw new Error("the head anchor changed while its ledger row was prepared; retry");
        recordHeadAnchored(workspace, at, anchor.head, false);
      });
    } catch (error) { return { status: "refused", reason: error instanceof Error ? error.message : String(error) }; }
    return { status: "recorded" };
  }
  const { tip, findings, records } = chainTip(workspace, at);
  if (records === 0) return { status: "empty" };
  const before = anchoredBefore(workspace, at);
  if (before !== false) {
    return before ? { status: "deleted", reason: "the ledger records this store's head as anchored before; its anchor was removed" }
      : { status: "refused", reason: "the ledger cannot show that this store was never anchored" };
  }
  const recordFindings = [...new Set(findings.filter((row) => !row.code.startsWith("HEAD_")).map((row) => row.code))];
  if (recordFindings.length > 0) return { status: "refused", reason: `its records do not verify (${recordFindings.join(", ")})` };
  if (tip === null) return { status: "refused", reason: "its record chain does not have exactly one newest record" };
  try {
    const prepared = prepareWorkspaceRecordHeadFor(workspace, at, tip, { provider: "file", publicKeyPem: getSigningPublicKeyPem(workspace, "artifact-seal") });
    if (!prepared.verified) return { status: "refused", reason: "the signed head anchor does not verify under the workspace artifact-seal keys" };
    withWorkspaceRecordPublicationLock(workspace, at, () => {
      if (chainTip(workspace, at).tip !== tip) throw new Error("workspace records changed while their head anchor was prepared; retry");
      anchorWorkspaceRecordHead(workspace, at, prepared, () => {});
    });
  } catch (error) {
    return { status: "refused", reason: error instanceof Error ? error.message : String(error) };
  }
  return { status: "adopted", head: tip };
}

function genesisHashes(at: RecordLocation): Set<string> {
  return new Set([`GENESIS_${at.kind.toUpperCase().replace(/-/g, "_")}`, "GENESIS"]);
}

/** Keeps the bytes an update is about to replace; called under the publication lock, before the overwrite. */
function keepRevision(workspace: string, at: RecordLocation, id: string, previous: Buffer | null): void {
  if (previous === null) return;
  writeFileAtomic(join(recordDir(workspace, at), REVISIONS_DIR, `${id}.${sha256Hex(previous).slice(0, 16)}.json`), previous, 0o644);
}

export interface WorkspaceRecordFinding {
  file: string;
  code: "UNREADABLE" | "HASH_MISMATCH" | "UNSIGNED" | "SIGNATURE_INVALID" | "CHAIN_GAP" | "HEAD_MISSING" | "HEAD_UNANCHORED"
    | "HEAD_UNVERIFIED" | "KEYSET_UNVERIFIABLE" | "ID_MISMATCH" | "DUPLICATE" | "SUPERSEDED";
  detail: string;
}

/** One fixed sentence per finding, for outputs that must not echo a reader's error text (security sweep). */
export const WORKSPACE_RECORD_FINDING_TEXT: Readonly<Record<WorkspaceRecordFinding["code"], string>> = {
  UNREADABLE: "the file cannot be read as a record", HASH_MISMATCH: "record_hash does not match the record body and prev link",
  UNSIGNED: "record carries no signature", SIGNATURE_INVALID: "signature does not verify under the workspace artifact-seal keys",
  CHAIN_GAP: "the record names a predecessor that is not stored", HEAD_MISSING: "the newest record or its head anchor was removed",
  HEAD_UNANCHORED: "no head anchor: a deleted newest record cannot be ruled out", HEAD_UNVERIFIED: "the head anchor does not verify",
  KEYSET_UNVERIFIABLE: "the workspace key set does not verify", ID_MISMATCH: "the record is filed under another record's id",
  DUPLICATE: "the same record is stored under more than one name", SUPERSEDED: "a superseded version is stored as a current record"
};

/**
 * The artifact-seal keys records verify under. A key set that fails its own checks (a flipped byte in a pinned public
 * key or in revocations.signed.json) is unverifiable, never keyless: it still refuses unsigned records, and the reader
 * says why (KEYSET_UNVERIFIABLE, WP37 review). Keyless means no artifact-seal key material exists at all.
 */
function sealKeys(workspace: string): { keys: string[]; keyed: boolean; unverifiable: string | null } {
  try {
    const keys = runHashVerificationKeys(workspace);
    return { keys, keyed: keys.length > 0, unverifiable: null };
  } catch (error) {
    let declared = true;
    try { declared = keysetDeclared(workspace); } catch { /* an unreadable machine mark decides nothing: keyed */ }
    const keyless = !declared && !pathExists(purposeKeyPaths(workspace, "artifact-seal").publicFile) && !pathExists(vaultPaths(workspace).auditorPublic);
    return { keys: [], keyed: !keyless, unverifiable: keyless ? null : error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The verifying reader (WP37): every record of one kind with the integrity findings `loadWorkspaceRecords` hides.
 * Recomputes record_hash over body + prev link, checks the artifact-seal signature, and requires every prev link to
 * name genesis or a stored record (current or a kept revision), so a deleted or corrupted middle record is a finding
 * rather than a silent omission. The head anchor covers the newest record, which no successor names: an anchored hash
 * that is not a current record means the newest record was deleted or rolled back (HEAD_MISSING). Records with no
 * anchor are HEAD_UNANCHORED until `amc doctor` anchors them once (adoptWorkspaceRecordHead), or HEAD_MISSING when the
 * ledger shows the store anchored before. An anchor whose signature does
 * not verify, or an unsigned one in a keyed workspace, is HEAD_UNVERIFIED: a writer who deletes the newest record and
 * rewrites the anchor to the older hash cannot sign it (WP37 review).
 * ponytail: an earlier signed anchor replayed from a backup, together with the records it named, still reads clean;
 * a machine-local high-water mark per store (src/keys/highWater.ts) or the transparency log closes that.
 */
export function verifyWorkspaceRecords<T>(workspace: string, at: RecordLocation): { records: T[]; findings: WorkspaceRecordFinding[] } {
  const { current, findings } = verifyStoredRecords(workspace, at);
  return { records: current.map((row) => row.record as unknown as T), findings };
}

type StoredRecord = { file: string; record: RecordEnvelope & Record<string, unknown> };

/** verifyWorkspaceRecords with the rows it parsed (current and kept revisions), each read once, and whether the workspace is keyed. */
function verifyStoredRecords(workspace: string, at: RecordLocation): { current: StoredRecord[]; revisions: StoredRecord[]; findings: WorkspaceRecordFinding[]; keyed: boolean } {
  const dir = recordDir(workspace, at);
  const findings: WorkspaceRecordFinding[] = [];
  const read = (folder: string): StoredRecord[] =>
    !pathExists(folder) ? [] : readdirSync(folder).filter((name) => name.endsWith(".json")).flatMap((name) => {
      const file = join(folder, name);
      try {
        const record = JSON.parse(readUtf8(file)) as unknown;
        if (record === null || typeof record !== "object" || Array.isArray(record)) throw new Error("record is not a JSON object");
        return [{ file, record: record as RecordEnvelope & Record<string, unknown> }];
      } catch (error) {
        findings.push({ file, code: "UNREADABLE", detail: error instanceof Error ? error.message : String(error) });
        return [];
      }
    });
  const current = read(dir), revisions = read(join(dir, REVISIONS_DIR)), all = [...current, ...revisions];
  const { keys, keyed, unverifiable } = sealKeys(workspace);
  if (unverifiable !== null && all.length > 0) {
    findings.push({ file: vaultPaths(workspace).keysDir, code: "KEYSET_UNVERIFIABLE", detail: `the workspace key set does not verify (${unverifiable}): no record signature can be checked and unsigned records are refused` });
  }
  const known = new Set([...genesisHashes(at), ...all.map((row) => row.record.record_hash)]);
  for (const { file, record } of all) {
    const { prev_record_hash: prev, record_hash: hash, signature, storedTs: _storedTs, ...body } = record;
    const preimage = (envelope: Partial<RecordEnvelope>) => sha256Hex(canonicalize({ ...body, ...envelope, prev_record_hash: prev }));
    // An update hashes the loaded record it replaces, envelope included: that preimage is the kept revision's envelope.
    const replaced = revisions.filter((row) => row.file !== file && basename(row.file).startsWith(`${basename(file).replace(/\.[0-9a-f]{16}\.json$|\.json$/, "")}.`));
    if (preimage({}) !== hash && !replaced.some(({ record: old }) =>
      preimage({ record_hash: old.record_hash, signature: old.signature, storedTs: old.storedTs }) === hash)) {
      findings.push({ file, code: "HASH_MISMATCH", detail: "record_hash does not match the record body and prev link" });
    }
    if (typeof signature !== "string" || signature === "unsigned") {
      findings.push({ file, code: "UNSIGNED", detail: "record carries no signature" });
    } else if (!verifyHexDigestAny(hash, signature, keys)) {
      findings.push({ file, code: "SIGNATURE_INVALID", detail: "signature does not verify under the workspace artifact-seal keys" });
    }
    if (!known.has(prev)) {
      findings.push({ file, code: "CHAIN_GAP", detail: `prev_record_hash ${String(prev).slice(0, 16)}… names no stored record` });
    }
  }
  // A genuinely signed record replayed under another name, twice, or as a superseded version is no current record (WP37 security review).
  // With an id field the copy filed under its own id is the record; without one every copy is refused.
  const filed = (row: StoredRecord) => at.idField === undefined || row.record[at.idField] === basename(row.file, ".json");
  const copies = new Map<string, number>(), superseded = new Set(revisions.map((row) => row.record.record_hash));
  for (const row of current.filter(filed)) copies.set(row.record.record_hash, (copies.get(row.record.record_hash) ?? 0) + 1);
  for (const row of current) {
    const { file, record } = row;
    if (!filed(row)) findings.push({ file, code: "ID_MISMATCH", detail: `${at.idField} does not name this file` });
    else if ((copies.get(record.record_hash) ?? 0) > 1) findings.push({ file, code: "DUPLICATE", detail: "the same record_hash is stored under another name" });
    if (superseded.has(record.record_hash)) findings.push({ file, code: "SUPERSEDED", detail: "record_hash is a kept revision's: a superseded version restored as current" });
  }
  const headFile = headAnchorPath(workspace, at), anchor = readHeadAnchor(workspace, at, { keys, keyed });
  if (anchor === UNREADABLE_ANCHOR) {
    findings.push({ file: headFile, code: "UNREADABLE", detail: "the head anchor cannot be read" });
  } else if (anchor === UNVERIFIED_ANCHOR) {
    findings.push({ file: headFile, code: "HEAD_UNVERIFIED", detail: "the head anchor is unsigned or its signature does not verify under the workspace artifact-seal keys" });
  } else if (anchor === "absent") {
    // A read never anchors (only amc doctor adopts); the ledger tells a removed anchor from one that never existed.
    if (current.length > 0 && keyed && anchoredBefore(workspace, at) === true) {
      findings.push({ file: headFile, code: "HEAD_MISSING", detail: "the ledger records this store's head as anchored before; its anchor was removed" });
    } else if (current.length > 0) findings.push({ file: headFile, code: "HEAD_UNANCHORED", detail: "no head anchor: a deleted newest record cannot be ruled out" });
  } else {
    if (!current.some((row) => row.record.record_hash === anchor.head)) {
      findings.push({ file: headFile, code: "HEAD_MISSING", detail: `the newest record ${anchor.head.slice(0, 16)}… is missing: deleted or rolled back` });
    }
    for (const lost of anchor.lost) {
      findings.push(lost === UNVERIFIED_ANCHOR ? { file: headFile, code: "HEAD_UNVERIFIED", detail: "an earlier head anchor did not verify when a later record was written" }
        : lost === UNANCHORED_MARK ? { file: headFile, code: "HEAD_UNANCHORED", detail: "records had no head anchor when a later record was written" }
        : { file: headFile, code: "HEAD_MISSING", detail: lost === UNREADABLE_ANCHOR ? "an earlier head anchor could not be read when a later record was written"
          : lost === REMOVED_ANCHOR_MARK ? "the store's head anchor had been removed when a later record was written"
          : `an earlier newest record ${lost.slice(0, 16)}… was already missing when a later record was written` });
    }
  }
  return { current, revisions, findings, keyed };
}

/** Findings that make a record itself untrusted; the others describe the store around it. */
const RECORD_REFUSALS: ReadonlySet<WorkspaceRecordFinding["code"]> = new Set(["HASH_MISMATCH", "SIGNATURE_INVALID", "ID_MISMATCH", "DUPLICATE", "SUPERSEDED"]);

/**
 * The history read for reports and aggregates (DXB-11), the workspace-record counterpart of `scanTrustedRuns`: a
 * record whose hash or signature fails is left out, and every finding is returned as an UNVERIFIED line. A report must
 * not read as clean while `unverified` is non-empty.
 * An unsigned record stays in only where the workspace has no artifact-seal verification key (a keyless workspace
 * writes nothing else); with a key, a stripped signature must not downgrade a record to "reported but kept".
 */
export function readTrustedWorkspaceRecords<T>(workspace: string, at: RecordLocation): { records: T[]; unverified: string[]; findings: WorkspaceRecordFinding[] } {
  // The rows returned are the rows verified: a file swapped after its check is never what a report reads (WP37 review).
  const { current, findings, keyed } = verifyStoredRecords(workspace, at);
  const refused = new Set(findings.filter((row) => RECORD_REFUSALS.has(row.code) || (keyed && row.code === "UNSIGNED")).map((row) => row.file));
  return { records: current.filter((row) => !refused.has(row.file)).map((row) => row.record as unknown as T),
    unverified: findings.map((row) => `UNVERIFIED: ${at.kind} ${row.code} ${basename(row.file)}: ${row.detail}`), findings };
}

function lastRecordHash(workspace: string, at: RecordLocation): string {
  const entries = loadWorkspaceRecords<RecordEnvelope>(workspace, at);
  if (entries.length === 0) return `GENESIS_${at.kind.toUpperCase().replace(/-/g, "_")}`;
  const sorted = [...entries].sort((a, b) => (a.storedTs ?? 0) - (b.storedTs ?? 0));
  return sorted[sorted.length - 1]?.record_hash ?? "GENESIS";
}

/** Internal async preparation reuses the unchanged legacy head rule; this does not verify historical record preimages. */
export function workspaceRecordHead(workspace: string, at: RecordLocation): string {
  return lastRecordHash(workspace, at);
}

/** Internal same-read target used by a real caller that derives a replacement body from its stored record. */
interface WorkspaceRecordPredecessor {
  readonly file: string;
  readonly head: string;
  readonly target: Buffer | null;
}
export function captureWorkspaceRecordPredecessor(workspace: string, at: RecordLocation, id: string): WorkspaceRecordPredecessor {
  const file = resolve(join(recordDir(workspace, at), `${id}.json`));
  return Object.freeze({ file, head: lastRecordHash(workspace, at), target: pathExists(file) ? readFileSync(file) : null });
}

/**
 * Synchronous publication only. Signatures and any key/history initialization must finish before acquiring this lock;
 * the one ledger row a store's first head anchor appends under it is local and bounded, like the legal-hold registry's.
 */
export function withWorkspaceRecordPublicationLock<T>(workspace: string, at: RecordLocation, operation: () => T): T {
  return withControlFileLock({ root: join(workspace, ".amc"),
    name: `workspace-records-${sha256Hex(join(...at.area, at.kind)).slice(0, 24)}`, operation });
}

function assertPredecessorCurrent(workspace: string, at: RecordLocation, id: string, expected: WorkspaceRecordPredecessor): void {
  const current = captureWorkspaceRecordPredecessor(workspace, at, id);
  if (current.file !== expected.file || current.head !== expected.head || (expected.target === null ? current.target !== null
    : current.target === null || !current.target.equals(expected.target))) {
    throw new Error("workspace record predecessor or destination changed while signing was prepared; retry");
  }
}

/**
 * Writes one record, chained to the previous one and signed where a key exists.
 *
 * Throws if the write fails: a residency record that cannot be persisted must
 * not report success, which is the failure this store exists to prevent.
 */
export function saveWorkspaceRecord<T extends Record<string, unknown>>(
  workspace: string,
  at: RecordLocation,
  id: string,
  body: T,
  now: number
): T & RecordEnvelope {
  const location = { area: [...at.area], kind: at.kind }, before = captureWorkspaceRecordPredecessor(workspace, location, id);
  const hash = sha256Hex(canonicalize({ ...body, prev_record_hash: before.head }));
  let signature = "unsigned";
  try {
    signature = signHexDigest(hash, getSigningKey(workspace, "artifact-seal"));
  } catch {
    // Retained synchronous compatibility: missing/refused signing keys can leave a legacy unsigned record.
  }
  const record = { ...body, prev_record_hash: before.head, record_hash: hash, signature, storedTs: now } as T & RecordEnvelope;
  const bytes = JSON.stringify(record, null, 2), head = prepareWorkspaceRecordHead(workspace, location, hash);
  return withWorkspaceRecordPublicationLock(workspace, location, () => {
    assertPredecessorCurrent(workspace, location, id, before);
    ensureDir(recordDir(workspace, location));
    anchorWorkspaceRecordHead(workspace, location, head, () => {
      keepRevision(workspace, location, id, before.target);
      writeFileAtomic(before.file, bytes, 0o644);
    });
    return record;
  });
}

/** Replaces a stored record, keeping its id; the superseded version is kept under revisions/ (WP37). Used for hold release. */
export function updateWorkspaceRecord<T extends Record<string, unknown>>(
  workspace: string,
  at: RecordLocation,
  id: string,
  body: T,
  now: number
): void {
  saveWorkspaceRecord(workspace, at, id, body, now);
}

/** Internal prepared writer consumed by actual family publishers, never a remote Sign inside a file lock or SQL transaction. */
export async function prepareWorkspaceRecordAsync<T extends Record<string, unknown>>(
  workspace: string, at: RecordLocation, id: string, body: T, now: number,
  predecessor?: WorkspaceRecordPredecessor,
  options: { beforePublish?: () => void } = {}
): Promise<{ assertCurrent(): void; publish(): T & RecordEnvelope }> {
  const root = resolve(workspace), location = { area: [...at.area], kind: at.kind }, ownId = id, ownBody = structuredClone(body), storedTs = now;
  const prior = predecessor ?? captureWorkspaceRecordPredecessor(root, location, ownId);
  const before = { file: prior.file, head: prior.head, target: prior.target === null ? null : Buffer.from(prior.target) };
  if (before.file !== resolve(join(recordDir(root, location), `${ownId}.json`))) throw new Error("workspace record predecessor names another destination");
  // Internal negative-only continuation. It cannot replace this record's captured authority or choose a signer.
  const beforePublish = options.beforePublish; beforePublish?.();
  const captured = capturePurposePublication(root, "artifact-seal"), original = captureRunHashAuthority(root, false);
  const hash = sha256Hex(canonicalize({ ...ownBody, prev_record_hash: before.head }));
  const beforeSign = () => withWorkspaceRecordPublicationLock(root, location, () => {
    beforePublish?.(); original(); assertPredecessorCurrent(root, location, ownId, before);
  });
  const signed = await signWithPurposeKey(root, "artifact-seal", Buffer.from(hash, "hex"), { beforeSign });
  const assertVaultCurrent = () => { if (signed.provider === "file" && !vaultStatus(root).unlocked) throw new Error("vault locked; unlock required for workspace record publication"); };
  const assertCurrent = () => {
    beforePublish?.();
    assertVaultCurrent(); original();
    assertPurposePublicationCurrent(root, captured, signed);
  };
  assertCurrent();
  const head = prepareWorkspaceRecordHeadFor(root, location, hash, signed);
  const record = { ...ownBody, prev_record_hash: before.head, record_hash: hash,
    signature: signed.signature.toString("base64"), storedTs } as T & RecordEnvelope;
  const bytes = JSON.stringify(record, null, 2);
  return Object.freeze({ assertCurrent, publish(): T & RecordEnvelope {
    assertCurrent();
    assertPredecessorCurrent(root, location, ownId, before);
    ensureDir(recordDir(root, location));
    anchorWorkspaceRecordHead(root, location, head, () => {
      keepRevision(root, location, ownId, before.target);
      writeFileAtomic(before.file, bytes, 0o644);
    });
    return record;
  } });
}
