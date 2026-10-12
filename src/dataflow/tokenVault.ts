/**
 * The workspace token keys and the token → value map (P2-02).
 *
 * Keys: one vault secret holds a 32-byte HMAC key and a 32-byte AES key, created once from the OS CSPRNG under a file
 * lock. A locked or unreadable vault refuses; nothing falls back to an unkeyed token. The keys are never logged.
 *
 * Map: `.amc/dataflow/token-vault.sqlite` holds each value AES-256-GCM encrypted under a fresh random 96-bit nonce, with
 * the token as additional data so a row cannot be moved to another token. The file holds the protected values
 * themselves: never export or bundle it. Rows are deleted only through the P2-01 deletion gate.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { withDeletionGate } from "../residency/deletionGate.js";
import { ensureDir } from "../utils/fs.js";
import type { ProtectedDataClass } from "../vault/dataClassification.js";
import { getVaultSecret, setVaultSecret } from "../vault/vault.js";
import { RedactionRefused } from "./tokenizer.js";

export interface TokenKeys { readonly hmac: Buffer; readonly aes: Buffer }
export interface TokenEntry { readonly token: string; readonly dataClass: ProtectedDataClass; readonly value: string }
interface TokenRow { readonly data_class: string; readonly nonce: Buffer; readonly ciphertext: Buffer; readonly tag: Buffer }

const KEY_SECRET = "dataflow.token-keys.v1";
const KEY_BYTES = 32;

export const tokenVaultPath = (workspace: string): string => join(resolve(workspace), ".amc", "dataflow", "token-vault.sqlite");

function decodeKeys(encoded: string | null): TokenKeys {
  const bytes = Buffer.from(encoded ?? "", "base64");
  if (bytes.length !== 2 * KEY_BYTES || bytes.toString("base64") !== encoded) throw new RedactionRefused("vault_unavailable");
  return Object.freeze({ hmac: bytes.subarray(0, KEY_BYTES), aes: bytes.subarray(KEY_BYTES) });
}

/** The workspace token keys from the unlocked vault; the first caller creates them under a lock. */
export function loadTokenKeys(workspace: string): TokenKeys {
  try {
    const existing = getVaultSecret(workspace, KEY_SECRET);
    if (existing !== null) return decodeKeys(existing);
    // ponytail: the lock orders AMC's own key creation only; the vault's whole-envelope rewrite can still lose a secret to
    // a concurrent unrelated vault write, after which new tokens differ and old rows stop decrypting (refused, never
    // silently re-keyed per row). A vault compare-and-swap fixes that if it matters.
    return withControlFileLock({ root: dirname(tokenVaultPath(workspace)), name: "token-keys", operation: () => {
      if (getVaultSecret(workspace, KEY_SECRET) === null) setVaultSecret(workspace, KEY_SECRET, randomBytes(2 * KEY_BYTES).toString("base64"));
      return decodeKeys(getVaultSecret(workspace, KEY_SECRET));
    } });
  } catch {
    throw new RedactionRefused("vault_unavailable");
  }
}

function openVault(workspace: string): Database.Database {
  const path = tokenVaultPath(workspace);
  ensureDir(dirname(path));
  const db = new Database(path);
  try {
    chmodSync(path, 0o600);
    db.pragma("busy_timeout = 5000");
    db.exec(`CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, data_class TEXT NOT NULL, nonce BLOB NOT NULL,
      ciphertext BLOB NOT NULL, tag BLOB NOT NULL, created_ts INTEGER NOT NULL) STRICT`);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function unseal(keys: TokenKeys, token: string, row: TokenRow): string {
  try {
    if (row.nonce.length !== 12 || row.tag.length !== 16) throw new Error("malformed row");
    const decipher = createDecipheriv("aes-256-gcm", keys.aes, row.nonce, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(token, "utf8"));
    decipher.setAuthTag(row.tag);
    return Buffer.concat([decipher.update(row.ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new RedactionRefused("vault_integrity");
  }
}

/**
 * Records every entry in one immediate transaction. A token already present must decrypt to the same class and value;
 * a different value under the same 64-bit token is a collision and refuses the whole commit rather than overwrite.
 */
export function storeTokens(workspace: string, keys: TokenKeys, entries: readonly TokenEntry[]): void {
  if (entries.length === 0) return;
  let db: Database.Database | undefined;
  try {
    db = openVault(workspace);
    const select = db.prepare("SELECT data_class, nonce, ciphertext, tag FROM tokens WHERE token = ?");
    const insert = db.prepare("INSERT INTO tokens (token, data_class, nonce, ciphertext, tag, created_ts) VALUES (?, ?, ?, ?, ?, ?)");
    db.transaction(() => {
      for (const entry of entries) {
        const row = select.get(entry.token) as TokenRow | undefined;
        if (row !== undefined) {
          if (row.data_class !== entry.dataClass || unseal(keys, entry.token, row) !== entry.value) throw new RedactionRefused("token_collision");
          continue;
        }
        const nonce = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", keys.aes, nonce, { authTagLength: 16 });
        cipher.setAAD(Buffer.from(entry.token, "utf8"));
        const ciphertext = Buffer.concat([cipher.update(entry.value, "utf8"), cipher.final()]);
        insert.run(entry.token, entry.dataClass, nonce, ciphertext, cipher.getAuthTag(), Date.now());
      }
    }).immediate();
  } catch (error) {
    throw error instanceof RedactionRefused ? error : new RedactionRefused("vault_unavailable");
  } finally {
    db?.close();
  }
}

/** Deletes the named tokens' rows through the P2-01 deletion gate, so an active legal hold refuses. Returns rows deleted. */
export function deleteTokens(workspace: string, executor: string, tokens: readonly string[]): number {
  return withDeletionGate({ workspace, executor, target: { kind: "token-vault" } }, () => {
    if (!existsSync(tokenVaultPath(workspace))) return 0;
    const db = openVault(workspace);
    try {
      const remove = db.prepare("DELETE FROM tokens WHERE token = ?");
      return db.transaction(() => tokens.reduce((count, token) => count + remove.run(token).changes, 0)).immediate();
    } finally {
      db.close();
    }
  });
}
