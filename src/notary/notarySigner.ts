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
import type { NotaryAttestationBasis, NotaryAttestationLevel, NotarySignResponse } from "./notaryApiTypes.js";
import { verifyCanonical } from "../keys/algorithmPolicy.js";
import { callProviderSync } from "../keys/providerBridge.js";
import { checkedDescription, KeyProviderError } from "../keys/provider.js";

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

type NotaryBackendType = NotaryBackendConfig["type"];

export interface NotarySignResult {
  signatureB64: string;
  pubkeyPem: string;
  pubkeyFingerprint: string;
  claims: Record<string, unknown>;
  backend: NotaryBackendType;
  attestationLevel: NotaryAttestationLevel;
  /** P2-08: where attestationLevel comes from; an external signer's level is only what it reports. */
  attestationBasis: NotaryAttestationBasis;
  signedTs: number;
}

/** The `/sign` answer and the `amc notary sign` output for one signature. */
export function notarySignResponse(kind: string, payloadSha256: string, signed: NotarySignResult): NotarySignResponse {
  return {
    v: 1, kind, payloadSha256, signatureB64: signed.signatureB64, pubkeyPem: signed.pubkeyPem, pubkeyFingerprint: signed.pubkeyFingerprint,
    signedTs: signed.signedTs, backend: signed.backend, attestationLevel: signed.attestationLevel, attestationBasis: signed.attestationBasis, claims: signed.claims
  };
}

export interface NotarySigner {
  sign: (kind: string, payload: Buffer) => NotarySignResult;
  pubkeyPem: () => string;
  pubkeyFingerprint: () => string;
  attestationLevel: () => NotaryAttestationLevel;
  attestationBasis: () => NotaryAttestationBasis;
  backendType: () => NotaryBackendType;
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
        attestationBasis: "configured",
        signedTs: Date.now()
      };
    },
    pubkeyPem: () => publicKey.export({ format: "pem", type: "spki" }).toString(),
    pubkeyFingerprint: () => fingerprint,
    attestationLevel: () => "SOFTWARE",
    attestationBasis: () => "configured",
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
        attestationBasis: "provider-reported",
        signedTs: Date.now()
      };
    },
    pubkeyPem: () => probe.pubkeyPem,
    pubkeyFingerprint: () => probe.pubkeyFingerprint,
    attestationLevel: () => level,
    attestationBasis: () => "provider-reported",
    backendType: () => "EXTERNAL_SIGNER",
    claims: () => probe.claims
  };
}

/**
 * P2-08: a key held by a key provider, reached synchronously through the provider bridge (one child process per call).
 * The level is HARDWARE only when the provider's description says "hsm", with its basis (provider metadata, or the
 * operator's configuration for PKCS#11); nothing a signer claims about itself counts. Notary signatures end up in
 * Ed25519-only artifact envelopes, so an ECDSA key is refused here until those envelopes accept it.
 */
function loadKeyProviderSigner(backend: Extract<NotaryBackendConfig, { type: "KEY_PROVIDER" }>, bridge: typeof callProviderSync): NotarySigner {
  const description = checkedDescription(bridge({ op: "describe", ref: backend.ref }).description, { allowed: ["ed25519"], requireNonExportable: true });
  const level: NotaryAttestationLevel = description.protection === "hsm" ? "HARDWARE" : "SOFTWARE";
  const basis: NotaryAttestationBasis = description.protectionBasis;
  const fingerprint = sha256Hex(Buffer.from(description.publicKeyPem, "utf8"));
  const claims = () => ({ hardware: level === "HARDWARE", provider: backend.ref.provider, protection: description.protection, protectionBasis: basis });
  return {
    sign: (_kind, payload) => {
      const signatureB64 = bridge({ op: "sign", ref: backend.ref, messageB64: payload.toString("base64") }).signatureB64 ?? "";
      if (!verifyCanonical(description.algorithm, payload, description.publicKeyPem, Buffer.from(signatureB64, "base64"))) {
        throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", backend.ref.provider, "the provider's signature does not verify under the notary key");
      }
      return { signatureB64, pubkeyPem: description.publicKeyPem, pubkeyFingerprint: fingerprint, claims: claims(), backend: "KEY_PROVIDER", attestationLevel: level, attestationBasis: basis, signedTs: Date.now() };
    },
    pubkeyPem: () => description.publicKeyPem,
    pubkeyFingerprint: () => fingerprint,
    attestationLevel: () => level,
    attestationBasis: () => basis,
    backendType: () => "KEY_PROVIDER",
    claims
  };
}

export function loadNotarySigner(params: {
  notaryDir: string;
  backend: NotaryBackendConfig;
  /** KEY_PROVIDER only: replaces the provider bridge child process (tests). */
  bridge?: typeof callProviderSync;
}): NotarySigner {
  if (params.backend.type === "FILE_SEALED") {
    return loadFileSealedSigner({
      notaryDir: params.notaryDir,
      backend: params.backend
    });
  }
  if (params.backend.type === "KEY_PROVIDER") return loadKeyProviderSigner(params.backend, params.bridge ?? callProviderSync);
  return loadExternalSigner(params.backend);
}
