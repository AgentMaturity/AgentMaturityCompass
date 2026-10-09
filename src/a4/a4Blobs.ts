/**
 * A4 Forge private blob store (P1-56; design §4.2): comment bodies and personal context never enter the ledger.
 *
 * Each body is sealed to its project's public key (`a4-projects/<projectId>/private/key.pub`), so writes never need
 * an unlocked vault. The project's private key lives in `key.enc`, sealed to the workspace KEK, whose private half is
 * the vault secret `a4:kek`; reads unwrap through the vault and report VAULT_LOCKED when they cannot. The salted
 * `bodySha256 = sha256(salt || body)` keeps a short body from being confirmed by dictionary after erasure; the salt
 * travels inside the ciphertext, and `blobRef = sha256(ciphertext)` names the file.
 *
 * Erasure is deleting `key.enc` (`destroyProjectKey`). It is effective only once every backup older than it is
 * rotated: an earlier backup still holds the old key file and vault envelope.
 */
import { constants, createCipheriv, createDecipheriv, generateKeyPairSync, privateDecrypt, publicEncrypt, randomBytes } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { highSeveritySecretTypes } from "../release/releaseSecretScan.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { getVaultSecretReadOnly, setVaultSecret, unlockVault, vaultStatus } from "../vault/vault.js";

const KEK_SECRET = "a4:kek";
const SALT_BYTES = 32;

export type A4BlobErrorCode = "VAULT_LOCKED" | "A4_KEK_MISSING" | "SECRET_SCAN_REFUSED" | "BLOB_MISSING" | "BLOB_INTEGRITY" | "PROJECT_KEY_DESTROYED";
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

const kekPublicPath = (workspace: string): string => join(a4ProjectsRoot(workspace), "kek.pub.pem");

/** RSA-OAEP(sha256) wraps a fresh AES-256-GCM key; only the private half opens it. */
function sealTo(publicKeyPem: string, plaintext: Buffer): Buffer {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const wrappedKey = publicEncrypt({ key: publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key);
  return Buffer.from(JSON.stringify({ v: 1, alg: "RSA-OAEP-256+A256GCM", wrappedKey: wrappedKey.toString("base64"),
    iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") }), "utf8");
}

function openWith(privateKeyPem: string, sealed: Buffer): Buffer {
  const parsed = JSON.parse(sealed.toString("utf8")) as Record<string, string>;
  const key = privateDecrypt({ key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(parsed.wrappedKey ?? "", "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv ?? "", "base64"));
  decipher.setAuthTag(Buffer.from(parsed.tag ?? "", "base64"));
  return Buffer.concat([decipher.update(Buffer.from(parsed.ciphertext ?? "", "base64")), decipher.final()]);
}

function rsaKeyPair(): { publicPem: string; privatePem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
  return { publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(), privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
}

/**
 * The workspace KEK's public half; creating it once needs an unlocked vault (or AMC_VAULT_PASSPHRASE). Created under
 * a lock so two first projects in two processes cannot leave the vault holding one KEK and kek.pub naming another.
 */
export function ensureA4Kek(workspace: string): string {
  const path = kekPublicPath(workspace);
  if (pathExists(path)) return readFileSync(path, "utf8");
  return withControlFileLock({ root: a4ProjectsRoot(workspace), name: "a4-kek", operation: () => {
    if (pathExists(path)) return readFileSync(path, "utf8");
    try {
      if (!vaultStatus(workspace).unlocked) unlockVault(workspace);
      const pair = rsaKeyPair();
      setVaultSecret(workspace, KEK_SECRET, pair.privatePem);
      writeFileAtomic(path, pair.publicPem, 0o644);
      return pair.publicPem;
    } catch (error) {
      throw new A4BlobError("VAULT_LOCKED", `the A4 key-encryption key is created once with an unlocked vault (${error instanceof Error ? error.message : String(error)})`);
    }
  } });
}

/** The project's public key, created on first use from the KEK's public half alone (encrypt-only: no vault needed). */
function projectPublicKey(workspace: string, projectId: string): string {
  const dir = privateDir(workspace, projectId);
  const publicPath = join(dir, "key.pub");
  if (pathExists(publicPath)) return readFileSync(publicPath, "utf8");
  // Locked like the KEK: two first writers must not leave key.enc and key.pub from two different pairs.
  return withControlFileLock({ root: a4ProjectsRoot(workspace), name: `key-${projectId}`, operation: () => {
    if (pathExists(publicPath)) return readFileSync(publicPath, "utf8");
    if (!pathExists(kekPublicPath(workspace))) throw new A4BlobError("A4_KEK_MISSING", "no A4 key-encryption key exists in this workspace yet");
    const pair = rsaKeyPair();
    ensureDir(dir);
    writeFileAtomic(join(dir, "key.enc"), sealTo(readFileSync(kekPublicPath(workspace), "utf8"), Buffer.from(pair.privatePem, "utf8")), 0o600);
    writeFileAtomic(publicPath, pair.publicPem, 0o644);
    return pair.publicPem;
  } });
}

/** Encrypts `bytes` for the project; refuses on any HIGH release secret-scan hit in the plaintext. Touches no ledger row. */
export function putPrivate(workspace: string, projectId: string, bytes: Buffer): { bodySha256: string; blobRef: string } {
  const hits = highSeveritySecretTypes(bytes.toString("utf8"));
  if (hits.length > 0) throw new A4BlobError("SECRET_SCAN_REFUSED", `the text matches ${hits.join(", ")}; remove the secret and retry`);
  const plaintext = Buffer.concat([randomBytes(SALT_BYTES), bytes]);
  const sealed = sealTo(projectPublicKey(workspace, projectId), plaintext);
  const blobRef = sha256Hex(sealed);
  writeFileAtomic(join(privateDir(workspace, projectId), `${blobRef}.enc`), sealed, 0o600);
  return { bodySha256: sha256Hex(plaintext), blobRef };
}

/** Decrypts one blob through the vault; checks the file against `blobRef` and, when given, the body against `bodySha256`. */
export function getPrivate(workspace: string, projectId: string, blobRef: string, bodySha256?: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(blobRef)) throw new A4BlobError("BLOB_MISSING", "invalid blob reference");
  const dir = privateDir(workspace, projectId);
  const path = join(dir, `${blobRef}.enc`);
  if (!pathExists(path)) throw new A4BlobError("BLOB_MISSING", `blob ${blobRef} is not in this workspace`);
  const sealed = readFileSync(path);
  if (sha256Hex(sealed) !== blobRef) throw new A4BlobError("BLOB_INTEGRITY", `blob ${blobRef} does not match its name`);
  if (!pathExists(join(dir, "key.enc"))) throw new A4BlobError("PROJECT_KEY_DESTROYED", `project ${projectId}'s key was destroyed`);
  let kek: string | null;
  try {
    kek = getVaultSecretReadOnly(workspace, KEK_SECRET);
  } catch {
    throw new A4BlobError("VAULT_LOCKED", "unlock the vault to read this");
  }
  if (kek === null) throw new A4BlobError("A4_KEK_MISSING", "the vault holds no A4 key-encryption key");
  let plaintext: Buffer;
  try {
    plaintext = openWith(openWith(kek, readFileSync(join(dir, "key.enc"))).toString("utf8"), sealed);
  } catch {
    throw new A4BlobError("BLOB_INTEGRITY", `blob ${blobRef} did not decrypt`);
  }
  if (bodySha256 !== undefined && sha256Hex(plaintext) !== bodySha256) throw new A4BlobError("BLOB_INTEGRITY", `blob ${blobRef} does not match its recorded hash`);
  return plaintext.subarray(SALT_BYTES);
}

/** Erasure (P2-36 calls it as an owner action): without key.enc no blob of the project decrypts again. */
export function destroyProjectKey(workspace: string, projectId: string): void {
  const dir = privateDir(workspace, projectId);
  rmSync(join(dir, "key.enc"), { force: true });
  rmSync(join(dir, "key.pub"), { force: true });
}
