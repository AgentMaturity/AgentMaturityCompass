import { generateKeyPairSync } from "node:crypto";
import { chmodSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, pathExists, writeFileAtomic, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { decryptVaultPayload, encryptVaultPayload, type VaultEnvelope } from "./vaultCrypto.js";

export type VaultKeyKind = "monitor" | "auditor" | "lease" | "session";

interface VaultPayload {
  v: 1;
  createdTs: number;
  monitorPrivateKeyPem: string;
  auditorPrivateKeyPem: string;
  leasePrivateKeyPem: string;
  sessionPrivateKeyPem: string;
  secrets: Record<string, string>;
}

interface VaultSession {
  unlocked: boolean;
  payload: VaultPayload | null;
  lastUnlockedTs: number | null;
  passphrase: string | null;
}

const sessions = new Map<string, VaultSession>();
const UNSAFE_SECRET_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function assertSafeSecretKey(secretKey: string): void {
  if (!secretKey || secretKey.trim().length === 0) {
    throw new Error("Secret key is required.");
  }
  if (UNSAFE_SECRET_KEYS.has(secretKey)) {
    throw new Error(`Unsafe secret key: ${secretKey}`);
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

export function vaultPaths(workspace: string): {
  vaultFile: string;
  metaFile: string;
  keysDir: string;
  monitorPublic: string;
  auditorPublic: string;
  leasePublic: string;
  sessionPublic: string;
  monitorHistory: string;
  auditorHistory: string;
  leaseHistory: string;
  sessionHistory: string;
  legacyMonitorPrivate: string;
  legacyAuditorPrivate: string;
} {
  const amcDir = join(workspace, ".amc");
  const keysDir = join(amcDir, "keys");
  return {
    vaultFile: join(amcDir, "vault.amcvault"),
    metaFile: join(amcDir, "vault.amcvault.meta.json"),
    keysDir,
    monitorPublic: join(keysDir, "monitor_ed25519.pub"),
    auditorPublic: join(keysDir, "auditor_ed25519.pub"),
    leasePublic: join(keysDir, "lease_ed25519.pub"),
    sessionPublic: join(keysDir, "session_ed25519.pub"),
    monitorHistory: join(keysDir, "monitor_history.json"),
    auditorHistory: join(keysDir, "auditor_history.json"),
    leaseHistory: join(keysDir, "lease_history.json"),
    sessionHistory: join(keysDir, "session_history.json"),
    legacyMonitorPrivate: join(keysDir, "monitor_ed25519"),
    legacyAuditorPrivate: join(keysDir, "auditor_ed25519")
  };
}

function defaultPassphrase(): string {
  if (process.env.AMC_VAULT_PASSPHRASE && process.env.AMC_VAULT_PASSPHRASE.length > 0) {
    return process.env.AMC_VAULT_PASSPHRASE;
  }
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true" || process.env.VITEST === "1") {
    return "amc-test-passphrase";
  }
  return "amc-local-default-passphrase";
}

function parseVaultPayload(raw: string): VaultPayload {
  const parsed = JSON.parse(raw) as Partial<VaultPayload>;
  if (parsed.v !== 1 || typeof parsed.monitorPrivateKeyPem !== "string" || typeof parsed.auditorPrivateKeyPem !== "string") {
    throw new Error("Invalid vault payload format");
  }
  return {
    v: 1,
    createdTs: typeof parsed.createdTs === "number" ? parsed.createdTs : Date.now(),
    monitorPrivateKeyPem: parsed.monitorPrivateKeyPem,
    auditorPrivateKeyPem: parsed.auditorPrivateKeyPem,
    leasePrivateKeyPem: typeof parsed.leasePrivateKeyPem === "string" ? parsed.leasePrivateKeyPem : "",
    sessionPrivateKeyPem: typeof parsed.sessionPrivateKeyPem === "string" ? parsed.sessionPrivateKeyPem : "",
    secrets: typeof parsed.secrets === "object" && parsed.secrets !== null
      ? toSafeSecretMap(parsed.secrets as Record<string, string>)
      : (Object.create(null) as Record<string, string>)
  };
}

function readEnvelope(workspace: string): VaultEnvelope {
  const paths = vaultPaths(workspace);
  if (!pathExists(paths.vaultFile)) {
    throw new Error(`Vault file not found: ${paths.vaultFile}`);
  }
  return JSON.parse(readUtf8(paths.vaultFile)) as VaultEnvelope;
}

function writePublicAndHistory(file: string, historyFile: string, publicPem: string): void {
  writeFileAtomic(file, publicPem, 0o644);
  const existing = pathExists(historyFile)
    ? (JSON.parse(readUtf8(historyFile)) as Array<{ createdTs: number; fingerprint: string; publicKeyPem: string }>)
    : [];
  const fingerprint = sha256Hex(Buffer.from(publicPem, "utf8"));
  if (!existing.some((row) => row.fingerprint === fingerprint)) {
    existing.push({
      createdTs: Date.now(),
      fingerprint,
      publicKeyPem: publicPem
    });
  }
  writeFileAtomic(historyFile, JSON.stringify(existing, null, 2), 0o644);
}

function ensurePublicKeys(paths: ReturnType<typeof vaultPaths>, monitorPub: string, auditorPub: string, leasePub: string, sessionPub: string): void {
  ensureDir(paths.keysDir);
  writePublicAndHistory(paths.monitorPublic, paths.monitorHistory, monitorPub);
  writePublicAndHistory(paths.auditorPublic, paths.auditorHistory, auditorPub);
  writePublicAndHistory(paths.leasePublic, paths.leaseHistory, leasePub);
  writePublicAndHistory(paths.sessionPublic, paths.sessionHistory, sessionPub);
}

function sessionFor(workspace: string): VaultSession {
  const current = sessions.get(workspace);
  if (current) {
    return current;
  }
  const created: VaultSession = {
    unlocked: false,
    payload: null,
    lastUnlockedTs: null,
    passphrase: null
  };
  sessions.set(workspace, created);
  return created;
}

export function vaultExists(workspace: string): boolean {
  return pathExists(vaultPaths(workspace).vaultFile);
}

export function createVault(params: {
  workspace: string;
  passphrase?: string;
  monitorPrivateKeyPem: string;
  auditorPrivateKeyPem: string;
  leasePrivateKeyPem: string;
  sessionPrivateKeyPem: string;
  monitorPublicKeyPem: string;
  auditorPublicKeyPem: string;
  leasePublicKeyPem: string;
  sessionPublicKeyPem: string;
  secrets?: Record<string, string>;
}): { vaultFile: string; metaFile: string } {
  const passphrase = params.passphrase ?? defaultPassphrase();
  if (passphrase.length < 8) {
    throw new Error("Vault passphrase must be at least 8 characters.");
  }
  const paths = vaultPaths(params.workspace);
  ensureDir(join(params.workspace, ".amc"));

  const payload: VaultPayload = {
    v: 1,
    createdTs: Date.now(),
    monitorPrivateKeyPem: params.monitorPrivateKeyPem,
    auditorPrivateKeyPem: params.auditorPrivateKeyPem,
    leasePrivateKeyPem: params.leasePrivateKeyPem,
    sessionPrivateKeyPem: params.sessionPrivateKeyPem,
    secrets: toSafeSecretMap(params.secrets ?? (Object.create(null) as Record<string, string>))
  };
  const encrypted = encryptVaultPayload(Buffer.from(JSON.stringify(payload), "utf8"), passphrase);
  writeFileAtomic(paths.vaultFile, JSON.stringify(encrypted, null, 2), 0o600);
  try {
    chmodSync(paths.vaultFile, 0o600);
  } catch {
    // ignore platform-specific chmod failures
  }

  const meta = {
    createdAt: new Date(payload.createdTs).toISOString(),
    monitorFingerprint: sha256Hex(Buffer.from(params.monitorPublicKeyPem, "utf8")),
    auditorFingerprint: sha256Hex(Buffer.from(params.auditorPublicKeyPem, "utf8")),
    leaseFingerprint: sha256Hex(Buffer.from(params.leasePublicKeyPem, "utf8")),
    sessionFingerprint: sha256Hex(Buffer.from(params.sessionPublicKeyPem, "utf8"))
  };
  writeFileAtomic(paths.metaFile, JSON.stringify(meta, null, 2), 0o644);

  ensurePublicKeys(paths, params.monitorPublicKeyPem, params.auditorPublicKeyPem, params.leasePublicKeyPem, params.sessionPublicKeyPem);

  // Always remove legacy unencrypted private key files.
  if (pathExists(paths.legacyMonitorPrivate)) {
    rmSync(paths.legacyMonitorPrivate, { force: true });
  }
  if (pathExists(paths.legacyAuditorPrivate)) {
    rmSync(paths.legacyAuditorPrivate, { force: true });
  }

  unlockVault(params.workspace, passphrase);
  return {
    vaultFile: paths.vaultFile,
    metaFile: paths.metaFile
  };
}

export function unlockVault(workspace: string, passphrase?: string): void {
  const phrase = passphrase ?? process.env.AMC_VAULT_PASSPHRASE;
  if (!phrase || phrase.length === 0) {
    throw new Error("Vault unlock requires passphrase (set AMC_VAULT_PASSPHRASE or use `amc vault unlock`).");
  }
  const envelope = readEnvelope(workspace);
  let payload: VaultPayload;
  try {
    payload = parseVaultPayload(decryptVaultPayload(envelope, phrase).toString("utf8"));
  } catch {
    throw new Error("Vault unlock failed: incorrect passphrase or corrupted vault.");
  }
  const session = sessionFor(workspace);
  session.unlocked = true;
  session.payload = payload;
  session.lastUnlockedTs = Date.now();
  session.passphrase = phrase;

  if (!payload.leasePrivateKeyPem || !payload.sessionPrivateKeyPem) {
    const leasePair = generateKeyPairSync("ed25519");
    const sessionPair = generateKeyPairSync("ed25519");
    const leasePrivateKeyPem = leasePair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const leasePublicKeyPem = leasePair.publicKey.export({ format: "pem", type: "spki" }).toString();
    const sessionPrivateKeyPem = sessionPair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const sessionPublicKeyPem = sessionPair.publicKey.export({ format: "pem", type: "spki" }).toString();
    createVault({
      workspace,
      passphrase: phrase,
      monitorPrivateKeyPem: payload.monitorPrivateKeyPem,
      auditorPrivateKeyPem: payload.auditorPrivateKeyPem,
      leasePrivateKeyPem,
      sessionPrivateKeyPem,
      monitorPublicKeyPem: readUtf8(vaultPaths(workspace).monitorPublic),
      auditorPublicKeyPem: readUtf8(vaultPaths(workspace).auditorPublic),
      leasePublicKeyPem,
      sessionPublicKeyPem,
      secrets: payload.secrets
    });
    const refreshed = parseVaultPayload(decryptVaultPayload(readEnvelope(workspace), phrase).toString("utf8"));
    session.payload = refreshed;
  }
}

export function lockVault(workspace: string): void {
  const session = sessionFor(workspace);
  session.unlocked = false;
  session.payload = null;
  session.passphrase = null;
}

export function vaultStatus(workspace: string): {
  exists: boolean;
  unlocked: boolean;
  lastUnlockedTs: number | null;
  metaPath: string;
  vaultPath: string;
} {
  const paths = vaultPaths(workspace);
  const session = sessionFor(workspace);
  return {
    exists: pathExists(paths.vaultFile),
    unlocked: session.unlocked,
    lastUnlockedTs: session.lastUnlockedTs,
    metaPath: paths.metaFile,
    vaultPath: paths.vaultFile
  };
}

export function getVaultPrivateKeyPem(workspace: string, kind: VaultKeyKind): string {
  const session = sessionFor(workspace);
  if (!session.unlocked || !session.payload) {
    const fromEnv = process.env.AMC_VAULT_PASSPHRASE;
    if (fromEnv && fromEnv.length > 0 && vaultExists(workspace)) {
      unlockVault(workspace, fromEnv);
    }
  }
  const refreshed = sessionFor(workspace);
  if (!refreshed.unlocked || !refreshed.payload) {
    throw new Error("Vault is locked. Run `amc vault unlock` before signing operations.");
  }
  if (kind === "monitor") {
    return refreshed.payload.monitorPrivateKeyPem;
  }
  if (kind === "auditor") {
    return refreshed.payload.auditorPrivateKeyPem;
  }
  if (kind === "lease") {
    return refreshed.payload.leasePrivateKeyPem;
  }
  return refreshed.payload.sessionPrivateKeyPem;
}

export function ensureVaultAndPublicKeys(workspace: string): void {
  const paths = vaultPaths(workspace);
  ensureDir(paths.keysDir);

  const legacyMonitorPrivate = pathExists(paths.legacyMonitorPrivate) ? readFileSync(paths.legacyMonitorPrivate, "utf8") : null;
  const legacyAuditorPrivate = pathExists(paths.legacyAuditorPrivate) ? readFileSync(paths.legacyAuditorPrivate, "utf8") : null;

  const monitorPublicExisting = pathExists(paths.monitorPublic) ? readUtf8(paths.monitorPublic) : null;
  const auditorPublicExisting = pathExists(paths.auditorPublic) ? readUtf8(paths.auditorPublic) : null;
  const leasePublicExisting = pathExists(paths.leasePublic) ? readUtf8(paths.leasePublic) : null;
  const sessionPublicExisting = pathExists(paths.sessionPublic) ? readUtf8(paths.sessionPublic) : null;

  if (vaultExists(workspace)) {
    const testEnv = process.env.NODE_ENV === "test" || process.env.VITEST === "true" || process.env.VITEST === "1";
    const unlockPhrase = process.env.AMC_VAULT_PASSPHRASE ?? (testEnv ? defaultPassphrase() : undefined);
    if (unlockPhrase) {
      try {
        unlockVault(workspace, unlockPhrase);
      } catch {
        // Keep locked when passphrase is unavailable or incorrect.
      }
    }
    if (legacyMonitorPrivate && pathExists(paths.legacyMonitorPrivate)) {
      rmSync(paths.legacyMonitorPrivate, { force: true });
    }
    if (legacyAuditorPrivate && pathExists(paths.legacyAuditorPrivate)) {
      rmSync(paths.legacyAuditorPrivate, { force: true });
    }
    if (monitorPublicExisting && auditorPublicExisting) {
      if (leasePublicExisting && sessionPublicExisting) {
        ensurePublicKeys(paths, monitorPublicExisting, auditorPublicExisting, leasePublicExisting, sessionPublicExisting);
      }
    }
    return;
  }

  let monitorPrivate = legacyMonitorPrivate;
  let auditorPrivate = legacyAuditorPrivate;
  let monitorPublic = monitorPublicExisting;
  let auditorPublic = auditorPublicExisting;
  let leasePublic = leasePublicExisting;
  let sessionPublic = sessionPublicExisting;
  let leasePrivate: string | null = null;
  let sessionPrivate: string | null = null;

  if (!monitorPrivate || !monitorPublic) {
    const pair = generateKeyPairSync("ed25519");
    monitorPrivate = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    monitorPublic = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
  }

  if (!auditorPrivate || !auditorPublic) {
    const pair = generateKeyPairSync("ed25519");
    auditorPrivate = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    auditorPublic = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
  }

  if (!leasePrivate || !leasePublic) {
    const pair = generateKeyPairSync("ed25519");
    leasePrivate = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    leasePublic = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
  }

  if (!sessionPrivate || !sessionPublic) {
    const pair = generateKeyPairSync("ed25519");
    sessionPrivate = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    sessionPublic = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
  }

  createVault({
    workspace,
    passphrase: defaultPassphrase(),
    monitorPrivateKeyPem: monitorPrivate,
    auditorPrivateKeyPem: auditorPrivate,
    leasePrivateKeyPem: leasePrivate,
    sessionPrivateKeyPem: sessionPrivate,
    monitorPublicKeyPem: monitorPublic,
    auditorPublicKeyPem: auditorPublic,
    leasePublicKeyPem: leasePublic,
    sessionPublicKeyPem: sessionPublic
  });
}

export function rotateMonitorKeyInVault(workspace: string, passphrase?: string): {
  fingerprint: string;
  publicKeyPath: string;
} {
  const paths = vaultPaths(workspace);
  const phrase = passphrase ?? process.env.AMC_VAULT_PASSPHRASE;
  if (!phrase || phrase.length === 0) {
    throw new Error("Monitor key rotation requires passphrase (AMC_VAULT_PASSPHRASE or interactive input).");
  }
  unlockVault(workspace, phrase);
  const session = sessionFor(workspace);
  if (!session.payload) {
    throw new Error("Vault unlock failed before rotation.");
  }

  const next = generateKeyPairSync("ed25519");
  const monitorPrivateKeyPem = next.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const monitorPublicKeyPem = next.publicKey.export({ format: "pem", type: "spki" }).toString();

  createVault({
    workspace,
    passphrase: phrase,
    monitorPrivateKeyPem,
    auditorPrivateKeyPem: session.payload.auditorPrivateKeyPem,
    leasePrivateKeyPem: session.payload.leasePrivateKeyPem,
    sessionPrivateKeyPem: session.payload.sessionPrivateKeyPem,
    monitorPublicKeyPem,
    auditorPublicKeyPem: readUtf8(paths.auditorPublic),
    leasePublicKeyPem: readUtf8(paths.leasePublic),
    sessionPublicKeyPem: readUtf8(paths.sessionPublic),
    secrets: session.payload.secrets
  });

  const fingerprint = sha256Hex(Buffer.from(monitorPublicKeyPem, "utf8"));
  return {
    fingerprint,
    publicKeyPath: paths.monitorPublic
  };
}

function requireUnlockedPayload(workspace: string): VaultPayload {
  const session = sessionFor(workspace);
  if (!session.unlocked || !session.payload) {
    throw new Error("Vault is locked. Run `amc vault unlock` before accessing secrets.");
  }
  return session.payload;
}

function rewriteUnlockedVault(workspace: string, payload: VaultPayload): void {
  const session = sessionFor(workspace);
  const passphrase = session.passphrase ?? process.env.AMC_VAULT_PASSPHRASE;
  if (!passphrase || passphrase.length === 0) {
    throw new Error("AMC_VAULT_PASSPHRASE is required to persist vault secret updates.");
  }
  const paths = vaultPaths(workspace);
  createVault({
    workspace,
    passphrase,
    monitorPrivateKeyPem: payload.monitorPrivateKeyPem,
    auditorPrivateKeyPem: payload.auditorPrivateKeyPem,
    leasePrivateKeyPem: payload.leasePrivateKeyPem,
    sessionPrivateKeyPem: payload.sessionPrivateKeyPem,
    monitorPublicKeyPem: readUtf8(paths.monitorPublic),
    auditorPublicKeyPem: readUtf8(paths.auditorPublic),
    leasePublicKeyPem: readUtf8(paths.leasePublic),
    sessionPublicKeyPem: readUtf8(paths.sessionPublic),
    secrets: payload.secrets
  });
}

export function setVaultSecret(workspace: string, secretKey: string, value: string): void {
  assertSafeSecretKey(secretKey);
  const payload = requireUnlockedPayload(workspace);
  payload.secrets[secretKey] = value;
  rewriteUnlockedVault(workspace, payload);
  const session = sessionFor(workspace);
  session.payload = payload;
}

export function getVaultSecret(workspace: string, secretKey: string): string | null {
  assertSafeSecretKey(secretKey);
  const payload = requireUnlockedPayload(workspace);
  const value = payload.secrets[secretKey];
  return typeof value === "string" ? value : null;
}
