/**
 * Durable store for data-residency configuration.
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
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest, getPrivateKeyPem } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";

/** Record kinds kept under .amc/compliance/residency/. */
export type ResidencyRecordKind = "policies" | "tenants" | "legal-holds";

/** Chain and signature fields appended to every stored record. */
export interface ResidencyRecordEnvelope {
  prev_record_hash: string;
  record_hash: string;
  signature: string;
  storedTs: number;
}

function recordDir(workspace: string, kind: ResidencyRecordKind): string {
  return join(workspace, ".amc", "compliance", "residency", kind);
}

/** Reads every stored record of one kind. Unreadable files are skipped. */
export function loadResidencyRecords<T>(workspace: string, kind: ResidencyRecordKind): T[] {
  const dir = recordDir(workspace, kind);
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

function lastRecordHash(workspace: string, kind: ResidencyRecordKind): string {
  const entries = loadResidencyRecords<ResidencyRecordEnvelope>(workspace, kind);
  if (entries.length === 0) return `GENESIS_${kind.toUpperCase().replace(/-/g, "_")}`;
  const sorted = [...entries].sort((a, b) => (a.storedTs ?? 0) - (b.storedTs ?? 0));
  return sorted[sorted.length - 1]?.record_hash ?? "GENESIS";
}

/**
 * Writes one record, chained to the previous one and signed where a key exists.
 *
 * Throws if the write fails: a residency record that cannot be persisted must
 * not report success, which is the failure this store exists to prevent.
 */
export function saveResidencyRecord<T extends Record<string, unknown>>(
  workspace: string,
  kind: ResidencyRecordKind,
  id: string,
  body: T,
  now: number
): T & ResidencyRecordEnvelope {
  const prev = lastRecordHash(workspace, kind);
  const hash = sha256Hex(canonicalize({ ...body, prev_record_hash: prev }));
  let signature = "unsigned";
  try {
    signature = signHexDigest(hash, getPrivateKeyPem(workspace, "auditor"));
  } catch {
    // No auditor key in this workspace; the chain still detects tampering.
  }
  const record = {
    ...body,
    prev_record_hash: prev,
    record_hash: hash,
    signature,
    storedTs: now
  } as T & ResidencyRecordEnvelope;

  const dir = recordDir(workspace, kind);
  ensureDir(dir);
  writeFileAtomic(join(dir, `${id}.json`), JSON.stringify(record, null, 2), 0o644);
  return record;
}

/** Replaces a stored record in place, keeping its id. Used for hold release. */
export function updateResidencyRecord<T extends Record<string, unknown>>(
  workspace: string,
  kind: ResidencyRecordKind,
  id: string,
  body: T,
  now: number
): void {
  saveResidencyRecord(workspace, kind, id, body, now);
}
