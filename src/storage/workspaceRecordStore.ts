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
import { join, resolve } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest, getSigningKey } from "../crypto/keys.js";
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
    writeFileAtomic(before.file, bytes, 0o644);
    return record;
  });
}

/** Replaces a stored record in place, keeping its id. Used for hold release. */
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
  const captured = capturePurposePublication(root, "artifact-seal");
  const hash = sha256Hex(canonicalize({ ...ownBody, prev_record_hash: before.head }));
  const signed = await signWithPurposeKey(root, "artifact-seal", Buffer.from(hash, "hex"));
  const assertVaultCurrent = () => { if (signed.provider === "file" && !vaultStatus(root).unlocked) throw new Error("vault locked; unlock required for workspace record publication"); };
  const assertCurrent = () => {
    beforePublish?.();
    assertVaultCurrent();
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
    writeFileAtomic(before.file, bytes, 0o644);
    return record;
  } });
}
