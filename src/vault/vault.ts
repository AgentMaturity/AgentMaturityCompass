import { generateKeyPairSync } from "node:crypto";
import { chmodSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, pathExists, writeFileAtomic, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { decryptVaultPayload, encryptVaultPayload, type VaultEnvelope } from "./vaultCrypto.js";
import { buildKeyHistoryEntry } from "../crypto/keyHistoryChain.js";
import { publicKeyFromPrivate, sealKeyHistory, verifyKeyHistoryEnvelope, type KeyHistoryEnvelope } from "../crypto/keyHistoryEnvelope.js";
import { createKeyRotationReceipt } from "../crypto/keyRotationReceipt.js";

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

/**
 * VaultSession holds the unlocked vault state in memory.
 * SECURITY NOTE: The passphrase is held as a JS string (immutable, not zeroable).
 * This is an accepted limitation of the Node.js runtime — a heap dump could reveal it.
 * Mitigation: sessions are evicted after VAULT_SESSION_TTL_MS of inactivity.
 */
interface VaultSession {
  unlocked: boolean;
  payload: VaultPayload | null;
  lastUnlockedTs: number | null;
  passphrase: string | null;
  /**
   * Digest of the envelope this session was opened from. Unlocking is skipped
   * only when the passphrase AND this digest both still match, so a vault
   * replaced or re-encrypted on disk is never served from memory.
   */
  envelopeDigest: string | null;
}

const sessions = new Map<string, VaultSession>();
const VAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** Evict stale vault sessions that haven't been used in VAULT_SESSION_TTL_MS */
function evictStaleSessions(): void {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (session.lastUnlockedTs && now - session.lastUnlockedTs > VAULT_SESSION_TTL_MS) {
      session.passphrase = null;
      session.payload = null;
      session.unlocked = false;
      session.envelopeDigest = null;
      sessions.delete(key);
    }
  }
}

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
  // Only the test runner, never NODE_ENV.
  //
  // This passphrase is published in this file, so a vault sealed with it can be
  // opened by anyone holding the file — private monitor and auditor signing
  // keys included. NODE_ENV=test is set routinely by CI images and application
  // frameworks, so `amc init` in such an environment used to mint a real
  // workspace whose keys were recoverable. VITEST is set by the runner itself
  // and does not leak into deployed environments.
  if (process.env.VITEST === "true" || process.env.VITEST === "1") {
    return "amc-test-passphrase";
  }
  throw new Error(
    "AMC_VAULT_PASSPHRASE environment variable is required. " +
    "Set it before using vault operations: export AMC_VAULT_PASSPHRASE='your-secure-passphrase'"
  );
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

function readEnvelopeRaw(workspace: string): string {
  const paths = vaultPaths(workspace);
  if (!pathExists(paths.vaultFile)) {
    throw new Error(`Vault file not found: ${paths.vaultFile}`);
  }
  return readUtf8(paths.vaultFile);
}

function readEnvelope(workspace: string): VaultEnvelope {
  return JSON.parse(readEnvelopeRaw(workspace)) as VaultEnvelope;
}

const KEY_KINDS = ["monitor", "auditor", "lease", "session"] as const;

interface MonitorTransition {
  previousPrivateKeyPem: string;
  nextHistory: KeyHistoryEnvelope;
  recoveryDirectory: string;
}

/** Prepare trust mutations before replacing any vault data. Never seal disk lists. */
function preparePublicKeys(paths: ReturnType<typeof vaultPaths>, params: CreateVaultParams, transition?: MonitorTransition): Array<{ publicFile: string; publicPem: string; historyFile: string; history: string | null }> {
  const existingVault = pathExists(paths.vaultFile);
  return KEY_KINDS.map((kind) => {
    const publicPem = publicKeyFromPrivate(params[`${kind}PrivateKeyPem`]);
    if (publicPem !== params[`${kind}PublicKeyPem`]) throw new Error(`${kind} public key does not match the vault private key`);
    const publicFile = paths[`${kind}Public`];
    const historyFile = paths[`${kind}History`];
    const previousPublic = pathExists(publicFile) ? readUtf8(publicFile) : null;
    let history: string | null = null;
    if (existingVault && previousPublic && previousPublic !== publicPem) {
      if (kind !== "monitor" || !transition || publicKeyFromPrivate(transition.previousPrivateKeyPem) !== previousPublic
        || !verifyKeyHistoryEnvelope(transition.nextHistory, "monitor", publicPem).valid) {
        throw new Error(`${kind} key replacement requires an authenticated rotation`);
      }
      history = JSON.stringify(transition.nextHistory, null, 2);
    } else if (!existingVault || !pathExists(historyFile)) {
      // Only a private-key-derived current key is admitted at initialization.
      // Existing unsigned arrays are never imported into a fresh envelope.
      history = JSON.stringify(sealKeyHistory(kind, [buildKeyHistoryEntry(publicPem, [])], params[`${kind}PrivateKeyPem`]), null, 2);
    }
    return { publicFile, publicPem, historyFile, history };
  });
}

function sessionFor(workspace: string): VaultSession {
  evictStaleSessions();
  const current = sessions.get(workspace);
  if (current) {
    return current;
  }
  const created: VaultSession = {
    unlocked: false,
    payload: null,
    lastUnlockedTs: null,
    passphrase: null,
    envelopeDigest: null
  };
  sessions.set(workspace, created);
  return created;
}

export function vaultExists(workspace: string): boolean {
  return pathExists(vaultPaths(workspace).vaultFile);
}

interface CreateVaultParams {
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
}

export function createVault(params: CreateVaultParams): { vaultFile: string; metaFile: string } {
  return persistVault(params);
}

function persistVault(params: CreateVaultParams, transition?: MonitorTransition): { vaultFile: string; metaFile: string } {
  const passphrase = params.passphrase ?? defaultPassphrase();
  if (passphrase.length < 8) {
    throw new Error("Vault passphrase must be at least 8 characters.");
  }
  const paths = vaultPaths(params.workspace);
  ensureDir(join(params.workspace, ".amc"));
  const publicWrites = preparePublicKeys(paths, params, transition);

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
  if (transition) {
    writeFileAtomic(join(transition.recoveryDirectory, "next-vault.amcvault"), JSON.stringify(encrypted, null, 2), 0o600);
  }
  writeFileAtomic(paths.vaultFile, JSON.stringify(encrypted, null, 2), 0o600);
  // The envelope on disk just changed, so any session opened from the previous
  // one must derive again rather than trust its cached digest.
  sessionFor(params.workspace).envelopeDigest = null;
  try {
    chmodSync(paths.vaultFile, 0o600);
  } catch {
    /* chmod not supported on this platform */
  }

  const meta = {
    createdAt: new Date(payload.createdTs).toISOString(),
    monitorFingerprint: sha256Hex(Buffer.from(params.monitorPublicKeyPem, "utf8")),
    auditorFingerprint: sha256Hex(Buffer.from(params.auditorPublicKeyPem, "utf8")),
    leaseFingerprint: sha256Hex(Buffer.from(params.leasePublicKeyPem, "utf8")),
    sessionFingerprint: sha256Hex(Buffer.from(params.sessionPublicKeyPem, "utf8"))
  };
  writeFileAtomic(paths.metaFile, JSON.stringify(meta, null, 2), 0o644);

  for (const row of publicWrites) {
    writeFileAtomic(row.publicFile, row.publicPem, 0o644);
    if (row.history !== null) {
      if (pathExists(row.historyFile)) {
        const original = readUtf8(row.historyFile);
        const backup = `${row.historyFile}.previous-${sha256Hex(Buffer.from(original, "utf8"))}`;
        if (!pathExists(backup)) writeFileAtomic(backup, original, 0o600);
      }
      writeFileAtomic(row.historyFile, row.history, 0o600);
    }
  }

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
  const session = sessionFor(workspace);
  const envelopeRaw = readEnvelopeRaw(workspace);
  const envelopeDigest = sha256Hex(Buffer.from(envelopeRaw, "utf8"));
  if (session.unlocked && session.passphrase === phrase && session.envelopeDigest === envelopeDigest) {
    // Already open on this exact envelope. Re-deriving the key costs a full
    // KDF (~24ms) and cannot reach a different answer — and signArtifactFile
    // reaches here on every signed artifact AMC writes.
    session.lastUnlockedTs = Date.now();
    return;
  }
  let payload: VaultPayload;
  try {
    payload = parseVaultPayload(decryptVaultPayload(JSON.parse(envelopeRaw) as VaultEnvelope, phrase).toString("utf8"));
  } catch {
    /* decryption or parse failed — rethrow with user-friendly message */
    throw new Error("Vault unlock failed: incorrect passphrase or corrupted vault.");
  }
  session.unlocked = true;
  session.payload = payload;
  session.lastUnlockedTs = Date.now();
  session.passphrase = phrase;
  session.envelopeDigest = envelopeDigest;

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
  session.envelopeDigest = null;
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

// Cache for ephemeral keys used in --no-sign mode (process lifetime only, not persisted)
const ephemeralKeyCache = new Map<string, string>();

function generateEphemeralKey(kind: VaultKeyKind): string {
  const cached = ephemeralKeyCache.get(kind);
  if (cached) return cached;
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  ephemeralKeyCache.set(kind, pem);
  return pem;
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
    // R2/R6: When --no-sign mode is active, use ephemeral (non-persistent) keys so operations
    // can proceed without vault access. Signatures will be valid format but not verifiable later.
    if (process.env.AMC_NO_SIGN === "1") {
      return generateEphemeralKey(kind);
    }
    throw new Error("🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup. Use --no-sign to skip signing where supported.");
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
        /* passphrase unavailable or incorrect — keep vault locked */
      }
    }
    if (legacyMonitorPrivate && pathExists(paths.legacyMonitorPrivate)) {
      rmSync(paths.legacyMonitorPrivate, { force: true });
    }
    if (legacyAuditorPrivate && pathExists(paths.legacyAuditorPrivate)) {
      rmSync(paths.legacyAuditorPrivate, { force: true });
    }
    // Reads/unlocks cannot authenticate or rewrite untrusted on-disk history.
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
  rotationReceiptPath: string;
  recoveryDirectory: string;
} {
  if (process.env.AMC_NO_SIGN === "1") throw new Error("Key rotation is unavailable in no-sign mode");
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

  const previousPrivateKeyPem = session.payload.monitorPrivateKeyPem;
  const previousPublicKeyPem = publicKeyFromPrivate(previousPrivateKeyPem);
  if (readUtf8(paths.monitorPublic) !== previousPublicKeyPem) throw new Error("Monitor public key does not match the unlocked vault");
  let prior;
  try {
    prior = verifyKeyHistoryEnvelope(JSON.parse(readUtf8(paths.monitorHistory)), "monitor", previousPublicKeyPem).envelope;
  } catch { /* malformed/missing history requires explicit reviewed migration */ }
  if (!prior) throw new Error("Monitor history is not authenticated; explicitly migrate reviewed history before rotating");

  const next = generateKeyPairSync("ed25519");
  const monitorPrivateKeyPem = next.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const monitorPublicKeyPem = next.publicKey.export({ format: "pem", type: "spki" }).toString();

  const nextEntries = [...prior.entries, buildKeyHistoryEntry(monitorPublicKeyPem, prior.entries)];
  const nextHistory = sealKeyHistory("monitor", nextEntries, monitorPrivateKeyPem, prior.revision + 1);
  const previousHistoryRaw = readUtf8(paths.monitorHistory);
  const nextHistoryRaw = JSON.stringify(nextHistory, null, 2);
  const receipt = createKeyRotationReceipt({
    previousPrivateKeyPem,
    nextPublicKeyPem: monitorPublicKeyPem,
    previousHistorySha256: sha256Hex(Buffer.from(previousHistoryRaw, "utf8")),
    nextHistorySha256: sha256Hex(Buffer.from(nextHistoryRaw, "utf8"))
  });
  const recoveryDirectory = join(paths.keysDir, "rotations", `${receipt.createdTs}-${receipt.nextFingerprint}`);
  ensureDir(recoveryDirectory);
  chmodSync(recoveryDirectory, 0o700);
  const rotationReceiptPath = join(recoveryDirectory, "receipt.json");
  // Preserve the encrypted old signing state before a multi-file transition.
  // Partial publication fails closed; recovery is explicit, never reader-driven.
  for (const [name, contents] of Object.entries({
    "previous-vault.amcvault": readUtf8(paths.vaultFile),
    "previous-vault.meta.json": readUtf8(paths.metaFile),
    "previous-monitor.pub": previousPublicKeyPem,
    "previous-monitor-history.json": previousHistoryRaw,
    "next-monitor.pub": monitorPublicKeyPem,
    "next-monitor-history.json": nextHistoryRaw,
    "receipt.json": JSON.stringify(receipt, null, 2)
  })) writeFileAtomic(join(recoveryDirectory, name), contents, 0o600);

  persistVault({
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
  }, { previousPrivateKeyPem, nextHistory, recoveryDirectory });

  const fingerprint = sha256Hex(Buffer.from(monitorPublicKeyPem, "utf8"));
  return {
    fingerprint,
    publicKeyPath: paths.monitorPublic,
    rotationReceiptPath,
    recoveryDirectory
  };
}

function requireUnlockedPayload(workspace: string): VaultPayload {
  const session = sessionFor(workspace);
  if (!session.unlocked || !session.payload) {
    throw new Error("🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup.");
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
