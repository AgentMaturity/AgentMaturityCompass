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

function deriveKey(passphrase: string, params: VaultKdfParams): Buffer {
  return pbkdf2Sync(
    Buffer.from(passphrase, "utf8"),
    Buffer.from(params.saltB64, "base64"),
    params.iterations,
    params.keyLen,
    params.digest
  );
}

export function encryptVaultPayload(payload: Buffer, passphrase: string): VaultEnvelope {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const kdf: VaultKdfParams = {
    name: "pbkdf2-sha256",
    iterations: 210_000,
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
  const key = deriveKey(passphrase, envelope.kdf);
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
