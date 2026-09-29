import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  scryptSync,
  sign
} from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import {
  notaryPublicKeyPath,
  notarySealedKeyPath
} from "./notaryConfigStore.js";
import type { NotaryBackendConfig } from "./notaryConfigSchema.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { runExternalSigner } from "./notaryExternalSigner.js";
import type { NotaryAttestationLevel } from "./notaryApiTypes.js";

const sealedKeySchema = z.object({
  v: z.literal(1),
  alg: z.literal("AES-256-GCM"),
  kdf: z.object({
    name: z.literal("scrypt"),
    N: z.number().int(),
    r: z.number().int(),
    p: z.number().int(),
    saltB64: z.string().min(1)
  }),
  cipher: z.object({
    nonceB64: z.string().min(1),
    authTagB64: z.string().min(1),
    ciphertextB64: z.string().min(1)
  })
});

function passphraseFromEnv(): string | null {
  const fromFile = process.env.AMC_NOTARY_PASSPHRASE_FILE;
  if (fromFile && fromFile.trim().length > 0 && pathExists(fromFile.trim())) {
    const value = readFileSync(fromFile.trim(), "utf8").trim();
    if (value.length > 0) {
      return value;
    }
  }
  const direct = process.env.AMC_NOTARY_PASSPHRASE;
  if (direct && direct.trim().length > 0) {
    return direct.trim();
  }
  return null;
}

function encryptPrivateKeyPem(privateKeyPem: string, passphrase: string): z.infer<typeof sealedKeySchema> {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const N = 1 << 15;
  const r = 8;
  const p = 1;
  const key = scryptSync(passphrase, salt, 32, {
    N,
    r,
    p,
    maxmem: 128 * 1024 * 1024
  });
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(privateKeyPem, "utf8")), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return sealedKeySchema.parse({
    v: 1,
    alg: "AES-256-GCM",
    kdf: {
      name: "scrypt",
      N,
      r,
      p,
      saltB64: salt.toString("base64")
    },
    cipher: {
      nonceB64: nonce.toString("base64"),
      authTagB64: authTag.toString("base64"),
      ciphertextB64: ciphertext.toString("base64")
    }
  });
}

function decryptPrivateKeyPem(envelopeRaw: string, passphrase: string): string {
  const envelope = sealedKeySchema.parse(JSON.parse(envelopeRaw) as unknown);
  const salt = Buffer.from(envelope.kdf.saltB64, "base64");
  const nonce = Buffer.from(envelope.cipher.nonceB64, "base64");
  const key = scryptSync(passphrase, salt, 32, {
    N: envelope.kdf.N,
    r: envelope.kdf.r,
    p: envelope.kdf.p,
    maxmem: 128 * 1024 * 1024
  });
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(Buffer.from(envelope.cipher.authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.cipher.ciphertextB64, "base64")),
    decipher.final()
  ]);
  return plaintext.toString("utf8");
}

export interface NotarySignResult {
  signatureB64: string;
  pubkeyPem: string;
  pubkeyFingerprint: string;
  claims: Record<string, unknown>;
  backend: "FILE_SEALED" | "EXTERNAL_SIGNER";
  attestationLevel: NotaryAttestationLevel;
  signedTs: number;
}

export interface NotarySigner {
  sign: (kind: string, payload: Buffer) => NotarySignResult;
  pubkeyPem: () => string;
  pubkeyFingerprint: () => string;
  attestationLevel: () => NotaryAttestationLevel;
  backendType: () => "FILE_SEALED" | "EXTERNAL_SIGNER";
  claims: () => Record<string, unknown>;
}

export function initFileSealedNotaryKey(params: {
  notaryDir: string;
  passphrase?: string;
}): {
  keyPath: string;
  publicKeyPath: string;
  pubkeyPem: string;
  pubkeyFingerprint: string;
} {
  const passphrase = params.passphrase ?? passphraseFromEnv();
  if (!passphrase || passphrase.length < 8) {
    throw new Error("Notary key init requires passphrase (AMC_NOTARY_PASSPHRASE_FILE or AMC_NOTARY_PASSPHRASE, min 8 chars).");
  }
  const keyPair = generateKeyPairSync("ed25519");
  const privateKeyPem = keyPair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicKeyPem = keyPair.publicKey.export({ format: "pem", type: "spki" }).toString();
  const keyPath = notarySealedKeyPath(params.notaryDir);
  const pubPath = notaryPublicKeyPath(params.notaryDir);
  ensureDir(dirname(keyPath));
  ensureDir(dirname(pubPath));
  writeFileAtomic(keyPath, JSON.stringify(encryptPrivateKeyPem(privateKeyPem, passphrase), null, 2), 0o600);
  writeFileAtomic(pubPath, publicKeyPem, 0o644);
  return {
    keyPath,
    publicKeyPath: pubPath,
    pubkeyPem: publicKeyPem,
    pubkeyFingerprint: sha256Hex(Buffer.from(publicKeyPem, "utf8"))
  };
}

function loadFileSealedSigner(params: {
  notaryDir: string;
  backend: Extract<NotaryBackendConfig, { type: "FILE_SEALED" }>;
}): NotarySigner {
  const keyPath = notarySealedKeyPath(params.notaryDir);
  const pubPath = notaryPublicKeyPath(params.notaryDir);
  if (!pathExists(keyPath) || !pathExists(pubPath)) {
    throw new Error("Notary key files missing. Run `amc notary init` first.");
  }
  const passphrase = passphraseFromEnv();
  if (!passphrase) {
    throw new Error("Notary passphrase required (AMC_NOTARY_PASSPHRASE_FILE or AMC_NOTARY_PASSPHRASE).");
  }
  const privateKeyPem = decryptPrivateKeyPem(readFileSync(keyPath, "utf8"), passphrase);
  const publicKeyPem = readFileSync(pubPath, "utf8");
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(publicKeyPem);
  const fingerprint = sha256Hex(Buffer.from(publicKeyPem, "utf8"));
  return {
    sign: (_kind, payload) => {
      const signature = sign(null, payload, privateKey).toString("base64");
      return {
        signatureB64: signature,
        pubkeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
        pubkeyFingerprint: fingerprint,
        claims: {
          hardware: false,
          device: "SOFTWARE",
          vendor: "AMC",
          model: "FILE_SEALED"
        },
        backend: "FILE_SEALED",
        attestationLevel: "SOFTWARE",
        signedTs: Date.now()
      };
    },
    pubkeyPem: () => publicKey.export({ format: "pem", type: "spki" }).toString(),
    pubkeyFingerprint: () => fingerprint,
    attestationLevel: () => "SOFTWARE",
    backendType: () => "FILE_SEALED",
    claims: () => ({
      hardware: false,
      device: "SOFTWARE",
      vendor: "AMC",
      model: "FILE_SEALED"
    })
  };
}

function loadExternalSigner(backend: Extract<NotaryBackendConfig, { type: "EXTERNAL_SIGNER" }>): NotarySigner {
  const probe = runExternalSigner({
    command: backend.command,
    args: backend.args,
    kind: "NOTARY_PROBE",
    payload: Buffer.from("amc-notary-probe", "utf8")
  });
  const level: NotaryAttestationLevel = probe.claims.hardware === true ? "HARDWARE" : "SOFTWARE";
  return {
    sign: (kind, payload) => {
      const out = runExternalSigner({
        command: backend.command,
        args: backend.args,
        kind,
        payload
      });
      return {
        signatureB64: out.signatureB64,
        pubkeyPem: out.pubkeyPem,
        pubkeyFingerprint: out.pubkeyFingerprint,
        claims: out.claims,
        backend: "EXTERNAL_SIGNER",
        attestationLevel: out.claims.hardware === true ? "HARDWARE" : "SOFTWARE",
        signedTs: Date.now()
      };
    },
    pubkeyPem: () => probe.pubkeyPem,
    pubkeyFingerprint: () => probe.pubkeyFingerprint,
    attestationLevel: () => level,
    backendType: () => "EXTERNAL_SIGNER",
    claims: () => probe.claims
  };
}

export function loadNotarySigner(params: {
  notaryDir: string;
  backend: NotaryBackendConfig;
}): NotarySigner {
  if (params.backend.type === "FILE_SEALED") {
    return loadFileSealedSigner({
      notaryDir: params.notaryDir,
      backend: params.backend
    });
  }
  return loadExternalSigner(params.backend);
}
