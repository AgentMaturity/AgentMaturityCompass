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
import { signHexDigest, getSigningKey, verifyHexDigestAny } from "../crypto/keys.js";
import { captureRunHashAuthority, runHashVerificationKeys } from "../ledger/runHashSignature.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { assertPurposePublicationCurrent, capturePurposePublication } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { vaultStatus } from "../vault/vault.js";

/**
 * Where a family of records lives, relative to the workspace root.
 *
 * e.g. { area: ["compliance", "residency"], kind: "legal-holds" } stores under
 * .amc/compliance/residency/legal-holds/.
 */
export interface RecordLocation {
  area: string[];
  kind: string;
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
 * anchored head that was already missing when a later record was written, so the next write does not hide it.
 */
const UNREADABLE_ANCHOR = "unreadable";
interface HeadAnchor { head: string; lost: string[] }

/** Beside the record directory, never in it: strict readers of a record directory refuse any non-record entry. */
function headAnchorPath(workspace: string, at: RecordLocation): string {
  return join(workspace, ".amc", ...at.area, `${at.kind}.head.json`);
}

/** The anchor; "absent" for a store written before anchoring, "unreadable" when it is corrupt. */
function readHeadAnchor(workspace: string, at: RecordLocation): HeadAnchor | "absent" | typeof UNREADABLE_ANCHOR {
  const file = headAnchorPath(workspace, at);
  if (!pathExists(file)) return "absent";
  try {
    const row = JSON.parse(readUtf8(file)) as { record_hash?: unknown; lost?: unknown };
    const lost = row.lost ?? [];
    return typeof row.record_hash === "string" && row.record_hash.length > 0 && Array.isArray(lost) && lost.every((item) => typeof item === "string")
      ? { head: row.record_hash, lost: lost as string[] } : UNREADABLE_ANCHOR;
  } catch {
    return UNREADABLE_ANCHOR;
  }
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
 * Records `recordHash` as the newest record of one kind. Every publisher calls it right after its record write, under
 * that store's publication lock; a previous head that is no longer stored is carried forward in `lost`.
 */
export function anchorWorkspaceRecordHead(workspace: string, at: RecordLocation, recordHash: string): void {
  const prior = readHeadAnchor(workspace, at);
  const lost = prior === "absent" ? [] : prior === UNREADABLE_ANCHOR ? [UNREADABLE_ANCHOR] : [...prior.lost];
  if (typeof prior === "object" && !storedRecordHashes(workspace, at).has(prior.head)) lost.push(prior.head);
  writeFileAtomic(headAnchorPath(workspace, at), JSON.stringify({ record_hash: recordHash, lost }, null, 2), 0o644);
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
  code: "UNREADABLE" | "HASH_MISMATCH" | "UNSIGNED" | "SIGNATURE_INVALID" | "CHAIN_GAP" | "HEAD_MISSING" | "HEAD_UNANCHORED";
  detail: string;
}

/**
 * The verifying reader (WP37): every record of one kind with the integrity findings `loadWorkspaceRecords` hides.
 * Recomputes record_hash over body + prev link, checks the artifact-seal signature, and requires every prev link to
 * name genesis or a stored record (current or a kept revision), so a deleted or corrupted middle record is a finding
 * rather than a silent omission. The head anchor covers the newest record, which no successor names: an anchored hash
 * that is not a current record means the newest record was deleted or rolled back (HEAD_MISSING), and records with
 * no anchor (a store written before anchoring, or an anchor deleted with the record) are HEAD_UNANCHORED.
 * ponytail: the anchor is unsigned (the async publishers sign exactly once), so a writer who rewrites head.anchor to
 * the previous hash along with the deletion is not caught; anchor heads in the transparency log if that matters.
 */
export function verifyWorkspaceRecords<T>(workspace: string, at: RecordLocation): { records: T[]; findings: WorkspaceRecordFinding[] } {
  const dir = recordDir(workspace, at);
  const findings: WorkspaceRecordFinding[] = [];
  const read = (folder: string): Array<{ file: string; record: RecordEnvelope & Record<string, unknown> }> =>
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
  let keys: string[] = [];
  try { keys = runHashVerificationKeys(workspace); } catch { /* no verification keys: every signature below is unverifiable */ }
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
  const anchor = readHeadAnchor(workspace, at), headFile = headAnchorPath(workspace, at);
  if (anchor === UNREADABLE_ANCHOR) {
    findings.push({ file: headFile, code: "UNREADABLE", detail: "the head anchor cannot be read" });
  } else if (anchor === "absent") {
    if (current.length > 0) findings.push({ file: headFile, code: "HEAD_UNANCHORED", detail: "no head anchor: a deleted newest record cannot be ruled out" });
  } else {
    if (!current.some((row) => row.record.record_hash === anchor.head)) {
      findings.push({ file: headFile, code: "HEAD_MISSING", detail: `the newest record ${anchor.head.slice(0, 16)}… is missing: deleted or rolled back` });
    }
    for (const lost of anchor.lost) {
      findings.push({ file: headFile, code: "HEAD_MISSING", detail: lost === UNREADABLE_ANCHOR ? "an earlier head anchor could not be read when a later record was written"
        : `an earlier newest record ${lost.slice(0, 16)}… was already missing when a later record was written` });
    }
  }
  return { records: current.map((row) => row.record as unknown as T), findings };
}

/** Findings that make a record itself untrusted; the others describe the store around it. */
const RECORD_REFUSALS: ReadonlySet<WorkspaceRecordFinding["code"]> = new Set(["HASH_MISMATCH", "SIGNATURE_INVALID"]);

/**
 * The history read for reports and aggregates (DXB-11), the workspace-record counterpart of `scanTrustedRuns`: a
 * record whose hash or signature fails is left out, and every finding is returned as an UNVERIFIED line. A report must
 * not read as clean while `unverified` is non-empty.
 * An unsigned record stays in only where the workspace has no artifact-seal verification key (a keyless workspace
 * writes nothing else); with a key, a stripped signature must not downgrade a record to "reported but kept".
 */
export function readTrustedWorkspaceRecords<T>(workspace: string, at: RecordLocation): { records: T[]; unverified: string[] } {
  const { findings } = verifyWorkspaceRecords<RecordEnvelope>(workspace, at);
  let keyed = false;
  try { keyed = runHashVerificationKeys(workspace).length > 0; } catch { /* keyless workspace */ }
  const refused = new Set(findings.filter((row) => RECORD_REFUSALS.has(row.code) || (keyed && row.code === "UNSIGNED")).map((row) => row.file));
  const dir = recordDir(workspace, at);
  const records = !pathExists(dir) ? [] : readdirSync(dir).filter((name) => name.endsWith(".json") && !refused.has(join(dir, name)))
    .flatMap((name) => {
      try { return [JSON.parse(readUtf8(join(dir, name))) as T]; } catch { return []; }
    });
  return { records, unverified: findings.map((row) => `UNVERIFIED: ${at.kind} ${row.code} ${basename(row.file)}: ${row.detail}`) };
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

/** Synchronous publication only. Signatures and any key/history initialization must finish before acquiring this lock. */
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
  const bytes = JSON.stringify(record, null, 2);
  return withWorkspaceRecordPublicationLock(workspace, location, () => {
    assertPredecessorCurrent(workspace, location, id, before);
    ensureDir(recordDir(workspace, location));
    keepRevision(workspace, location, id, before.target);
    writeFileAtomic(before.file, bytes, 0o644);
    anchorWorkspaceRecordHead(workspace, location, hash);
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
  const record = { ...ownBody, prev_record_hash: before.head, record_hash: hash,
    signature: signed.signature.toString("base64"), storedTs } as T & RecordEnvelope;
  const bytes = JSON.stringify(record, null, 2);
  return Object.freeze({ assertCurrent, publish(): T & RecordEnvelope {
    assertCurrent();
    assertPredecessorCurrent(root, location, ownId, before);
    ensureDir(recordDir(root, location));
    keepRevision(root, location, ownId, before.target);
    writeFileAtomic(before.file, bytes, 0o644);
    anchorWorkspaceRecordHead(root, location, hash);
    return record;
  } });
}
