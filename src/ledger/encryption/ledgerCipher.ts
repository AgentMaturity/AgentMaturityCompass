/**
 * Field encryption for ledger rows (P2-09, ADR 018 option A): AES-256-GCM, the blob envelope's pattern, with AAD binding
 * the table, the row id, the column and the key version, so a ciphertext moved to another row or column fails to open.
 *
 *   amcenc:v1:{keyVersion}:{nonce}:{ciphertext}:{tag}      (nonce, ciphertext and tag in base64url)
 *
 * The stored ciphertext is what the event hash covers (src/ledger/ledger.ts), so the chain and its signatures verify
 * without any key; `payload_sha256` (over the plaintext) is checked only by a holder of the key or of a plaintext export.
 */
import type Database from "better-sqlite3";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { KeyProviderError } from "../../keys/provider.js";
import type { EvidenceEvent } from "../../types.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalMetadataForHash } from "../eventHash.js";
import { dataKeySync } from "./dataKeys.js";

const LEDGER_CIPHER_PREFIX = "amcenc:v1:";

export interface LedgerAad { table: string; rowId: string; column: string }

const aadBytes = (aad: LedgerAad, keyVersion: number) => Buffer.from(`${aad.table}:${aad.rowId}:${aad.column}:${keyVersion}`, "utf8");

export function isEncryptedField(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith(LEDGER_CIPHER_PREFIX);
}

const floors = new WeakMap<Database.Database, number>();

/** The highest key version among the ledger's inline ciphertexts, read once per connection and kept current here. */
function ciphertextFloor(db: Database.Database): number {
  const known = floors.get(db);
  if (known !== undefined) return known;
  // ponytail: one full scan per connection; keep a max-version column or index if ledgers grow past what that allows.
  const row = db.prepare(`SELECT MAX(CAST(substr(v, 11, instr(substr(v, 11), ':') - 1) AS INTEGER)) AS version FROM
    (SELECT COALESCE(canonical_payload_inline, payload_inline) AS v FROM evidence_events) WHERE v LIKE '${LEDGER_CIPHER_PREFIX}%'`).get() as { version: number | null };
  floors.set(db, row.version ?? 0);
  return row.version ?? 0;
}

/**
 * Encrypts under the workspace's active data key. A KeyProviderError (key unavailable) propagates: nothing is written.
 * With `db`, a key version older than one the ledger already holds is refused (a rolled-back key file).
 */
export function encryptField(workspace: string, plain: string, aad: LedgerAad, db?: Database.Database): string {
  const { keyVersion, key } = dataKeySync(workspace);
  if (db !== undefined) {
    const floor = ciphertextFloor(db);
    if (keyVersion < floor) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", `ledger data key version ${keyVersion} is older than version ${floor} already in the ledger`);
    floors.set(db, keyVersion);
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aadBytes(aad, keyVersion));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${LEDGER_CIPHER_PREFIX}${keyVersion}:${nonce.toString("base64url")}:${body.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}`;
}

/** Thrown when a value is not an authentic ciphertext for this row and column (as opposed to a key being unavailable). */
export class LedgerFieldAuthError extends Error {
  constructor(aad: LedgerAad) {
    super(`ledger field ${aad.table}.${aad.column} of row ${aad.rowId} failed authentication`);
    this.name = "LedgerFieldAuthError";
  }
}

/** The plaintext of `value`; a value without the prefix is returned as is (rows written before encryption). */
export function decryptField(workspace: string, value: string, aad: LedgerAad): string {
  if (!isEncryptedField(value)) return value;
  const parts = value.slice(LEDGER_CIPHER_PREFIX.length).split(":");
  const keyVersion = Number(parts[0]);
  if (parts.length !== 4 || !Number.isInteger(keyVersion) || keyVersion < 1) throw new LedgerFieldAuthError(aad);
  const { key } = dataKeySync(workspace, keyVersion);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1]!, "base64url"));
    decipher.setAAD(aadBytes(aad, keyVersion));
    decipher.setAuthTag(Buffer.from(parts[3]!, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(parts[2]!, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new LedgerFieldAuthError(aad);
  }
}

/** The AAD of an evidence row's inline payload; `canonical_payload_inline` holds the same ciphertext. */
export const inlinePayloadAad = (eventId: string): LedgerAad => ({ table: "evidence_events", rowId: eventId, column: "payload_inline" });

/**
 * Decrypts an evidence row's inline payload, or null only when the key is genuinely out of reach here: the provider
 * could not be reached or the vault is locked (KEY_PROVIDER_UNAVAILABLE). A missing or rolled-back key file, a key
 * version the signed file does not hold, a refused key or a ciphertext that does not open all throw.
 */
export function inlinePlaintextOrNull(workspace: string, eventId: string, value: string): string | null {
  try {
    return decryptField(workspace, value, inlinePayloadAad(eventId));
  } catch (error) {
    if (error instanceof KeyProviderError && error.code === "KEY_PROVIDER_UNAVAILABLE") return null;
    throw error;
  }
}

/**
 * Recomputes an evidence row's event hash. Rows written with encryption on hash their stored ciphertext, so no key is
 * needed. Rows encrypted later by `amc evidence-stores encrypt` hashed their plaintext; for those the key is needed, and
 * without it the mismatch is reported with that reason.
 */
export function recomputeEventHash(workspace: string, event: EvidenceEvent, errors: string[]): string {
  const inline = event.canonical_payload_inline ?? event.payload_inline;
  const hashWith = (payloadInline: string | null) => sha256Hex(`${event.prev_event_hash}${canonicalMetadataForHash({
    id: event.id, ts: event.ts, sessionId: event.session_id, runtime: event.runtime, eventType: event.event_type,
    payloadPath: event.canonical_payload_path ?? event.payload_path, payloadInline, metaJson: event.meta_json
  })}${event.payload_sha256}`);
  const stored = hashWith(inline ?? null);
  if (stored === event.event_hash || !isEncryptedField(inline)) return stored;
  try {
    const plain = inlinePlaintextOrNull(workspace, event.id, inline);
    if (plain !== null) return hashWith(plain);
    // Without the key a row encrypted after hashing cannot be told from an altered one: it fails, saying why.
    errors.push(`Event ${event.id} event_hash mismatch over its stored ciphertext; a row encrypted after hashing needs the ledger key or a plaintext export to verify`);
    return event.event_hash;
  } catch {
    return stored;
  }
}
