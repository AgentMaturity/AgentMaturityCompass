/**
 * A4 Forge private blob store (P1-56; design §4.2): comment bodies and personal context never enter the ledger.
 *
 * `createProjectKey` (called by createProject, which needs the vault anyway to sign its audit row) makes the project's
 * RSA key pair: `key.pub` seals bodies, and `key.enc` holds the private half under AES-256-GCM with the project's wrap
 * secret, the vault secret `a4:<projectId>:wrap`. Sealing needs only `key.pub`, so the blob write itself needs no vault
 * (the transition recording it still signs with the vault's monitor key). `key.pub` is an unauthenticated file, so
 * `putPrivate` seals only to a key whose sha256 matches the one the caller read from the signed CREATED transition.
 * Reads unwrap through the vault: VAULT_LOCKED when no passphrase is available, VAULT_UNREADABLE when the vault does
 * not open with the one given (a wrong passphrase or a damaged envelope). The salted `bodySha256 = sha256(salt ||
 * body)` keeps a short body from being confirmed by dictionary after erasure; the salt travels inside the ciphertext,
 * and `blobRef = sha256(ciphertext)` names the file.
 *
 * Erasure (`destroyProjectKey`) leaves a tombstone, deletes the wrap secret and `key.enc`; nothing re-keys the project
 * afterwards (an explicit re-key belongs to P2-36). It is effective only once every backup older than it is rotated: an
 * earlier backup still holds key.enc and a vault envelope with the wrap secret.
 */
import { constants, createCipheriv, createDecipheriv, generateKeyPairSync, privateDecrypt, publicEncrypt, randomBytes } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { highSeveritySecretTypes } from "../release/releaseSecretScan.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { deleteVaultSecret, getVaultSecretReadOnly, setVaultSecret, unlockVault, vaultStatus } from "../vault/vault.js";

const SALT_BYTES = 32;
const TOMBSTONE = "key.destroyed";
const wrapSecret = (projectId: string): string => `a4:${projectId}:wrap`;

export type A4BlobErrorCode = "VAULT_LOCKED" | "VAULT_UNREADABLE" | "SECRET_SCAN_REFUSED" | "BLOB_MISSING" | "BLOB_INTEGRITY" | "PROJECT_KEY_DESTROYED"
  | "PROJECT_KEY_EXISTS" | "PROJECT_KEY_MISSING" | "PROJECT_KEY_UNVERIFIED";
export class A4BlobError extends Error {
  constructor(readonly code: A4BlobErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "A4BlobError";
  }
}

export function a4ProjectsRoot(workspace: string): string {
  return join(workspace, "a4-projects");
}

function privateDir(workspace: string, projectId: string): string {
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(projectId)) throw new Error(`invalid A4 project id ${JSON.stringify(projectId)}`);
  return join(a4ProjectsRoot(workspace), projectId, "private");
}

type AesParts = { iv: string; tag: string; ciphertext: string };
function aesSeal(key: Buffer, plaintext: Buffer): AesParts {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}
function aesOpen(key: Buffer, parts: Partial<AesParts>): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts.iv ?? "", "base64"));
  decipher.setAuthTag(Buffer.from(parts.tag ?? "", "base64"));
  return Buffer.concat([decipher.update(Buffer.from(parts.ciphertext ?? "", "base64")), decipher.final()]);
}

/** RSA-OAEP(sha256) wraps a fresh AES-256-GCM key; only the private half opens it. */
function sealTo(publicKeyPem: string, plaintext: Buffer): Buffer {
  const key = randomBytes(32);
  const wrappedKey = publicEncrypt({ key: publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key);
  return Buffer.from(JSON.stringify({ v: 1, alg: "RSA-OAEP-256+A256GCM", wrappedKey: wrappedKey.toString("base64"), ...aesSeal(key, plaintext) }), "utf8");
}

function openWith(privateKeyPem: string, sealed: Buffer): Buffer {
  const parsed = JSON.parse(sealed.toString("utf8")) as Record<string, string>;
  return aesOpen(privateDecrypt({ key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(parsed.wrappedKey ?? "", "base64")), parsed);
}

/** Whether this process holds a vault credential: an unlocked session or AMC_VAULT_PASSPHRASE. */
const holdsVaultCredential = (workspace: string): boolean => vaultStatus(workspace).unlocked || Boolean(process.env.AMC_VAULT_PASSPHRASE);

/**
 * VAULT_LOCKED only when no credential was held before the vault call; a wrong passphrase or a damaged vault is
 * VAULT_UNREADABLE with the vault's message. The state is taken before the call because a failed refresh locks the vault.
 */
function vaultFailure(hadCredential: boolean, purpose: string, error: unknown): A4BlobError {
  const message = error instanceof Error ? error.message : String(error);
  return hadCredential
    ? new A4BlobError("VAULT_UNREADABLE", `the vault did not open to ${purpose} (${message})`)
    : new A4BlobError("VAULT_LOCKED", `unlock the vault to ${purpose} (${message})`);
}

/** Opens the vault for a write. */
function unlockForWrite(workspace: string, purpose: string): void {
  if (vaultStatus(workspace).unlocked) return;
  const hadCredential = holdsVaultCredential(workspace);
  try {
    unlockVault(workspace);
  } catch (error) {
    throw vaultFailure(hadCredential, purpose, error);
  }
}

/** A4's vault writes share one lock: setVaultSecret rewrites the whole envelope from this process's copy. */
const withVaultLock = <T>(workspace: string, operation: () => T): T => withControlFileLock({ root: a4ProjectsRoot(workspace), name: "a4-vault", operation });

/** Makes the project's key pair and wrap secret once; needs the vault. Returns sha256(key.pub), which CREATED signs. */
export function createProjectKey(workspace: string, projectId: string): string {
  const dir = privateDir(workspace, projectId);
  unlockForWrite(workspace, "create the project's key");
  if (pathExists(join(dir, "key.pub")) || pathExists(join(dir, TOMBSTONE))) throw new A4BlobError("PROJECT_KEY_EXISTS", `project ${projectId} already has a key`);
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const wrap = randomBytes(32);
  withVaultLock(workspace, () => setVaultSecret(workspace, wrapSecret(projectId), wrap.toString("base64")));
  ensureDir(dir);
  writeFileAtomic(join(dir, "key.enc"), JSON.stringify({ v: 1, alg: "A256GCM", ...aesSeal(wrap, Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" }).toString(), "utf8")) }), 0o600);
  writeFileAtomic(join(dir, "key.pub"), publicPem, 0o644);
  return sha256Hex(publicPem);
}

/**
 * Encrypts `bytes` to the project's key.pub, read once and refused unless its sha256 is `keySha256` (from the signed
 * CREATED transition); refuses on any HIGH release secret-scan hit in the plaintext. Touches no ledger row.
 */
export function putPrivate(workspace: string, projectId: string, bytes: Buffer, keySha256: string): { bodySha256: string; blobRef: string } {
  const hits = highSeveritySecretTypes(bytes.toString("utf8"));
  if (hits.length > 0) throw new A4BlobError("SECRET_SCAN_REFUSED", `the text matches ${hits.join(", ")}; remove the secret and retry`);
  const dir = privateDir(workspace, projectId);
  if (pathExists(join(dir, TOMBSTONE))) throw new A4BlobError("PROJECT_KEY_DESTROYED", `project ${projectId}'s key was destroyed; nothing more is stored for it`);
  const publicPem = pathExists(join(dir, "key.pub")) ? readFileSync(join(dir, "key.pub"), "utf8") : null;
  if (publicPem === null || sha256Hex(publicPem) !== keySha256) {
    throw new A4BlobError("PROJECT_KEY_UNVERIFIED", `project ${projectId}'s key.pub is not the key its CREATED record names`);
  }
  const plaintext = Buffer.concat([randomBytes(SALT_BYTES), bytes]);
  const sealed = sealTo(publicPem, plaintext);
  const blobRef = sha256Hex(sealed);
  writeFileAtomic(join(dir, `${blobRef}.enc`), sealed, 0o600);
  return { bodySha256: sha256Hex(plaintext), blobRef };
}

/** Decrypts one blob through the vault; checks the file against `blobRef` and, when given, the body against `bodySha256`. */
export function getPrivate(workspace: string, projectId: string, blobRef: string, bodySha256?: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(blobRef)) throw new A4BlobError("BLOB_MISSING", "invalid blob reference");
  const dir = privateDir(workspace, projectId);
  // After the tombstone no blob is written, so every blob of the project predates the erasure.
  if (pathExists(join(dir, TOMBSTONE))) throw new A4BlobError("PROJECT_KEY_DESTROYED", `project ${projectId}'s key was destroyed`);
  const path = join(dir, `${blobRef}.enc`);
  if (!pathExists(path)) throw new A4BlobError("BLOB_MISSING", `blob ${blobRef} is not in this workspace`);
  const sealed = readFileSync(path);
  if (sha256Hex(sealed) !== blobRef) throw new A4BlobError("BLOB_INTEGRITY", `blob ${blobRef} does not match its name`);
  let wrap: string | null;
  const hadCredential = holdsVaultCredential(workspace);
  try {
    wrap = getVaultSecretReadOnly(workspace, wrapSecret(projectId));
  } catch (error) {
    throw vaultFailure(hadCredential, "read this", error);
  }
  if (wrap === null || !pathExists(join(dir, "key.enc"))) throw new A4BlobError("PROJECT_KEY_MISSING", `project ${projectId}'s key is missing without an erasure record`);
  let plaintext: Buffer;
  try {
    const privatePem = aesOpen(Buffer.from(wrap, "base64"), JSON.parse(readFileSync(join(dir, "key.enc"), "utf8")) as Partial<AesParts>).toString("utf8");
    plaintext = openWith(privatePem, sealed);
  } catch {
    throw new A4BlobError("BLOB_INTEGRITY", `blob ${blobRef} did not decrypt`);
  }
  if (bodySha256 !== undefined && sha256Hex(plaintext) !== bodySha256) throw new A4BlobError("BLOB_INTEGRITY", `blob ${blobRef} does not match its recorded hash`);
  return plaintext.subarray(SALT_BYTES);
}

/**
 * Erasure (P2-36 calls it as an owner action): the tombstone first, so an erasure interrupted halfway still refuses new
 * writes and reports PROJECT_KEY_DESTROYED; then the wrap secret and key.enc. Needs the vault; idempotent.
 */
export function destroyProjectKey(workspace: string, projectId: string): void {
  const dir = privateDir(workspace, projectId);
  unlockForWrite(workspace, "destroy the project's key");
  const publicPem = pathExists(join(dir, "key.pub")) ? readFileSync(join(dir, "key.pub"), "utf8") : null;
  ensureDir(dir);
  if (!pathExists(join(dir, TOMBSTONE))) {
    writeFileAtomic(join(dir, TOMBSTONE), JSON.stringify({ keySha256: publicPem === null ? null : sha256Hex(publicPem), destroyedTs: Date.now() }), 0o644);
  }
  withVaultLock(workspace, () => deleteVaultSecret(workspace, wrapSecret(projectId)));
  rmSync(join(dir, "key.enc"), { force: true });
  rmSync(join(dir, "key.pub"), { force: true });
}
