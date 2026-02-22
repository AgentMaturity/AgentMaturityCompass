import { generateKeyPairSync, sign, verify } from "node:crypto";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { decryptVaultPayload, encryptVaultPayload, type VaultEnvelope } from "../vault/vaultCrypto.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

const payloadSchema = z.object({
  v: z.literal(1),
  createdTs: z.number().int(),
  auditorPrivateKeyPem: z.string().min(1),
  sessionPrivateKeyPem: z.string().min(1),
  secrets: z.record(z.string()).default({})
});

type HostVaultPayload = z.infer<typeof payloadSchema>;

interface HostVaultSession {
  unlocked: boolean;
  payload: HostVaultPayload | null;
  passphrase: string | null;
  lastUnlockedTs: number | null;
}

const sessions = new Map<string, HostVaultSession>();
const UNSAFE_SECRET_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function assertSafeSecretKey(key: string): void {
  if (!key || key.trim().length === 0) {
    throw new Error("Host vault secret key is required.");
  }
  if (UNSAFE_SECRET_KEYS.has(key)) {
    throw new Error(`Unsafe host vault secret key: ${key}`);
  }
}

function toSafeSecretMap(input: Record<string, string>): Record<string, string> {
  const out = Object.create(null) as Record<string, string>;
  for (const [key, value] of Object.entries(input)) {
    if (UNSAFE_SECRET_KEYS.has(key)) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function sessionFor(hostDir: string): HostVaultSession {
  const existing = sessions.get(hostDir);
  if (existing) {
    return existing;
  }
  const created: HostVaultSession = {
    unlocked: false,
    payload: null,
    passphrase: null,
    lastUnlockedTs: null
  };
  sessions.set(hostDir, created);
  return created;
}

function defaultPassphrase(): string {
  if (process.env.AMC_HOST_VAULT_PASSPHRASE && process.env.AMC_HOST_VAULT_PASSPHRASE.length > 0) {
    return process.env.AMC_HOST_VAULT_PASSPHRASE;
  }
  if (process.env.AMC_VAULT_PASSPHRASE && process.env.AMC_VAULT_PASSPHRASE.length > 0) {
    return process.env.AMC_VAULT_PASSPHRASE;
  }
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true" || process.env.VITEST === "1") {
    return "amc-host-vault-test-passphrase";
  }
  return "";
}

export function hostVaultPaths(hostDir: string): {
  dir: string;
  vaultFile: string;
  metaFile: string;
  auditorPub: string;
  sessionPub: string;
} {
  const dir = join(hostDir, "host-vault");
  return {
    dir,
    vaultFile: join(dir, "vault.amcvault"),
    metaFile: join(dir, "vault.amcvault.meta.json"),
    auditorPub: join(dir, "auditor_ed25519.pub"),
    sessionPub: join(dir, "session_ed25519.pub")
  };
}

function readEnvelope(hostDir: string): VaultEnvelope {
  const paths = hostVaultPaths(hostDir);
  if (!pathExists(paths.vaultFile)) {
    throw new Error(`Host vault file not found: ${paths.vaultFile}`);
  }
  return JSON.parse(readUtf8(paths.vaultFile)) as VaultEnvelope;
}

function readPayload(hostDir: string, passphrase: string): HostVaultPayload {
  const envelope = readEnvelope(hostDir);
  const decrypted = decryptVaultPayload(envelope, passphrase).toString("utf8");
  const parsed = payloadSchema.parse(JSON.parse(decrypted) as unknown);
  return {
    ...parsed,
    secrets: toSafeSecretMap(parsed.secrets)
  };
}

function writePayload(hostDir: string, payload: HostVaultPayload, passphrase: string, auditorPub: string, sessionPub: string): void {
  const paths = hostVaultPaths(hostDir);
  ensureDir(paths.dir);
  const encrypted = encryptVaultPayload(Buffer.from(JSON.stringify(payload), "utf8"), passphrase);
  writeFileAtomic(paths.vaultFile, JSON.stringify(encrypted, null, 2), 0o600);
  try {
    chmodSync(paths.vaultFile, 0o600);
  } catch {
    // ignore chmod errors on unsupported filesystems
  }
  writeFileAtomic(paths.auditorPub, auditorPub, 0o644);
  writeFileAtomic(paths.sessionPub, sessionPub, 0o644);
  writeFileAtomic(
    paths.metaFile,
    JSON.stringify(
      {
        createdAt: new Date(payload.createdTs).toISOString(),
        auditorFingerprint: sha256Hex(Buffer.from(auditorPub, "utf8")),
        sessionFingerprint: sha256Hex(Buffer.from(sessionPub, "utf8"))
      },
      null,
      2
    ),
    0o644
  );
}

export function hostVaultExists(hostDir: string): boolean {
  return pathExists(hostVaultPaths(hostDir).vaultFile);
}

export function initHostVault(hostDir: string, passphrase?: string): {
  vaultFile: string;
  metaFile: string;
  auditorFingerprint: string;
  sessionFingerprint: string;
} {
  const phrase = passphrase ?? defaultPassphrase();
  if (!phrase || phrase.length < 8) {
    throw new Error("Host vault passphrase must be at least 8 characters.");
  }
  const auditorPair = generateKeyPairSync("ed25519");
  const sessionPair = generateKeyPairSync("ed25519");
  const auditorPrivateKeyPem = auditorPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const auditorPublicKeyPem = auditorPair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const sessionPrivateKeyPem = sessionPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const sessionPublicKeyPem = sessionPair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const payload: HostVaultPayload = {
    v: 1,
    createdTs: Date.now(),
    auditorPrivateKeyPem,
    sessionPrivateKeyPem,
    secrets: Object.create(null) as Record<string, string>
  };
  writePayload(hostDir, payload, phrase, auditorPublicKeyPem, sessionPublicKeyPem);
  unlockHostVault(hostDir, phrase);
  return {
    vaultFile: hostVaultPaths(hostDir).vaultFile,
    metaFile: hostVaultPaths(hostDir).metaFile,
    auditorFingerprint: sha256Hex(Buffer.from(auditorPublicKeyPem, "utf8")),
    sessionFingerprint: sha256Hex(Buffer.from(sessionPublicKeyPem, "utf8"))
  };
}

export function unlockHostVault(hostDir: string, passphrase?: string): void {
  const phrase = passphrase ?? defaultPassphrase();
  if (!phrase || phrase.length === 0) {
    throw new Error("Host vault passphrase is required.");
  }
  const payload = readPayload(hostDir, phrase);
  const session = sessionFor(hostDir);
  session.unlocked = true;
  session.payload = payload;
  session.passphrase = phrase;
  session.lastUnlockedTs = Date.now();
}

export function lockHostVault(hostDir: string): void {
  const session = sessionFor(hostDir);
  session.unlocked = false;
  session.payload = null;
  session.passphrase = null;
}

export function hostVaultStatus(hostDir: string): {
  exists: boolean;
  unlocked: boolean;
  lastUnlockedTs: number | null;
  vaultFile: string;
  metaFile: string;
} {
  const paths = hostVaultPaths(hostDir);
  const session = sessionFor(hostDir);
  return {
    exists: hostVaultExists(hostDir),
    unlocked: session.unlocked,
    lastUnlockedTs: session.lastUnlockedTs,
    vaultFile: paths.vaultFile,
    metaFile: paths.metaFile
  };
}

function unlockedPayload(hostDir: string): HostVaultPayload {
  const session = sessionFor(hostDir);
  if (!session.unlocked || !session.payload) {
    const phrase = defaultPassphrase();
    if (phrase && hostVaultExists(hostDir)) {
      try {
        unlockHostVault(hostDir, phrase);
      } catch {
        // keep locked
      }
    }
  }
  const refreshed = sessionFor(hostDir);
  if (!refreshed.unlocked || !refreshed.payload) {
    throw new Error("Host vault is locked.");
  }
  return refreshed.payload;
}

function persistCurrentPayload(hostDir: string): void {
  const session = sessionFor(hostDir);
  if (!session.unlocked || !session.payload || !session.passphrase) {
    throw new Error("Host vault is locked.");
  }
  const paths = hostVaultPaths(hostDir);
  const auditorPub = readUtf8(paths.auditorPub);
  const sessionPub = readUtf8(paths.sessionPub);
  writePayload(hostDir, session.payload, session.passphrase, auditorPub, sessionPub);
}

export function setHostVaultSecret(hostDir: string, key: string, value: string): void {
  assertSafeSecretKey(key);
  const payload = unlockedPayload(hostDir);
  payload.secrets[key] = value;
  persistCurrentPayload(hostDir);
}

export function getHostVaultSecret(hostDir: string, key: string): string | null {
  assertSafeSecretKey(key);
  const payload = unlockedPayload(hostDir);
  return Object.prototype.hasOwnProperty.call(payload.secrets, key) ? payload.secrets[key]! : null;
}

export function listHostVaultSecrets(hostDir: string): string[] {
  const payload = unlockedPayload(hostDir);
  return Object.keys(payload.secrets).sort((a, b) => a.localeCompare(b));
}

export function deleteHostVaultSecret(hostDir: string, key: string): void {
  assertSafeSecretKey(key);
  const payload = unlockedPayload(hostDir);
  delete payload.secrets[key];
  persistCurrentPayload(hostDir);
}

function privateKeyPem(hostDir: string, kind: "auditor" | "session"): string {
  const payload = unlockedPayload(hostDir);
  return kind === "auditor" ? payload.auditorPrivateKeyPem : payload.sessionPrivateKeyPem;
}

export function hostVaultPublicKeyPem(hostDir: string, kind: "auditor" | "session"): string {
  const paths = hostVaultPaths(hostDir);
  return readUtf8(kind === "auditor" ? paths.auditorPub : paths.sessionPub);
}

function toBase64Url(value: Buffer): string {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${pad}`, "base64");
}

export function signHostPayload(hostDir: string, kind: "auditor" | "session", payloadBytes: Buffer): string {
  const signature = sign(null, payloadBytes, privateKeyPem(hostDir, kind));
  return toBase64Url(signature);
}

export function verifyHostPayload(hostDir: string, kind: "auditor" | "session", payloadBytes: Buffer, signatureB64Url: string): boolean {
  try {
    return verify(null, payloadBytes, hostVaultPublicKeyPem(hostDir, kind), fromBase64Url(signatureB64Url));
  } catch {
    return false;
  }
}

export function signHostCanonicalJson(hostDir: string, kind: "auditor" | "session", payload: unknown): {
  digestSha256: string;
  signature: string;
} {
  const bytes = Buffer.from(canonicalize(payload), "utf8");
  return {
    digestSha256: sha256Hex(bytes),
    signature: signHostPayload(hostDir, kind, bytes)
  };
}
