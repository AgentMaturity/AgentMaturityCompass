import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";

export interface VaultKdfParams {
  name: "pbkdf2-sha256";
  iterations: number;
  keyLen: number;
  digest: "sha256";
  saltB64: string;
}

export interface VaultEnvelope {
  v: 1;
  kdf: VaultKdfParams;
  cipher: {
    name: "aes-256-gcm";
    ivB64: string;
    authTagB64: string;
    ciphertextB64: string;
  };
}

/** The count every vault used until 2026-11-16; an older vault opens with it and is not rewritten just for being older. */
export const LEGACY_VAULT_ITERATIONS = 210_000;
/** New vaults (OWASP Password Storage Cheat Sheet: PBKDF2-HMAC-SHA256, 600,000 iterations). */
export const VAULT_ITERATIONS = 600_000;
/** Above this a vault header would stall the machine for minutes on every unlock: refused as a denial of service. */
const MAX_VAULT_ITERATIONS = 10_000_000;

/**
 * The header's key-derivation settings, checked before any work is done. A count below the legacy one (a downgrade) or
 * absurdly high (a stall), or any setting AMC never writes, is refused with a plain message. A header with no count is
 * an old vault: it opens with the legacy count.
 */
function checkedVaultKdf(kdf: unknown): VaultKdfParams {
  const header = (kdf ?? {}) as Partial<VaultKdfParams>;
  const iterations = header.iterations ?? LEGACY_VAULT_ITERATIONS;
  if (header.name !== "pbkdf2-sha256" || header.digest !== "sha256" || header.keyLen !== 32 || typeof header.saltB64 !== "string") {
    throw new Error("The vault file uses key-derivation settings AMC does not write. It may have been changed: restore it from a backup.");
  }
  if (!Number.isSafeInteger(iterations) || iterations < LEGACY_VAULT_ITERATIONS || iterations > MAX_VAULT_ITERATIONS) {
    throw new Error(`The vault file asks for ${String(iterations)} key-derivation rounds. AMC accepts ${LEGACY_VAULT_ITERATIONS.toLocaleString("en-US")} to `
      + `${MAX_VAULT_ITERATIONS.toLocaleString("en-US")}: fewer would weaken the vault and more could stall this computer. The file may have been changed: restore it from a backup.`);
  }
  return { name: "pbkdf2-sha256", iterations, keyLen: 32, digest: "sha256", saltB64: header.saltB64 };
}

/** The checked iteration count stored in an envelope's header (raw JSON text). */
export function storedVaultIterations(raw: string | Buffer): number {
  return checkedVaultKdf((JSON.parse(raw.toString()) as Partial<VaultEnvelope>).kdf).iterations;
}

function deriveKey(passphrase: string, params: VaultKdfParams): Buffer {
  return pbkdf2Sync(
    Buffer.from(passphrase, "utf8"),
    Buffer.from(params.saltB64, "base64"),
    params.iterations,
    params.keyLen,
    params.digest
  );
}

/** `iterations`: VAULT_ITERATIONS for a new envelope; a rewrite of an existing vault passes the count it already has. */
export function encryptVaultPayload(payload: Buffer, passphrase: string, iterations: number = VAULT_ITERATIONS): VaultEnvelope {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const kdf: VaultKdfParams = {
    name: "pbkdf2-sha256",
    iterations: checkedVaultKdf({ name: "pbkdf2-sha256", digest: "sha256", keyLen: 32, saltB64: "", iterations }).iterations,
    keyLen: 32,
    digest: "sha256",
    saltB64: salt.toString("base64")
  };
  const key = deriveKey(passphrase, kdf);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    v: 1,
    kdf,
    cipher: {
      name: "aes-256-gcm",
      ivB64: iv.toString("base64"),
      authTagB64: authTag.toString("base64"),
      ciphertextB64: encrypted.toString("base64")
    }
  };
}

export function decryptVaultPayload(envelope: VaultEnvelope, passphrase: string): Buffer {
  if (envelope.v !== 1) {
    throw new Error(`Unsupported vault version: ${String((envelope as { v?: unknown }).v)}`);
  }
  const key = deriveKey(passphrase, checkedVaultKdf(envelope.kdf));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(envelope.cipher.ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(envelope.cipher.authTagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.cipher.ciphertextB64, "base64")),
    decipher.final()
  ]);
}

/**
 * LIVE-VAULT-19: an envelope (the vault, a child vault or a recovery copy) re-sealed under `next` with the same plaintext,
 * or null when `current` does not open it.
 */
export function resealVaultEnvelope(raw: string | Buffer, current: string, next: string): string | null {
  let plaintext: Buffer;
  try { plaintext = decryptVaultPayload(JSON.parse(raw.toString()) as VaultEnvelope, current); } catch { return null; } // "does not open" is the answer
  return JSON.stringify(encryptVaultPayload(plaintext, next), null, 2);
}
